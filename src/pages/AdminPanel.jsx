import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../components/Toast'

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt    = n  => Number(n || 0).toLocaleString('ar-IQ') + ' د.ع'
const fmtNum = n  => Number(n || 0).toLocaleString('ar-IQ')
const ago    = ts => {
  if (!ts) return '—'
  const d = Math.floor((Date.now() - new Date(ts)) / 86400000)
  if (d === 0) return 'اليوم'
  if (d === 1) return 'أمس'
  if (d < 30)  return `منذ ${d} يوم`
  return new Date(ts).toLocaleDateString('ar-IQ')
}
const planLabel = p => ({ trial: '🎁 تجريبي', basic: '💼 أساسي', pro: '🚀 برو', enterprise: '🏢 مؤسسي' }[p] || p || '—')
const planColor = p => ({ trial: '#d97706', basic: '#1a3fdb', pro: '#7c3aed', enterprise: '#059669' }[p] || '#6b7280')
const statusColor = s => ({ active: '#059669', suspended: '#e11d48', trial: '#d97706', expired: '#6b7280' }[s] || '#6b7280')
const statusLabel = s => ({ active: '✅ نشط', suspended: '🚫 موقوف', trial: '⏳ تجريبي', expired: '🔴 منتهي' }[s] || s)

const PLANS = [
  { key: 'trial',      label: '🎁 تجريبي',  price: 0,      maxSubs: 20,   days: 14 },
  { key: 'basic',      label: '💼 أساسي',   price: 15000,  maxSubs: 100,  days: 30 },
  { key: 'pro',        label: '🚀 برو',      price: 30000,  maxSubs: 500,  days: 30 },
  { key: 'enterprise', label: '🏢 مؤسسي',   price: 60000,  maxSubs: 9999, days: 30 },
]

