// src/pages/Dashboard.jsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../components/Toast'

// ── Arabic month names ─────────────────────────────────────────
const MO = [
  'كانون الثاني','شباط','آذار','نيسان','أيار','حزيران',
  'تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول',
]

// ── Helpers ────────────────────────────────────────────────────
const fmt = n => Number(n || 0).toLocaleString('ar-IQ') + ' د.ع'

function moKey(dateStr) {
  // Works with both "2025-06" and "2025-06-01T..." formats
  if (!dateStr) return null
  const s = typeof dateStr === 'string' ? dateStr : new Date(dateStr).toISOString()
  return s.slice(0, 7) // "YYYY-MM"
}

function moLabel(ym) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return `${MO[parseInt(m) - 1]} ${y}`
}

function getCurMo() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

function avatarColor(name = '') {
  const colors = ['#1a3fdb','#059669','#d97706','#e11d48','#7c3aed','#0d9488']
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % colors.length
  return colors[h]
}

// ── Debt calculation using real payments data ──────────────────
// Returns array of unpaid "YYYY-MM" strings from start_date until today
function calcDebtFromPayments(sub, paidMonthsSet) {
  if (!sub.start_date) return []
  const now   = new Date()
  const start = new Date(sub.start_date)
  const unpaid = []
  let y = start.getFullYear()
  let m = start.getMonth() + 1
  while (new Date(y, m - 1) <= now) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    if (!paidMonthsSet.has(key)) unpaid.push(key)
    m++
    if (m > 12) { m = 1; y++ }
  }
  // Don't count the current month as debt yet
  const curMo = getCurMo()
  return unpaid.filter(k => k < curMo)
}

// ── Skeleton card ──────────────────────────────────────────────
function SkeletonBox({ h = 110 }) {
  return (
    <div style={{
      background: 'var(--sur)', border: '1px solid var(--bdr)',
      borderRadius: 'var(--r3)', height: h,
      animation: 'shimmer 1.4s ease-in-out infinite',
    }} />
  )
}

