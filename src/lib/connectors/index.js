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
 * Runs a sync for one data_source row: calls its connector, then upserts
 * the normalized metrics into synced_data. Call this on a schedule
 * (e.g. a Vercel cron hitting a serverless function) or on-demand from
 * a "Sync now" button.
 */
export async function syncDataSource(dataSource) {
  const connector = CONNECTORS[dataSource.type]
  if (!connector) {
    throw new Error(`No connector registered for type "${dataSource.type}"`)
  }

  const metrics = await connector.fetchMetrics(dataSource.config)

  if (metrics.length > 0) {
    const rows = metrics.map(m => ({
      data_source_id: dataSource.id,
      org_id: dataSource.org_id,
      metric_key: m.metric_key,
      dimension: m.dimension ?? null,
      value: m.value,
      recorded_at: m.recorded_at,
      raw: m.raw ?? null,
    }))
    const { error } = await supabase.from('synced_data').insert(rows)
    if (error) throw error
  }

  await supabase
    .from('data_sources')
    .update({ last_synced_at: new Date().toISOString(), status: 'active' })
    .eq('id', dataSource.id)

  return { count: metrics.length }
}
