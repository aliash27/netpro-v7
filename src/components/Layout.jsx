import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const NAV = [
  { to: '/dashboard',          icon: '🏠', label: 'الرئيسية' },
  { to: '/subscribers',        icon: '👥', label: 'المشتركون' },
  { to: '/debts',              icon: '💰', label: 'الديون' },
  { to: '/payments',           icon: '🧾', label: 'الدفعات' },
  { to: '/reports',            icon: '📊', label: 'التقارير' },
  { to: '/sheets',             icon: '📋', label: 'Sheets' },
  { to: '/accountants',        icon: '👤', label: 'المحاسبون', ownerOnly: true },
  { to: '/settings',           icon: '⚙️', label: 'الإعدادات' },
]

export default function Layout() {
  const { user, company, role, planExpired, signOut, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [sideOpen,    setSideOpen]    = useState(false)
  const [notifOpen,   setNotifOpen]   = useState(false)
  const [notifs,      setNotifs]      = useState([])
  const [unread,      setUnread]      = useState(0)
  const [syncing,     setSyncing]     = useState(false)
  const notifRef = useRef(null)

  // ─── redirect ────────────────────────────────────────
  useEffect(() => {
    if (!user)    { navigate('/login',     { replace: true }); return }
    if (isAdmin)  { navigate('/admin',     { replace: true }); return }
  }, [user, isAdmin, navigate])

  // ─── تحميل الإشعارات ─────────────────────────────────
  useEffect(() => {
    if (!company) return
    loadNotifs()
    // تحديث تلقائي كل دقيقة
    const t = setInterval(loadNotifs, 60_000)
    return () => clearInterval(t)
  }, [company])

  async function loadNotifs() {
    if (!company) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifs(data ?? [])
    setUnread((data ?? []).filter(n => !n.is_read).length)
  }

  async function markAllRead() {
    if (!company || unread === 0) return
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('company_id', company.id)
      .eq('is_read', false)
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnread(0)
  }

  // ─── إغلاق notif عند النقر خارجه ─────────────────────
  useEffect(() => {
    function handler(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ─── مزامنة Sheets ───────────────────────────────────
  async function syncSheets() {
    if (!company || syncing) return
    setSyncing(true)
    try {
      const { data: cfg } = await supabase
        .from('sheets_config')
        .select('*')
        .eq('company_id', company.id)
        .maybeSingle()
      if (!cfg?.is_connected || !cfg?.web_app_url) return
      const { data: subs } = await supabase
        .from('subscribers')
        .select('name,phone,monthly_fee,start_date,last_paid_month,is_active')
        .eq('company_id', company.id)
        .order('name')
      await fetch(cfg.web_app_url, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetName: cfg.sheet_name, data: subs ?? [] }),
      })
      await supabase.from('sheets_config').update({ last_sync: new Date().toISOString() }).eq('id', cfg.id)
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    syncSheets()
    const t = setInterval(syncSheets, 5 * 60_000)
    return () => clearInterval(t)
  }, [company])

  if (!user || isAdmin) return null

  // ─── حالة الباقة ─────────────────────────────────────
  const planBadge = () => {
    if (!company) return null
    const plans = { trial: { label: 'تجريبي', color: '#f59e0b' }, starter: { label: 'البداية', color: '#3b82f6' }, pro: { label: 'احترافي', color: '#8b5cf6' }, business: { label: 'أعمال', color: '#10b981' } }
    const p = plans[company.plan] ?? { label: company.plan, color: '#6b7280' }
    return <span style={{ background: p.color + '22', color: p.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{p.label}</span>
  }

  const navLinks = NAV.filter(n => !n.ownerOnly || role === 'owner')

  return (
    <div dir="rtl" style={{ display: 'flex', minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* ─── Sidebar ────────────────────────────────────── */}
      <aside style={{
        width: 240, background: '#0d1117', borderLeft: '1px solid #1e293b',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        position: 'fixed', top: 0, right: 0, height: '100vh', zIndex: 200,
        transform: sideOpen ? 'translateX(0)' : undefined,
        transition: 'transform .25s',
      }} className="sidebar-desktop">

        {/* Logo */}
        <div style={{ padding: '20px 18px 14px', borderBottom: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📡</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>نيت برو</div>
              <div style={{ fontSize: 10, color: '#475569' }}>NetPro Platform</div>
            </div>
          </div>

          {/* معلومات الشركة */}
          {company && (
            <div style={{ marginTop: 12, background: '#1e293b', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                🏢 {company.name}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {planBadge()}
                <span style={{ background: '#334155', color: '#94a3b8', borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>
                  {role === 'owner' ? 'مالك' : role === 'accountant' ? 'محاسب' : 'مراقب'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* تنبيه انتهاء الباقة */}
        {planExpired && (
          <div style={{ margin: '10px 12px 0', background: '#ef444420', border: '1px solid #ef444444', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#fca5a5', textAlign: 'center' }}>
            ⚠️ انتهت صلاحية باقتك
            <br />
            <button onClick={() => navigate('/subscribe')}
              style={{ marginTop: 6, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
              تجديد الاشتراك
            </button>
          </div>
        )}

        {/* Nav Links */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
          {navLinks.map(n => (
            <NavLink key={n.to} to={n.to} onClick={() => setSideOpen(false)}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 10, marginBottom: 4,
                textDecoration: 'none', fontSize: 14, fontWeight: isActive ? 700 : 500,
                background: isActive ? 'linear-gradient(135deg,rgba(59,130,246,.15),rgba(139,92,246,.15))' : 'transparent',
                color: isActive ? '#a5b4fc' : '#94a3b8',
                borderRight: isActive ? '3px solid #6366f1' : '3px solid transparent',
                transition: 'all .2s',
              })}>
              <span style={{ fontSize: 18 }}>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* تسجيل الخروج */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid #1e293b' }}>
          <button onClick={() => { signOut(); navigate('/login') }}
            style={{ width: '100%', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, transition: 'all .2s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#ef444420'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.color = '#94a3b8' }}>
            🚪 تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Overlay على الموبايل */}
      {sideOpen && (
        <div onClick={() => setSideOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 199 }} />
      )}

      {/* ─── Main Area ──────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginRight: 240, minWidth: 0 }} className="main-area">

        {/* Topbar */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: 'rgba(13,17,23,.95)', backdropFilter: 'blur(10px)',
          borderBottom: '1px solid #1e293b',
          padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Hamburger (موبايل) */}
          <button onClick={() => setSideOpen(p => !p)}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 22, display: 'none' }}
            className="hamburger">
            ☰
          </button>

          {/* مزامنة Sheets */}
          <button onClick={syncSheets} disabled={syncing}
            title="مزامنة Google Sheets"
            style={{ background: syncing ? '#1e293b' : '#1e293b', border: '1px solid #334155', color: syncing ? '#475569' : '#94a3b8', borderRadius: 8, padding: '6px 14px', cursor: syncing ? 'not-allowed' : 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, transition: 'all .2s' }}>
            <span style={{ display: 'inline-block', animation: syncing ? 'spin 1s linear infinite' : 'none' }}>🔄</span>
            {syncing ? 'جاري المزامنة...' : 'مزامنة Sheets'}
          </button>

          {/* يمين: إشعارات + مستخدم */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} ref={notifRef}>
            {/* جرس الإشعارات */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setNotifOpen(p => !p)}
                style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', borderRadius: 10, width: 38, height: 38, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                🔔
                {unread > 0 && (
                  <span style={{ position: 'absolute', top: -4, left: -4, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {/* Dropdown الإشعارات */}
              {notifOpen && (
                <div style={{
                  position: 'absolute', top: 44, left: 0, width: 320,
                  background: '#1e293b', border: '1px solid #334155', borderRadius: 14,
                  boxShadow: '0 10px 40px rgba(0,0,0,.5)', zIndex: 200, overflow: 'hidden'
                }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>الإشعارات {unread > 0 && `(${unread})`}</span>
                    {unread > 0 && (
                      <button onClick={markAllRead}
                        style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 12 }}>
                        تحديد الكل كمقروء
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {notifs.length === 0 ? (
                      <div style={{ padding: 24, textAlign: 'center', color: '#475569', fontSize: 13 }}>لا توجد إشعارات</div>
                    ) : notifs.map(n => (
                      <div key={n.id} style={{
                        padding: '12px 16px', borderBottom: '1px solid #0f172a',
                        background: n.is_read ? 'transparent' : 'rgba(99,102,241,.08)',
                        cursor: 'pointer', transition: 'background .2s',
                      }}>
                        <div style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700, color: '#f1f5f9', marginBottom: 3 }}>
                          {notifIcon(n.type)} {n.title}
                        </div>
                        {n.body && <div style={{ fontSize: 12, color: '#64748b' }}>{n.body}</div>}
                        <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                          {new Date(n.created_at).toLocaleDateString('ar-IQ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* معلومات المستخدم */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '6px 12px' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                {user?.email?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <span style={{ fontSize: 13, color: '#94a3b8', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email}
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          {planExpired && (
            <div style={{ background: 'linear-gradient(135deg,rgba(239,68,68,.1),rgba(220,38,38,.05))', border: '1px solid #ef444444', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, color: '#fca5a5', fontSize: 15 }}>⚠️ انتهت صلاحية اشتراكك</div>
                <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>بعض الميزات قد تكون محدودة. جدّد اشتراكك للاستمرار.</div>
              </div>
              <button onClick={() => navigate('/subscribe')}
                style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                تجديد الاشتراك الآن
              </button>
            </div>
          )}
          <Outlet />
        </main>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .sidebar-desktop { transform: translateX(100%) !important; }
          .sidebar-desktop.open { transform: translateX(0) !important; }
          .main-area { margin-right: 0 !important; }
          .hamburger { display: flex !important; }
        }
      `}</style>
    </div>
  )
}

function notifIcon(type) {
  return { debt: '💰', expiry: '⏰', payment: '✅', system: '📢' }[type] ?? '🔔'
}
