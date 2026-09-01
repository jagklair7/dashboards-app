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

  // Expected payload shape (adjust to match the real endpoint once it exists):
  // { invoices: [{ date, total, status }], quotes: [...], vendors_payable: [...] }
  const metrics = []

  for (const inv of payload.invoices || []) {
    metrics.push({
      metric_key: 'invoice_total',
      dimension: inv.status,
      value: Number(inv.total) || 0,
      recorded_at: inv.date,
      raw: inv,
    })
  }

  return metrics
}

export const type = 'invoicing'
