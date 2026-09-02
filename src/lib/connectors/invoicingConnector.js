import { supabase } from '../../app/supabaseClient' // adjust to actual path

/**
 * Pulls invoice + payment data from the invoicing app's dashboard-metrics
 * endpoint and writes it into synced_data as widget-ready metrics.
 *
 * Two write strategies, matching the two shapes of metric this app has:
 *   - Time series (revenue_cash): upserted on the table's own unique
 *     constraint (data_source_id, metric_key, dimension, recorded_at), so
 *     re-running a sync for a month that already has a row updates it in
 *     place instead of duplicating it.
 *   - Snapshots (ar_aging, top_clients, overdue_invoices, active_orgs):
 *     delete every existing row for (data_source_id, metric_key, org_id)
 *     first, then insert fresh. These represent "right now", not history —
 *     an invoice that got paid since the last sync must disappear from
 *     overdue_invoices, not just stop being updated.
 */
export async function syncInvoicingData(dataSource) {
  const { id: data_source_id, org_id, config } = dataSource
  const { apiKey, endpointUrl, sourceOrgId } = config

  const res = await fetch(`${endpointUrl}?org_id=${sourceOrgId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    throw new Error(`dashboard-metrics fetch failed: ${res.status}`)
  }
  const { invoices, payments } = await res.json()

  await Promise.all([
    syncRevenueCash(data_source_id, org_id, payments),
    syncSnapshotMetric(data_source_id, org_id, 'ar_aging', buildAgingRows(invoices)),
    syncSnapshotMetric(data_source_id, org_id, 'top_clients', buildTopClientRows(invoices)),
    syncSnapshotMetric(data_source_id, org_id, 'overdue_invoices', buildOverdueRows(invoices)),
    syncSnapshotMetric(data_source_id, org_id, 'active_orgs', buildActiveOrgsRows(invoices)),
  ])
}

async function syncRevenueCash(data_source_id, org_id, payments) {
  const byMonth = new Map()
  for (const p of payments) {
    if (!p.paid_at) continue
    const monthKey = p.paid_at.slice(0, 7) + '-01' // YYYY-MM-01
    byMonth.set(monthKey, (byMonth.get(monthKey) || 0) + Number(p.amount || 0))
  }

  const rows = [...byMonth.entries()].map(([month, total]) => ({
    data_source_id,
    org_id,
    metric_key: 'revenue_cash',
    dimension: '',
    value: total,
    recorded_at: month,
  }))

  if (rows.length === 0) return
  const { error } = await supabase
    .from('synced_data')
    .upsert(rows, { onConflict: 'data_source_id,metric_key,dimension,recorded_at' })
  if (error) throw error
}

async function syncSnapshotMetric(data_source_id, org_id, metric_key, rows) {
  const { error: deleteError } = await supabase
    .from('synced_data')
    .delete()
    .eq('data_source_id', data_source_id)
    .eq('org_id', org_id)
    .eq('metric_key', metric_key)
  if (deleteError) throw deleteError

  if (rows.length === 0) return
  const { error: insertError } = await supabase
    .from('synced_data')
    .insert(rows.map(r => ({ data_source_id, org_id, metric_key, ...r })))
  if (insertError) throw insertError
}

function buildAgingRows(invoices) {
  const byBucket = new Map()
  for (const inv of invoices) {
    if (!inv.aging_bucket) continue
    byBucket.set(inv.aging_bucket, (byBucket.get(inv.aging_bucket) || 0) + Number(inv.total || 0))
  }
  const today = new Date().toISOString().slice(0, 10)
  return [...byBucket.entries()].map(([bucket, amount]) => ({
    dimension: bucket,
    value: amount,
    recorded_at: today,
  }))
}

function buildTopClientRows(invoices, limit = 5) {
  const byClient = new Map()
  for (const inv of invoices) {
    if (inv.status !== 'paid') continue
    const name = inv.customer_name || 'Unknown'
    byClient.set(name, (byClient.get(name) || 0) + Number(inv.total || 0))
  }
  const today = new Date().toISOString().slice(0, 10)
  return [...byClient.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, total]) => ({ dimension: name, value: total, recorded_at: today }))
}

function buildOverdueRows(invoices) {
  return invoices
    .filter(inv => inv.is_overdue)
    .map(inv => {
      const daysOverdue = Math.floor(
        (new Date() - new Date(inv.due_date)) / 86400000
      )
      return {
        dimension: `${inv.number} · ${inv.customer_name || 'Unknown'} · ${daysOverdue}d overdue`,
        value: Number(inv.total || 0),
        recorded_at: inv.due_date,
      }
    })
}

function buildActiveOrgsRows(invoices) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)
  const activeClients = new Set(
    invoices
      .filter(inv => new Date(inv.date) >= cutoff)
      .map(inv => inv.customer_id)
      .filter(Boolean)
  )
  const today = new Date().toISOString().slice(0, 10)
  return [{ dimension: '', value: activeClients.size, recorded_at: today }]
}