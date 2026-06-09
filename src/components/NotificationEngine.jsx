/**
 * NotificationEngine
 * يعمل في الخلفية لفحص الديون والاشتراكات المنتهية
 * وتخزين الإشعارات في جدول notifications (تستمر بين الجلسات)
 */
import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ARABIC_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

export default function NotificationEngine() {
  const { company, canWrite } = useAuth()
  const lastRun = useRef(null)

  useEffect(() => {
    if (!company || !canWrite) return

    // شغّل فور التحميل
    runChecks()

    // وكل 30 دقيقة
    const t = setInterval(runChecks, 30 * 60_000)
    return () => clearInterval(t)
  }, [company])

  async function runChecks() {
    if (!company) return
    // منع التشغيل المتكرر خلال 5 دقائق
    const now = Date.now()
    if (lastRun.current && now - lastRun.current < 5 * 60_000) return
    lastRun.current = now

    await Promise.all([
      checkDebts(),
      checkExpiry(),
    ])
  }

  // ─── فحص الديون ──────────────────────────────────────
  async function checkDebts() {
    const { data: subs } = await supabase
      .from('subscribers')
      .select('id, name, start_date, monthly_fee, last_paid_month')
      .eq('company_id', company.id)
      .eq('is_active', true)

    if (!subs?.length) return

    const now     = new Date()
    const curYear = now.getFullYear()
    const curMon  = now.getMonth() + 1
    const toCreate = []

    for (const s of subs) {
      const debt = calcDebtMonths(s, curYear, curMon)
      if (debt >= 2) {
        // هل يوجد إشعار حديث لهذا المشترك؟
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('company_id', company.id)
          .eq('type', 'debt')
          .eq('subscriber_id', s.id)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .maybeSingle()

        if (!existing) {
          toCreate.push({
            company_id:    company.id,
            type:          'debt',
            title:         `دين متراكم: ${s.name}`,
            body:          `${debt} شهر غير مدفوع — ${(debt * s.monthly_fee).toLocaleString()} IQD`,
            subscriber_id: s.id,
          })
        }
      }
    }

    if (toCreate.length) {
      await supabase.from('notifications').insert(toCreate)
    }
  }

  // ─── فحص الانتهاء القريب ─────────────────────────────
  async function checkExpiry() {
    const soon = new Date()
    soon.setDate(soon.getDate() + 7)

    const { data: subs } = await supabase
      .from('subscribers')
      .select('id, name, subscription_end')
      .eq('company_id', company.id)
      .eq('is_active', true)
      .not('subscription_end', 'is', null)
      .lte('subscription_end', soon.toISOString().split('T')[0])
      .gte('subscription_end', new Date().toISOString().split('T')[0])

    if (!subs?.length) return

    const toCreate = []
    for (const s of subs) {
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('company_id', company.id)
        .eq('type', 'expiry')
        .eq('subscriber_id', s.id)
        .gte('created_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
        .maybeSingle()

      if (!existing) {
        const days = Math.ceil((new Date(s.subscription_end) - new Date()) / 86400000)
        toCreate.push({
          company_id:    company.id,
          type:          'expiry',
          title:         `اشتراك ينتهي قريباً: ${s.name}`,
          body:          `ينتهي خلال ${days} ${days === 1 ? 'يوم' : 'أيام'} — ${s.subscription_end}`,
          subscriber_id: s.id,
        })
      }
    }

    if (toCreate.length) {
      await supabase.from('notifications').insert(toCreate)
    }
  }

  return null // لا يعرض شيئاً
}

// ─── حساب أشهر الدين ─────────────────────────────────────
function calcDebtMonths(sub, curYear, curMon) {
  if (!sub.start_date) return 0

  const start = new Date(sub.start_date)
  let debtFrom = { year: start.getFullYear(), month: start.getMonth() + 1 }

  if (sub.last_paid_month) {
    const [y, m] = sub.last_paid_month.split('-').map(Number)
    if (!isNaN(y) && !isNaN(m)) {
      // الشهر التالي بعد آخر دفعة
      debtFrom = m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 }
    }
  }

  let count = 0
  let y = debtFrom.year, m = debtFrom.month
  while (y < curYear || (y === curYear && m <= curMon)) {
    count++
    m++
    if (m > 12) { m = 1; y++ }
  }
  return Math.max(0, count - 1) // الشهر الحالي لا يحتسب ديناً
}
