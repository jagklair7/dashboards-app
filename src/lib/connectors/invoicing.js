/**
 * Invoicing connector — pulls from a small read-only reporting endpoint on
 * the invoicing app. See README.md → "Connector API contract" for exactly
 * what that endpoint needs to return; this file just consumes it.
 *
 * config shape (stored in data_sources.config):
 *   { invoicingOrgId: '7ab37af4-...', apiKey: '...' }
 *
 * SNAPSHOT METRICS: ar_aging, top_clients, overdue_invoices, and
 * active_orgs represent "right now", not history. syncDataSource only ever
 * upserts (never deletes) on the (data_source_id, metric_key, dimension,
 * recorded_at) constraint, so these all use a fixed SNAPSHOT_DATE instead
 * of today's date — that's what makes every sync overwrite the same rows
 * in place, regardless of what day it runs. Using a real "today" date here
 * was the bug that caused snapshot rows to pile up forever across days
 * (see incident: doubled ar_aging bars, Sept 2026).
 *
 * TIME-SERIES METRICS: revenue_cash uses the real month as recorded_at —
 * that's genuine history and each month should keep its own row.
 */
const BASE_URL = import.meta.env.VITE_INVOICING_API_BASE
const SNAPSHOT_DATE = '1970-01-01' // fixed sentinel — never varies by sync date

export async function fetchMetrics(config) {
  if (!config?.invoicingOrgId) {
    throw new Error('Invoicing connector is missing invoicingOrgId in its config.')
  }

  const res = await fetch(`${BASE_URL}/api/dashboard-metrics?org_id=${config.invoicingOrgId}`, {
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
  })
  if (!res.ok) {
    throw new Error(`Invoicing connector fetch failed: ${res.status} ${res.statusText}`)
  }
  const payload = await res.json()
  // Expected payload shape (updated to include payments for cash-basis
  // revenue): { invoices: [...], payments: [{ amount, paid_at, invoice_id }] }

  const metrics = []

  // --- Revenue trend (cash basis) — time series, one row per month ---
  const byMonth = new Map()
  for (const p of payload.payments || []) {
    if (!p.paid_at) continue
    const monthKey = p.paid_at.slice(0, 7) + '-01' // YYYY-MM-01
    byMonth.set(monthKey, (byMonth.get(monthKey) || 0) + (Number(p.amount) || 0))
  }
  for (const [month, total] of byMonth) {
    metrics.push({ metric_key: 'revenue_cash', dimension: '', value: total, recorded_at: month, raw: null })
  }

  // --- A/R aging — snapshot, one row per bucket ---
  const bucketTotals = new Map()
  for (const inv of payload.invoices || []) {
    if (!inv.aging_bucket) continue
    bucketTotals.set(inv.aging_bucket, (bucketTotals.get(inv.aging_bucket) || 0) + (Number(inv.total) || 0))
  }
  for (const [bucket, total] of bucketTotals) {
    metrics.push({ metric_key: 'ar_aging', dimension: bucket, value: total, recorded_at: SNAPSHOT_DATE, raw: null })
  }

    // --- Top clients by paid revenue — snapshot, top 5 rows ---
    // dimension = customer_id (stable) so re-syncing always upserts onto the
    // same row even if the display name changes; raw carries the name for
    // display so WidgetRenderer never needs to parse anything.
    const byClient = new Map() // customer_id -> { name, total }
    for (const inv of payload.invoices || []) {
      if (inv.status !== 'paid') continue
      const id = inv.customer_id || 'unknown'
      const entry = byClient.get(id) || { name: inv.customer_name || 'Unknown', total: 0 }
      entry.total += Number(inv.total) || 0
      byClient.set(id, entry)
    }
    const topClients = [...byClient.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5)
    for (const [customerId, { name, total }] of topClients) {
      metrics.push({
        metric_key: 'top_clients',
        dimension: customerId,
        value: total,
        recorded_at: SNAPSHOT_DATE,
        raw: { client_name: name },
      })
    }


  // --- Overdue invoices — snapshot, one row per currently-overdue invoice ---
  // dimension = invoice number (stable, unique). raw carries client name and
  // due_date; WidgetRenderer computes "days overdue" live from due_date at
  // render time rather than freezing it here — that number changes daily,
  // so baking it into dimension would break the upsert key every single day.
  const overdueInvoices = (payload.invoices || []).filter(inv => inv.is_overdue)
  for (const inv of overdueInvoices) {
    metrics.push({
      metric_key: 'overdue_invoices',
      dimension: inv.number,
      value: Number(inv.total) || 0,
      recorded_at: SNAPSHOT_DATE,
      raw: { client_name: inv.customer_name || 'Unknown', due_date: inv.due_date, invoice_number: inv.number },
    })
  }

  // --- Active clients (90d) — snapshot, single row ---
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)
  const activeClients = new Set(
    (payload.invoices || [])
      .filter(inv => new Date(inv.date) >= cutoff)
      .map(inv => inv.customer_id)
      .filter(Boolean)
  )
  metrics.push({ metric_key: 'active_orgs', dimension: '', value: activeClients.size, recorded_at: SNAPSHOT_DATE, raw: null })

  return metrics
}

export const type = 'invoicing'
export const snapshotMetricKeys = ['ar_aging', 'top_clients', 'overdue_invoices', 'active_orgs']
