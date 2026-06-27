// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,         setUser]         = useState(null)
  const [company,      setCompany]      = useState(null)
  const [accountant,   setAccountant]   = useState(null)
  const [role,         setRole]         = useState(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [planExpired,  setPlanExpired]  = useState(false)

  // ── Reset all identity state ───────────────────────────────
  function resetState() {
    setCompany(null)
    setAccountant(null)
    setRole(null)
    setIsSuperAdmin(false)
    setPlanExpired(false)
  }

  // ── Core loader ────────────────────────────────────────────
  const loadCompany = useCallback(async (authUser) => {
    resetState()

    if (!authUser?.id) {
      setLoading(false)
      return
    }

    try {
      // ── Attempt 1: lookup by owner_id ──────────────────────
      const { data: row1, error: err1 } = await supabase
        .from('companies')
        .select('*')
        .eq('owner_id', authUser.id)
        .maybeSingle()

      if (err1) {
        // Log the code so we can diagnose RLS issues in console
        console.warn('[Auth] owner_id lookup failed:', err1.code, err1.message)
      }

      if (row1) {
        applyCompanyRow(row1)
        setLoading(false)
        return
      }

      // ── Attempt 2: lookup by email ─────────────────────────
      // Handles the case where owner_id was nulled (ON DELETE SET NULL)
      // or the trigger didn't fire yet
      const { data: row2, error: err2 } = await supabase
        .from('companies')
        .select('*')
        .eq('email', authUser.email)
        .maybeSingle()

      if (err2) {
        console.warn('[Auth] email lookup failed:', err2.code, err2.message)
      }

      if (row2) {
        // Silently repair owner_id if it's missing
        if (!row2.owner_id) {
          supabase
            .from('companies')
            .update({ owner_id: authUser.id })
            .eq('id', row2.id)
            .then(() => {})
        }
        applyCompanyRow(row2)
        setLoading(false)
        return
      }

      // ── Attempt 3: sub-accountant ──────────────────────────
      const { data: subRow, error: err3 } = await supabase
        .from('sub_accountants')
        .select('*, companies(*)')
        .eq('auth_user_id', authUser.id)
        .eq('is_active', true)
        .maybeSingle()

      if (err3) {
        console.warn('[Auth] sub_accountant lookup failed:', err3.code, err3.message)
      }

      if (subRow?.companies) {
        setCompany(subRow.companies)
        setAccountant(subRow)
        setIsSuperAdmin(false)
        setRole(subRow.role === 'viewer' ? 'viewer' : 'accountant')
        evaluateExpiry(subRow.companies, false)
        setLoading(false)
        return
      }

      // ── No record found — genuine new/deleted user ─────────
      console.warn('[Auth] no company record for', authUser.email)
      setLoading(false)

    } catch (err) {
      console.error('[Auth] loadCompany error:', err.message)
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply a companies row to state ─────────────────────────
  function applyCompanyRow(row) {
    const superAdmin = row.is_super_admin === true || row.is_admin === true
    setCompany(row)
    setIsSuperAdmin(superAdmin)
    setRole(superAdmin ? 'admin' : 'owner')
    setAccountant(null)
    evaluateExpiry(row, superAdmin)
  }

  // ── Plan expiry — super-admins never expire ────────────────
  function evaluateExpiry(comp, superAdmin) {
    if (!comp || superAdmin) { setPlanExpired(false); return }
    const expiryStr = comp.trial_end || comp.plan_end_date || null
    if (!expiryStr) { setPlanExpired(false); return }
    setPlanExpired(new Date(expiryStr) < new Date())
  }

  // ── Auth listener ──────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return
      if (error) console.error('[Auth] getSession:', error.message)
      const u = session?.user ?? null
      setUser(u)
      loadCompany(u)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return
        const u = session?.user ?? null
        setUser(u)
        if (!u) {
          resetState()
          setLoading(false)
          return
        }
        loadCompany(u)
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadCompany])

  // ── Auth actions ───────────────────────────────────────────
  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signUp(email, password, companyName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { company_name: companyName } },
    })
    if (error) throw error
    return data
  }

  async function signOut() {
    resetState()
    setUser(null)
    await supabase.auth.signOut()
  }

  async function refreshCompany() {
    if (user) {
      setLoading(true)
      await loadCompany(user)
    }
  }

  async function checkSubscriberLimit() {
    if (!company || isSuperAdmin) return true
    const limit = company.max_subscribers
    if (!limit || limit <= 0 || limit >= 99999) return true
    const { count } = await supabase
      .from('subscribers')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('is_active', true)
    return (count ?? 0) < limit
  }

  // ── Derived values ─────────────────────────────────────────
  const trialDaysLeft = (() => {
    if (!company?.trial_end) return 0
    const diff = new Date(company.trial_end) - new Date()
    return Math.max(0, Math.ceil(diff / 86400000))
  })()

  const isTrialActive = company?.plan === 'trial' && trialDaysLeft > 0
  const isAdmin       = isSuperAdmin   // backward-compat alias used by Layout & pages
  const isOwner       = role === 'owner'
  const isViewer      = role === 'viewer'
  const canWrite      = role === 'owner' || role === 'accountant' || isSuperAdmin
  const canDelete     = role === 'owner' || isSuperAdmin

  return (
    <AuthContext.Provider value={{
      // State
      user,
      company,
      accountant,
      role,
      loading,
      planExpired,

      // Role flags
      isSuperAdmin,
      isAdmin,      // alias — Layout.jsx, Dashboard.jsx, etc. import this
      isOwner,
      isViewer,
      canWrite,
      canDelete,

      // Plan helpers
      trialDaysLeft,
      isTrialActive,

      // Actions
      signIn,
      signUp,
      signOut,
      refreshCompany,
      checkSubscriberLimit,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
