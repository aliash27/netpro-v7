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

  // ── Core identity loader ───────────────────────────────────
  const loadCompany = useCallback(async (authUser) => {
    // Reset all identity state before every load
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
      // ── Step 1: Try owner lookup ─────────────────────────
      const { data: ownRow, error: ownerErr } = await supabase
        .from('companies')
        .select('*')
        .eq('owner_id', authUser.id)
        .maybeSingle()

      // Log but don't throw — RLS violations return an error here
      // when the user has no row, not just null
      if (ownerErr) {
        console.warn('[Auth] owner lookup:', ownerErr.code, ownerErr.message)
      }

      if (ownRow) {
        const superAdmin = ownRow.is_super_admin === true || ownRow.is_admin === true
        setCompany(ownRow)
        setIsSuperAdmin(superAdmin)
        setRole(superAdmin ? 'admin' : 'owner')
        setAccountant(null)
        if (!superAdmin) evaluateExpiry(ownRow)
        setLoading(false)
        return
      }

      // ── Step 2: No owner row found.
      //    Before concluding "no account", check if this auth user
      //    is a super-admin by email as a last resort.
      //    This handles the edge case where RLS blocked the SELECT
      //    but the user IS the admin.
      // ────────────────────────────────────────────────────────
      // We do a second attempt using the user's email directly.
      // This only works if the companies.email column matches.
      const { data: emailRow, error: emailErr } = await supabase
        .from('companies')
        .select('*')
        .eq('email', authUser.email)
        .maybeSingle()

      if (emailErr) {
        console.warn('[Auth] email lookup:', emailErr.code, emailErr.message)
      }

      if (emailRow) {
        const superAdmin = emailRow.is_super_admin === true || emailRow.is_admin === true

        // If owner_id was null (SET NULL on delete), fix it silently
        if (!emailRow.owner_id) {
          supabase
            .from('companies')
            .update({ owner_id: authUser.id })
            .eq('id', emailRow.id)
            .then(() => console.log('[Auth] Patched owner_id for', authUser.email))
        }

        setCompany(emailRow)
        setIsSuperAdmin(superAdmin)
        setRole(superAdmin ? 'admin' : 'owner')
        setAccountant(null)
        if (!superAdmin) evaluateExpiry(emailRow)
        setLoading(false)
        return
      }

      // ── Step 3: Try sub-accountant lookup ───────────────
      const { data: subRow, error: subErr } = await supabase
        .from('sub_accountants')
        .select('*, companies(*)')
        .eq('auth_user_id', authUser.id)
        .eq('is_active', true)
        .maybeSingle()

      if (subErr) {
        console.warn('[Auth] sub-accountant lookup:', subErr.code, subErr.message)
      }

      if (subRow?.companies) {
        setCompany(subRow.companies)
        setAccountant(subRow)
        setIsSuperAdmin(false)
        setRole(subRow.role === 'viewer' ? 'viewer' : 'accountant')
        evaluateExpiry(subRow.companies)
        setLoading(false)
        return
      }

      // ── Step 4: Authenticated but genuinely no company row ──
      // Could be a brand-new signup where the trigger hasn't fired,
      // or a deleted company. Show the empty state.
      console.warn('[Auth] No company found for', authUser.email, authUser.id)
      setLoading(false)

    } catch (err) {
      // Catch unexpected errors (network issues, etc.)
      console.error('[Auth] loadCompany crashed:', err.message)
      setLoading(false)
    }
  }, [])

  // ── Plan expiry (never applies to super-admins) ────────────
  function evaluateExpiry(comp) {
    if (!comp) { setPlanExpired(false); return }
    const expiry = comp.trial_end
      ? new Date(comp.trial_end)
      : comp.plan_end_date
        ? new Date(comp.plan_end_date)
        : null
    setPlanExpired(expiry ? expiry < new Date() : false)
  }

  // ── Auth listener ──────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    // Restore session on mount / page refresh
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return
      if (error) console.error('[Auth] getSession:', error.message)
      const u = session?.user ?? null
      setUser(u)
      loadCompany(u)
    })

    // React to sign-in, sign-out, token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return
        const u = session?.user ?? null
        setUser(u)

        if (!u) {
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
    // Clear state immediately so UI reacts before the network call
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
  const isAdmin       = isSuperAdmin        // backward-compat alias
  const isOwner       = role === 'owner'
  const isViewer      = role === 'viewer'
  const canWrite      = role === 'owner' || role === 'accountant' || isSuperAdmin
  const canDelete     = role === 'owner' || isSuperAdmin

  return (
    <AuthContext.Provider value={{
      user,
      company,
      accountant,
      role,
      loading,
      planExpired,
      isSuperAdmin,
      isAdmin,
      isOwner,
      isViewer,
      canWrite,
      canDelete,
      trialDaysLeft,
      isTrialActive,
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
