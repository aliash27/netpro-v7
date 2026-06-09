import { useState, useEffect } from 'react'
import { supabase }  from '../lib/supabase'
import { useAuth }   from '../context/AuthContext'
import { toast }     from '../components/Toast'
import ReceiptModal  from '../components/ReceiptModal'
import { SkeletonList } from '../components/Skeleton'
import { confirm, ConfirmDialog, useConfirmDialog } from '../components/ConfirmDialog'
import {
  calcDebt, buildPaidMap, fmt, moLabel, avatarColor,
  getToday, getCurMo, MO
} from '../utils'

export default function Payments() {
  const { company, user, isViewer } = useAuth()
  const dlg = useConfirmDialog()

  const [pays, setPays]       = useState([])
  const [subs, setSubs]       = useState([])
  const [paidMap, setPaidMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filterMonth, setFilterMonth] = useState('')

  const [showNew, setShowNew]     = useState(false)
  const [subSearch, setSubSearch] = useState('')
  const [selSub, setSelSub]       = useState(null)
  const [payForm, setPayForm]     = useState({ month: getCurMo(), amount: '', paid_at: getToday(), notes: '' })
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [receiptData, setReceiptData] = useState(null)

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    setLoading(true)
    const [{ data: pData, error: e1 }, { data: sData, error: e2 }] = await Promise.all([
      supabase.from('payments').select('*')
        .eq('company_id', company.id).order('paid_at', { ascending: false }),
      supabase.from('subscribers').select('*')
        .eq('company_id', company.id).eq('is_active', true).order('name')
    ])
    if (e1 || e2) { toast('خطأ في تحميل البيانات', 'e'); setLoading(false); return }
    setPays(pData || [])
    setSubs(sData || [])
    setPaidMap(buildPaidMap(pData || []))
    setLoading(false)
  }

  function selectSub(sub) {
    setSelSub(sub)
    const debt = calcDebt(sub, paidMap[sub.id] || [])
    setPayForm({
      month:   debt[0] || getCurMo(),
      amount:  String(sub.monthly_fee || ''),
      paid_at: getToday(),
      notes:   ''
    })
    setSubSearch('')
  }

  async function savePay() {
    if (!selSub || !payForm.month || !payForm.amount) {
      toast('يرجى اختيار مشترك وملء المبلغ', 'e'); return
    }
    if (parseFloat(payForm.amount) <= 0) {
      toast('المبلغ يجب أن يكون أكبر من صفر', 'e'); return
    }
    const alreadyPaid = (paidMap[selSub.id] || []).includes(payForm.month)
    if (alreadyPaid) {
      toast(`شهر ${moLabel(payForm.month)} مسجل مسبقاً ⚠️`, 'e'); return
    }
    setSaving(true)
    const recorderName = user?.email || 'admin'
    const { error } = await supabase.from('payments').insert({
      company_id:      company.id,
      subscriber_id:   selSub.id,
      subscriber_name: selSub.name,
      month:           payForm.month,
      amount:          parseFloat(payForm.amount),
      paid_at:         payForm.paid_at,
      notes:           payForm.notes,
      recorded_by:     recorderName
    })
    if (error) { toast('خطأ: ' + error.message, 'e'); setSaving(false); return }
    const allPaid = [...(paidMap[selSub.id] || []), payForm.month].sort()
    await supabase.from('subscribers')
      .update({ last_paid_month: allPaid[allPaid.length - 1] }).eq('id', selSub.id)
    toast(`✅ تم تسجيل دفعة ${moLabel(payForm.month)} لـ ${selSub.name}`, 's')
    setSaving(false)
    setReceiptData({
      sub: selSub, month: payForm.month, amount: parseFloat(payForm.amount),
      paidAt: payForm.paid_at, recordedBy: recorderName, company
    })
    setShowConfirm(false)
    setShowNew(false)
    setSelSub(null)
    load()
  }

  async function deletePayment(pay) {
    const yes = await confirm({
      title: `حذف دفعة ${moLabel(pay.month)}؟`,
      body:  `سيتم حذف دفعة ${pay.subscriber_name} لشهر ${moLabel(pay.month)}.`,
      danger: true
    })
    if (!yes) return
    const { error } = await supabase.from('payments').delete().eq('id', pay.id)
    if (error) { toast('خطأ في الحذف: ' + error.message, 'e'); return }
    // Recalculate last_paid_month
    const remaining = pays.filter(p => p.id !== pay.id && p.subscriber_id === pay.subscriber_id)
    const sorted = remaining.map(p => p.month).sort()
    await supabase.from('subscribers')
      .update({ last_paid_month: sorted.length ? sorted[sorted.length - 1] : null })
      .eq('id', pay.subscriber_id)
    toast('تم حذف الدفعة ✅', 's')
    load()
  }

  const months      = [...new Set(pays.map(p => p.month))].sort().reverse()
  const list        = pays.filter(p => {
    const ms = !search || p.subscriber_name.includes(search) || moLabel(p.month).includes(search)
    const mm = !filterMonth || p.month === filterMonth
    return ms && mm
  })
  const totalFiltered = list.reduce((s, p) => s + Number(p.amount), 0)
  const subList = subSearch.trim()
    ? subs.filter(s => s.name.includes(subSearch) || s.phone.includes(subSearch))
    : subs

  return (
    <div className="page">
      <ConfirmDialog {...dlg} />
      <ReceiptModal data={receiptData} onClose={() => setReceiptData(null)} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="page-title" style={{ marginBottom: 0 }}>📋 سجل الدفعات</div>
        {!isViewer && (
          <button className="btn btn-primary btn-sm"
            style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => { setShowNew(true); setSelSub(null); setSubSearch('') }}>
            ➕ دفعة جديدة
          </button>
        )}
      </div>

      {/* Stats */}
      {pays.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 14 }}>
          <div style={{ background: 'var(--sur)', border: '1px solid var(--bdr)', borderRadius: 14, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 700, marginBottom: 3 }}>إجمالي الدفعات</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--ink)' }}>{pays.length}</div>
          </div>
          <div style={{ background: 'var(--sur)', border: '1px solid var(--bdr)', borderRadius: 14, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 700, marginBottom: 3 }}>إجمالي الإيرادات</div>
            <div style={{ fontSize: 14, fontWeight: 900, background: 'var(--gT)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {fmt(pays.reduce((a, p) => a + Number(p.amount), 0))}
            </div>
          </div>
        </div>
      )}

      <div className="search-wrap">
        <span className="search-icon">🔍</span>
        <input className="search-input" placeholder="بحث باسم أو شهر..."
          value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select style={{
          flex: 1, minWidth: 150, padding: '8px 12px', borderRadius: 10,
          border: '1px solid var(--bdr)', background: 'var(--sur)', color: 'var(--ink)', fontSize: 13
        }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
          <option value="">📅 كل الأشهر</option>
          {months.map(m => <option key={m} value={m}>{moLabel(m)}</option>)}
        </select>
        {filterMonth && (
          <button style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--bdr)', background: 'var(--bg2)', color: 'var(--ink3)', fontSize: 12, cursor: 'pointer' }}
            onClick={() => setFilterMonth('')}>✕</button>
        )}
      </div>

      {(filterMonth || search) && list.length > 0 && (
        <div style={{ background: 'rgba(26,63,219,.06)', border: '1px solid rgba(26,63,219,.15)', borderRadius: 12, padding: '12px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--ink2)' }}>
            {filterMonth ? `💡 ${moLabel(filterMonth)}` : '🔍 نتائج'}
            <span style={{ fontSize: 11, color: 'var(--ink3)', marginRight: 6 }}>({list.length} دفعة)</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 900, background: 'var(--gP)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {fmt(totalFiltered)}
          </div>
        </div>
      )}

      <div className="sec-header">
        <div className="sec-title">الدفعات المسجلة</div>
        <div className="sec-count">{list.length}</div>
      </div>

      {loading ? <SkeletonList count={5} /> : list.length === 0 ? (
        <div className="empty-state">
          <div className="empty-art">📋</div>
          <div className="empty-title">لا يوجد دفعات</div>
          <div className="empty-sub">{search || filterMonth ? 'لا توجد نتائج' : 'اضغط ➕ لتسجيل أول دفعة'}</div>
        </div>
      ) : list.map(p => (
        <div key={p.id} className="card" style={{ marginBottom: 9 }}>
          <div className="card-body" style={{ padding: '13px 15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: `${avatarColor(p.subscriber_name)}22`,
                  color: avatarColor(p.subscriber_name),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 900
                }}>{p.subscriber_name[0]}</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>{p.subscriber_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>📅 {moLabel(p.month)} • {p.paid_at}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>👤 {p.recorded_by || '—'}</div>
                </div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 17, fontWeight: 900, background: 'var(--gT)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {fmt(p.amount)}
                </div>
                {!isViewer && (
                  <button onClick={() => deletePayment(p)}
                    style={{ marginTop: 6, background: 'rgba(225,29,72,.08)', border: 'none', color: 'var(--rose)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    🗑 حذف
                  </button>
                )}
              </div>
            </div>
            {p.notes && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink3)', background: 'var(--bg2)', borderRadius: 8, padding: '6px 10px' }}>
                📝 {p.notes}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* ── New Payment Modal ── */}
      {showNew && !showConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(4,8,22,.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={e => e.target === e.currentTarget && setShowNew(false)}>
          <div style={{ width: '100%', maxWidth: 560, background: 'var(--sur)', borderRadius: '26px 26px 0 0', padding: '10px 20px 36px', borderTop: '1px solid var(--bdr)', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ width: 38, height: 4, background: 'var(--bdr)', borderRadius: 4, margin: '8px auto 18px' }} />
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
              💵 تسجيل دفعة جديدة
              <button onClick={() => setShowNew(false)} style={{ marginRight: 'auto', width: 32, height: 32, borderRadius: '50%', background: 'var(--bg2)', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 15 }}>✕</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>1️⃣ اختيار المشترك *</label>
              {selSub ? (
                <div style={{ background: 'rgba(26,63,219,.08)', border: '1px solid rgba(26,63,219,.2)', borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 11 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `${avatarColor(selSub.name)}22`, color: avatarColor(selSub.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, flexShrink: 0 }}>{selSub.name[0]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>{selSub.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1 }}>{selSub.phone} • {fmt(selSub.monthly_fee)}/شهر</div>
                    {calcDebt(selSub, paidMap[selSub.id] || []).length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--rose)', marginTop: 2, fontWeight: 700 }}>
                        ⚠️ {calcDebt(selSub, paidMap[selSub.id] || []).length} شهر متأخر
                      </div>
                    )}
                  </div>
                  <button onClick={() => setSelSub(null)} style={{ background: 'var(--bg2)', border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--ink3)', fontWeight: 700 }}>تغيير</button>
                </div>
              ) : (
                <div>
                  <div className="field-wrap" style={{ marginBottom: 8 }}>
                    <span className="field-icon">🔍</span>
                    <input className="field-input" type="text" placeholder="ابحث بالاسم أو الهاتف..."
                      value={subSearch} onChange={e => setSubSearch(e.target.value)} autoFocus />
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--bdr)', borderRadius: 10, background: 'var(--sur)' }}>
                    {subList.length === 0 ? (
                      <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--ink3)' }}>لا يوجد مشتركون</div>
                    ) : subList.map(sub => {
                      const d = calcDebt(sub, paidMap[sub.id] || [])
                      const col = avatarColor(sub.name)
                      return (
                        <div key={sub.id} onClick={() => selectSub(sub)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid var(--bdr)', transition: '.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <div style={{ width: 34, height: 34, borderRadius: 9, background: `${col}22`, color: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900, flexShrink: 0 }}>{sub.name[0]}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{sub.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{sub.phone}</div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 800, background: d.length ? 'rgba(225,29,72,.1)' : 'rgba(5,150,105,.1)', color: d.length ? '#e11d48' : '#059669', padding: '2px 8px', borderRadius: 20 }}>
                            {d.length ? `⚠️ ${d.length}` : '✅'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {selSub && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', marginBottom: 10 }}>2️⃣ تفاصيل الدفعة</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>الشهر المدفوع *</label>
                  <select className="field-input" value={payForm.month}
                    onChange={e => setPayForm({ ...payForm, month: e.target.value })}>
                    {(calcDebt(selSub, paidMap[selSub.id] || []).length > 0
                      ? calcDebt(selSub, paidMap[selSub.id] || [])
                      : [getCurMo()]).map(mo => (
                      <option key={mo} value={mo}>{moLabel(mo)}</option>
                    ))}
                    {Array.from({ length: 6 }, (_, i) => {
                      const d = new Date(); d.setMonth(d.getMonth() - i)
                      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                    }).filter(m => !calcDebt(selSub, paidMap[selSub.id] || []).includes(m)).map(m => (
                      <option key={m} value={m}>{moLabel(m)} (مدفوع)</option>
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
                  <textarea className="field-input" rows={2} placeholder="أي ملاحظات..."
                    value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} />
                </div>
                <button onClick={() => setShowConfirm(true)} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#065f46,#059669)', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', marginBottom: 9, fontFamily: 'inherit' }}>
                  التالي: مراجعة وتأكيد →
                </button>
              </>
            )}
            <button onClick={() => setShowNew(false)} style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid var(--bdr)', background: 'transparent', color: 'var(--ink3)', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ── Confirm Modal ── */}
      {showConfirm && selSub && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 510, background: 'rgba(4,8,22,.82)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowConfirm(false)}>
          <div style={{ background: 'var(--sur)', borderRadius: 20, padding: 28, maxWidth: 420, width: '100%', border: '1px solid rgba(5,150,105,.3)' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 44 }}>💵</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink)', marginTop: 8 }}>تأكيد تثبيت الدفعة</div>
            </div>
            {[['المشترك', selSub.name], ['الشهر', moLabel(payForm.month)], ['المبلغ', fmt(payForm.amount)], ['التاريخ', payForm.paid_at]].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--bdr)' }}>
                <span style={{ fontSize: 13, color: 'var(--ink3)' }}>{l}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{v}</span>
              </div>
            ))}
            <button onClick={savePay} disabled={saving} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#065f46,#059669)', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', marginTop: 18, marginBottom: 10, fontFamily: 'inherit' }}>
              {saving ? '⏳ جاري التثبيت...' : '✅ تثبيت الدفعة'}
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
