/**
 * Invoicing connector — pulls from a small read-only reporting endpoint on
 * the invoicing app. See README.md → "Connector API contract" for exactly
 * what that endpoint needs to return; this file just consumes it.
 *
 * config shape (stored in data_sources.config):
 *   { invoicingOrgId: '7ab37af4-...', apiKey: '...' }
 */
const BASE_URL = import.meta.env.VITE_INVOICING_API_BASE

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

  // Expected payload shape: { invoices: [{ date, total, status, number }] }
  const metrics = []

  // Per-status daily totals, aggregated by (status, date) — must be unique
  // per upsert batch, or Postgres throws "ON CONFLICT DO UPDATE command
  // cannot affect row a second time" the moment two invoices share a status
  // and a date. Kept for any future widget wanting a status breakdown.
  const statusTotals = new Map()
  for (const inv of payload.invoices || []) {
    const key = `${inv.status}||${inv.date}`
    statusTotals.set(key, (statusTotals.get(key) || 0) + (Number(inv.total) || 0))
  }
  for (const [key, total] of statusTotals) {
    const [status, date] = key.split('||')
    metrics.push({
      metric_key: 'invoice_total',
      dimension: status,
      value: total,
      recorded_at: date,
      raw: null,
    })
  }

  // Daily-aggregated revenue, one row per calendar day, for the Revenue
  // Trend widget. WidgetRenderer's line_chart case plots one point per row,
  // so this has to be pre-summed here — otherwise multiple invoices on the
  // same day would render as separate points instead of one summed point.
  //
  // ASSUMPTION: "revenue" = paid invoices only, not everything invoiced.
  // Flagging this since it changes the numbers a lot — if you want this to
  // reflect total invoiced (including unpaid/pending), tell me and I'll
  // drop the status filter below.
  const dailyTotals = new Map()
  for (const inv of payload.invoices || []) {
    if (inv.status !== 'paid') continue
    const day = inv.date // assumed already an ISO date string, e.g. '2026-08-15'
    dailyTotals.set(day, (dailyTotals.get(day) || 0) + (Number(inv.total) || 0))
  }
  for (const [day, total] of dailyTotals) {
    metrics.push({
      metric_key: 'daily_revenue',
      dimension: '',
      value: total,
      recorded_at: day,
      raw: null,
    })
  }

  // Overdue invoices — one row for count, one for $ total, both recorded
  // "as of" today since this is a snapshot, not a historical time series.
  const today = new Date().toISOString().slice(0, 10)
  const overdueInvoices = (payload.invoices || []).filter(inv => inv.is_overdue)
  metrics.push({
    metric_key: 'overdue_invoice_count',
    dimension: '',
    value: overdueInvoices.length,
    recorded_at: today,
    raw: null,
  })
  metrics.push({
    metric_key: 'overdue_invoice_total',
    dimension: '',
    value: overdueInvoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0),
    recorded_at: today,
    raw: null,
  })

  // A/R aging — one row per bucket, summed from the endpoint's
  // per-invoice aging_bucket field. Only invoices with a non-null bucket
  // count (i.e. sent + overdue); paid/draft/void/not-yet-due are excluded.
  const bucketTotals = new Map()
  for (const inv of payload.invoices || []) {
    if (!inv.aging_bucket) continue
    bucketTotals.set(inv.aging_bucket, (bucketTotals.get(inv.aging_bucket) || 0) + (Number(inv.total) || 0))
  }
  for (const [bucket, total] of bucketTotals) {
    metrics.push({
      metric_key: 'ar_aging',
      dimension: bucket,
      value: total,
      recorded_at: today,
      raw: null,
    })
  }

  return metrics
}

export const type = 'invoicing'