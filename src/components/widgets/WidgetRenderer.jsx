import { useEffect, useState } from 'react'
import { supabase } from '../../app/supabaseClient'
import KpiWidget from './KpiWidget'
import ChartWidget from './ChartWidget'
import TableWidget from './TableWidget'

/**
 * Every widget type reads from the same synced_data table, regardless of
 * which connector originally populated it — this is what makes adding a
 * new data source (a new client's own DB, a new SaaS integration, etc.)
 * not require touching any widget code.
 */
export default function WidgetRenderer({ widget }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!widget.metric_key) { setRows([]); return }
      const { data, error } = await supabase
        .from('synced_data')
        .select('value, dimension, recorded_at')
        .eq('org_id', widget.org_id)
        .eq('metric_key', widget.metric_key)
        .order('recorded_at', { ascending: true })
        .limit(500)
      if (cancelled) return
      if (error) { setError(error.message); return }
      setRows(data || [])
    }
    load()
    return () => { cancelled = true }
  }, [widget.metric_key, widget.org_id])

  if (error) return <div className="widget widget--error">Couldn't load "{widget.title}": {error}</div>
  if (rows === null) return <div className="widget widget--loading">Loading…</div>

  // When widget.config.xAxis === 'dimension', the chart groups by category
  // (e.g. an aging bucket, a client name) instead of by date — used for
  // any metric that's a snapshot broken into groups rather than a time
  // series. Sorting alphabetically by dimension is intentional: for
  // aging buckets specifically, labels ('0-30', '31-60', '61-90', '90+')
  // are chosen so alphabetical order is also the correct chronological
  // order, with no extra sort-order field needed.
  const useDimensionAxis = widget.config?.xAxis === 'dimension'

  switch (widget.type) {
    case 'kpi': {
      const total = rows.reduce((s, r) => s + Number(r.value || 0), 0)
      return <KpiWidget title={widget.title} value={total} unit={widget.config?.unit} />
    }
    case 'line_chart':
    case 'bar_chart': {
      const sortedRows = useDimensionAxis
        ? [...rows].sort((a, b) => (a.dimension || '').localeCompare(b.dimension || ''))
        : rows
      const chartData = sortedRows.map(r => ({
        label: useDimensionAxis
          ? (r.dimension || '—')
          : new Date(r.recorded_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
        value: Number(r.value || 0),
      }))
      return <ChartWidget title={widget.title} type={widget.type === 'bar_chart' ? 'bar' : 'line'} data={chartData} />
    }
    case 'table': {
      const columns = [
        { key: 'recorded_at', label: 'Date' },
        { key: 'dimension', label: 'Category' },
        { key: 'value', label: 'Value' },
      ]
      const tableRows = rows.map(r => ({
        recorded_at: new Date(r.recorded_at).toLocaleDateString('en-CA'),
        dimension: r.dimension || '—',
        value: Number(r.value || 0).toLocaleString('en-CA'),
      }))
      return <TableWidget title={widget.title} columns={columns} rows={tableRows} />
    }
    default:
      return <div className="widget widget--error">Unknown widget type "{widget.type}"</div>
  }
}