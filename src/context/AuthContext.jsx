import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null)
  const [company, setCompany]         = useState(null)
  const [accountant, setAccountant]   = useState(null) // sub-accountant info
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchUserContext(session.user)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) fetchUserContext(session.user)
        else { setCompany(null); setAccountant(null); setLoading(false) }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  async function fetchUserContext(authUser) {
    // Check if this user is an owner (has a company)
    const { data: companyData } = await supabase
      .from('companies')
      .select('*')
      .eq('owner_id', authUser.id)
      .single()

    if (companyData) {
      setCompany(companyData)
      setAccountant(null)
      setLoading(false)
      return
    }

    // Check if this user is a sub-accountant
    const { data: accData } = await supabase
      .from('sub_accountants')
      .select('*, companies(*)')
      .eq('auth_user_id', authUser.id)
      .eq('is_active', true)
      .single()

    if (accData) {
      setCompany(accData.companies) // load the parent company
      setAccountant({
        id:   accData.id,
        name: accData.name,
        role: accData.role,  // 'accountant' | 'viewer'
      })
      setLoading(false)
      return
    }

    setLoading(false)
  }

  async function signUp(email, password, companyName, phone) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { company_name: companyName } }
    })
    if (error) throw error
    if (data.user) {
      await supabase.from('companies')
        .update({ name: companyName, phone })
        .eq('owner_id', data.user.id)
    }
    return data
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email, password
    })
    if (error) throw error
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
    setCompany(null)
    setAccountant(null)
  }

  async function updateCompany(updates) {
    if (!company) return
    const { data, error } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', company.id)
      .select()
      .single()
    if (!error) setCompany(data)
    return { data, error }
  }

  const trialDaysLeft = company
    ? Math.max(0, Math.ceil(
        (new Date(company.trial_end) - new Date()) / 86400000
      ))
    : 7

  const isTrialActive = company?.plan === 'trial' && trialDaysLeft > 0
  const isPro = ['pro', 'business'].includes(company?.plan)
  const isAdmin = company?.is_admin === true

  // Accountant role checks
  const isViewer    = accountant?.role === 'viewer'
  const isAccountant = !!accountant

  return (
    <AuthContext.Provider value={{
      user, company, loading,
      accountant, isAccountant, isViewer,
      signUp, signIn, signOut,
      updateCompany,
      trialDaysLeft,
      isTrialActive,
      isPro, isAdmin,
      refreshCompany: () => user && fetchUserContext(user)
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
