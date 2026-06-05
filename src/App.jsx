import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoadingScreen from './components/LoadingScreen'
import Layout from './components/Layout'
import Login from './pages/Login'
import Pricing from './components/Pricing'
import SubscribePlan from './pages/SubscribePlan'
import Dashboard from './pages/Dashboard'
import Subscribers from './pages/Subscribers'
import SubscriberDetail from './pages/SubscriberDetail'
import Debts from './pages/Debts'
import Payments from './pages/Payments'
import Reports from './pages/Reports'
import Sheets from './pages/Sheets'
import Settings from './pages/Settings'
import Accountants from './pages/Accountants'
import AdminDashboard from './pages/admin/AdminDashboard'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (user) return <Navigate to="/" replace />
  return children
}

function AdminRoute({ children }) {
  const { user, company, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (!company?.is_admin) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={
        <PublicRoute><Login /></PublicRoute>
      }/>
      <Route path="/pricing" element={
        <ProtectedRoute><Pricing /></ProtectedRoute>
      }/>
      <Route path="/subscribe/:plan" element={
        <ProtectedRoute><SubscribePlan /></ProtectedRoute>
      }/>
      <Route path="/admin" element={
        <AdminRoute><AdminDashboard /></AdminRoute>
      }/>
      <Route path="/" element={
        <ProtectedRoute><Layout /></ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="subscribers" element={<Subscribers />} />
        <Route path="subscribers/:id" element={<SubscriberDetail />} />
        <Route path="debts" element={<Debts />} />
        <Route path="payments" element={<Payments />} />
        <Route path="reports" element={<Reports />} />
        <Route path="sheets" element={<Sheets />} />
        <Route path="settings" element={<Settings />} />
        <Route path="accountants" element={<Accountants />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
} 
