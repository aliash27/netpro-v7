import { useState, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { ToastContainer, toast } from './Toast'
import BottomNav from './BottomNav'
import NotificationEngine from './NotificationEngine'
import Sidebar from './Sidebar'

export default function Layout() {
  const { user, company } = useAuth()
  const navigate = useNavigate()
  const [sideOpen, setSideOpen]     = useState(false)
  const [dark, setDark]             = useState(false)
  const [gsConnected, setGsConnected] = useState(false)
  const [debtCount, setDebtCount]   = useState(0)

  // Load debt count on mount so BottomNav badge always shows correct number
  useEffect(() => {
    if (!company) return
    async function loadDebtCount() {
      const [{ data: subs }, { data: pays }] = await Promise.all([
        supabase.from('subscribers').select('id,start_date,monthly_fee')
          .eq('company_id', company.id).eq('is_active', true),
        supabase.from('payments').select('subscriber_id,month')
          .eq('company_id', company.id)
      ])
      const pm = {}
      for (const p of (pays||[])) {
        if (!pm[p.subscriber_id]) pm[p.subscriber_id] = []
        pm[p.subscriber_id].push(p.month)
      }
      function calcDebt(sub) {
        if (!sub?.start_date) return 0
        const now = new Date(), startD = new Date(sub.start_date)
        const paidSet = new Set(pm[sub.id]||[])
        let cnt = 0, y = startD.getFullYear(), m = startD.getMonth()+1
        while (new Date(y, m-1) <= now) {
          if (!paidSet.has(`${y}-${String(m).padStart(2,'0')}`)) cnt++
          m++; if (m>12){m=1;y++}
        }
        return cnt
      }
      setDebtCount((subs||[]).filter(s => calcDebt(s) > 0).length)
    }
    loadDebtCount()
  }, [company])
  const [syncing, setSyncing]       = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('np_theme')
    if (saved === 'dark') {
      setDark(true)
      document.documentElement.setAttribute('data-dark', '')
    }
  }, [])

  useEffect(() => {
    if (company) loadGsStatus()
  }, [company])

  async function loadGsStatus() {
    const { data } = await supabase
      .from('sheets_config')
      .select('is_connected')
      .eq('company_id', company.id)
      .single()
    if (data) setGsConnected(data.is_connected || false)
  }

  function toggleTheme() {
    const newDark = !dark
    setDark(newDark)
    if (newDark) {
      document.documentElement.setAttribute('data-dark', '')
      localStorage.setItem('np_theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-dark')
      localStorage.setItem('np_theme', 'light')
    }
  }

  async function syncNow() {
    if (!gsConnected) {
      toast('Google Sheets غير متصل — اذهب إلى صفحة الربط أولاً', 'e')
      return
    }
    setSyncing(true)
    try {
      // Fetch sheets config
      const { data: cfg } = await supabase
        .from('sheets_config')
        .select('*')
        .eq('company_id', company.id)
        .single()

      if (!cfg?.web_app_url) {
        toast('لا يوجد رابط Web App مضبوط في الإعدادات', 'e')
        setSyncing(false)
        return
      }

      // Fetch subscribers for export
      const { data: subs } = await supabase
        .from('subscribers')
        .select('*')
        .eq('company_id', company.id)
        .eq('is_active', true)
        .order('name')

      const rows = [
        ['الاسم', 'الهاتف', 'الاشتراك الشهري', 'آخر دفعة', 'تاريخ البداية', 'ملاحظات'],
        ...(subs || []).map(s => [
          s.name, s.phone, s.monthly_fee,
          s.last_paid_month || '—', s.start_date || '—', s.notes || ''
        ])
      ]

      const res = await fetch(cfg.web_app_url, {
        method: 'POST',
        body: JSON.stringify({ action: 'write', sheet: 'المشتركين', rows })
      })
      const json = await res.json()
      if (json.ok) {
        toast('تمت المزامنة مع Google Sheets ✅', 's')
      } else {
        toast('فشل في المزامنة: ' + (json.err || 'خطأ غير معروف'), 'e')
      }
    } catch (err) {
      toast('خطأ في الاتصال: ' + err.message, 'e')
    }
    setSyncing(false)
  }

  const avatarLetter = (company?.name?.[0] || user?.email?.[0] || 'N').toUpperCase()

  return (
    <div>
      {/* Scroll progress */}
      <div className="scroll-progress" id="scroll-progress" />

      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-logo">
          <button
            className="icon-btn"
            onClick={() => setSideOpen(true)}
            style={{ border: 'none', fontSize: 20 }}
          >☰</button>
          <div className="topbar-icon">📡</div>
          <div>
            <div className="topbar-name">{company?.name || 'نيت برو'}</div>
            <div className="topbar-sub">NETPRO PLATFORM</div>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={toggleTheme}>
            {dark ? '☀️' : '🌙'}
          </button>
          <button
            className={`icon-btn ${syncing ? 'spinning' : ''}`}
            onClick={syncNow}
            title="مزامنة"
          >
            <span className="spnI">🔄</span>
          </button>
          <div className="user-avatar" onClick={() => setSideOpen(true)}>
            {avatarLetter}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main>
        <Outlet context={{ gsConnected, setGsConnected, setDebtCount }} />
      </main>

      {/* ✅ إصلاح: حُذف الكود المكرر الملصوق خارج الـ component وأُبقي على النسخة الصحيحة فقط */}
      {company?.is_admin && (
        <div style={{position:'fixed',bottom:78,right:17,zIndex:151}}>
          <button
            onClick={() => navigate('/admin')}
            title="لوحة تحكم المدير"
            style={{width:52,height:52,borderRadius:16,
              background:'linear-gradient(135deg,#0a0f1e,#1a3fdb)',
              color:'#fff',border:'none',display:'flex',
              alignItems:'center',justifyContent:'center',
              fontSize:22,cursor:'pointer',
              boxShadow:'0 4px 20px rgba(26,63,219,.4)'}}>
            🛡️
          </button>
        </div>
      )}

      {/* Bottom Nav */}
      <BottomNav debtCount={debtCount} />

      {/* Sidebar */}
      <Sidebar
        open={sideOpen}
        onClose={() => setSideOpen(false)}
        gsConnected={gsConnected}
      />

      {/* Notification Engine */}
      <NotificationEngine />

      {/* Toast */}
      <ToastContainer />

      {/* Scroll progress script */}
      <script dangerouslySetInnerHTML={{ __html: `
        window.addEventListener('scroll', () => {
          const el = document.getElementById('scroll-progress')
          if (!el) return
          const pct = window.scrollY / (document.body.scrollHeight - window.innerHeight)
          el.style.transform = 'scaleX(' + Math.min(pct, 1) + ')'
          el.style.transformOrigin = 'right'
        }, { passive: true })
      `}} />

      <style>{`
        .spinning .spnI { animation: spin .8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes glow {
          0%,100%{ box-shadow:0 0 40px rgba(26,63,219,.18) }
          50%{ box-shadow:0 0 60px rgba(26,63,219,.4) }
        }
      `}</style>
    </div>
  )
}
