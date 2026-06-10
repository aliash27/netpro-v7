import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null)
  const [company,     setCompany]     = useState(null)
  const [role,        setRole]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [planExpired, setPlanExpired] = useState(false)

  const loadCompany = useCallback(async (authUser) => {
    if (!authUser) {
      setCompany(null); setRole(null); setPlanExpired(false)
      return
    }
    try {
      // هل هو مالك شركة؟
      const { data: ownRows } = await supabase
        .from('companies')
        .select('*')
        .eq('owner_id', authUser.id)
        .limit(1)

      if (ownRows && ownRows.length > 0) {
        const c = ownRows[0]
        setCompany(c)
        setRole(c.is_admin ? 'admin' : 'owner')
        checkExpiry(c)
        return
      }

      // هل هو محاسب فرعي؟
      const { data: subRows } = await supabase
        .from('sub_accountants')
        .select('role, company_id, companies(*)')
        .eq('auth_user_id', authUser.id)
        .eq('is_active', true)
        .limit(1)

      if (subRows && subRows.length > 0 && subRows[0].companies) {
        const sub = subRows[0]
        setCompany(sub.companies)
        setRole(sub.role === 'viewer' ? 'viewer' : 'accountant')
        checkExpiry(sub.companies)
        return
      }

      setCompany(null); setRole(null)
    } catch (err) {
      console.error('loadCompany:', err.message)
      setCompany(null); setRole(null)
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
      loadCompany(u).finally(() => { if (mounted) setLoading(false) })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return
        const u = session?.user ?? null
        setUser(u)
        if (event === 'SIGNED_OUT') {
          setCompany(null); setRole(null); setPlanExpired(false); setLoading(false)
          return
        }
        await loadCompany(u)
        if (mounted) setLoading(false)
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
    await supabase.auth.signOut()
  }

  async function refreshCompany() {
    if (user) await loadCompany(user)
  }

  const canWrite  = role === 'owner' || role === 'accountant' || role === 'admin'
  const canDelete = role === 'owner' || role === 'admin'
  const isAdmin   = role === 'admin'
  const isOwner   = role === 'owner'

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

  return (
    <AuthContext.Provider value={{
      user, company, role, loading, planExpired,
      canWrite, canDelete, isAdmin, isOwner,
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
