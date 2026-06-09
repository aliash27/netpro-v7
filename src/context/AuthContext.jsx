import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null)
  const [company, setCompany]   = useState(null)
  const [role, setRole]         = useState(null)   // 'owner' | 'accountant' | 'viewer' | 'admin'
  const [loading, setLoading]   = useState(true)
  const [planExpired, setPlanExpired] = useState(false)

  // ─── تحميل بيانات الشركة ───────────────────────────────
  const loadCompany = useCallback(async (authUser) => {
    if (!authUser) {
      setCompany(null); setRole(null); setPlanExpired(false)
      return
    }

    try {
      // هل هو مالك شركة؟
      const { data: ownCompany } = await supabase
        .from('companies')
        .select('*')
        .eq('owner_id', authUser.id)
        .maybeSingle()

      if (ownCompany) {
        setCompany(ownCompany)
        setRole(ownCompany.is_admin ? 'admin' : 'owner')
        _checkPlanExpiry(ownCompany)
        return
      }

      // هل هو محاسب فرعي؟
      const { data: subAcc } = await supabase
        .from('sub_accountants')
        .select('*, companies(*)')
        .eq('auth_user_id', authUser.id)
        .eq('is_active', true)
        .maybeSingle()

      if (subAcc?.companies) {
        setCompany(subAcc.companies)
        setRole(subAcc.role === 'viewer' ? 'viewer' : 'accountant')
        _checkPlanExpiry(subAcc.companies)
        return
      }

      // لا توجد شركة مرتبطة
      setCompany(null); setRole(null)
    } catch (err) {
      console.error('loadCompany error:', err)
      setCompany(null); setRole(null)
    }
  }, [])

  // ─── فحص انتهاء الباقة ────────────────────────────────
  function _checkPlanExpiry(comp) {
    if (!comp || comp.is_admin) { setPlanExpired(false); return }

    const now = new Date()
    if (comp.plan === 'trial' && comp.trial_end) {
      setPlanExpired(new Date(comp.trial_end) < now)
    } else if (comp.plan_end_date) {
      setPlanExpired(new Date(comp.plan_end_date) < now)
    } else {
      setPlanExpired(false)
    }
  }

  // ─── الاستماع لتغييرات Auth ────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      loadCompany(session?.user ?? null).finally(() => setLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        if (event === 'SIGNED_OUT') {
          setCompany(null); setRole(null); setPlanExpired(false); setLoading(false)
          return
        }
        await loadCompany(session?.user ?? null)
        setLoading(false)
      }
    )
    return () => subscription.unsubscribe()
  }, [loadCompany])

  // ─── تسجيل الدخول ────────────────────────────────────
  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  // ─── إنشاء حساب جديد ─────────────────────────────────
  async function signUp(email, password, companyName) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { company_name: companyName } }
    })
    if (error) throw error
    return data
  }

  // ─── تسجيل الخروج ────────────────────────────────────
  async function signOut() {
    await supabase.auth.signOut()
  }

  // ─── إعادة تحميل بيانات الشركة (بعد تحديث الباقة مثلاً) ──
  async function refreshCompany() {
    if (user) await loadCompany(user)
  }

  // ─── الصلاحيات ────────────────────────────────────────
  const canWrite  = role === 'owner' || role === 'accountant' || role === 'admin'
  const canDelete = role === 'owner' || role === 'admin'
  const isAdmin   = role === 'admin'
  const isOwner   = role === 'owner'

  // ─── فحص حد المشتركين ─────────────────────────────────
  async function checkSubscriberLimit() {
    if (!company || isAdmin) return true
    const limit = company.max_subscribers ?? 100
    if (limit >= 999999) return true
    const { count } = await supabase
      .from('subscribers')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('is_active', true)
    return (count ?? 0) < limit
  }

  const value = {
    user,
    company,
    role,
    loading,
    planExpired,
    canWrite,
    canDelete,
    isAdmin,
    isOwner,
    signIn,
    signUp,
    signOut,
    refreshCompany,
    checkSubscriberLimit,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
