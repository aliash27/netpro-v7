import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null)
  const [company,     setCompany]     = useState(null)
  const [accountant,  setAccountant]  = useState(null)
  const [role,        setRole]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [planExpired, setPlanExpired] = useState(false)

  const loadCompany = useCallback(async (authUser) => {
    if (!authUser) {
      setCompany(null); setRole(null); setAccountant(null)
      setPlanExpired(false); setLoading(false)
      return
    }
    try {
      // هل هو مالك شركة؟
      const { data: ownRows, error: e1 } = await supabase
        .from('companies')
        .select('*')
        .eq('owner_id', authUser.id)
        .limit(1)

      if (e1) throw e1

      if (ownRows && ownRows.length > 0) {
        const c = ownRows[0]
        setCompany(c)
        setAccountant(null)
        setRole(c.is_admin ? 'admin' : 'owner')
        checkExpiry(c)
        setLoading(false)
        return
      }

      // هل هو محاسب فرعي؟
      const { data: subRows, error: e2 } = await supabase
        .from('sub_accountants')
        .select('*, companies(*)')
        .eq('auth_user_id', authUser.id)
        .eq('is_active', true)
        .limit(1)

      if (!e2 && subRows && subRows.length > 0 && subRows[0].companies) {
        const sub = subRows[0]
        setCompany(sub.companies)
        setAccountant(sub)
        setRole(sub.role === 'viewer' ? 'viewer' : 'accountant')
        checkExpiry(sub.companies)
      } else {
        setCompany(null)
        setRole(null)
        setAccountant(null)
      }
    } catch (err) {
      console.error('loadCompany error:', err.message)
      setCompany(null); setRole(null); setAccountant(null)
    } finally {
      setLoading(false)
    }
  }, [])

  function checkExpiry(comp) {
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

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      const u = session?.user ?? null
      setUser(u)
      loadCompany(u)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return
        const u = session?.user ?? null
        setUser(u)
        if (event === 'SIGNED_OUT') {
          setCompany(null); setRole(null); setAccountant(null)
          setPlanExpired(false); setLoading(false)
          return
        }
        loadCompany(u)
      }
    )

    return () => { mounted = false; subscription.unsubscribe() }
  }, [loadCompany])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signUp(email, password, companyName) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { company_name: companyName } }
    })
    if (error) throw error
    return data
  }

  async function signOut() {
    setLoading(true)
    await supabase.auth.signOut()
  }

  async function refreshCompany() {
    if (user) await loadCompany(user)
  }

  const trialDaysLeft = (() => {
    if (!company || company.plan !== 'trial' || !company.trial_end) return 0
    const diff = new Date(company.trial_end) - new Date()
    return Math.max(0, Math.ceil(diff / 86400000))
  })()

  const isTrialActive = company?.plan === 'trial' && trialDaysLeft > 0
  const isViewer  = role === 'viewer'
  const isAdmin   = role === 'admin'
  const isOwner   = role === 'owner'
  const canWrite  = role === 'owner' || role === 'accountant' || role === 'admin'
  const canDelete = role === 'owner' || role === 'admin'

  async function checkSubscriberLimit() {
    if (!company || isAdmin) return true
    const limit = company.max_subscribers ?? 999999
    if (limit >= 999999) return true
    const { count } = await supabase
      .from('subscribers')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('is_active', true)
    return (count ?? 0) < limit
  }

  return (
    <AuthContext.Provider value={{
      user, company, accountant, role, loading, planExpired,
      trialDaysLeft, isTrialActive,
      isViewer, isAdmin, isOwner, canWrite, canDelete,
      signIn, signUp, signOut, refreshCompany, checkSubscriberLimit,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
