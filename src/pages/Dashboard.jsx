import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../components/Toast'

const MO = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران',
            'تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول']

function calcDebt(sub, paidMonths = []) {
  if (!sub?.start_date) return []
  const now = new Date()
  const months = []

  // If we have actual payment records from DB, use them precisely
  if (paidMonths.length > 0) {
    // All months from start_date to now that are NOT in paidMonths = debt
    const paidSet = new Set(paidMonths)
    const startD  = new Date(sub.start_date)
    let y = startD.getFullYear(), m = startD.getMonth() + 1
    while (new Date(y, m - 1) <= now) {
      const key = `${y}-${String(m).padStart(2,'0')}`
      if (!paidSet.has(key)) months.push(key)
      m++; if (m > 12) { m = 1; y++ }
    }
    return months
  }

  // No DB payment records — use last_paid_month as the paid-up-to marker
  // Everything AFTER last_paid_month is debt
  if (sub.last_paid_month) {
    const [ly, lm] = sub.last_paid_month.split('-').map(Number)
    // Start from month AFTER last_paid_month
    let y = ly, m = lm + 1
    if (m > 12) { m = 1; y++ }
    while (new Date(y, m - 1) <= now) {
      months.push(`${y}-${String(m).padStart(2,'0')}`)
      m++; if (m > 12) { m = 1; y++ }
    }
    return months
  }

  // No payment info at all — everything from start_date is debt
  const startD = new Date(sub.start_date)
  let y = startD.getFullYear(), m = startD.getMonth() + 1
  while (new Date(y, m - 1) <= now) {
    months.push(`${y}-${String(m).padStart(2,'0')}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return months
}

function fmt(n) { return Number(n).toLocaleString('ar-IQ') + ' د.ع' }
function moLabel(ym) {
  if (!ym) return '—'
  const months = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول']
  const [y, m] = ym.split('-')
  return `${months[parseInt(m)-1]} ${y}`
}
function avatarColor(name) {
  const colors = ['#1a3fdb','#059669','#d97706','#e11d48','#7c3aed','#0d9488']
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % colors.length
  return colors[h]
}

export default function Dashboard() {
  const { company, trialDaysLeft, isTrialActive, isViewer } = useAuth()
  const { setDebtCount } = useOutletContext()
  const navigate = useNavigate()

  const [subs, setSubs]     = useState([])
  const [pays, setPays]     = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [showDrop, setShowDrop] = useState(false)

  const now = new Date()
  const curMo = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`

  useEffect(() => {
    if (company) loadData()
  }, [company])

  async function loadData() {
    setLoading(true)
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from('subscribers').select('*')
        .eq('company_id', company.id).eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase.from('payments').select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
    ])
    setSubs(s || [])
    setPays(p || [])
    // Build paid map for accurate debt calc
    const pm = {}
    for (const pay of (p||[])) {
      if (!pm[pay.subscriber_id]) pm[pay.subscriber_id] = []
      pm[pay.subscriber_id].push(pay.month)
    }
    const lateCount = (s || []).filter(sub => calcDebt(sub, pm[sub.id]||[]).length > 0).length
    setDebtCount(lateCount)
    setLoading(false)

    if (!sessionStorage.getItem('np_notif') && lateCount > 0) {
      setTimeout(() => {
        toast(`⚠️ ${lateCount} مشترك متأخر عن الدفع`, 'w', 5000)
        sessionStorage.setItem('np_notif', '1')
      }, 2000)
    }
  }

  function doSearch(val) {
    setSearch(val)
    if (!val.trim()) { setResults([]); setShowDrop(false); return }
    const r = subs.filter(s => s.name.includes(val) || s.phone.includes(val))
    setResults(r)
    setShowDrop(true)
  }

  // Build paidMap from pays
  const paidMap = {}
  for (const p of pays) {
    if (!paidMap[p.subscriber_id]) paidMap[p.subscriber_id] = []
    paidMap[p.subscriber_id].push(p.month)
  }
  const late = subs.filter(s => calcDebt(s, paidMap[s.id]||[]).length > 0)
  const totalDebt = late.reduce((a, s) => a + calcDebt(s, paidMap[s.id]||[]).length * s.monthly_fee, 0)
  const paidThisMo  = pays.filter(p => p.month === curMo).length
  const revenueThisMo = pays.filter(p => p.month === curMo).reduce((a,p) => a + Number(p.amount), 0)

  // Last 6 months for mini chart
  const last6 = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const rev = pays.filter(p => p.month === key).reduce((a,p) => a + Number(p.amount), 0)
    last6.push({ key, label: MO[d.getMonth()].slice(0,4), rev })
  }
  const maxRev = Math.max(...last6.map(m => m.rev), 1)

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',
      minHeight:'60vh',fontSize:24}}>
      ⏳
    </div>
  )

  return (
    <div className="page">
      {/* Trial banner */}
      {isTrialActive && (
        <div className="trial-strip fadeUp">
          <div className="trial-text">
            <h4>🎁 الفترة التجريبية المجانية</h4>
            <p>متبقي <strong>{trialDaysLeft}</strong> أيام — جميع الميزات مفعّلة</p>
          </div>
          <button className="trial-btn" onClick={() => navigate('/pricing')}>
            ترقية ✨
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card fadeUp d1">
          <div className="stat-icon si-1">👥</div>
          <div className="stat-label">إجمالي المشتركين</div>
          <div className="stat-value">{subs.length}</div>
          <div className="stat-trend">{subs.length} مشترك مسجل</div>
        </div>
        <div className="stat-card fadeUp d2">
          <div className="stat-icon si-2">⚠️</div>
          <div className="stat-label">المتأخرون</div>
          <div className="stat-value warn">{late.length}</div>
          <div className="stat-trend">
            {subs.length ? Math.round(late.length/subs.length*100) : 0}% متأخرون
          </div>
        </div>
        <div className="stat-card fadeUp d3">
          <div className="stat-icon si-3">💰</div>
          <div className="stat-label">إجمالي الديون</div>
          <div className="stat-value danger" style={{fontSize:'clamp(12px,3vw,20px)'}}>
            {late.length ? fmt(totalDebt) : 'لا ديون 🎉'}
          </div>
        </div>
        <div className="stat-card fadeUp d4">
          <div className="stat-icon si-4">💵</div>
          <div className="stat-label">إيرادات هذا الشهر</div>
          <div className="stat-value ok" style={{fontSize:'clamp(10px,2.5vw,17px)'}}>
            {revenueThisMo ? fmt(revenueThisMo) : `${paidThisMo} دفعة`}
          </div>
        </div>
      </div>

      {/* Mini revenue chart */}
      {pays.length > 0 && (
        <div className="card fadeUp d3" style={{marginBottom:14}}>
          <div className="card-body" style={{padding:'14px 14px 10px'}}>
            <div style={{fontSize:13,fontWeight:800,color:'var(--ink)',marginBottom:12}}>
              📈 إيرادات آخر 6 أشهر
            </div>
            <div style={{display:'flex',alignItems:'flex-end',gap:6,height:80}}>
              {last6.map((m,i) => {
                const h = Math.max(4, Math.round(m.rev / maxRev * 64))
                const isCur = m.key === curMo
                return (
                  <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                    <div style={{fontSize:9,fontWeight:700,color:'var(--ink3)',marginBottom:1}}>
                      {m.rev > 0 ? Math.round(m.rev/1000)+'k' : ''}
                    </div>
                    <div style={{
                      width:'100%', height:h, borderRadius:'5px 5px 3px 3px',
                      background: isCur ? 'var(--gP)' : 'rgba(26,63,219,.2)',
                      boxShadow: isCur ? '0 3px 10px rgba(26,63,219,.3)' : 'none',
                      transition:'height .5s'
                    }}/>
                    <div style={{fontSize:9,fontWeight:isCur?800:600,
                      color: isCur ? 'var(--blue)' : 'var(--ink3)'}}>
                      {m.label}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="quick-grid fadeUp d3">
        {!isViewer && <button className="btn btn-primary"
          onClick={() => navigate('/subscribers', { state: { openAdd: true } })}>
          ➕ إضافة مشترك
        </button>}
        <button className="btn btn-whatsapp" onClick={() => navigate('/debts')}>
          📨 مراسلة المتأخرين
        </button>
      </div>

      {/* Search */}
      <div className="search-wrap fadeUp d4">
        <span className="search-icon">🔍</span>
        <input
          className="search-input"
          placeholder="ابحث عن مشترك بالاسم أو الهاتف..."
          value={search}
          onChange={e => doSearch(e.target.value)}
          onFocus={() => results.length && setShowDrop(true)}
        />
        {search && (
          <button className="search-clear" onClick={() => {
            setSearch(''); setResults([]); setShowDrop(false)
          }}>✕</button>
        )}
        {showDrop && (
          <div className="search-dropdown open">
            {results.length === 0 ? (
              <div className="search-item">لا توجد نتائج</div>
            ) : results.map(s => {
              const d = calcDebt(s, paidMap[s.id]||[])
              return (
                <div key={s.id} className="search-item"
                  onClick={() => {
                    navigate(`/subscribers/${s.id}`)
                    setSearch(''); setShowDrop(false)
                  }}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13}}>{s.name}</div>
                    <div style={{fontSize:12,color:'var(--ink3)'}}>{s.phone}</div>
                  </div>
                  <span className={`badge ${d.length ? 'badge-warn' : 'badge-ok'}`}>
                    {d.length ? `⚠️ ${d.length} شهر` : '✅'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent subscribers */}
      <div className="sec-header fadeUp d5">
        <div className="sec-title">📋 آخر المشتركين</div>
        <button className="sec-link" onClick={() => navigate('/subscribers')}>
          عرض الكل →
        </button>
      </div>

      <div className="fadeUp d6">
        {subs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-art">📭</div>
            <div className="empty-title">لا يوجد مشتركون بعد</div>
            <div className="empty-sub">أضف أول مشترك باستخدام زر ➕</div>
          </div>
        ) : subs.slice(0, 5).map(sub => {
          const d = calcDebt(sub, paidMap[sub.id]||[])
          const color = avatarColor(sub.name)
          return (
            <div key={sub.id} className="sub-row"
              onClick={() => navigate(`/subscribers/${sub.id}`)}>
              <div className="sub-avatar"
                style={{background:`${color}22`,color}}>
                {sub.name[0]}
              </div>
              <div className="sub-info">
                <div className="sub-name">{sub.name}</div>
                <div className="sub-phone">{sub.phone}</div>
              </div>
              <div style={{display:'flex',flexDirection:'column',
                alignItems:'flex-end',gap:5,flexShrink:0}}>
                <span className={`badge ${d.length ? 'badge-warn' : 'badge-ok'}`}>
                  {d.length ? `⚠️ ${d.length} شهر` : '✅ مدفوع'}
                </span>
                <span style={{fontSize:11,color:'var(--ink3)'}}>
                  {fmt(sub.monthly_fee)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes orbFloat {
          0%,100%{transform:translate(0,0)}
          33%{transform:translate(18px,-14px)}
          66%{transform:translate(-14px,18px)}
        }
      `}</style>
    </div>
  )
}
