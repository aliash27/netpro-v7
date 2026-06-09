import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase }  from '../lib/supabase'
import { useAuth }   from '../context/AuthContext'
import { toast }     from '../components/Toast'
import ReceiptModal  from '../components/ReceiptModal'
import { SkeletonList } from '../components/Skeleton'
import {
  calcDebt, buildPaidMap, fmt, moLabel, avatarColor,
  getToday, getCurMo
} from '../utils'

export default function Debts() {
  const { company, user, isViewer } = useAuth()
  const navigate = useNavigate()

  const [subs, setSubs]       = useState([])
  const [paidMap, setPaidMap] = useState({})
  const [loading, setLoading] = useState(true)

  const [payTarget, setPayTarget]   = useState(null)
  const [payForm, setPayForm]       = useState({ month: '', amount: '', paid_at: getToday(), notes: '' })
  const [showConfirm, setShowConfirm] = useState(false)
  const [paying, setPaying]         = useState(false)
  const [receiptData, setReceiptData] = useState(null)
  const [search, setSearch]         = useState('')

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    setLoading(true)
    const [{ data: subsData, error: e1 }, { data: paysData, error: e2 }] = await Promise.all([
      supabase.from('subscribers').select('*')
        .eq('company_id', company.id).eq('is_active', true)
        .order('name'),
      supabase.from('payments').select('subscriber_id, month')
        .eq('company_id', company.id)
    ])
    if (e1 || e2) { toast('خطأ في تحميل البيانات', 'e'); setLoading(false); return }
    setSubs(subsData || [])
    setPaidMap(buildPaidMap(paysData || []))
    setLoading(false)
  }

  function openPay(sub) {
    const debt = calcDebt(sub, paidMap[sub.id] || [])
    setPayTarget(sub)
    setPayForm({
      month:   debt[0] || getCurMo(),
      amount:  String(sub.monthly_fee || ''),
      paid_at: getToday(),
      notes:   ''
    })
    setShowConfirm(false)
  }

  async function confirmPay() {
    if (!payForm.amount || !payForm.month) {
      toast('يرجى ملء المبلغ والشهر', 'e'); return
    }
    if (parseFloat(payForm.amount) <= 0) {
      toast('المبلغ يجب أن يكون أكبر من صفر', 'e'); return
    }
    if ((paidMap[payTarget.id] || []).includes(payForm.month)) {
      toast(`شهر ${moLabel(payForm.month)} مسجل مسبقاً ⚠️`, 'e'); return
    }
    setPaying(true)
    const recorderName = user?.email || 'admin'
    const { error } = await supabase.from('payments').insert({
      company_id:      company.id,
      subscriber_id:   payTarget.id,
      subscriber_name: payTarget.name,
      month:           payForm.month,
      amount:          parseFloat(payForm.amount),
      paid_at:         payForm.paid_at,
      notes:           payForm.notes,
      recorded_by:     recorderName
    })
    if (error) { toast('خطأ: ' + error.message, 'e'); setPaying(false); return }

    const allPaid = [...(paidMap[payTarget.id] || []), payForm.month].sort()
    await supabase.from('subscribers')
      .update({ last_paid_month: allPaid[allPaid.length - 1] }).eq('id', payTarget.id)

    toast(`✅ تم تسجيل دفعة ${moLabel(payForm.month)} لـ ${payTarget.name}`, 's')
    setPaying(false)
    setReceiptData({
      sub: payTarget, month: payForm.month, amount: parseFloat(payForm.amount),
      paidAt: payForm.paid_at, recordedBy: recorderName, company
    })
    setPayTarget(null)
    setShowConfirm(false)
    load()
  }

  function sendWA(sub) {
    const d     = calcDebt(sub, paidMap[sub.id] || [])
    const total = d.length * sub.monthly_fee
    const tmpl  = company?.whatsapp_template ||
      'عزيزي {name}، لديك {months} شهر متأخر بمبلغ {amount} د.ع. شكراً — {company}'
    const msg = tmpl
      .replace(/{name}/g,    sub.name)
      .replace(/{months}/g,  d.length)
      .replace(/{amount}/g,  total.toLocaleString('ar-IQ'))
      .replace(/{company}/g, company?.name || 'المنصة')
    const phone = sub.phone?.replace(/^0/, '964').replace(/\D/g, '')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  async function sendAllWA() {
    if (!late.length) { toast('لا يوجد متأخرون', 'i'); return }
    toast(`جاري فتح ${late.length} محادثة...`, 'i')
    late.forEach((sub, i) => setTimeout(() => sendWA(sub), i * 1200))
  }

  const all  = subs.filter(s => calcDebt(s, paidMap[s.id] || []).length > 0)
  const late = search
    ? all.filter(s => s.name.includes(search) || s.phone?.includes(search))
    : all
  const totalDebt = all.reduce((a, s) => a + calcDebt(s, paidMap[s.id] || []).length * s.monthly_fee, 0)

  return (
    <div className="page">
      <ReceiptModal data={receiptData} onClose={() => setReceiptData(null)} />

      <div className="page-title">⚠️ الديون المستحقة</div>

      {/* Summary */}
      <div className="stat-grid" style={{ marginBottom: 14 }}>
        <div className="stat-card">
          <div className="stat-icon si-2">👥</div>
          <div className="stat-label">متأخرون</div>
          <div className="stat-value warn">{all.length}</div>
          <div className="stat-trend">
            {subs.length ? Math.round(all.length / subs.length * 100) : 0}% من الكل
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon si-3">💰</div>
          <div className="stat-label">إجمالي الديون</div>
          <div className="stat-value danger" style={{ fontSize: 'clamp(11px,3vw,18px)' }}>
            {all.length ? fmt(totalDebt) : 'لا ديون 🎉'}
          </div>
        </div>
      </div>

      {all.length > 0 && (
        <>
          <div className="search-wrap" style={{ marginBottom: 10 }}>
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="ابحث في المتأخرين..."
              value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
          <button className="btn btn-whatsapp" style={{ marginBottom: 14 }} onClick={sendAllWA}>
            📨 مراسلة جميع المتأخرين ({all.length})
          </button>
        </>
      )}

      <div className="sec-header">
        <div className="sec-title">المتأخرون عن الدفع</div>
        <div className="sec-count">{late.length}</div>
      </div>

      {loading ? <SkeletonList count={4} /> : late.length === 0 ? (
        <div className="empty-state">
          <div className="empty-art">🎉</div>
          <div className="empty-title">
            {search ? 'لا توجد نتائج' : 'لا يوجد متأخرون!'}
          </div>
          <div className="empty-sub">
            {search ? 'جرب بحثاً آخر' : 'جميع المشتركين مدفوعون. عمل رائع!'}
          </div>
        </div>
      ) : late.map(sub => {
        const d     = calcDebt(sub, paidMap[sub.id] || [])
        const total = d.length * sub.monthly_fee
        const color = avatarColor(sub.name)
        const urgency = d.length >= 3 ? 'high' : d.length >= 2 ? 'mid' : 'low'
        return (
          <div key={sub.id} className="card" style={{
            marginBottom: 11,
            borderLeft: `3px solid ${urgency === 'high' ? '#e11d48' : urgency === 'mid' ? '#d97706' : '#f59e0b'}`
          }}>
            <div className="card-body" style={{ padding: 15 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 11 }}>
                <div className="sub-avatar" style={{ background: `${color}22`, color }}>
                  {sub.name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, cursor: 'pointer', color: 'var(--ink)' }}
                    onClick={() => navigate(`/subscribers/${sub.id}`)}>
                    {sub.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{sub.phone}</div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <span className={`badge ${urgency === 'high' ? 'badge-err' : 'badge-warn'}`}>
                    {urgency === 'high' ? '🔴' : '⚠️'} {d.length} شهر
                  </span>
                  <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--rose)', marginTop: 4 }}>
                    {fmt(total)}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 11, lineHeight: 1.7 }}>
                آخر دفع: <strong style={{ color: 'var(--ink)' }}>{moLabel(sub.last_paid_month)}</strong>
                <br />
                أشهر الدين: <strong style={{ color: 'var(--rose)' }}>
                  {d.slice(0, 4).map(moLabel).join('، ')}{d.length > 4 ? ` +${d.length - 4}` : ''}
                </strong>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => navigate(`/subscribers/${sub.id}`)}>
                  📋 تفاصيل
                </button>
                <button className="btn btn-whatsapp btn-sm" onClick={() => sendWA(sub)}>
                  📱 مراسلة
                </button>
                {!isViewer && (
                  <button onClick={() => openPay(sub)} style={{
                    padding: '8px 4px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg,#065f46,#059669)',
                    color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit'
                  }}>
                    💵 دفعة
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {/* ── Pay Modal ── */}
      {payTarget && !showConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(4,8,22,.72)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={e => e.target === e.currentTarget && setPayTarget(null)}>
          <div style={{ width: '100%', maxWidth: 540, background: 'var(--sur)', borderRadius: '26px 26px 0 0', padding: '10px 20px 36px', borderTop: '1px solid var(--bdr)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ width: 38, height: 4, background: 'var(--bdr)', borderRadius: 4, margin: '8px auto 18px' }} />
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              💵 تسجيل دفعة
              <button onClick={() => setPayTarget(null)} style={{ marginRight: 'auto', width: 32, height: 32, borderRadius: '50%', background: 'var(--bg2)', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 15 }}>✕</button>
            </div>

            <div style={{ background: 'rgba(26,63,219,.06)', border: '1px solid rgba(26,63,219,.15)', borderRadius: 12, padding: '12px 14px', marginBottom: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: `${avatarColor(payTarget.name)}22`, color: avatarColor(payTarget.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900 }}>{payTarget.name[0]}</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>{payTarget.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{payTarget.phone}</div>
                <div style={{ fontSize: 12, color: 'var(--rose)', marginTop: 2 }}>
                  ⚠️ {calcDebt(payTarget, paidMap[payTarget.id] || []).length} شهر متأخر
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>الشهر المدفوع *</label>
              <select className="field-input" value={payForm.month}
                onChange={e => setPayForm({ ...payForm, month: e.target.value })}>
                {calcDebt(payTarget, paidMap[payTarget.id] || []).map(mo => (
                  <option key={mo} value={mo}>{moLabel(mo)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">المبلغ (د.ع) *</label>
              <div className="field-wrap">
                <span className="field-icon">💰</span>
                <input className="field-input" type="number" value={payForm.amount}
                  onChange={e => setPayForm({ ...payForm, amount: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label className="field-label">تاريخ الاستلام</label>
              <div className="field-wrap">
                <span className="field-icon">📅</span>
                <input className="field-input" type="date" value={payForm.paid_at}
                  onChange={e => setPayForm({ ...payForm, paid_at: e.target.value })} />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 18 }}>
              <label className="field-label">ملاحظات (اختياري)</label>
              <textarea className="field-input" rows={2} placeholder="ملاحظات..."
                value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} />
            </div>
            <button onClick={() => setShowConfirm(true)} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#065f46,#059669)', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', marginBottom: 10, fontFamily: 'inherit' }}>
              التالي: مراجعة الدفعة →
            </button>
            <button onClick={() => setPayTarget(null)} style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid var(--bdr)', background: 'transparent', color: 'var(--ink3)', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* ── Confirm Modal ── */}
      {payTarget && showConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 510, background: 'rgba(4,8,22,.82)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowConfirm(false)}>
          <div style={{ background: 'var(--sur)', borderRadius: 20, padding: 28, maxWidth: 420, width: '100%', border: '1px solid rgba(5,150,105,.3)' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 44 }}>💵</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink)', marginTop: 8 }}>تأكيد تثبيت الدفعة</div>
            </div>
            {[['المشترك', payTarget.name], ['الشهر', moLabel(payForm.month)], ['المبلغ', fmt(payForm.amount)], ['التاريخ', payForm.paid_at]].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--bdr)' }}>
                <span style={{ fontSize: 13, color: 'var(--ink3)' }}>{l}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{v}</span>
              </div>
            ))}
            <button onClick={confirmPay} disabled={paying} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#065f46,#059669)', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', marginTop: 18, marginBottom: 10, fontFamily: 'inherit' }}>
              {paying ? '⏳ جاري التثبيت...' : '✅ تثبيت الدفعة'}
            </button>
            <button onClick={() => setShowConfirm(false)} style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid var(--bdr)', background: 'transparent', color: 'var(--ink3)', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              ← تعديل البيانات
            </button>
          </div>
        </div>
      )}

      <style>{`.sec-count{font-size:11px;font-weight:700;color:var(--ink3);background:var(--bg2);border:1px solid var(--bdr);padding:3px 10px;border-radius:20px;}`}</style>
    </div>
  )
}