// ─── Stat Card ────────────────────────────────────────────────────────────────
function KPI({ icon, label, value, sub, color = '#1a3fdb' }) {
  return (
    <div style={{
      background: 'var(--sur)', border: '1px solid var(--bdr)', borderRadius: 16,
      padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 6
    }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{icon}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--ink)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{sub}</div>}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [tab, setTab]         = useState('companies')
  const [companies, setCompanies] = useState([])
  const [requests, setRequests]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [stats, setStats]         = useState({})
  const [search, setSearch]       = useState('')
  const [filterPlan, setFilterPlan] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selected, setSelected]   = useState(null)  // company detail modal
  const [editForm, setEditForm]   = useState(null)
  const [saving, setSaving]       = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [
      { data: comps,  error: e1 },
      { data: reqs,   error: e2 },
      { data: subs,   error: e3 },
      { data: pays,   error: e4 },
    ] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase.from('upgrade_requests').select('*, companies(name, email)').order('created_at', { ascending: false }),
      supabase.from('subscribers').select('company_id, is_active'),
      supabase.from('payments').select('company_id, amount, created_at'),
    ])
    if (e1) { toast('خطأ في تحميل الشركات: ' + e1.message, 'e'); setLoading(false); return }

    const compsData = comps || []
    const subsData  = subs  || []
    const paysData  = pays  || []

    // Enrich companies with sub counts & revenue
    const enriched = compsData.map(c => {
      const cSubs = subsData.filter(s => s.company_id === c.id && s.is_active)
      const cPays = paysData.filter(p => p.company_id === c.id)
      const revenue = cPays.reduce((a, p) => a + Number(p.amount), 0)
      const lastPay = cPays.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
      return { ...c, subCount: cSubs.length, revenue, lastActivity: lastPay?.created_at || c.created_at }
    })

    setCompanies(enriched)
    setRequests(reqs || [])

    const activeCount    = enriched.filter(c => c.status === 'active').length
    const suspCount      = enriched.filter(c => c.status === 'suspended').length
    const trialCount     = enriched.filter(c => c.status === 'trial' || c.plan === 'trial').length
    const totalRevenue   = enriched.reduce((a, c) => a + c.revenue, 0)
    const pendingReqs    = (reqs || []).filter(r => r.status === 'pending').length

    setStats({ total: enriched.length, active: activeCount, suspended: suspCount, trial: trialCount, revenue: totalRevenue, pending: pendingReqs })
    setLoading(false)
  }

  // ── Approve request ──────────────────────────────────────────────────────────
  async function approveRequest(req) {
    setSaving(true)
    const plan = PLANS.find(p => p.key === req.requested_plan)
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + (plan?.days || 30))

    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('upgrade_requests').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', req.id),
      supabase.from('companies').update({
        plan:       req.requested_plan,
        status:     'active',
        trial_end:  expiry.toISOString(),
        max_subscribers: plan?.maxSubs || 100
      }).eq('id', req.company_id)
    ])
    if (e1 || e2) { toast('خطأ في الموافقة', 'e'); setSaving(false); return }
    toast(`✅ تم تفعيل خطة ${planLabel(req.requested_plan)} لـ ${req.companies?.name}`, 's')
    setSaving(false)
    loadAll()
  }

  // ── Reject request ───────────────────────────────────────────────────────────
  async function rejectRequest(req) {
    const { error } = await supabase.from('upgrade_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', req.id)
    if (error) { toast('خطأ', 'e'); return }
    toast('تم رفض الطلب', 'w')
    loadAll()
  }

  // ── Update company ───────────────────────────────────────────────────────────
  async function saveCompany() {
    if (!editForm) return
    setSaving(true)
    const plan   = PLANS.find(p => p.key === editForm.plan)
    const expiry = editForm.trial_end || (() => {
      const d = new Date(); d.setDate(d.getDate() + (plan?.days || 30)); return d.toISOString()
    })()
    const { error } = await supabase.from('companies').update({
      name:            editForm.name,
      email:           editForm.email,
      plan:            editForm.plan,
      status:          editForm.status,
      trial_end:       expiry,
      max_subscribers: editForm.max_subscribers || plan?.maxSubs || 100,
      notes:           editForm.notes || ''
    }).eq('id', editForm.id)
    if (error) { toast('خطأ: ' + error.message, 'e'); setSaving(false); return }
    toast('✅ تم تحديث بيانات الشركة', 's')
    setSaving(false)
    setSelected(null)
    setEditForm(null)
    loadAll()
  }

  // ── Suspend / Activate ───────────────────────────────────────────────────────
  async function toggleStatus(company) {
    const newStatus = company.status === 'active' ? 'suspended' : 'active'
    const { error } = await supabase.from('companies').update({ status: newStatus }).eq('id', company.id)
    if (error) { toast('خطأ', 'e'); return }
    toast(newStatus === 'active' ? `✅ تم تفعيل ${company.name}` : `🚫 تم تعليق ${company.name}`, 's')
    loadAll()
  }

  // ── Delete company ───────────────────────────────────────────────────────────
  async function deleteCompany(id, name) {
    if (!window.confirm(`⚠️ حذف ${name} نهائياً؟ هذا لا يمكن التراجع عنه!`)) return
    const { error } = await supabase.from('companies').delete().eq('id', id)
    if (error) { toast('خطأ في الحذف', 'e'); return }
    toast('تم حذف الشركة', 's')
    setSelected(null)
    loadAll()
  }

  // ── Extend trial ────────────────────────────────────────────────────────────
  async function extendTrial(company, days = 7) {
    const current = company.trial_end ? new Date(company.trial_end) : new Date()
    if (current < new Date()) current.setTime(Date.now())
    current.setDate(current.getDate() + days)
    const { error } = await supabase.from('companies')
      .update({ trial_end: current.toISOString(), status: 'active' }).eq('id', company.id)
    if (error) { toast('خطأ', 'e'); return }
    toast(`✅ تم تمديد ${company.name} بـ ${days} أيام`, 's')
    loadAll()
    if (selected?.id === company.id) setSelected({ ...company, trial_end: current.toISOString() })
  }

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = companies.filter(c => {
    const ms = !search || c.name?.includes(search) || c.email?.includes(search)
    const mp = filterPlan   === 'all' || c.plan   === filterPlan
    const mst = filterStatus === 'all' || c.status === filterStatus
    return ms && mp && mst
  })

  const pendingReqs = requests.filter(r => r.status === 'pending')

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', direction: 'rtl', fontFamily: 'inherit' }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,#0a0f1e,#1e1b4b)',
        borderBottom: '1px solid var(--bdr)',
        padding: '16px 18px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#e11d48,#b91c1c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🛡️</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>لوحة الإدارة العليا</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>NetPro Super Admin</div>
          </div>
          {stats.pending > 0 && (
            <div style={{ marginRight: 'auto', background: '#e11d48', color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 800, animation: 'pulse 2s infinite' }}>
              🔔 {stats.pending} طلب جديد
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '16px 16px 80px', maxWidth: 900, margin: '0 auto' }}>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, marginBottom: 16 }}>
          <KPI icon="🏢" label="إجمالي الشركات"  value={fmtNum(stats.total)}    sub={`${stats.trial || 0} تجريبي`}    color="#1a3fdb" />
          <KPI icon="✅" label="شركات نشطة"       value={fmtNum(stats.active)}   sub={`${stats.suspended || 0} موقوف`} color="#059669" />
          <KPI icon="💰" label="إجمالي الإيرادات" value={fmt(stats.revenue)}     sub="كل الشركات"                       color="#d97706" />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, background: 'var(--bg2)', borderRadius: 12, padding: 4, marginBottom: 16 }}>
          {[
            ['companies', `🏢 الشركات (${companies.length})`],
            ['requests',  `📋 الطلبات ${pendingReqs.length ? `(${pendingReqs.length} جديد)` : `(${requests.length})`}`],
            ['stats',     '📊 إحصائيات'],
          ].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} style={{
              flex: 1, padding: '9px 4px', borderRadius: 9, border: 'none',
              background: tab === v ? 'var(--sur)' : 'transparent',
              color: tab === v ? 'var(--ink)' : 'var(--ink3)',
              fontWeight: tab === v ? 800 : 600, fontSize: 12.5,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: tab === v ? '0 2px 8px rgba(0,0,0,.1)' : 'none',
              transition: 'all .2s'
            }}>{l}</button>
          ))}
        </div>

        {/* ═══ COMPANIES TAB ═══════════════════════════════════════════════════ */}
        {tab === 'companies' && (
          <div>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 2, minWidth: 180 }}>
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14 }}>🔍</span>
                <input style={{
                  width: '100%', padding: '9px 38px 9px 12px', borderRadius: 10,
                  border: '1px solid var(--bdr)', background: 'var(--sur)',
                  color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box'
                }} placeholder="ابحث بالاسم أو الإيميل..."
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select style={{ flex: 1, minWidth: 110, padding: '9px 10px', borderRadius: 10, border: '1px solid var(--bdr)', background: 'var(--sur)', color: 'var(--ink)', fontSize: 12 }}
                value={filterPlan} onChange={e => setFilterPlan(e.target.value)}>
                <option value="all">كل الخطط</option>
                {PLANS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <select style={{ flex: 1, minWidth: 110, padding: '9px 10px', borderRadius: 10, border: '1px solid var(--bdr)', background: 'var(--sur)', color: 'var(--ink)', fontSize: 12 }}
                value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">كل الحالات</option>
                <option value="active">✅ نشط</option>
                <option value="trial">⏳ تجريبي</option>
                <option value="suspended">🚫 موقوف</option>
                <option value="expired">🔴 منتهي</option>
              </select>
            </div>

            <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 10 }}>
              عرض {filtered.length} من {companies.length} شركة
            </div>

            {loading ? (
              [1,2,3,4].map(i => (
                <div key={i} style={{ background:'var(--sur)',borderRadius:14,padding:14,marginBottom:9,height:70,animation:'shimmer 1.4s ease-in-out infinite',border:'1px solid var(--bdr)' }} />
              ))
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🏢</div>
                <div style={{ fontWeight: 700 }}>لا توجد شركات</div>
              </div>
            ) : filtered.map(c => {
              const expiry      = c.trial_end ? new Date(c.trial_end) : null
              const daysLeft    = expiry ? Math.ceil((expiry - Date.now()) / 86400000) : null
              const isExpiring  = daysLeft !== null && daysLeft <= 5 && daysLeft > 0
              const isExpired   = daysLeft !== null && daysLeft <= 0
              return (
                <div key={c.id} style={{
                  background: 'var(--sur)', border: `1px solid ${isExpired ? 'rgba(225,29,72,.3)' : isExpiring ? 'rgba(217,119,6,.3)' : 'var(--bdr)'}`,
                  borderRadius: 14, padding: '13px 15px', marginBottom: 9,
                  cursor: 'pointer', transition: 'all .18s'
                }}
                  onClick={() => { setSelected(c); setEditForm({ ...c }) }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(26,63,219,.4)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = isExpired ? 'rgba(225,29,72,.3)' : isExpiring ? 'rgba(217,119,6,.3)' : 'var(--bdr)'}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>{c.name || '—'}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${planColor(c.plan)}18`, color: planColor(c.plan) }}>
                          {planLabel(c.plan)}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${statusColor(c.status)}18`, color: statusColor(c.status) }}>
                          {statusLabel(c.status)}
                        </span>
                        {isExpired   && <span style={{ fontSize: 10, background: 'rgba(225,29,72,.12)', color: '#e11d48', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>🔴 انتهى</span>}
                        {isExpiring  && <span style={{ fontSize: 10, background: 'rgba(217,119,6,.12)', color: '#d97706', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>⏳ {daysLeft} أيام</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
                        📧 {c.email || '—'} &nbsp;•&nbsp; 👥 {c.subCount} مشترك &nbsp;•&nbsp; 💰 {fmt(c.revenue)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                        📅 انضم: {ago(c.created_at)} &nbsp;•&nbsp; آخر نشاط: {ago(c.lastActivity)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => toggleStatus(c)} style={{
                        padding: '5px 10px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        background: c.status === 'active' ? 'rgba(225,29,72,.1)' : 'rgba(5,150,105,.1)',
                        color: c.status === 'active' ? '#e11d48' : '#059669', fontFamily: 'inherit'
                      }}>
                        {c.status === 'active' ? '🚫 تعليق' : '✅ تفعيل'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ REQUESTS TAB ════════════════════════════════════════════════════ */}
        {tab === 'requests' && (
          <div>
            {requests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink3)' }}>
                <div style={{ fontSize: 44, marginBottom: 8 }}>📋</div>
                <div style={{ fontWeight: 700 }}>لا يوجد طلبات</div>
              </div>
            ) : requests.map(r => {
              const isPending = r.status === 'pending'
              return (
                <div key={r.id} style={{
                  background: 'var(--sur)', border: `1px solid ${isPending ? 'rgba(26,63,219,.3)' : 'var(--bdr)'}`,
                  borderRadius: 14, padding: '14px 16px', marginBottom: 10,
                  opacity: isPending ? 1 : 0.7
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>
                          {r.companies?.name || r.company_id}
                        </div>
                        {isPending && (
                          <span style={{ background: 'rgba(26,63,219,.1)', color: '#1a3fdb', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 800 }}>🔔 جديد</span>
                        )}
                        {r.status === 'approved' && (
                          <span style={{ background: 'rgba(5,150,105,.1)', color: '#059669', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 800 }}>✅ موافَق</span>
                        )}
                        {r.status === 'rejected' && (
                          <span style={{ background: 'rgba(225,29,72,.1)', color: '#e11d48', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 800 }}>❌ مرفوض</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 4 }}>
                        📧 {r.companies?.email || '—'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                        طلب الترقية إلى: <strong style={{ color: planColor(r.requested_plan) }}>{planLabel(r.requested_plan)}</strong>
                        &nbsp;•&nbsp; {ago(r.created_at)}
                      </div>
                      {r.message && (
                        <div style={{ marginTop: 8, background: 'var(--bg2)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: 'var(--ink2)', lineHeight: 1.6 }}>
                          💬 {r.message}
                        </div>
                      )}
                    </div>
                    {isPending && (
                      <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                        <button onClick={() => approveRequest(r)} disabled={saving} style={{
                          padding: '8px 16px', borderRadius: 9, border: 'none',
                          background: 'linear-gradient(135deg,#065f46,#059669)',
                          color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit'
                        }}>✅ موافقة</button>
                        <button onClick={() => rejectRequest(r)} style={{
                          padding: '8px 14px', borderRadius: 9, border: '1px solid rgba(225,29,72,.3)',
                          background: 'rgba(225,29,72,.08)', color: '#e11d48',
                          fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit'
                        }}>❌ رفض</button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ STATS TAB ═══════════════════════════════════════════════════════ */}
        {tab === 'stats' && (
          <div>
            {/* Plan distribution */}
            <div style={{ background: 'var(--sur)', border: '1px solid var(--bdr)', borderRadius: 16, padding: '16px 16px', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)', marginBottom: 14 }}>📊 توزيع الخطط</div>
              {PLANS.map(plan => {
                const count = companies.filter(c => c.plan === plan.key).length
                const pct   = companies.length ? Math.round(count / companies.length * 100) : 0
                return (
                  <div key={plan.key} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{plan.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{count} شركة ({pct}%)</span>
                    </div>
                    <div style={{ height: 7, background: 'var(--bdr)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg,${planColor(plan.key)},${planColor(plan.key)}88)`, borderRadius: 4, transition: 'width .6s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Top companies by subscribers */}
            <div style={{ background: 'var(--sur)', border: '1px solid var(--bdr)', borderRadius: 16, padding: '16px 16px', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)', marginBottom: 14 }}>🏆 أكثر الشركات نشاطاً</div>
              {[...companies].sort((a, b) => b.subCount - a.subCount).slice(0, 5).map((c, i) => {
                const max = companies.reduce((a, x) => Math.max(a, x.subCount), 1)
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < 4 ? '1px solid var(--bdr)' : 'none' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: 'var(--ink3)', flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                      <div style={{ height: 4, background: 'var(--bdr)', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
                        <div style={{ height: '100%', width: `${Math.round(c.subCount / max * 100)}%`, background: 'var(--gP)', borderRadius: 4 }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--blue)', flexShrink: 0 }}>{c.subCount} مشترك</div>
                  </div>
                )
              })}
            </div>

            {/* Expiring soon */}
            {companies.filter(c => {
              const d = c.trial_end ? Math.ceil((new Date(c.trial_end) - Date.now()) / 86400000) : null
              return d !== null && d <= 7 && d > 0
            }).length > 0 && (
              <div style={{ background: 'rgba(217,119,6,.06)', border: '1px solid rgba(217,119,6,.25)', borderRadius: 16, padding: '16px 16px' }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#d97706', marginBottom: 12 }}>⏳ تنتهي قريباً (خلال 7 أيام)</div>
                {companies.filter(c => {
                  const d = c.trial_end ? Math.ceil((new Date(c.trial_end) - Date.now()) / 86400000) : null
                  return d !== null && d <= 7 && d > 0
                }).map(c => {
                  const d = Math.ceil((new Date(c.trial_end) - Date.now()) / 86400000)
                  return (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(217,119,6,.15)' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{planLabel(c.plan)}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: d <= 3 ? '#e11d48' : '#d97706' }}>
                          {d} أيام
                        </span>
                        <button onClick={() => extendTrial(c, 7)} style={{
                          padding: '4px 10px', borderRadius: 7, border: 'none',
                          background: 'rgba(217,119,6,.15)', color: '#d97706',
                          fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
                        }}>+7 أيام</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ COMPANY DETAIL MODAL ════════════════════════════════════════════ */}
      {selected && editForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 800, background: 'rgba(4,8,22,.82)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={e => e.target === e.currentTarget && (setSelected(null), setEditForm(null))}>
          <div style={{
            width: '100%', maxWidth: 600, background: 'var(--sur)',
            borderRadius: '24px 24px 0 0', padding: '10px 20px 44px',
            borderTop: '1px solid var(--bdr)', maxHeight: '92vh', overflowY: 'auto',
            animation: 'slideUp .32s ease'
          }}>
            <div style={{ width: 38, height: 4, background: 'var(--bdr)', borderRadius: 4, margin: '8px auto 18px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--ink)', flex: 1 }}>⚙️ {selected.name}</div>
              <button onClick={() => { setSelected(null); setEditForm(null) }} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg2)', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 15 }}>✕</button>
            </div>

            {/* Quick stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
              {[
                { l: 'المشتركون', v: selected.subCount, c: '#1a3fdb' },
                { l: 'الإيرادات',  v: fmt(selected.revenue), c: '#059669' },
                { l: 'الحالة',     v: statusLabel(selected.status), c: statusColor(selected.status) },
              ].map((s, i) => (
                <div key={i} style={{ background: 'var(--bg2)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 700, marginBottom: 3 }}>{s.l}</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: s.c }}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Edit fields */}
            {[
              { label: 'اسم الشركة *', key: 'name', type: 'text', icon: '🏢' },
              { label: 'الإيميل *',    key: 'email', type: 'email', icon: '📧' },
              { label: 'الحد الأقصى للمشتركين', key: 'max_subscribers', type: 'number', icon: '👥' },
              { label: 'تاريخ انتهاء الخطة', key: 'trial_end', type: 'datetime-local', icon: '📅' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>{f.label}</label>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 10, padding: '0 12px', gap: 8 }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{f.icon}</span>
                  <input type={f.type}
                    value={f.key === 'trial_end' ? (editForm[f.key] || '').slice(0, 16) : (editForm[f.key] || '')}
                    onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })}
                    style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--ink)', padding: '10px 0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                </div>
              </div>
            ))}

            {/* Plan selector */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 8 }}>الخطة</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 7 }}>
                {PLANS.map(p => (
                  <button key={p.key} onClick={() => setEditForm({ ...editForm, plan: p.key, max_subscribers: p.maxSubs })}
                    style={{
                      padding: '10px 8px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                      border: `2px solid ${editForm.plan === p.key ? planColor(p.key) : 'var(--bdr)'}`,
                      background: editForm.plan === p.key ? `${planColor(p.key)}12` : 'var(--bg2)',
                      color: editForm.plan === p.key ? planColor(p.key) : 'var(--ink3)',
                      fontWeight: editForm.plan === p.key ? 800 : 600, fontSize: 12,
                      transition: 'all .18s'
                    }}>
                    {p.label}<br />
                    <span style={{ fontSize: 10, opacity: .8 }}>{p.price ? fmt(p.price) + '/شهر' : 'مجاني'} • {p.maxSubs === 9999 ? 'غير محدود' : p.maxSubs + ' مشترك'}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Status selector */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 8 }}>الحالة</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                {[['active','✅ نشط','#059669'],['trial','⏳ تجريبي','#d97706'],['suspended','🚫 موقوف','#e11d48'],['expired','🔴 منتهي','#6b7280']].map(([v,l,c]) => (
                  <button key={v} onClick={() => setEditForm({ ...editForm, status: v })}
                    style={{
                      padding: '8px 4px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
                      border: `2px solid ${editForm.status === v ? c : 'var(--bdr)'}`,
                      background: editForm.status === v ? `${c}12` : 'var(--bg2)',
                      color: editForm.status === v ? c : 'var(--ink3)',
                      fontWeight: editForm.status === v ? 800 : 600, fontSize: 11,
                      transition: 'all .18s'
                    }}>{l}</button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>ملاحظات داخلية</label>
              <textarea value={editForm.notes || ''} onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                rows={2} placeholder="ملاحظات خاصة بهذه الشركة..."
                style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--bdr)', background: 'var(--bg2)', color: 'var(--ink)', fontSize: 13, fontFamily: 'inherit', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Action buttons */}
            <button onClick={saveCompany} disabled={saving} style={{
              width: '100%', padding: 14, borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg,#1a3fdb,#6144f5)',
              color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', marginBottom: 9, fontFamily: 'inherit'
            }}>
              {saving ? '⏳ جاري الحفظ...' : '💾 حفظ التعديلات'}
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7, marginBottom: 9 }}>
              <button onClick={() => extendTrial(selected, 7)} style={{ padding: '10px 4px', borderRadius: 10, border: '1px solid rgba(217,119,6,.3)', background: 'rgba(217,119,6,.08)', color: '#d97706', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                ⏳ +7 أيام
              </button>
              <button onClick={() => extendTrial(selected, 30)} style={{ padding: '10px 4px', borderRadius: 10, border: '1px solid rgba(26,63,219,.3)', background: 'rgba(26,63,219,.08)', color: '#1a3fdb', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                📅 +30 يوم
              </button>
              <button onClick={() => toggleStatus(selected)} style={{
                padding: '10px 4px', borderRadius: 10, border: `1px solid ${selected.status === 'active' ? 'rgba(225,29,72,.3)' : 'rgba(5,150,105,.3)'}`,
                background: selected.status === 'active' ? 'rgba(225,29,72,.08)' : 'rgba(5,150,105,.08)',
                color: selected.status === 'active' ? '#e11d48' : '#059669',
                fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit'
              }}>
                {selected.status === 'active' ? '🚫 تعليق' : '✅ تفعيل'}
              </button>
            </div>

            <button onClick={() => deleteCompany(selected.id, selected.name)} style={{
              width: '100%', padding: 12, borderRadius: 12,
              border: '1px solid rgba(225,29,72,.3)', background: 'rgba(225,29,72,.06)',
              color: '#e11d48', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit'
            }}>
              🗑 حذف الشركة نهائياً
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.7}}
        @keyframes shimmer{0%{background:var(--bg2)}50%{background:var(--sur)}100%{background:var(--bg2)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
      `}</style>
    </div>
  )
}
