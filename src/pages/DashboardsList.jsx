import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'

console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL)

export default function DashboardsList() {
  const { activeOrg } = useOrg()
  const [dashboards, setDashboards] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => { if (activeOrg?.orgId) fetchDashboards() }, [activeOrg?.orgId])

  async function fetchDashboards() {
    setLoading(true)
    const { data } = await supabase
      .from('dashboards')
      .select('*')
      .eq('org_id', activeOrg.orgId)
      .order('created_at', { ascending: true })
    setDashboards(data || [])
    setLoading(false)
  }

  async function createDashboard(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    const slug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    await supabase.from('dashboards').insert([{
      org_id: activeOrg.orgId,
      name: newName.trim(),
      slug,
      is_default: dashboards.length === 0,
    }])
    setNewName('')
    setCreating(false)
    fetchDashboards()
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboards</h1>
      </div>

      <form className="inline-create-form" onSubmit={createDashboard}>
        <input
          placeholder="New dashboard name…"
          value={newName}
          onChange={e => setNewName(e.target.value)}
        />
        <button type="submit" disabled={creating || !newName.trim()}>+ Create</button>
      </form>

      {loading ? (
        <div className="loading-spinner" />
      ) : dashboards.length === 0 ? (
        <div className="empty-state">No dashboards yet. Create your first one above.</div>
      ) : (
        <div className="dashboard-grid">
          {dashboards.map(d => (
            <Link key={d.id} to={`/dashboards/${d.slug}`} className="dashboard-card">
              <div className="dashboard-card-name">{d.name}</div>
              {d.is_default && <span className="dashboard-card-badge">Default</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
