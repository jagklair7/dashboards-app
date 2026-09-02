import { supabase } from '../../app/supabaseClient'
import * as invoicing from './invoicing'
import * as hotelTv from './hotelTv'

// Registry — add a new connector module and register it here. csv_upload is
// intentionally excluded: it's driven directly from the DataSources page's
// upload UI rather than an automated sync.
const CONNECTORS = {
  [invoicing.type]: invoicing,
  [hotelTv.type]: hotelTv,
}

/**
 * Runs a sync for one data_source row: calls its connector, then writes
 * the normalized metrics into synced_data. Call this on a schedule
 * (e.g. a Vercel cron hitting a serverless function) or on-demand from
 * a "Sync now" button.
 *
 * Two kinds of metric, handled differently:
 *
 * - Time series (e.g. revenue_cash): upserted on
 *   (data_source_id, metric_key, dimension, recorded_at) — see the
 *   synced_data_unique_metric constraint — so re-running a sync for a
 *   period that already has a row updates it in place. History
 *   accumulates correctly across syncs; nothing is ever deleted.
 *
 * - Snapshot (e.g. ar_aging, top_clients, overdue_invoices, active_orgs):
 *   represents "right now", not history. A connector declares its
 *   snapshot metric_keys via an exported `snapshotMetricKeys` array.
 *   Before inserting, every existing row for that (data_source_id,
 *   metric_key) is deleted, then the freshly fetched rows are inserted.
 *   This is what makes a paid invoice disappear from overdue_invoices,
 *   or a client that drops out of the top 5 disappear from top_clients —
 *   without this, a snapshot dimension that stops appearing in a sync's
 *   results would just sit in synced_data forever, permanently stuck at
 *   its last-known value (see incident: invoice paid outside the app's
 *   normal flow stayed "overdue" indefinitely, Sept 2026).
 *
 * A nullable dimension would defeat the unique constraint (Postgres
 * treats every NULL as distinct), so connectors must always use '' for
 * "no dimension", never null/undefined.
 */
export async function syncDataSource(dataSource) {
  const connector = CONNECTORS[dataSource.type]
  if (!connector) {
    throw new Error(`No connector registered for type "${dataSource.type}"`)
  }

  const metrics = await connector.fetchMetrics(dataSource.config)
  const snapshotKeys = connector.snapshotMetricKeys || []

  if (snapshotKeys.length > 0) {
    const { error: deleteError } = await supabase
      .from('synced_data')
      .delete()
      .eq('data_source_id', dataSource.id)
      .in('metric_key', snapshotKeys)
    if (deleteError) throw deleteError
  }

  if (metrics.length > 0) {
    const rows = metrics.map(m => ({
      data_source_id: dataSource.id,
      org_id: dataSource.org_id,
      metric_key: m.metric_key,
      dimension: m.dimension ?? '',
      value: m.value,
      recorded_at: m.recorded_at,
      raw: m.raw ?? null,
    }))
    const { error } = await supabase
      .from('synced_data')
      .upsert(rows, { onConflict: 'data_source_id,metric_key,dimension,recorded_at' })
    if (error) throw error
  }

  await supabase
    .from('data_sources')
    .update({ last_synced_at: new Date().toISOString(), status: 'active' })
    .eq('id', dataSource.id)

  return { count: metrics.length }
}