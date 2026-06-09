/**
 * NotificationEngine v10
 * Smart startup notifications using shared calcDebt
 */
import { useEffect } from 'react'
import { supabase }  from '../lib/supabase'
import { useAuth }   from '../context/AuthContext'
import { toast }     from './Toast'
import { calcDebt, buildPaidMap } from '../utils'

export default function NotificationEngine() {
  const { company, trialDaysLeft, isTrialActive } = useAuth()

  useEffect(() => {
    if (!company) return
    const key = 'np_notif_' + new Date().toISOString().slice(0, 10)
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')

    setTimeout(checkDebtors,    2000)
    setTimeout(checkExpiries,   5500)
    setTimeout(checkPlanExpiry, 8000)
  }, [company])

  async function checkDebtors() {
    if (!company) return
    const [{ data: subs, error: e1 }, { data: pays, error: e2 }] = await Promise.all([
      supabase.from('subscribers').select('id,name,start_date,monthly_fee,last_paid_month')
        .eq('company_id', company.id).eq('is_active', true),
      supabase.from('payments').select('subscriber_id,month')
        .eq('company_id', company.id)
    ])
    if (e1 || e2) return
    const pm     = buildPaidMap(pays || [])
    const late   = (subs || []).filter(s => calcDebt(s, pm[s.id] || []).length > 0)
    const urgent = late.filter(s => calcDebt(s, pm[s.id] || []).length >= 3)
    if (urgent.length)
      toast(`🚨 ${urgent.length} مشترك متأخر 3 أشهر أو أكثر — متابعة عاجلة!`, 'e', 8000)
    else if (late.length)
      toast(`⚠️ ${late.length} مشترك متأخر عن الدفع`, 'w', 5000)
  }

  async function checkExpiries() {
    if (!company) return
    const { data: subs, error } = await supabase
      .from('subscribers').select('id,name,subscription_end')
      .eq('company_id', company.id).eq('is_active', true)
      .not('subscription_end', 'is', null)
    if (error) return
    const now     = new Date()
    const soon    = (subs || []).filter(s => {
      const d = new Date(s.subscription_end)
      const days = Math.ceil((d - now) / 86400000)
      return days >= 0 && days <= 7
    })
    const expired = (subs || []).filter(s => new Date(s.subscription_end) < now)
    if (expired.length)
      toast(`🔴 ${expired.length} مشترك انتهى اشتراكه`, 'e', 7000)
    else if (soon.length)
      toast(`⏳ ${soon.length} مشترك اشتراكه على وشك الانتهاء`, 'w', 6000)
  }

  function checkPlanExpiry() {
    if (!company) return
    if (isTrialActive) {
      if (trialDaysLeft <= 2)
        toast(`🔴 ينتهي حسابك التجريبي خلال ${trialDaysLeft} أيام — جدد الآن`, 'e', 0)
      else if (trialDaysLeft <= 5)
        toast(`⏰ متبقي ${trialDaysLeft} أيام من التجربة المجانية`, 'w', 6000)
      return
    }
    if (company.trial_end) {
      const days = Math.ceil((new Date(company.trial_end) - new Date()) / 86400000)
      if (days <= 0)
        toast(`🔴 انتهى اشتراكك — تواصل معنا لتجديده`, 'e', 0)
      else if (days <= 7)
        toast(`⏳ اشتراكك ينتهي خلال ${days} أيام — جدد لتجنب الانقطاع`, 'w', 8000)
    }
  }

  return null
}
