/**
 * CSV upload connector — doesn't fetch anything remotely. Instead, the
 * UI (DataSources page) parses an uploaded CSV client-side and calls
 * `normalizeCsvRows` directly, then writes to synced_data the same way
 * every other connector does. Expects columns: metric_key, dimension,
 * value, recorded_at (dimension is optional).
 */
export function normalizeCsvRows(rows) {
  return rows
    .filter(r => r.metric_key && r.recorded_at)
    .map(r => ({
      metric_key: String(r.metric_key).trim(),
      dimension: r.dimension ? String(r.dimension).trim() : null,
      value: Number(r.value) || 0,
      recorded_at: r.recorded_at,
      raw: r,
    }))
}

export const type = 'csv_upload'
