import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { OrgProvider, useOrg } from './context/OrgContext'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import DashboardsList from './pages/DashboardsList'
import DashboardView from './pages/DashboardView'
import DataSources from './pages/DataSources'

function AuthGate({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-spinner" />
  if (!user) return <Login />
  return children
}

function OrgGate({ children }) {
  const { activeOrg, loading } = useOrg()
  if (loading) return <div className="loading-spinner" />
  if (!activeOrg) return <Onboarding />
  return children
}

function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboards" replace />} />
          <Route path="/dashboards" element={<DashboardsList />} />
          <Route path="/dashboards/:slug" element={<DashboardView />} />
          <Route path="/data-sources" element={<DataSources />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate>
          <OrgProvider>
            <OrgGate>
              <AppShell />
            </OrgGate>
          </OrgProvider>
        </AuthGate>
      </AuthProvider>
    </BrowserRouter>
  )
}
