import { useState } from 'react'
import { supabase } from '../app/supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus(null)
    setLoading(true)
    try {
      // Calling supabase.auth.signInWithPassword directly (not via an
      // extracted variable) preserves its `this` binding to the Supabase
      // client — assigning it to a plain variable first and calling that
      // loses the binding and throws.
      const { error } = mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

      if (error) setStatus({ ok: false, text: error.message })
      else if (mode === 'signup') setStatus({ ok: true, text: 'Check your email to confirm your account.' })
    } catch (err) {
      setStatus({ ok: false, text: err.message || 'Something went wrong. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">Klair Dashboards</div>
        <h1>{mode === 'signin' ? 'Sign in' : 'Create an account'}</h1>
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          {status && <div className={status.ok ? 'auth-status-ok' : 'auth-status-err'}>{status.text}</div>}
          <button type="submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>
        <button className="auth-toggle" onClick={() => setMode(m => m === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}
