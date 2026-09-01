import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import WidgetRenderer from '../components/widgets/WidgetRenderer'

export default function DashboardView() {
  const { slug } = useParams()
  const { activeOrg } = useOrg()
  const [dashboard, setDashboard] = useState(null)
  const [widgets, setWidgets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (activeOrg?.orgId) fetchDashboard() }, [activeOrg?.orgId, slug])

  async function fetchDashboard() {
    setLoading(true)
    const { data: dash } = await supabase
      .from('dashboards')
      .select('*')
      .eq('org_id', activeOrg.orgId)
      .eq('slug', slug)
      .single()

    if (dash) {
      const { data: widgetRows } = await supabase
        .from('widgets')
        .select('*')
        .eq('dashboard_id', dash.id)
        .order('position', { ascending: true })
      setWidgets(widgetRows || [])
    }
    setDashboard(dash)
    setLoading(false)
  }

  if (loading) return <div className="loading-spinner" />
  if (!dashboard) return <div className="empty-state">Dashboard not found.</div>

  return (
    <div className="page">
      <div className="page-header">
        <h1>{dashboard.name}</h1>
      </div>

      {widgets.length === 0 ? (
        <div className="empty-state">
          No widgets on this dashboard yet. Widgets are added via Supabase directly for now
          (see README → "Adding a widget") until the builder UI is in place.
        </div>
      ) : (
        <div className="widget-grid">
          {widgets.map(w => (
            <div key={w.id} className={`widget-slot widget-slot--${w.size}`}>
              <WidgetRenderer widget={w} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
