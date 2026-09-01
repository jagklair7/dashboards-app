import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../app/supabaseClient'
import { useAuth } from './AuthContext'

const OrgContext = createContext(null)

export function OrgProvider({ children }) {
  const { user } = useAuth()
  const [orgs, setOrgs] = useState([])           // all orgs this user belongs to
  const [activeOrg, setActiveOrg] = useState(null) // { orgId, name, role }
  const [loading, setLoading] = useState(true)

  const fetchOrgs = useCallback(async () => {
    if (!user) { setOrgs([]); setActiveOrg(null); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('organization_members')
      .select('role, organizations ( id, name )')
      .eq('user_id', user.id)

    if (error) {
      console.error('Failed to load organizations:', error.message)
      setLoading(false)
      return
    }

    const mapped = (data || []).map(row => ({
      orgId: row.organizations.id,
      name: row.organizations.name,
      role: row.role,
    }))
    setOrgs(mapped)

    // Restore last-used org from localStorage if still valid, else default to first
    const savedId = localStorage.getItem('activeOrgId')
    const restored = mapped.find(o => o.orgId === savedId)
    setActiveOrg(restored || mapped[0] || null)
    setLoading(false)
  }, [user])

  useEffect(() => { fetchOrgs() }, [fetchOrgs])

  const switchOrg = (orgId) => {
    const target = orgs.find(o => o.orgId === orgId)
    if (target) {
      setActiveOrg(target)
      localStorage.setItem('activeOrgId', orgId)
    }
  }

  return (
    <OrgContext.Provider value={{ orgs, activeOrg, switchOrg, loading, refetch: fetchOrgs }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used within OrgProvider')
  return ctx
}
