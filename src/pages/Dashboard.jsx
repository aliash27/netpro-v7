import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const { company, isSuperAdmin } = useAuth()
  const [stats, setStats] = useState({
    totalSubscribers: 0,
    activeSubscribers: 0,
    totalDebts: 0,
    collectedPayments: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDashboardData() {
      if (!company?.id && !isSuperAdmin) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        
        // بناء الاستعلام بناءً على هوية المستخدم (سوبر أدمن يرى كل شيء، أو عزل بحسب الشركة)
        let subQuery = supabase.from('subscribers').select('id, is_active', { count: 'exact' })
        let debtQuery = supabase.from('debts').select('amount')
        let paymentQuery = supabase.from('payments').select('amount')

        if (!isSuperAdmin) {
          subQuery = subQuery.eq('company_id', company.id)
          debtQuery = debtQuery.eq('company_id', company.id)
          paymentQuery = paymentQuery.eq('company_id', company.id)
        }

        const [subsRes, debtsRes, paymentsRes] = await Promise.all([
          subQuery,
          debtQuery,
          paymentQuery
        ])

        // حساب إحصائيات المشتركين
        const totalSubs = subsRes.count ?? 0
        const activeSubs = subsRes.data?.filter(s => s.is_active).length ?? 0

        // حساب إجمالي الديون
        const totalDebtsSum = debtsRes.data?.reduce((sum, d) => sum + (d.amount || 0), 0) ?? 0

        // حساب المبالغ المحصلة
        const totalPaymentsSum = paymentsRes.data?.reduce((sum, p) => sum + (p.amount || 0), 0) ?? 0

        setStats({
          totalSubscribers: totalSubs,
          activeSubscribers: activeSubs,
          totalDebts: totalDebtsSum,
          collectedPayments: totalPaymentsSum
        })
      } catch (error) {
        console.error('Error loading dashboard stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [company?.id, isSuperAdmin])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-slate-400 animate-pulse text-lg">جاري تحميل الإحصائيات...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-right" dir="rtl">
      {/* العناوين الرئيسية */}
      <div>
        <h1 className="text-2xl font-bold text-white">لوحة الإحصائيات والتحليل</h1>
        <p className="text-sm text-slate-400 mt-1">
          {isSuperAdmin ? 'عرض البيانات الشاملة للنظام (Super Admin)' : `مرحباً بك في لوحة تحكم: ${company?.name || 'الشركة'}`}
        </p>
      </div>

      {/* بطاقات الإحصائيات السريعة KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-6 backdrop-blur-sm">
          <div className="text-sm font-medium text-slate-400">إجمالي المشتركين</div>
          <div className="text-3xl font-bold text-white mt-2">{stats.totalSubscribers}</div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-6 backdrop-blur-sm">
          <div className="text-sm font-medium text-emerald-400">المشتركين النشطين</div>
          <div className="text-3xl font-bold text-emerald-400 mt-2">{stats.activeSubscribers}</div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-6 backdrop-blur-sm">
          <div className="text-sm font-medium text-rose-400">إجمالي الديون المتبقية</div>
          <div className="text-3xl font-bold text-rose-400 mt-2">
            {stats.totalDebts.toLocaleString()} د.ع
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-6 backdrop-blur-sm">
          <div className="text-sm font-medium text-blue-400">المبالغ المحصلة</div>
          <div className="text-3xl font-bold text-blue-400 mt-2">
            {stats.collectedPayments.toLocaleString()} د.ع
          </div>
        </div>
      </div>

      {/* قسـم الرسوم البيانية التوضيحية البسيطة */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-md font-semibold text-white mb-4">نسبة حالة المشتركين</h3>
          <div className="w-full bg-slate-700 h-4 rounded-full overflow-hidden flex">
            <div 
              style={{ width: `${stats.totalSubscribers ? (stats.activeSubscribers / stats.totalSubscribers) * 100 : 0}%` }} 
              className="bg-emerald-500 h-full"
            />
            <div 
              style={{ width: `${stats.totalSubscribers ? ((stats.totalSubscribers - stats.activeSubscribers) / stats.totalSubscribers) * 100 : 0}%` }} 
              className="bg-slate-600 h-full"
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-2">
            <span>نشط ({stats.activeSubscribers})</span>
            <span>غير نشط ({stats.totalSubscribers - stats.activeSubscribers})</span>
          </div>
        </div>

        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-md font-semibold text-white mb-4">التحصيل المالي ضد الديون</h3>
          <div className="w-full bg-slate-700 h-4 rounded-full overflow-hidden flex">
            <div 
              style={{ width: `${(stats.collectedPayments + stats.totalDebts) ? (stats.collectedPayments / (stats.collectedPayments + stats.totalDebts)) * 100 : 0}%` }} 
              className="bg-blue-500 h-full"
            />
            <div 
              style={{ width: `${(stats.collectedPayments + stats.totalDebts) ? (stats.totalDebts / (stats.collectedPayments + stats.totalDebts)) * 100 : 0}%` }} 
              className="bg-rose-500 h-full"
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-2">
            <span>تم تحصيله ({stats.collectedPayments.toLocaleString()} د.ع)</span>
            <span>ديون متبقية ({stats.totalDebts.toLocaleString()} د.ع)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