// ══════════════════════════════════════════════════════════════
export default function Dashboard() {
  const {
    company, loading: authLoading,
    trialDaysLeft, isTrialActive, isViewer,
  } = useAuth()
  const navigate = useNavigate()

  // Safe outlet context — setDebtCount updates the sidebar badge
  const ctx          = useOutletContext() ?? {}
  const setDebtCount = ctx.setDebtCount  ?? (() => {})

  // ── Local state ────────────────────────────────────────────
  const [subs,     setSubs]     = useState([])
  const [pays,     setPays]     = useState([])
  const [paidMap,  setPaidMap]  = useState({})  // { subId: Set<"YYYY-MM"> }
  const [loading,  setLoading]  = useState(false)
  const [errMsg,   setErrMsg]   = useState(null)
  const [search,   setSearch]   = useState('')
  const [results,  setResults]  = useState([])
  const [showDrop, setShowDrop] = useState(false)

  // ── Load data ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    setErrMsg(null)

    try {
      // Subscribers — active only, for this company
      const { data: subsRaw, error: e1 } = await supabase
        .from('subscribers')
        .select('id, name, phone, start_date, monthly_fee, subscription_end, notes')
        .eq('company_id', company.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (e1) throw e1

      // Payments — only need subscriber_id, paid_at, amount for stats
      // paid_at in your schema is TIMESTAMPTZ — we derive the month from it
      const { data: paysRaw, error: e2 } = await supabase
        .from('payments')
        .select('id, subscriber_id, amount, paid_at, subscriber_name')
        .eq('company_id', company.id)
        .order('paid_at', { ascending: false })

      if (e2) throw e2

      const paysData = paysRaw ?? []
      const subsData = subsRaw ?? []

      // Build paidMap: { subId → Set<"YYYY-MM"> }
      const pm = {}
      for (const p of paysData) {
        const key = moKey(p.paid_at)
        if (!key) continue
        if (!pm[p.subscriber_id]) pm[p.subscriber_id] = new Set()
        pm[p.subscriber_id].add(key)
      }

      setSubs(subsData)
      setPays(paysData)
      setPaidMap(pm)

      // Update sidebar debt badge
      const lateCount = subsData.filter(s =>
        calcDebtFromPayments(s, pm[s.id] ?? new Set()).length > 0
      ).length
      setDebtCount(lateCount)

      // One-time session notification
      if (!sessionStorage.getItem('np_notif_shown') && lateCount > 0) {
        setTimeout(() => {
          toast(`⚠️ ${lateCount} مشترك متأخر عن الدفع`, 'w', 5000)
          sessionStorage.setItem('np_notif_shown', '1')
        }, 1500)
      }
    } catch (err) {
      console.error('Dashboard loadData error:', err)
      setErrMsg(err.message)
    } finally {
      setLoading(false)
    }
  }, [company?.id, setDebtCount])

  useEffect(() => {
    if (!authLoading && company?.id) loadData()
  }, [authLoading, company?.id, loadData])

  // ── Search ─────────────────────────────────────────────────
  function doSearch(val) {
    setSearch(val)
    if (!val.trim()) { setResults([]); setShowDrop(false); return }
    const q = val.toLowerCase()
    setResults(
      subs.filter(s =>
        s.name?.toLowerCase().includes(q) ||
        s.phone?.includes(val)
      ).slice(0, 8)
    )
    setShowDrop(true)
  }

  // ── Derived statistics ─────────────────────────────────────
  const curMo = getCurMo()

  // Late subscribers (have at least one unpaid month before current)
  const late = subs.filter(s =>
    calcDebtFromPayments(s, paidMap[s.id] ?? new Set()).length > 0
  )

  // Total debt in IQD
  const totalDebt = late.reduce((acc, s) => {
    const months = calcDebtFromPayments(s, paidMap[s.id] ?? new Set())
    return acc + months.length * Number(s.monthly_fee || 0)
  }, 0)

  // Revenue this calendar month (derived from paid_at timestamp)
  const revenueThisMo = pays
    .filter(p => moKey(p.paid_at) === curMo)
    .reduce((acc, p) => acc + Number(p.amount || 0), 0)

  const paidThisMo = pays.filter(p => moKey(p.paid_at) === curMo).length

  // Last 6 months revenue chart data
  const now   = new Date()
  const last6 = Array.from({ length: 6 }, (_, i) => {
    const d   = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const rev = pays
      .filter(p => moKey(p.paid_at) === key)
      .reduce((acc, p) => acc + Number(p.amount || 0), 0)
    return { key, label: MO[d.getMonth()].slice(0, 3), rev }
  })
  const maxRev = Math.max(...last6.map(m => m.rev), 1)

  // ── Guard states ───────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ textAlign: 'center', color: 'var(--ink3)' }}>
          <div style={{ fontSize: 36, marginBottom: 8, animation: 'float 2s ease-in-out infinite' }}>📡</div>
          <div style={{ fontSize: 13 }}>جاري تحميل الحساب...</div>
        </div>
      </div>
    )
  }

  if (!company) {
    return (
      <div className="page">
        <div className="empty-state">
          <div className="empty-art">🏢</div>
          <div className="empty-title">لا يوجد حساب مرتبط</div>
          <div className="empty-sub">تواصل مع الدعم الفني أو أعد تسجيل الدخول</div>
        </div>
      </div>
    )
  }

  if (errMsg) {
    return (
      <div className="page">
        <div style={{
          background: 'rgba(225,29,72,.06)', border: '1px solid rgba(225,29,72,.2)',
          borderRadius: 16, padding: 24, textAlign: 'center', marginTop: 20,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 700, color: 'var(--rose)', marginBottom: 8 }}>خطأ في تحميل البيانات</div>
          <div style={{
            fontSize: 12, color: 'var(--ink3)', marginBottom: 16,
            fontFamily: 'monospace', background: 'var(--bg2)', padding: 8, borderRadius: 8,
          }}>
            {errMsg}
          </div>
          <button
            className="btn btn-primary"
            style={{ width: 'auto', padding: '10px 24px' }}
            onClick={loadData}
          >
            🔄 إعادة المحاولة
          </button>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="page">

      {/* ── Trial banner ── */}
      {isTrialActive && (
        <div className="trial-strip fadeUp">
          <div className="trial-text">
            <h4>🎁 الفترة التجريبية المجانية</h4>
            <p>متبقي <strong>{trialDaysLeft}</strong> أيام</p>
          </div>
          <button className="trial-btn" onClick={() => navigate('/subscribe')}>
            ترقية ✨
          </button>
        </div>
      )}

      {/* ── KPI cards ── */}
      {loading ? (
        <div className="stat-grid">
          {[1, 2, 3, 4].map(i => <SkeletonBox key={i} h={110} />)}
        </div>
      ) : (
        <div className="stat-grid">
          <div className="stat-card fadeUp d1">
            <div className="stat-icon si-1">👥</div>
            <div className="stat-label">إجمالي المشتركين</div>
            <div className="stat-value">{subs.length}</div>
            <div className="stat-trend">{subs.length} مشترك نشط</div>
          </div>

          <div className="stat-card fadeUp d2">
            <div className="stat-icon si-2">⚠️</div>
            <div className="stat-label">المتأخرون</div>
            <div className="stat-value warn">{late.length}</div>
            <div className="stat-trend">
              {subs.length ? Math.round(late.length / subs.length * 100) : 0}% من الكل
            </div>
          </div>

          <div className="stat-card fadeUp d3">
            <div className="stat-icon si-3">💰</div>
            <div className="stat-label">إجمالي الديون</div>
            <div
              className="stat-value danger"
              style={{ fontSize: 'clamp(11px,3vw,18px)' }}
            >
              {late.length ? fmt(totalDebt) : 'لا ديون 🎉'}
            </div>
          </div>

          <div className="stat-card fadeUp d4">
            <div className="stat-icon si-4">💵</div>
            <div className="stat-label">إيرادات هذا الشهر</div>
            <div
              className="stat-value ok"
              style={{ fontSize: 'clamp(10px,2.5vw,16px)' }}
            >
              {revenueThisMo
                ? fmt(revenueThisMo)
                : paidThisMo > 0
                  ? `${paidThisMo} دفعة`
                  : 'لا دفعات بعد'}
            </div>
          </div>
        </div>
      )}

      {/* ── Revenue bar chart (last 6 months) ── */}
      {!loading && pays.length > 0 && (
        <div className="card fadeUp d3" style={{ marginBottom: 14 }}>
          <div className="card-body" style={{ padding: '14px 14px 10px' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', marginBottom: 12 }}>
              📈 إيرادات آخر 6 أشهر
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 86 }}>
              {last6.map((m, i) => {
                const h      = Math.max(4, Math.round(m.rev / maxRev * 68))
                const isCur  = m.key === curMo
                const kLabel = m.rev > 0
                  ? (m.rev >= 1_000_000
                    ? (m.rev / 1_000_000).toFixed(1) + 'M'
                    : Math.round(m.rev / 1000) + 'k')
                  : ''
                return (
                  <div
                    key={i}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
                  >
                    <div style={{ fontSize: 9, color: 'var(--ink3)', fontWeight: 700, minHeight: 12 }}>
                      {kLabel}
                    </div>
                    <div style={{
                      width: '100%', height: h,
                      borderRadius: '5px 5px 2px 2px',
                      background: isCur ? 'var(--gP)' : 'rgba(26,63,219,.18)',
                      boxShadow: isCur ? '0 3px 10px rgba(26,63,219,.3)' : 'none',
                      transition: 'height .5s ease',
                    }} />
                    <div style={{
                      fontSize: 9,
                      fontWeight: isCur ? 800 : 600,
                      color: isCur ? 'var(--blue)' : 'var(--ink3)',
                    }}>
                      {m.label}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Quick action buttons ── */}
      <div className="quick-grid fadeUp d3">
        {!isViewer && (
          <button
            className="btn btn-primary"
            onClick={() => navigate('/subscribers', { state: { openAdd: true } })}
          >
            ➕ إضافة مشترك
          </button>
        )}
        <button
          className="btn btn-whatsapp"
          onClick={() => navigate('/debts')}
        >
          📨 مراسلة المتأخرين
        </button>
      </div>

      {/* ── Subscriber search ── */}
      <div className="search-wrap fadeUp d4" style={{ position: 'relative' }}>
        <span className="search-icon">🔍</span>
        <input
          className="search-input"
          placeholder="ابحث عن مشترك بالاسم أو الهاتف..."
          value={search}
          onChange={e => doSearch(e.target.value)}
          onFocus={() => results.length && setShowDrop(true)}
          onBlur={() => setTimeout(() => setShowDrop(false), 200)}
        />
        {search && (
          <button
            className="search-clear"
            onClick={() => { setSearch(''); setResults([]); setShowDrop(false) }}
          >
            ✕
          </button>
        )}

        {showDrop && (
          <div className="search-dropdown open">
            {results.length === 0 ? (
              <div className="search-item">لا توجد نتائج</div>
            ) : results.map(s => {
              const debtMonths = calcDebtFromPayments(s, paidMap[s.id] ?? new Set())
              return (
                <div
                  key={s.id}
                  className="search-item"
                  onMouseDown={() => {
                    navigate(`/subscribers/${s.id}`)
                    setSearch('')
                    setShowDrop(false)
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{s.phone}</div>
                  </div>
                  <span className={`badge ${debtMonths.length ? 'badge-warn' : 'badge-ok'}`}>
                    {debtMonths.length ? `⚠️ ${debtMonths.length}` : '✅'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Recent subscribers list ── */}
      <div className="sec-header fadeUp d5">
        <div className="sec-title">📋 آخر المشتركين</div>
        <button className="sec-link" onClick={() => navigate('/subscribers')}>
          عرض الكل →
        </button>
      </div>

      {loading ? (
        [1, 2, 3].map(i => <SkeletonBox key={i} h={66} />)
      ) : subs.length === 0 ? (
        <div className="empty-state fadeUp d6">
          <div className="empty-art">📭</div>
          <div className="empty-title">لا يوجد مشتركون بعد</div>
          <div className="empty-sub">اضغط ➕ لإضافة أول مشترك</div>
        </div>
      ) : (
        <div className="fadeUp d6">
          {subs.slice(0, 5).map(sub => {
            const debtMonths = calcDebtFromPayments(sub, paidMap[sub.id] ?? new Set())
            const color      = avatarColor(sub.name)
            return (
              <div
                key={sub.id}
                className="sub-row"
                onClick={() => navigate(`/subscribers/${sub.id}`)}
              >
                <div
                  className="sub-avatar"
                  style={{ background: `${color}22`, color }}
                >
                  {sub.name?.[0] ?? '?'}
                </div>
                <div className="sub-info">
                  <div className="sub-name">{sub.name}</div>
                  <div className="sub-phone">{sub.phone}</div>
                </div>
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'flex-end', gap: 5, flexShrink: 0,
                }}>
                  <span className={`badge ${debtMonths.length ? 'badge-warn' : 'badge-ok'}`}>
                    {debtMonths.length ? `⚠️ ${debtMonths.length} شهر` : '✅ مدفوع'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--ink3)' }}>
                    {fmt(sub.monthly_fee)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
