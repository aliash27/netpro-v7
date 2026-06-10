import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Suspense, lazy } from 'react'

// Lazy load كل الصفحات لتجنب أخطاء الاستيراد
const Layout         = lazy(() => import('./components/Layout'))
const Login          = lazy(() => import('./pages/Login'))
const Dashboard      = lazy(() => import('./pages/Dashboard'))
const Subscribers    = lazy(() => import('./pages/Subscribers'))
const SubscriberDetail = lazy(() => import('./pages/SubscriberDetail'))
const Debts          = lazy(() => import('./pages/Debts'))
const Payments       = lazy(() => import('./pages/Payments'))
const Reports        = lazy(() => import('./pages/Reports'))
const Sheets         = lazy(() => import('./pages/Sheets'))
const Settings       = lazy(() => import('./pages/Settings'))
const Accountants    = lazy(() => import('./pages/Accountants'))
const SubscribePlan  = lazy(() => import('./pages/SubscribePlan'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))

// Loading بسيط بدون CSS خارجي
function SimpleLoading() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{ fontSize: 48 }}>📡</div>
      <div style={{
        fontSize: 20, fontWeight: 800, color: '#fff'
      }}>نيت برو</div>
      <div style={{ fontSize: 13, color: '#64748b' }}>جاري التحميل...</div>
      <div style={{
        width: 200, height: 4, background: '#1e293b', borderRadius: 4, overflow: 'hidden'
      }}>
        <div style={{
          width: '60%', height: '100%',
          background: 'linear-gradient(90deg,#3b82f6,#8b5cf6)',
          borderRadius: 4,
          animation: 'slide 1.5s ease-in-out infinite'
        }} />
      </div>
      <style>{`
        @keyframes slide {
          0% { transform: translateX(-100%) }
          100% { transform: translateX(300%) }
        }
      `}</style>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<SimpleLoading />}>
          <AppRoutes />
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}

function AppRoutes() {
  const { loading, user, isAdmin } = useAuth()

  if (loading) return <SimpleLoading />

  return (
    <Routes>
      {/* عام */}
      <Route path="/login" element={
        user ? <Navigate to={isAdmin ? '/admin' : '/dashboard'} replace /> : <Login />
      } />

      {/* أدمن */}
      <Route path="/admin" element={
        !user ? <Navigate to="/login" replace /> :
        !isAdmin ? <Navigate to="/dashboard" replace /> :
        <AdminDashboard />
      } />

      {/* مستخدم عادي */}
      <Route element={
        !user ? <Navigate to="/login" replace /> :
        isAdmin ? <Navigate to="/admin" replace /> :
        <Layout />
      }>
        <Route path="/dashboard"       element={<Dashboard />} />
        <Route path="/subscribers"     element={<Subscribers />} />
        <Route path="/subscribers/:id" element={<SubscriberDetail />} />
        <Route path="/debts"           element={<Debts />} />
        <Route path="/payments"        element={<Payments />} />
        <Route path="/reports"         element={<Reports />} />
        <Route path="/sheets"          element={<Sheets />} />
        <Route path="/accountants"     element={<Accountants />} />
        <Route path="/settings"        element={<Settings />} />
        <Route path="/subscribe"       element={<SubscribePlan />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
