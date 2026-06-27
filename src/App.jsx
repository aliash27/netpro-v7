import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Suspense, lazy } from 'react'
import { ToastContainer } from './components/Toast'

const Layout           = lazy(() => import('./components/Layout'))
const Login            = lazy(() => import('./pages/Login'))
const Dashboard        = lazy(() => import('./pages/Dashboard'))
const Subscribers      = lazy(() => import('./pages/Subscribers'))
const SubscriberDetail = lazy(() => import('./pages/SubscriberDetail'))
const Debts            = lazy(() => import('./pages/Debts'))
const Payments         = lazy(() => import('./pages/Payments'))
const Reports          = lazy(() => import('./pages/Reports'))
const Sheets           = lazy(() => import('./pages/Sheets'))
const Settings         = lazy(() => import('./pages/Settings'))
const Accountants      = lazy(() => import('./pages/Accountants'))
const SubscribePlan    = lazy(() => import('./pages/SubscribePlan'))
const AdminDashboard   = lazy(() => import('./pages/admin/AdminDashboard'))

function FullPageLoader() {
  return (
    <div style={{
      minHeight: '100vh', background: '#0f172a',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 18, fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ fontSize: 52 }}>📡</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>نيت برو</div>
      <div style={{ fontSize: 13, color: '#64748b' }}>جاري التحميل...</div>
      <div style={{
        width: 200, height: 3,
        background: '#1e293b', borderRadius: 4, overflow: 'hidden',
      }}>
        <div style={{
          width: '55%', height: '100%',
          background: 'linear-gradient(90deg,#3b82f6,#8b5cf6)',
          borderRadius: 4,
          animation: 'npSlide 1.4s ease-in-out infinite',
        }} />
      </div>
      <style>{`
        @keyframes npSlide {
          0%   { transform: translateX(-180%); }
          100% { transform: translateX(420%); }
        }
      `}</style>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastContainer />
        <Suspense fallback={<FullPageLoader />}>
          <AppRoutes />
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}

function AppRoutes() {
  const { loading, user, isSuperAdmin } = useAuth()

  if (loading) return <FullPageLoader />

  return (
    <Routes>

      {/* Public */}
      <Route path="/login" element={
        !user        ? <Login /> :
        isSuperAdmin ? <Navigate to="/admin"     replace /> :
                       <Navigate to="/dashboard" replace />
      } />

      {/* Super-admin — never mounts Layout */}
      <Route path="/admin" element={
        !user         ? <Navigate to="/login"     replace /> :
        !isSuperAdmin ? <Navigate to="/dashboard" replace /> :
        <AdminDashboard />
      } />
      <Route path="/admin/*" element={
        !user         ? <Navigate to="/login"     replace /> :
        !isSuperAdmin ? <Navigate to="/dashboard" replace /> :
        <AdminDashboard />
      } />

      {/* Regular users — isSuperAdmin check prevents Layout mounting */}
      <Route element={
        !user        ? <Navigate to="/login" replace /> :
        isSuperAdmin ? <Navigate to="/admin" replace /> :
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
        <Route path="/subscribe/:plan" element={<SubscribePlan />} />
        <Route path="/pricing"         element={<SubscribePlan />} />
      </Route>

      {/* Catch-all */}
      <Route path="/" element={
        !user        ? <Navigate to="/login"     replace /> :
        isSuperAdmin ? <Navigate to="/admin"     replace /> :
                       <Navigate to="/dashboard" replace />
      } />
      <Route path="*" element={
        !user        ? <Navigate to="/login"     replace /> :
        isSuperAdmin ? <Navigate to="/admin"     replace /> :
                       <Navigate to="/dashboard" replace />
      } />

    </Routes>
  )
}
