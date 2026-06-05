/**
 * NotificationEngine
 * يعمل في الخلفية عند كل فتح للتطبيق ويتحقق من:
 * 1. مشتركون متأخرون (عاجل: 3+ أشهر، عادي: أي تأخر)
 * 2. مشتركون تنتهي اشتراكاتهم خلال 7 أيام
 * 3. انتهاء اشتراك الشركة / الفترة التجريبية
 */
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from './Toast'

function calcDebt(sub, paidMonths = []) {
  if (!sub?.start_date) return []
  const now     = new Date()
  const paidSet = new Set(paidMonths)
  const months  = []

  if (paidMonths.length > 0) {
    const startD = new Date(sub.start_date)
    let y = startD.getFullYear(), m = startD.getMonth() + 1
    while (new Date(y, m - 1) <= now) {
      const key = `${y}-${String(m).padStart(2,'0')}`
      if (!paidSet.has(key)) months.push(key)
      m++; if (m > 12) { m = 1; y++ }
    }
    return months
  }

  if (sub.last_paid_month) {
    const [ly, lm] = sub.last_paid_month.split('-').map(Number)
    let y = ly, m = lm + 1
    if (m > 12) { m = 1; y++ }
    while (new Date(y, m - 1) <= now) {
      months.push(`${y}-${String(m).padStart(2,'0')}`)
      m++; if (m > 12) { m = 1; y++ }
    }
    return months
  }

  const startD = new Date(sub.start_date)
  let y = startD.getFullYear(), m = startD.getMonth() + 1
  while (new Date(y, m - 1) <= now) {
    months.push(`${y}-${String(m).padStart(2,'0')}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return months
}

export default function NotificationEngine() {
  const { company, trialDaysLeft, isTrialActive } = useAuth()

  useEffect(() => {
    if (!company) return
    const key   = 'np_notif_' + new Date().toISOString().slice(0,10)
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
    // Stagger checks so toasts don't stack
    setTimeout(checkDebtors,    2000)
    setTimeout(checkExpiries,   5000)
    setTimeout(checkPlanExpiry, 7000)
  }, [company])

  async function checkDebtors() {
    if (!company) return
    const [{ data: subs }, { data: pays }] = await Promise.all([
      supabase.from('subscribers').select('id,name,start_date,monthly_fee')
        .eq('company_id', company.id).eq('is_active', true),
      supabase.from('payments').select('subscriber_id,month')
        .eq('company_id', company.id)
    ])
    const pm = {}
    for (const p of (pays||[])) {
      if (!pm[p.subscriber_id]) pm[p.subscriber_id] = []
      pm[p.subscriber_id].push(p.month)
    }
    const late    = (subs||[]).filter(s => calcDebt(s, pm[s.id]||[]).length > 0)
    const urgent  = late.filter(s => calcDebt(s, pm[s.id]||[]).length >= 3)
    if (urgent.length)
      toast(`🚨 ${urgent.length} مشترك متأخر 3 أشهر أو أكثر — متابعة عاجلة!`, 'e', 8000)
    else if (late.length)
      toast(`⚠️ ${late.length} مشترك متأخر عن الدفع`, 'w', 5000)
  }

  async function checkExpiries() {
    if (!company) return
    const { data: subs } = await supabase
      .from('subscribers').select('id,name,subscription_end')
      .eq('company_id', company.id).eq('is_active', true)
      .not('subscription_end', 'is', null)
    const now     = new Date()
    const soon    = (subs||[]).filter(s => {
      const d = new Date(s.subscription_end)
      const days = Math.ceil((d - now) / 86400000)
      return days >= 0 && days <= 7
    })
    const expired = (subs||[]).filter(s => new Date(s.subscription_end) < now)
    if (expired.length)
      toast(`🔴 ${expired.length} مشترك انتهى اشتراكه`, 'e', 7000)
    else if (soon.length)
      toast(`⏳ ${soon.length} مشترك اشتراكه على وشك الانتهاء`, 'w', 6000)
  }

  function checkPlanExpiry() {
    if (!company) return
    if (isTrialActive) {
      if (trialDaysLeft <= 2)
        toast(`🔴 ينتهي حسابك التجريبي خلال ${trialDaysLeft} أيام فقط — جدد الآن`, 'e', 0)
      else if (trialDaysLeft <= 5)
        toast(`⏰ متبقي ${trialDaysLeft} أيام من التجربة المجانية`, 'w', 6000)
      return
    }
    if (company.plan !== 'trial' && company.trial_end) {
      const days = Math.ceil((new Date(company.trial_end) - new Date()) / 86400000)
      if (days <= 0)
        toast(`🔴 انتهى اشتراكك — تواصل: wa.me/9647707505999`, 'e', 0)
      else if (days <= 7)
        toast(`⏳ اشتراكك ينتهي خلال ${days} أيام — جدد لتجنب الانقطاع`, 'w', 8000)
    }
  }

  return null
}
