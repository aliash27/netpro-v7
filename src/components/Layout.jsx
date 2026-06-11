import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const NAV = [
  { to: '/dashboard',   icon: '🏠', label: 'الرئيسية' },
  { to: '/subscribers', icon: '👥', label: 'المشتركون' },
  { to: '/debts',       icon: '💰', label: 'الديون' },
  { to: '/payments',    icon: '🧾', label: 'الدفعات' },
  { to: '/reports',     icon: '📊', label: 'التقارير' },
  { to: '/sheets',      icon: '📋', label: 'Sheets' },
  { to: '/accountants', icon: '👤', label: 'المحاسبون', ownerOnly: true },
  { to: '/settings',    icon: '⚙️', label: 'الإعدادات' },
]

export default function Layout() {
  const { user, company, role, planExpired, signOut, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [sideOpen,    setSideOpen]    = useState(false)
  const [notifOpen,   setNotifOpen]   = useState(false)
  const [notifs,      setNotifs]      = useState([])
  const [unread,      setUnread]      = useState(0)
  const [syncing,     setSyncing]     = useState(false)
  const [debtCount,   setDebtCount]   = useState(0)
  const [gsConnected, setGsConnected] = useState(false)
  const notifRef = useRef(null)

  useEffect(() => {
    if (!user)   { navigate('/login', { replace: true }); return }
    if (isAdmin) { navigate('/admin', { replace: true }); return }
  }, [user, isAdmin, navigate])

  useEffect(() => {
    if (!company) return
    loadNotifs()
    const t = setInterval(loadNotifs, 60_000)
    return () => clearInterval(t)
  }, [company])

  async function loadNotifs() {
    if (!company) return
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(30)
      setNotifs(data ?? [])
      setUnread((data ?? []).filter(n => !n.is_read).length)
    } catch (_) {}
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

  useEffect(() => {
    function handler(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
      setGsConnected(true)
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
      await supabase
        .from('sheets_config')
        .update({ last_sync: new Date().toISOString() })
        .eq('id', cfg.id)
    } catch (_) {
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

  const planBadge = () => {
    if (!company) return null
    const plans = {
      trial:    { label: 'تجريبي',  color: '#f59e0b' },
      starter:  { label: 'البداية', color: '#3b82f6' },
      pro:      { label: 'احترافي', color: '#8b5cf6' },
      business: { label: 'أعمال',   color: '#10b981' },
    }
    const p = plans[company.plan] ?? { label: company.plan, color: '#6b7280' }
    return (
      <span style={{ background: p.color + '22', color: p.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
        {p.label}
      </span>
    )
  }

  const navLinks = NAV.filter(n => !n.ownerOnly || role === 'owner')

  return (
    <div dir="rtl" style={{
      display: 'flex', minHeight: '100vh',
      background: 'var(--bg, #f0f4ff)',
      color: 'var(--ink, #0a0f1e)',
      fontFamily: "'Tajawal', system-ui, sans-serif"
    }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 240,
        background: 'var(--sur, #fff)',
        borderLeft: '1px solid var(--bdr, rgba(80,100,220,.13))',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        position: 'fixed', top: 0, right: 0, height: '100vh', zIndex: 200,
        transition: 'transform .25s',
        boxShadow: '0 0 40px rgba(26,63,219,.07)',
      }} className={`sidebar-desktop${sideOpen ? ' open' : ''}`}>

        {/* Logo */}
        <div style={{ padding: '20px 18px 14px', borderBottom: '1px solid var(--bdr)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'linear-gradient(135deg,#1a3fdb,#6144f5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, flexShrink: 0,
              boxShadow: '0 4px 14px rgba(26,63,219,.3)'
            }}>📡</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16, color: 'var(--ink)' }}>نيت برو</div>
              <div style={{ fontSize: 10, color: 'var(--ink3)' }}>NetPro Platform</div>
            </div>
          </div>

          {company && (
            <div style={{ marginTop: 12, background: 'var(--bg2)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                🏢 {company.name}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {planBadge()}
                <span style={{ background: 'var(--bdr)', color: 'var(--ink3)', borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>
                  {role === 'owner' ? 'مالك' : role === 'accountant' ? 'محاسب' : 'مراقب'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* تنبيه انتهاء الباقة */}
        {planExpired && (
          <div style={{
            margin: '10px 12px 0', background: 'rgba(225,29,72,.08)',
            border: '1px solid rgba(225,29,72,.25)', borderRadius: 10,
            padding: '10px 12px', fontSize: 12, color: 'var(--rose)', textAlign: 'center'
          }}>
            ⚠️ انتهت صلاحية باقتك<br />
            <button onClick={() => navigate('/subscribe')} style={{
              marginTop: 6, background: 'var(--rose)', color: '#fff', border: 'none',
              borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 700
            }}>تجديد الاشتراك</button>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
          {navLinks.map(n => (
            <NavLink key={n.to} to={n.to} onClick={() => setSideOpen(false)}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 10, marginBottom: 4,
                textDecoration: 'none', fontSize: 14,
                fontWeight: isActive ? 800 : 500,
                background: isActive
                  ? 'linear-gradient(135deg,rgba(26,63,219,.09),rgba(97,68,245,.05))'
                  : 'transparent',
                color: isActive ? 'var(--blue)' : 'var(--ink3)',
                borderRight: isActive ? '3px solid var(--blue)' : '3px solid transparent',
                transition: 'all .2s',
              })}>
              <span style={{ fontSize: 18 }}>{n.icon}</span>
              {n.label}
              {n.to === '/debts' && debtCount > 0 && (
                <span style={{
                  marginRight: 'auto', background: 'var(--rose)', color: '#fff',
                  borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700
                }}>{debtCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* تسجيل خروج */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid var(--bdr)' }}>
          <button onClick={() => { signOut(); navigate('/login') }}
            style={{
              width: '100%', background: 'transparent', color: 'var(--ink3)',
              border: '1px solid var(--bdr)', borderRadius: 10, padding: '10px 14px',
              cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center',
              gap: 8, fontWeight: 600, transition: 'all .2s', fontFamily: 'inherit'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(225,29,72,.08)'; e.currentTarget.style.color = 'var(--rose)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink3)' }}>
            🚪 تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Overlay موبايل */}
      {sideOpen && (
        <div onClick={() => setSideOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 199 }} />
      )}

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginRight: 240, minWidth: 0 }} className="main-area">

        {/* Topbar */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: 'rgba(255,255,255,.92)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--bdr)',
          padding: '0 20px', height: 62,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: 'var(--shC)',
        }}>
          {/* Hamburger */}
          <button onClick={() => setSideOpen(p => !p)} className="hamburger"
            style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 22, display: 'none' }}>
            ☰
          </button>

          {/* Sheets sync */}
          <button onClick={syncSheets} disabled={syncing} title="مزامنة Google Sheets"
            style={{
              background: 'var(--sur)', border: '1px solid var(--bdr)', color: 'var(--ink3)',
              borderRadius: 10, padding: '7px 14px', cursor: syncing ? 'not-allowed' : 'pointer',
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'inherit', fontWeight: 600
            }}>
            <span style={{ display: 'inline-block', animation: syncing ? 'spin 1s linear infinite' : 'none' }}>🔄</span>
            {syncing ? 'جاري المزامنة...' : 'Sheets'}
          </button>

          {/* Notif + user */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} ref={notifRef}>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setNotifOpen(p => !p)} style={{
                background: 'var(--sur)', border: '1px solid var(--bdr)', color: 'var(--ink3)',
                borderRadius: 10, width: 38, height: 38, cursor: 'pointer', fontSize: 17,
                display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative'
              }}>
                🔔
                {unread > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, left: -4, background: 'var(--rose)',
                    color: '#fff', borderRadius: '50%', width: 18, height: 18,
                    fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>{unread > 9 ? '9+' : unread}</span>
                )}
              </button>

              {notifOpen && (
                <div style={{
                  position: 'absolute', top: 44, left: 0, width: 300,
                  background: 'var(--sur)', border: '1px solid var(--bdr)', borderRadius: 14,
                  boxShadow: 'var(--shH)', zIndex: 200, overflow: 'hidden'
                }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>
                      الإشعارات {unread > 0 && `(${unread})`}
                    </span>
                    {unread > 0 && (
                      <button onClick={markAllRead}
                        style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                        قراءة الكل
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {notifs.length === 0 ? (
                      <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>لا توجد إشعارات</div>
                    ) : notifs.map(n => (
                      <div key={n.id} style={{
                        padding: '11px 16px', borderBottom: '1px solid var(--bdr2)',
                        background: n.is_read ? 'transparent' : 'rgba(26,63,219,.04)',
                      }}>
                        <div style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700, color: 'var(--ink)', marginBottom: 2 }}>
                          {notifIcon(n.type)} {n.title}
                        </div>
                        {n.body && <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{n.body}</div>}
                        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>
                          {new Date(n.created_at).toLocaleDateString('ar-IQ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--sur)', border: '1px solid var(--bdr)',
              borderRadius: 10, padding: '5px 12px'
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(135deg,#1a3fdb,#6144f5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 13, fontWeight: 900
              }}>
                {user?.email?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <span style={{ fontSize: 12, color: 'var(--ink3)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email}
              </span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, overflowY: 'auto' }}>
          {planExpired && (
            <div style={{
              background: 'rgba(225,29,72,.06)', border: '1px solid rgba(225,29,72,.2)',
              borderRadius: 14, padding: '14px 20px', margin: '16px 20px 0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10
            }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--rose)', fontSize: 14 }}>⚠️ انتهت صلاحية اشتراكك</div>
                <div style={{ color: 'var(--ink3)', fontSize: 12, marginTop: 2 }}>جدّد اشتراكك للاستمرار بدون انقطاع.</div>
              </div>
              <button onClick={() => navigate('/subscribe')} style={{
                background: 'var(--rose)', color: '#fff', border: 'none',
                borderRadius: 10, padding: '9px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit'
              }}>تجديد الاشتراك</button>
            </div>
          )}

          {/* context يمرر setDebtCount و debtCount و setGsConnected للصفحات */}
          <Outlet context={{ setDebtCount, debtCount, gsConnected, setGsConnected }} />
        </main>
      </div>

      <style>{`
        [data-dark] header { background: rgba(7,12,28,.92) !important; }
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
