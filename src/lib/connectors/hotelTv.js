/**
 * Hotel TV portal connector. See README.md → "Connector API contract".
 *
 * config shape:
 *   { hotelOrgId: '...', apiKey: '...' }
 */
const BASE_URL = import.meta.env.VITE_HOTEL_TV_API_BASE

export async function fetchMetrics(config) {
  if (!config?.hotelOrgId) {
    throw new Error('Hotel TV connector is missing hotelOrgId in its config.')
  }

  const res = await fetch(`${BASE_URL}/api/dashboard-metrics?org_id=${config.hotelOrgId}`, {
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
  })
  if (!res.ok) {
    throw new Error(`Hotel TV connector fetch failed: ${res.status} ${res.statusText}`)
  }
  const payload = await res.json()

  // Expected payload shape (adjust once the real endpoint exists):
  // { ad_views: [{ date, count, ad_id }], qr_scans: [...] }
  const metrics = []

  for (const row of payload.ad_views || []) {
    metrics.push({
      metric_key: 'ad_views',
      dimension: row.ad_id,
      value: Number(row.count) || 0,
      recorded_at: row.date,
      raw: row,
    })
  }

  return metrics
}

export const type = 'hotel_tv'
