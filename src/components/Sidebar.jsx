import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const links = [
  { path:'/',            icon:'🏠', label:'الرئيسية',           viewer:true  },
  { path:'/subscribers', icon:'👥', label:'المشتركون',          viewer:true  },
  { path:'/debts',       icon:'⚠️', label:'الديون المستحقة',    viewer:true  },
  { path:'/payments',    icon:'📋', label:'سجل الدفعات',        viewer:true  },
  { path:'/reports',     icon:'📊', label:'التقارير',           viewer:true  },
  { path:'/sheets',      icon:'🔗', label:'Google Sheets',      viewer:false },
  { path:'/accountants', icon:'👤', label:'المحاسبون الفرعيون', viewer:false },
  { path:'/pricing',     icon:'💎', label:'الباقات',            viewer:false },
  { path:'/settings',    icon:'⚙️', label:'الإعدادات',          viewer:true  },
]

const planNames = {
  trial:    '⭐ تجريبي',
  starter:  '⚡ البداية',
  pro:      '💎 الاحترافي',
  business: '🏢 الأعمال'
}

export default function Sidebar({ open, onClose, gsConnected }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { user, company, accountant, isViewer, signOut, trialDaysLeft } = useAuth()

  const trialPct = Math.min(100, (trialDaysLeft / 7) * 100)

  async function handleLogout() {
    await signOut(); onClose(); navigate('/login')
  }

  function go(path) { navigate(path); onClose() }

  const visibleLinks = links.filter(l => !isViewer || l.viewer)

  return (
    <>
      <div className={`sidebar-veil ${open?'open':''}`} onClick={onClose}/>
      <div className={`sidebar ${open?'open':''}`}>
        {/* Header */}
        <div className="sidebar-top">
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
            <div style={{width:42,height:42,borderRadius:12,
              background:'linear-gradient(135deg,#1a3fdb,#6144f5)',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:20,fontWeight:900,color:'#fff',flexShrink:0}}>
              {(company?.name||'N')[0].toUpperCase()}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div className="sidebar-name" style={{
                overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {company?.name || '—'}
              </div>
              <div className="sidebar-company" style={{
                overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {user?.email}
              </div>
            </div>
          </div>

          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:4}}>
            <span className="sidebar-badge">
              {planNames[company?.plan] || '⭐ تجريبي'}
            </span>
            {accountant && (
              <span style={{background:'rgba(97,68,245,.12)',color:'#6144f5',
                borderRadius:20,padding:'3px 10px',fontSize:11,fontWeight:700}}>
                {accountant.role === 'viewer' ? '👁 مراقب' : '📊 محاسب'}
              </span>
            )}
          </div>

          {company?.plan === 'trial' && (
            <div className="trial-bar">
              <div className="trial-bar-label">
                التجربة المجانية: <strong>{trialDaysLeft}</strong> أيام
              </div>
              <div className="trial-progress">
                <div className="trial-fill" style={{width:`${trialPct}%`}}/>
              </div>
            </div>
          )}
        </div>

        {/* Links */}
        <div className="sidebar-links">
          {visibleLinks.map(link => (
            <button
              key={link.path}
              className={`sidebar-link ${location.pathname === link.path ||
                (link.path !== '/' && location.pathname.startsWith(link.path))
                  ? 'active' : ''}`}
              onClick={() => go(link.path)}>
              <span className="link-icon">{link.icon}</span>
              {link.label}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="gs-status">
            <div className={`gs-dot ${gsConnected?'connected':'disconnected'}`}/>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'var(--ink)'}}>Google Sheets</div>
              <div style={{fontSize:11,color:'var(--ink3)'}}>
                {gsConnected ? 'متصل ✅' : 'غير متصل'}
              </div>
            </div>
          </div>
          <button className="sidebar-link" style={{color:'var(--rose)'}} onClick={handleLogout}>
            <span className="link-icon">🚪</span> تسجيل الخروج
          </button>
        </div>
      </div>
    </>
  )
}
