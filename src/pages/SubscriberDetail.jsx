import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase }  from '../lib/supabase'
import { useAuth }   from '../context/AuthContext'
import { toast }     from '../components/Toast'
import ReceiptModal  from '../components/ReceiptModal'
import { SkeletonList } from '../components/Skeleton'
import { confirm, ConfirmDialog, useConfirmDialog } from '../components/ConfirmDialog'
import {
  calcDebt, buildPaidMap, fmt, moLabel, avatarColor,
  validatePhone, getToday, getCurMo, MO
} from '../utils'

export default function SubscriberDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { company, user, isViewer } = useAuth()
  const dlg = useConfirmDialog()

  const [sub, setSub]         = useState(null)
  const [pays, setPays]       = useState([])
  const [paidMap, setPaidMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [form, setForm]       = useState({})

  const [showPay, setShowPay]       = useState(false)
  const [showConfPay, setShowConfPay] = useState(false)
  const [payForm, setPayForm]       = useState({ month: '', amount: '', paid_at: getToday(), notes: '' })
  const [saving, setSaving]         = useState(false)
  const [receiptData, setReceiptData] = useState(null)
  const [activeTab, setActiveTab]   = useState('overview')

  useEffect(() => { if (company && id) load() }, [company, id])

  async function load() {
    setLoading(true)
    const [{ data: subData, error: e1 }, { data: paysData, error: e2 }] = await Promise.all([
      supabase.from('subscribers').select('*').eq('id', id).single(),
      supabase.from('payments').select('*')
        .eq('subscriber_id', id).order('month', { ascending: false })
    ])
    if (e1) { toast('خطأ: مشترك غير موجود', 'e'); navigate('/subscribers'); return }
    if (e2) { toast('خطأ في تحميل الدفعات', 'e') }
    setSub(subData)
    setPays(paysData || [])
    setPaidMap(buildPaidMap(paysData || []))
    setForm({
      name:             subData.name,
      phone:            subData.phone,
      start_date:       subData.start_date,
      monthly_fee:      subData.monthly_fee,
      last_paid_month:  subData.last_paid_month || '',
      subscription_end: subData.subscription_end || '',
      notes:            subData.notes || ''
    })
    setLoading(false)
  }

  function openPay() {
    const debt = calcDebt(sub, paidMap[sub.id] || [])
    setPayForm({ month: debt[0] || getCurMo(), amount: String(sub.monthly_fee || ''), paid_at: getToday(), notes: '' })
    setShowPay(true)
    setShowConfPay(false)
  }

  async function savePay() {
    if (!payForm.amount || !payForm.month) { toast('يرجى ملء المبلغ والشهر', 'e'); return }
    if (parseFloat(payForm.amount) <= 0) { toast('المبلغ يجب أن يكون أكبر من صفر', 'e'); return }
    if ((paidMap[sub.id] || []).includes(payForm.month)) {
      toast(`شهر ${moLabel(payForm.month)} مسجل مسبقاً ⚠️`, 'e'); return
    }
    setSaving(true)
    const recorderName = user?.email || 'admin'
    const { error } = await supabase.from('payments').insert({
      company_id:      company.id,
      subscriber_id:   sub.id,
      subscriber_name: sub.name,
      month:           payForm.month,
      amount:          parseFloat(payForm.amount),
      paid_at:         payForm.paid_at,
      notes:           payForm.notes,
      recorded_by:     recorderName
    })
    if (error) { toast('خطأ: ' + error.message, 'e'); setSaving(false); return }
    const allPaid = [...(paidMap[sub.id] || []), payForm.month].sort()
    await supabase.from('subscribers')
      .update({ last_paid_month: allPaid[allPaid.length - 1] }).eq('id', sub.id)
    toast(`✅ تم تسجيل دفعة ${moLabel(payForm.month)}`, 's')
    setSaving(false)
    setReceiptData({ sub, month: payForm.month, amount: parseFloat(payForm.amount), paidAt: payForm.paid_at, recordedBy: recorderName, company })
    setShowPay(false); setShowConfPay(false)
    load()
  }

  async function saveEdit() {
    if (!form.name?.trim() || !form.phone?.trim() || !form.monthly_fee) {
      toast('يرجى ملء الحقول المطلوبة', 'e'); return
    }
    if (!validatePhone(form.phone)) { toast('رقم الهاتف غير صحيح', 'e'); return }
    if (parseFloat(form.monthly_fee) <= 0) { toast('الرسم الشهري يجب أن يكون أكبر من صفر', 'e'); return }
    setSavingEdit(true)
    const { error } = await supabase.from('subscribers').update({
      name:             form.name.trim(),
      phone:            form.phone.trim(),
      start_date:       form.start_date,
      monthly_fee:      parseFloat(form.monthly_fee),
      last_paid_month:  form.last_paid_month || null,
      subscription_end: form.subscription_end || null,
      notes:            form.notes.trim()
    }).eq('id', id)
    if (error) { toast('خطأ في التعديل: ' + error.message, 'e'); setSavingEdit(false); return }
    toast('تم تعديل البيانات ✅', 's')
    setSavingEdit(false)
    setEditing(false)
    load()
  }

  async function deletePay(pay) {
    const yes = await confirm({ title: `حذف دفعة ${moLabel(pay.month)}؟`, danger: true })
    if (!yes) return
    const { error } = await supabase.from('payments').delete().eq('id', pay.id)
    if (error) { toast('خطأ: ' + error.message, 'e'); return }
    const remaining = pays.filter(p => p.id !== pay.id).map(p => p.month).sort()
    await supabase.from('subscribers')
      .update({ last_paid_month: remaining.length ? remaining[remaining.length - 1] : null }).eq('id', id)
    toast('تم حذف الدفعة ✅', 's')
    load()
  }

  async function deleteSub() {
    const yes = await confirm({ title: `حذف ${sub.name}؟`, body: 'سيتم أرشفة هذا المشترك.', danger: true })
    if (!yes) return
    const { error } = await supabase.from('subscribers').update({ is_active: false }).eq('id', id)
    if (error) { toast('خطأ في الحذف', 'e'); return }
    toast('تم حذف المشترك ✅', 's')
    navigate('/subscribers')
  }

  function sendWA() {
    const d     = calcDebt(sub, paidMap[sub.id] || [])
    const total = d.length * sub.monthly_fee
    const tmpl  = company?.whatsapp_template || 'عزيزي {name}، لديك {months} شهر متأخر بمبلغ {amount} د.ع. شكراً — {company}'
    const msg   = tmpl.replace(/{name}/g, sub.name).replace(/{months}/g, d.length)
      .replace(/{amount}/g, total.toLocaleString('ar-IQ')).replace(/{company}/g, company?.name || '')
    const phone = sub.phone?.replace(/^0/, '964').replace(/\D/g, '')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  if (loading) return (
    <div className="page">
      <div style={{ height: 120, background: 'var(--skeleton)', borderRadius: 16, marginBottom: 14, animation: 'shimmer 1.4s ease-in-out infinite' }} />
      <SkeletonList count={4} />
    </div>
  )
  if (!sub) return null

  const debt  = calcDebt(sub, paidMap[sub.id] || [])
  const color = avatarColor(sub.name)
  const totalPaid = pays.reduce((a, p) => a + Number(p.amount), 0)
  const totalDebt = debt.length * sub.monthly_fee

  return (
    <div className="page">
      <ConfirmDialog {...dlg} />
      <ReceiptModal data={receiptData} onClose={() => setReceiptData(null)} />

      {/* Back button */}
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--ink3)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, padding: 0, fontFamily: 'inherit' }}>
        → رجوع
      </button>

      {/* Header card */}
      <div className="card fadeUp" style={{ marginBottom: 14, overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(26,63,219,.12), rgba(97,68,245,.08))', padding: '20px 18px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: `${color}22`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, flexShrink: 0 }}>
              {sub.name[0]}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 19, fontWeight: 900, color: 'var(--ink)' }}>{sub.name}</div>
              <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 3 }}>📞 {sub.phone}</div>
            </div>
            <span className={`badge ${debt.length ? 'badge-warn' : 'badge-ok'}`} style={{ fontSize: 12, padding: '4px 12px' }}>
              {debt.length ? `⚠️ ${debt.length} شهر` : '✅ مدفوع'}
            </span>
          </div>
        </div>
        <div className="card-body" style={{ padding: '12px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            {[
              { label: 'الرسم الشهري', val: fmt(sub.monthly_fee), color: 'var(--blue)' },
              { label: 'إجمالي المدفوع', val: fmt(totalPaid), color: 'var(--green)' },
              { label: 'الدين المتراكم', val: fmt(totalDebt), color: debt.length ? 'var(--rose)' : 'var(--green)' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '10px 4px', background: 'var(--bg2)', borderRadius: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 700, marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: s.color }}>{s.val}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: debt.length ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8 }}>
            {!isViewer && debt.length > 0 && (
              <button onClick={openPay} style={{ padding: '10px 6px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#065f46,#059669)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                💵 دفعة
              </button>
            )}
            <button className="btn btn-whatsapp btn-sm" onClick={sendWA}>📱 واتساب</button>
            {!isViewer && (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>✏️ تعديل</button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, background: 'var(--bg2)', borderRadius: 12, padding: 4 }}>
        {[['overview', '📋 نظرة عامة'], ['payments', '💵 الدفعات'], ['debt', '⚠️ الديون']].map(([v, l]) => (
          <button key={v} onClick={() => setActiveTab(v)} style={{
            flex: 1, padding: '8px 4px', borderRadius: 9, border: 'none', fontFamily: 'inherit',
            background: activeTab === v ? 'var(--sur)' : 'transparent',
            color: activeTab === v ? 'var(--ink)' : 'var(--ink3)',
            fontWeight: activeTab === v ? 800 : 600, fontSize: 12, cursor: 'pointer',
            boxShadow: activeTab === v ? '0 2px 8px rgba(0,0,0,.1)' : 'none',
            transition: 'all .2s'
          }}>{l}</button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="card fadeUp">
          <div className="card-body">
            <div className="card-title" style={{ marginBottom: 12 }}>📋 بيانات المشترك</div>
            {[
              ['📅', 'تاريخ البداية', sub.start_date],
              ['💰', 'الرسم الشهري', fmt(sub.monthly_fee)],
              ['✅', 'آخر شهر مدفوع', moLabel(sub.last_paid_month)],
              ['📅', 'انتهاء الاشتراك', sub.subscription_end ? sub.subscription_end : '—'],
              ['📝', 'ملاحظات', sub.notes || '—'],
            ].map(([icon, label, val]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--bdr)' }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 700, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{val}</div>
                </div>
              </div>
            ))}
            {!isViewer && (
              <button onClick={deleteSub} style={{ width: '100%', marginTop: 16, padding: 12, borderRadius: 10, border: '1px solid rgba(225,29,72,.3)', background: 'rgba(225,29,72,.06)', color: '#e11d48', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                🗑 أرشفة المشترك
              </button>
            )}
          </div>
        </div>
      )}

      {/* Payments tab */}
      {activeTab === 'payments' && (
        <div>
          {pays.length === 0 ? (
            <div className="empty-state">
              <div className="empty-art">💳</div>
              <div className="empty-title">لا يوجد دفعات مسجلة</div>
            </div>
          ) : pays.map(p => (
            <div key={p.id} className="card" style={{ marginBottom: 9 }}>
              <div className="card-body" style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>{moLabel(p.month)}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>📅 {p.paid_at} • 👤 {p.recorded_by || '—'}</div>
                    {p.notes && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>📝 {p.notes}</div>}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 17, fontWeight: 900, background: 'var(--gT)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{fmt(p.amount)}</div>
                    {!isViewer && (
                      <button onClick={() => deletePay(p)} style={{ marginTop: 5, background: 'rgba(225,29,72,.08)', border: 'none', color: 'var(--rose)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>🗑</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Debt tab */}
      {activeTab === 'debt' && (
        <div>
          {debt.length === 0 ? (
            <div className="empty-state">
              <div className="empty-art">🎉</div>
              <div className="empty-title">لا يوجد ديون</div>
              <div className="empty-sub">هذا المشترك مدفوع بالكامل</div>
            </div>
          ) : (
            <div>
              <div style={{ background: 'rgba(225,29,72,.06)', border: '1px solid rgba(225,29,72,.2)', borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#e11d48', marginBottom: 4 }}>
                  ⚠️ {debt.length} شهر غير مدفوع — {fmt(totalDebt)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                  من {moLabel(debt[debt.length - 1])} إلى {moLabel(debt[0])}
                </div>
              </div>
              {debt.map(mo => (
                <div key={mo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', background: 'var(--sur)', border: '1px solid var(--bdr)', borderRadius: 12, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{moLabel(mo)}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>غير مدفوع</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--rose)' }}>{fmt(sub.monthly_fee)}</div>
                    {!isViewer && (
                      <button onClick={() => { setPayForm({ month: mo, amount: String(sub.monthly_fee), paid_at: getToday(), notes: '' }); setShowPay(true); setShowConfPay(false) }}
                        style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#065f46,#059669)', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                        دفع
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Pay Modal ── */}
      {showPay && !showConfPay && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(4,8,22,.72)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={e => e.target === e.currentTarget && setShowPay(false)}>
          <div style={{ width: '100%', maxWidth: 540, background: 'var(--sur)', borderRadius: '26px 26px 0 0', padding: '10px 20px 36px', borderTop: '1px solid var(--bdr)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ width: 38, height: 4, background: 'var(--bdr)', borderRadius: 4, margin: '8px auto 18px' }} />
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              💵 تسجيل دفعة — {sub.name}
              <button onClick={() => setShowPay(false)} style={{ marginRight: 'auto', width: 32, height: 32, borderRadius: '50%', background: 'var(--bg2)', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 15 }}>✕</button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>الشهر المدفوع *</label>
              <select className="field-input" value={payForm.month}
                onChange={e => setPayForm({ ...payForm, month: e.target.value })}>
                {debt.length > 0 ? debt.map(mo => (
                  <option key={mo} value={mo}>{moLabel(mo)}</option>
                )) : [getCurMo()].map(mo => <option key={mo} value={mo}>{moLabel(mo)}</option>)}
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
            <button onClick={() => setShowConfPay(true)} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#065f46,#059669)', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', marginBottom: 10, fontFamily: 'inherit' }}>
              التالي →
            </button>
            <button onClick={() => setShowPay(false)} style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid var(--bdr)', background: 'transparent', color: 'var(--ink3)', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ── Confirm Pay ── */}
      {showConfPay && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 510, background: 'rgba(4,8,22,.82)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowConfPay(false)}>
          <div style={{ background: 'var(--sur)', borderRadius: 20, padding: 28, maxWidth: 420, width: '100%', border: '1px solid rgba(5,150,105,.3)' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 44 }}>💵</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink)', marginTop: 8 }}>تأكيد الدفعة</div>
            </div>
            {[['المشترك', sub.name], ['الشهر', moLabel(payForm.month)], ['المبلغ', fmt(payForm.amount)], ['التاريخ', payForm.paid_at]].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--bdr)' }}>
                <span style={{ fontSize: 13, color: 'var(--ink3)' }}>{l}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{v}</span>
              </div>
            ))}
            <button onClick={savePay} disabled={saving} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#065f46,#059669)', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', marginTop: 18, marginBottom: 10, fontFamily: 'inherit' }}>
              {saving ? '⏳ جاري التثبيت...' : '✅ تثبيت الدفعة'}
            </button>
            <button onClick={() => setShowConfPay(false)} style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid var(--bdr)', background: 'transparent', color: 'var(--ink3)', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>← تعديل</button>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(4,8,22,.72)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={e => e.target === e.currentTarget && setEditing(false)}>
          <div style={{ width: '100%', maxWidth: 560, background: 'var(--sur)', borderRadius: '26px 26px 0 0', padding: '10px 20px 36px', borderTop: '1px solid var(--bdr)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ width: 38, height: 4, background: 'var(--bdr)', borderRadius: 4, margin: '8px auto 18px' }} />
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              ✏️ تعديل بيانات {sub.name}
              <button onClick={() => setEditing(false)} style={{ marginRight: 'auto', width: 32, height: 32, borderRadius: '50%', background: 'var(--bg2)', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 15 }}>✕</button>
            </div>
            {[
              { label: 'الاسم الكامل *', key: 'name', type: 'text', icon: '👤' },
              { label: 'رقم الهاتف *', key: 'phone', type: 'tel', icon: '📞' },
              { label: 'تاريخ البداية *', key: 'start_date', type: 'date', icon: '📅' },
              { label: 'الرسم الشهري (د.ع) *', key: 'monthly_fee', type: 'number', icon: '💰' },
              { label: 'آخر شهر مدفوع', key: 'last_paid_month', type: 'month', icon: '📅' },
              { label: 'تاريخ انتهاء الاشتراك', key: 'subscription_end', type: 'date', icon: '🗓️' },
            ].map(f => (
              <div className="field" key={f.key}>
                <label className="field-label">{f.label}</label>
                <div className="field-wrap">
                  <span className="field-icon">{f.icon}</span>
                  <input className="field-input" type={f.type} value={form[f.key] || ''}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                </div>
              </div>
            ))}
            <div className="field">
              <label className="field-label">ملاحظات</label>
              <textarea className="field-input" rows={3} value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <button className="btn btn-primary" onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? '⏳ جاري الحفظ...' : '💾 حفظ التعديلات'}
            </button>
            <button className="btn btn-ghost" style={{ marginTop: 9 }} onClick={() => setEditing(false)}>إلغاء</button>
          </div>
        </div>
      )}
    </div>
  )
}
