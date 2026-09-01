/**
 * Every connector normalizes its source's data into this shape before
 * writing to `synced_data`. Widgets only ever read from `synced_data` —
 * they never call a connector or an external API directly. This is what
 * keeps chart/widget code identical regardless of whether the numbers came
 * from the invoicing app, the hotel TV portal, or a CSV upload.
 *
 * @typedef {Object} NormalizedMetric
 * @property {string} metric_key   - e.g. 'invoice_total', 'occupancy_rate'
 * @property {string} [dimension]  - optional grouping (category, room type, etc.)
 * @property {number} value
 * @property {string} recorded_at  - ISO date string this value applies to
 * @property {Object} [raw]        - original payload, for widgets needing more detail
 */

/**
 * @typedef {Object} Connector
 * @property {string} type - matches data_sources.type
 * @property {(config: Object) => Promise<NormalizedMetric[]>} fetchMetrics
 */
