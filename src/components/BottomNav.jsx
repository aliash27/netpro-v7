import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const items = [
  { path:'/',            icon:'🏠', label:'الرئيسية' },
  { path:'/subscribers', icon:'👥', label:'المشتركون' },
  { path:'/debts',       icon:'⚠️', label:'الديون' },
  { path:'/payments',    icon:'📋', label:'السجل' },
  { path:'/settings',    icon:'⚙️', label:'الإعدادات' },
]

export default function BottomNav({ debtCount = 0 }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { isViewer } = useAuth()

  return (
    <nav className="bottom-nav">
      {items.map(item => {
        const active = location.pathname === item.path ||
          (item.path !== '/' && location.pathname.startsWith(item.path))
        return (
          <button
            key={item.path}
            className={`nav-item ${active ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <div className="nav-icon" style={{position:'relative'}}>
              {item.icon}
              {item.path === '/debts' && debtCount > 0 && (
                <span style={{
                  position:'absolute', top:-6, left:-6,
                  background:'var(--rose)', color:'#fff',
                  borderRadius:10, fontSize:9, fontWeight:900,
                  minWidth:16, height:16, display:'flex',
                  alignItems:'center', justifyContent:'center',
                  padding:'0 3px', lineHeight:1,
                  boxShadow:'0 1px 4px rgba(225,29,72,.4)'
                }}>
                  {debtCount > 99 ? '99+' : debtCount}
                </span>
              )}
            </div>
            <span>{item.label}</span>
            {active && (
              <div className="nav-pip" style={{
                background: item.path === '/debts' && debtCount > 0
                  ? 'var(--rose)' : undefined
              }}/>
            )}
          </button>
        )
      })}
    </nav>
  )
}
