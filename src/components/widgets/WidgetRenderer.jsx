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
        .select('value, dimension, recorded_at, raw')
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

  // top_clients uses customer_id as dimension (stable upsert key) with the
  // display name in raw — fall back to dimension itself if raw is missing
  // (e.g. rows synced before this change).
  const isTopClients = widget.metric_key === 'top_clients'
  const isOverdueInvoices = widget.metric_key === 'overdue_invoices'

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
          ? (isTopClients ? (r.raw?.client_name || r.dimension || '—') : (r.dimension || '—'))
          : new Date(r.recorded_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
        value: Number(r.value || 0),
      }))
      return <ChartWidget title={widget.title} type={widget.type === 'bar_chart' ? 'bar' : 'line'} data={chartData} />
    }
    case 'table': {
      if (isOverdueInvoices) {
        const columns = [
          { key: 'invoice_number', label: 'Invoice #' },
          { key: 'client_name', label: 'Client' },
          { key: 'days_overdue', label: 'Days Overdue' },
          { key: 'amount', label: 'Amount' },
        ]
        // Days overdue computed live from raw.due_date at render time —
        // never stored, so it's always accurate and never a sync/upsert
        // concern (see invoicingConnector notes on why baking a
        // daily-changing value into dimension broke upserts).
        const today = new Date()
        const tableRows = [...rows]
          .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
          .map(r => {
            const dueDate = r.raw?.due_date ? new Date(r.raw.due_date) : null
            const daysOverdue = dueDate ? Math.floor((today - dueDate) / 86400000) : null
            return {
              invoice_number: r.raw?.invoice_number || r.dimension || '—',
              client_name: r.raw?.client_name || '—',
              days_overdue: daysOverdue !== null ? daysOverdue : '—',
              amount: Number(r.value || 0).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' }),
            }
          })
        return <TableWidget title={widget.title} columns={columns} rows={tableRows} />
      }

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