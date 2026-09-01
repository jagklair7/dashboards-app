import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import { syncDataSource } from '../lib/connectors'
import { normalizeCsvRows } from '../lib/connectors/csvUpload'

const CONNECTOR_TYPES = [
  { value: 'invoicing', label: 'Klair Invoicing', configHint: 'Needs: invoicingOrgId' },
  { value: 'hotel_tv', label: 'Hotel TV Portal', configHint: 'Needs: hotelOrgId' },
  { value: 'csv_upload', label: 'CSV Upload', configHint: 'No config needed — upload a file below' },
]

export default function DataSources() {
  const { activeOrg } = useOrg()
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncingId, setSyncingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [statusMsg, setStatusMsg] = useState(null)

  const [newType, setNewType] = useState('invoicing')
  const [newLabel, setNewLabel] = useState('')
  const [newConfigId, setNewConfigId] = useState('') // invoicingOrgId / hotelOrgId
  const [creating, setCreating] = useState(false)

  useEffect(() => { if (activeOrg?.orgId) fetchSources() }, [activeOrg?.orgId])

  async function fetchSources() {
    setLoading(true)
    const { data } = await supabase
      .from('data_sources')
      .select('*')
      .eq('org_id', activeOrg.orgId)
      .order('created_at', { ascending: true })
    setSources(data || [])
    setLoading(false)
  }

  async function createSource(e) {
    e.preventDefault()
    if (!newLabel.trim()) return
    setCreating(true)
    const config = newType === 'invoicing' ? { invoicingOrgId: newConfigId }
      : newType === 'hotel_tv' ? { hotelOrgId: newConfigId }
      : {}
    await supabase.from('data_sources').insert([{
      org_id: activeOrg.orgId,
      type: newType,
      label: newLabel.trim(),
      config,
    }])
    setNewLabel(''); setNewConfigId('')
    setCreating(false)
    fetchSources()
  }

  async function handleSync(source) {
    setSyncingId(source.id)
    setStatusMsg(null)
    try {
      const result = await syncDataSource(source)
      setStatusMsg({ ok: true, text: `Synced ${result.count} metric${result.count === 1 ? '' : 's'} for ${source.label}.` })
      fetchSources()
    } catch (err) {
      await supabase.from('data_sources').update({ status: 'error' }).eq('id', source.id)
      setStatusMsg({ ok: false, text: `Sync failed for ${source.label}: ${err.message}` })
      fetchSources()
    } finally {
      setSyncingId(null)
    }
  }

  async function handleCsvUpload(source, file) {
    setSyncingId(source.id)
    setStatusMsg(null)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const metrics = normalizeCsvRows(results.data)
          if (metrics.length > 0) {
            const rows = metrics.map(m => ({
              data_source_id: source.id,
              org_id: activeOrg.orgId,
              metric_key: m.metric_key,
              dimension: m.dimension,
              value: m.value,
              recorded_at: m.recorded_at,
              raw: m.raw,
            }))
            const { error } = await supabase.from('synced_data').insert(rows)
            if (error) throw error
          }
          await supabase.from('data_sources').update({
            last_synced_at: new Date().toISOString(), status: 'active',
          }).eq('id', source.id)
          setStatusMsg({ ok: true, text: `Imported ${metrics.length} rows from ${file.name}.` })
          fetchSources()
        } catch (err) {
          setStatusMsg({ ok: false, text: `Import failed: ${err.message}` })
        } finally {
          setSyncingId(null)
        }
      },
    })
  }

  async function handleDelete(source) {
    if (!window.confirm(`Delete "${source.label}"? This also removes any synced_data rows tied to it.`)) return
    setDeletingId(source.id)
    setStatusMsg(null)
    try {
      // Remove dependent synced_data rows first — avoids leaving orphaned
      // metric rows behind if there's no FK cascade set up on this table.
      const { error: dataErr } = await supabase
        .from('synced_data')
        .delete()
        .eq('data_source_id', source.id)
      if (dataErr) throw dataErr

      const { error: sourceErr } = await supabase
        .from('data_sources')
        .delete()
        .eq('id', source.id)
      if (sourceErr) throw sourceErr

      setStatusMsg({ ok: true, text: `Deleted "${source.label}".` })
      fetchSources()
    } catch (err) {
      setStatusMsg({ ok: false, text: `Delete failed for ${source.label}: ${err.message}` })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="page">
      <div className="page-header"><h1>Data Sources</h1></div>

      <form className="data-source-form" onSubmit={createSource}>
        <select value={newType} onChange={e => setNewType(e.target.value)}>
          {CONNECTOR_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input placeholder="Label (e.g. Klair Invoicing)" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
        {newType !== 'csv_upload' && (
          <input
            placeholder={newType === 'invoicing' ? 'invoicingOrgId' : 'hotelOrgId'}
            value={newConfigId}
            onChange={e => setNewConfigId(e.target.value)}
          />
        )}
        <button type="submit" disabled={creating || !newLabel.trim()}>+ Add source</button>
      </form>
      <p className="form-hint">
        {CONNECTOR_TYPES.find(c => c.value === newType)?.configHint}
      </p>

      {statusMsg && (
        <div className={statusMsg.ok ? 'status-ok' : 'status-err'}>{statusMsg.text}</div>
      )}

      {loading ? (
        <div className="loading-spinner" />
      ) : sources.length === 0 ? (
        <div className="empty-state">No data sources connected yet.</div>
      ) : (
        <table className="data-sources-table">
          <thead>
            <tr><th>Source</th><th>Type</th><th>Status</th><th>Last synced</th><th /><th /></tr>
          </thead>
          <tbody>
            {sources.map(s => (
              <tr key={s.id}>
                <td>{s.label}</td>
                <td>{CONNECTOR_TYPES.find(c => c.value === s.type)?.label || s.type}</td>
                <td><span className={`status-badge status-badge--${s.status}`}>{s.status}</span></td>
                <td>{s.last_synced_at ? new Date(s.last_synced_at).toLocaleString('en-CA') : 'Never'}</td>
                <td>
                  {s.type === 'csv_upload' ? (
                    <label className="btn btn--sm">
                      {syncingId === s.id ? 'Importing…' : 'Upload CSV'}
                      <input
                        type="file" accept=".csv" style={{ display: 'none' }}
                        onChange={e => e.target.files[0] && handleCsvUpload(s, e.target.files[0])}
                      />
                    </label>
                  ) : (
                    <button className="btn btn--sm" onClick={() => handleSync(s)} disabled={syncingId === s.id}>
                      {syncingId === s.id ? 'Syncing…' : 'Sync now'}
                    </button>
                  )}
                </td>
                <td>
                  <button
                    className="btn btn--sm btn--danger"
                    onClick={() => handleDelete(s)}
                    disabled={deletingId === s.id}
                  >
                    {deletingId === s.id ? 'Deleting…' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
