import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,         setUser]         = useState(null)
  const [company,      setCompany]      = useState(null)
  const [accountant,   setAccountant]   = useState(null)
  const [role,         setRole]         = useState(null)        // 'admin'|'owner'|'accountant'|'viewer'|null
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [planExpired,  setPlanExpired]  = useState(false)

  // ─────────────────────────────────────────────────────────────
  // Core loader — called on every auth state change
  // Strategy: try owner lookup → try sub-accountant lookup → give up
  // ─────────────────────────────────────────────────────────────
  const loadCompany = useCallback(async (authUser) => {
    // Always reset first so stale state never leaks between sessions
    setCompany(null)
    setAccountant(null)
    setRole(null)
    setIsSuperAdmin(false)
    setPlanExpired(false)

    if (!authUser?.id) {
      setLoading(false)
      return
    }

    try {
      // ── 1. Look up by owner_id ──────────────────────────────
      // Use maybeSingle() so a missing row returns null instead of error
      const { data: ownRow, error: e1 } = await supabase
        .from('companies')
        .select('*')
        .eq('owner_id', authUser.id)
        .maybeSingle()

      if (e1) {
        console.error('[AuthContext] owner lookup error:', e1.message, e1.code)
        // Don't throw — fall through to sub-accountant check
      }

      if (ownRow) {
        // Determine super-admin: check is_super_admin first, fall back to is_admin
        const superAdmin =
          ownRow.is_super_admin === true ||
          ownRow.is_admin === true

        setCompany(ownRow)
        setIsSuperAdmin(superAdmin)
        setRole(superAdmin ? 'admin' : 'owner')
        setAccountant(null)
        if (!superAdmin) checkExpiry(ownRow)
        setLoading(false)
        return
      }

      // ── 2. Look up as sub-accountant ────────────────────────
      // Table name in your real schema is `sub_accountants`
      const { data: subRow, error: e2 } = await supabase
        .from('sub_accountants')
        .select('*, companies(*)')
        .eq('auth_user_id', authUser.id)
        .eq('is_active', true)
        .maybeSingle()

      if (e2) {
        console.error('[AuthContext] sub-accountant lookup error:', e2.message, e2.code)
      }

      if (subRow?.companies) {
        setCompany(subRow.companies)
        setAccountant(subRow)
        setIsSuperAdmin(false)
        setRole(subRow.role === 'viewer' ? 'viewer' : 'accountant')
        checkExpiry(subRow.companies)
        setLoading(false)
        return
      }

      // ── 3. Authenticated but no company row found ───────────
      // This is the "لا يوجد حساب مرتبط" case.
      // We still set the user — the UI will show the empty state.
      console.warn('[AuthContext] No company row found for uid:', authUser.id, 'email:', authUser.email)
      setLoading(false)

    } catch (err) {
      console.error('[AuthContext] Unexpected error in loadCompany:', err)
      setLoading(false)
    }
  }, [])

  // ─────────────────────────────────────────────────────────────
  // Plan expiry check (never applies to super-admin)
  // ─────────────────────────────────────────────────────────────
  function checkExpiry(comp) {
    if (!comp) { setPlanExpired(false); return }
    const now = new Date()
    // Check trial_end first, then plan_end_date
    const expiryDate = comp.trial_end
      ? new Date(comp.trial_end)
      : comp.plan_end_date
        ? new Date(comp.plan_end_date)
        : null

    if (!expiryDate) { setPlanExpired(false); return }
    setPlanExpired(expiryDate < now)
  }

  // ─────────────────────────────────────────────────────────────
  // Auth state listener — single source of truth
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    // Get existing session immediately (handles page refresh)
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return
      if (error) console.error('[AuthContext] getSession error:', error.message)
      const u = session?.user ?? null
      setUser(u)
      loadCompany(u)
    })

    // Listen for sign-in / sign-out / token-refresh events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return
        const u = session?.user ?? null
        setUser(u)

        if (!u) {
          // Signed out — clear everything
          setCompany(null)
          setAccountant(null)
          setRole(null)
          setIsSuperAdmin(false)
          setPlanExpired(false)
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

  // ─────────────────────────────────────────────────────────────
  // Auth actions
  // ─────────────────────────────────────────────────────────────
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
    // Pre-clear state so the UI reacts instantly
    setUser(null)
    setCompany(null)
    setAccountant(null)
    setRole(null)
    setIsSuperAdmin(false)
    setPlanExpired(false)
    await supabase.auth.signOut()
  }

  async function refreshCompany() {
    if (user) {
      setLoading(true)
      await loadCompany(user)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Subscriber limit check
  // ─────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────
  // Derived values
  // ─────────────────────────────────────────────────────────────
  const trialDaysLeft = (() => {
    if (!company || !company.trial_end) return 0
    const diff = new Date(company.trial_end) - new Date()
    return Math.max(0, Math.ceil(diff / 86400000))
  })()

  const isTrialActive = company?.plan === 'trial' && trialDaysLeft > 0
  const isAdmin       = isSuperAdmin   // backward-compat alias
  const isOwner       = role === 'owner'
  const isViewer      = role === 'viewer'
  const canWrite      = role === 'owner' || role === 'accountant' || isSuperAdmin
  const canDelete     = role === 'owner' || isSuperAdmin

  return (
    <AuthContext.Provider value={{
      // Raw state
      user,
      company,
      accountant,
      role,
      loading,
      planExpired,

      // Role flags — use these in components
      isSuperAdmin,
      isAdmin,       // alias for isSuperAdmin — keeps old pages working
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
