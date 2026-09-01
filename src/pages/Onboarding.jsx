import { useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'

export default function Onboarding() {
  const { refetch } = useOrg()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError(null)

    // Both inserts (organizations + organization_members) happen atomically
    // inside this one SECURITY DEFINER function — doing them as two separate
    // client-side inserts hits a chicken-and-egg RLS problem: creating the
    // org and immediately selecting it back requires already being a member,
    // but that membership row doesn't exist until the very next insert.
    const { error: rpcErr } = await supabase.rpc('create_organization', { org_name: name.trim() })
    if (rpcErr) { setError(rpcErr.message); setCreating(false); return }

    await refetch()
    setCreating(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">Klair Dashboards</div>
        <h1>Set up your organization</h1>
        <form onSubmit={handleCreate}>
          <label>
            Company name
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Klair Computer Inc." required />
          </label>
          {error && <div className="auth-status-err">{error}</div>}
          <button type="submit" disabled={creating || !name.trim()}>
            {creating ? 'Creating…' : 'Create organization'}
          </button>
        </form>
      </div>
    </div>
  )
}
