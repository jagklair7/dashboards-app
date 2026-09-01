import { NavLink } from 'react-router-dom'
import { useOrg } from '../context/OrgContext'
import { useAuth } from '../context/AuthContext'

export default function Sidebar() {
  const { orgs, activeOrg, switchOrg } = useOrg()
  const { signOut } = useAuth()

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">Klair Dashboards</div>

      {orgs.length > 1 ? (
        <select
          className="org-switcher"
          value={activeOrg?.orgId || ''}
          onChange={e => switchOrg(e.target.value)}
        >
          {orgs.map(o => <option key={o.orgId} value={o.orgId}>{o.name}</option>)}
        </select>
      ) : (
        <div className="org-name">{activeOrg?.name}</div>
      )}

      <nav className="sidebar-nav">
        <NavLink to="/dashboards" className={({ isActive }) => isActive ? 'active' : ''}>Dashboards</NavLink>
        <NavLink to="/data-sources" className={({ isActive }) => isActive ? 'active' : ''}>Data Sources</NavLink>
      </nav>

      <button className="sidebar-signout" onClick={signOut}>Sign out</button>
    </aside>
  )
}
