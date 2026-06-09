import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import NotificationEngine from './components/NotificationEngine'
import Layout       from './components/Layout'
import LoadingScreen from './components/LoadingScreen'

// Pages
import Login           from './pages/Login'
import Dashboard       from './pages/Dashboard'
import Subscribers     from './pages/Subscribers'
import SubscriberDetail from './pages/SubscriberDetail'
import Debts           from './pages/Debts'
import Payments        from './pages/Payments'
import Reports         from './pages/Reports'
import Sheets          from './pages/Sheets'
import Settings        from './pages/Settings'
import Accountants     from './pages/Accountants'
import SubscribePlan   from './pages/SubscribePlan'
import AdminDashboard  from './pages/admin/AdminDashboard'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

function AppRoutes() {
  const { loading } = useAuth()

  if (loading) return <LoadingScreen />

  return (
    <>
      <NotificationEngine />
      <Routes>
        {/* عام */}
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

        {/* أدمن */}
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />

        {/* مستخدم عادي */}
        <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route path="/dashboard"           element={<Dashboard />} />
          <Route path="/subscribers"         element={<Subscribers />} />
          <Route path="/subscribers/:id"     element={<SubscriberDetail />} />
          <Route path="/debts"               element={<Debts />} />
          <Route path="/payments"            element={<Payments />} />
          <Route path="/reports"             element={<Reports />} />
          <Route path="/sheets"              element={<Sheets />} />
          <Route path="/accountants"         element={<OwnerRoute><Accountants /></OwnerRoute>} />
          <Route path="/settings"            element={<Settings />} />
          <Route path="/subscribe"           element={<SubscribePlan />} />
        </Route>

        {/* Fallback */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}

// ─── Guards ───────────────────────────────────────────────

function PublicRoute({ children }) {
  const { user, isAdmin, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (user) return <Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />
  return children
}

function PrivateRoute({ children }) {
  const { user, isAdmin, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user)   return <Navigate to="/login"   replace />
  if (isAdmin) return <Navigate to="/admin"   replace />
  return children
}

function AdminRoute({ children }) {
  const { user, isAdmin, loading } = useAuth()
  if (loading)  return <LoadingScreen />
  if (!user)    return <Navigate to="/login"     replace />
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return children
}

function OwnerRoute({ children }) {
  const { role } = useAuth()
  if (role !== 'owner') return <Navigate to="/dashboard" replace />
  return children
}

function NotFound() {
  return (
    <div dir="rtl" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#94a3b8', textAlign: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 64 }}>🌐</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9' }}>404 — الصفحة غير موجودة</div>
      <a href="/dashboard" style={{ color: '#6366f1', textDecoration: 'none', fontSize: 15 }}>← العودة للرئيسية</a>
    </div>
  )
}
