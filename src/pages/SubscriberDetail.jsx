import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
  const [y, m] = ym.split('-')
  return `${MO[parseInt(m)-1]} ${y}`
}

const today = new Date().toISOString().split('T')[0]
const curMo = today.slice(0, 7)


const MO_NAMES = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران',
            'تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول']

function printReceipt({ sub, month, amount, company, paidAt, recordedBy, mode }) {
  function fmtR(n) { return Number(n||0).toLocaleString('ar-IQ') + ' د.ع' }
  function moLabelR(ym) {
    if (!ym) return '—'
    const [y, m] = ym.split('-')
    return `${MO_NAMES[parseInt(m)-1]} ${y}`
  }
  if (mode === 'thermal') {
    const win = window.open('','_blank','width=380,height=600')
    win.document.write(`<html dir="rtl"><head><meta charset="utf-8">
      <style>*{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Courier New',monospace;font-size:13px;width:72mm;margin:8px auto;padding:8px;background:#fff;color:#000}
      .c{text-align:center}.b{font-weight:bold}.big{font-size:16px}
      .sep{border-top:1px dashed #000;margin:6px 0}
      .row{display:flex;justify-content:space-between;margin:3px 0}
      @media print{body{width:72mm}button{display:none}}</style></head><body>
      <div class="c b big">${company?.name||'نيت برو'}</div>
      <div class="sep"></div><div class="c">وصل دفع اشتراك</div><div class="sep"></div>
      <div class="row"><span>الاسم:</span><span>${sub.name}</span></div>
      <div class="row"><span>الشهر:</span><span>${moLabelR(month)}</span></div>
      <div class="row"><span>المبلغ:</span><span class="b">${fmtR(amount)}</span></div>
      <div class="row"><span>التاريخ:</span><span>${paidAt}</span></div>
      <div class="row"><span>بواسطة:</span><span>${recordedBy}</span></div>
      <div class="sep"></div><div class="c">شكراً لاشتراككم 🙏</div><br/>
      <button onclick="window.print()" style="width:100%;padding:8px;font-size:14px;cursor:pointer">🖨️ طباعة</button>
    </body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 400)
  } else if (mode === 'normal' || mode === 'pdf') {
    const win = window.open('','_blank','width=600,height=700')
    win.document.write(`<html dir="rtl"><head><meta charset="utf-8">
      <style>*{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Tajawal',sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh}
      .r{background:#fff;border-radius:16px;padding:36px;max-width:450px;width:100%;box-shadow:0 4px 30px rgba(0,0,0,.12)}
      .logo{text-align:center;font-size:36px;margin-bottom:4px}
      .co{text-align:center;font-size:20px;font-weight:900;color:#1a1a2e}
      .ti{text-align:center;font-size:13px;color:#6b7280;margin-bottom:20px}
      .sep{border:none;border-top:2px dashed #e5e7eb;margin:14px 0}
      .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6}
      .lbl{font-size:13px;color:#6b7280}.val{font-size:14px;font-weight:700;color:#111827}
      .amt{font-size:22px;font-weight:900;color:#059669}
      .ft{text-align:center;font-size:12px;color:#9ca3af;margin-top:16px}
      @media print{body{background:#fff}.np{display:none}@page{margin:1cm}}</style></head><body>
      <div class="r"><div class="logo">📡</div>
      <div class="co">${company?.name||'نيت برو'}</div>
      <div class="ti">وصل دفع اشتراك إنترنت</div><hr class="sep"/>
      <div class="row"><span class="lbl">اسم المشترك</span><span class="val">${sub.name}</span></div>
      <div class="row"><span class="lbl">الشهر المدفوع</span><span class="val">${moLabelR(month)}</span></div>
      <div class="row"><span class="lbl">المبلغ المدفوع</span><span class="amt">${fmtR(amount)}</span></div>
      <div class="row"><span class="lbl">تاريخ الدفع</span><span class="val">${paidAt}</span></div>
      <div class="row"><span class="lbl">بواسطة</span><span class="val">${recordedBy}</span></div>
      <hr class="sep"/><div class="ft">شكراً لثقتكم 🙏 — ${company?.name||''}</div><br/>
      <button class="np" onclick="window.print()" style="width:100%;padding:12px;font-size:15px;border-radius:10px;border:none;background:#1a3fdb;color:#fff;cursor:pointer;font-family:Tajawal,sans-serif;font-weight:700">
        ${mode==='pdf'?'📄 حفظ كـ PDF':'🖨️ طباعة'}</button></div>
    </body></html>`)
    win.document.close()
    if (mode==='pdf') setTimeout(() => win.print(), 500)
  } else if (mode === 'image') {
    const canvas = document.createElement('canvas')
    canvas.width=500; canvas.height=500
    const ctx = canvas.getContext('2d')
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,500,500)
    const g = ctx.createLinearGradient(0,0,500,90)
    g.addColorStop(0,'#1a3fdb'); g.addColorStop(1,'#6144f5')
    ctx.fillStyle=g; ctx.fillRect(0,0,500,90)
    ctx.fillStyle='#fff'; ctx.font='bold 20px Arial'
    ctx.textAlign='center'; ctx.fillText((company?.name||'نيت برو'), 250, 38)
    ctx.font='13px Arial'; ctx.fillStyle='rgba(255,255,255,.8)'
    ctx.fillText('وصل دفع اشتراك', 250, 62)
    const rows2=[['الاسم',sub.name],['الشهر',moLabelR(month)],['المبلغ',fmtR(amount)],['التاريخ',paidAt],['بواسطة',recordedBy]]
    rows2.forEach(([l,v],i)=>{
      const y=120+i*60
      ctx.fillStyle=i%2===0?'#f9fafb':'#fff'; ctx.fillRect(20,y-18,460,52)
      ctx.fillStyle='#6b7280'; ctx.font='13px Arial'; ctx.textAlign='right'
      ctx.fillText(l,470,y+10)
      ctx.fillStyle='#111827'; ctx.font='bold 14px Arial'; ctx.textAlign='left'
      ctx.fillText(v,30,y+10)
    })
    ctx.fillStyle='#9ca3af'; ctx.font='12px Arial'; ctx.textAlign='center'
    ctx.fillText('شكراً لثقتكم 🙏',250,465)
    const a=document.createElement('a')
    a.download=`receipt-${sub.name}-${month}.png`
    a.href=canvas.toDataURL('image/png'); a.click()
  }
}

export default function SubscriberDetail() {
  const { id }      = useParams()
  const navigate    = useNavigate()
  const { company, user, isViewer } = useAuth()

  const [sub, setSub]           = useState(null)
  const [pays, setPays]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [showPay, setShowPay]     = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [receiptData, setReceiptData] = useState(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [form, setForm]         = useState({})
  const [payForm, setPayForm]   = useState({
    month: curMo, amount: '', paid_at: today, notes: ''
  })

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from('subscribers').select('*').eq('id', id).single(),
      supabase.from('payments').select('*')
        .eq('subscriber_id', id)
        .order('created_at', { ascending: false })
    ])
    setSub(s)
    setPays(p || [])
    setLoading(false)
  }

  async function saveEdit() {
    if (!form.name || !form.phone || !form.monthly_fee) {
      toast('يرجى ملء الحقول المطلوبة', 'e')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('subscribers').update({
      name:            form.name,
      phone:           form.phone,
      start_date:      form.start_date,
      monthly_fee:     parseFloat(form.monthly_fee),
      last_paid_month:   form.last_paid_month,
      subscription_end:  form.subscription_end || null,
      notes:             form.notes
    }).eq('id', id)
    setSaving(false)
    if (error) { toast('خطأ في التعديل', 'e'); return }
    toast('تم التعديل ✅', 's')
    setShowEdit(false)
    load()
  }

  async function savePay() {
    if (!payForm.month || !payForm.amount) {
      toast('يرجى ملء جميع الحقول', 'e')
      return
    }
    // ✅ Duplicate check: prevent same month being paid twice
    const alreadyPaid = pays.some(p => p.month === payForm.month)
    if (alreadyPaid) {
      toast(`شهر ${moLabel(payForm.month)} مسجل مسبقاً لهذا المشترك ⚠️`, 'e')
      return
    }
    setSaving(true)
    const recorderName = user?.email || user?.user_metadata?.name || 'admin'
    const { error } = await supabase.from('payments').insert({
      company_id:      company.id,
      subscriber_id:   id,
      subscriber_name: sub.name,
      month:           payForm.month,
      amount:          parseFloat(payForm.amount),
      paid_at:         payForm.paid_at,
      notes:           payForm.notes,
      recorded_by:     recorderName
    })
    if (error) {
      toast('خطأ في تسجيل الدفعة', 'e')
      setSaving(false)
      return
    }
    const allPaid = [...pays.map(p => p.month), payForm.month].sort()
    const lastMo  = allPaid[allPaid.length - 1]
    await supabase.from('subscribers')
      .update({ last_paid_month: lastMo }).eq('id', id)
    toast(`تم تسجيل دفعة ${moLabel(payForm.month)} ✅`, 's')
    setSaving(false)
    // Store receipt data
    setReceiptData({
      sub, month: payForm.month, amount: parseFloat(payForm.amount),
      paidAt: payForm.paid_at, recordedBy: recorderName, company
    })
    setShowPay(false)
    setShowConfirm(false)
    setShowReceipt(true)
    load()
  }

  async function deleteSub() {
    if (!confirm('هل أنت متأكد من حذف هذا المشترك؟')) return
    await supabase.from('subscribers')
      .update({ is_active: false }).eq('id', id)
    toast('تم حذف المشترك', 's')
    navigate('/subscribers')
  }

  async function deletePayment(payId, payMonth) {
    if (!confirm(`هل أنت متأكد من حذف دفعة ${moLabel(payMonth)}؟`)) return
    const { error } = await supabase.from('payments').delete().eq('id', payId)
    if (error) { toast('خطأ في الحذف: ' + error.message, 'e'); return }
    // Recalculate last_paid_month
    const remaining = pays.filter(p => p.id !== payId)
    const sorted = remaining.map(p => p.month).sort()
    const newLast = sorted.length ? sorted[sorted.length - 1] : null
    await supabase.from('subscribers')
      .update({ last_paid_month: newLast }).eq('id', id)
    toast(`تم حذف دفعة ${moLabel(payMonth)} ✅`, 's')
    load()
  }

  function sendWA() {
    if (!sub || !company) return
    const d     = calcDebt(sub, pays.map(p => p.month))
    const total = d.length * sub.monthly_fee
    const tmpl  = company.whatsapp_template ||
      'عزيزي {name}، لديك {months} شهر متأخر بمبلغ {amount} د.ع. شكراً — {company}'
    const msg = tmpl
      .replace(/{name}/g,    sub.name)
      .replace(/{months}/g,  d.length)
      .replace(/{amount}/g,  total.toLocaleString('ar-IQ'))
      .replace(/{company}/g, company.name || 'المنصة')
    const phone = sub.phone.replace(/^0/, '964')
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,
      '_blank'
    )
  }

  if (loading) return (
    <div style={{
      display:'flex', alignItems:'center',
      justifyContent:'center',
      minHeight:'60vh', fontSize:24
    }}>⏳</div>
  )

  if (!sub) return (
    <div style={{ textAlign:'center', padding:40 }}>
      <div style={{ fontSize:48, marginBottom:12 }}>😕</div>
      <p style={{ color:'var(--ink3)' }}>لم يتم العثور على المشترك</p>
      <button className="btn btn-primary"
        style={{ marginTop:16, width:'auto', padding:'10px 20px' }}
        onClick={() => navigate('/subscribers')}>
        ← رجوع
      </button>
    </div>
  )

  const paidMonthsSet = pays.map(p => p.month)
  const debt  = calcDebt(sub, paidMonthsSet)
  const total = debt.length * sub.monthly_fee

  return (
    <div>

      {/* ══════════ HEADER ══════════ */}
      <div style={{
        background:'var(--sur)',
        borderBottom:'1px solid var(--bdr)',
        padding:'0 15px', height:62,
        display:'flex', alignItems:'center', gap:13,
        position:'sticky', top:0, zIndex:100,
        backdropFilter:'blur(20px)'
      }}>
        <button
          onClick={() => navigate('/subscribers')}
          style={{
            width:38, height:38, borderRadius:11,
            background:'var(--bg2)',
            border:'1px solid var(--bdr)',
            display:'flex', alignItems:'center',
            justifyContent:'center',
            fontSize:18, cursor:'pointer',
            color:'var(--ink2)', transition:'.18s'
          }}>←</button>
        <div>
          <div style={{
            fontSize:16, fontWeight:800, color:'var(--ink)'
          }}>{sub.name}</div>
          <div style={{
            fontSize:12, color:'var(--ink3)'
          }}>{sub.phone}</div>
        </div>
        <div style={{ flex:1 }} />
        <button
          onClick={() => {
            setForm({
              name:             sub.name,
              phone:            sub.phone,
              start_date:       sub.start_date,
              monthly_fee:      sub.monthly_fee,
              last_paid_month:  sub.last_paid_month || '',
              subscription_end: sub.subscription_end || '',
              notes:            sub.notes || ''
            })
            setShowEdit(true)
          }}
          style={{
            width:38, height:38, borderRadius:10,
            border:'1px solid var(--bdr)',
            background:'var(--sur)',
            display:'flex', alignItems:'center',
            justifyContent:'center',
            fontSize:17, cursor:'pointer',
            color:'var(--ink2)'
          }}>✏️</button>
        <button
          onClick={deleteSub}
          style={{
            width:38, height:38, borderRadius:10,
            border:'1px solid var(--bdr)',
            background:'var(--sur)',
            display:'flex', alignItems:'center',
            justifyContent:'center',
            fontSize:17, cursor:'pointer',
            color:'var(--rose)'
          }}>🗑</button>
      </div>

      {/* ══════════ CONTENT ══════════ */}
      <div style={{
        padding:'18px 16px 120px',
        maxWidth:660, margin:'0 auto'
      }}>

        {/* Hero Card */}
        <div style={{
          background: debt.length
            ? 'linear-gradient(135deg,#1a3fdb,#7c3aed,#c2185b)'
            : 'linear-gradient(135deg,#059669,#0d9488)',
          borderRadius:20, padding:'22px 20px',
          marginBottom:14, position:'relative',
          overflow:'hidden',
          boxShadow:'0 0 40px rgba(26,63,219,.18),0 8px 32px rgba(26,63,219,.1)'
        }}>
          <div style={{
            position:'absolute', top:-50, left:-50,
            width:220, height:220, borderRadius:'50%',
            background:'rgba(255,255,255,.06)'
          }}/>
          <div style={{ position:'relative', zIndex:1 }}>
            <div style={{
              display:'flex', alignItems:'center',
              gap:14, marginBottom:14
            }}>
              <div style={{
                width:56, height:56, borderRadius:17,
                display:'flex', alignItems:'center',
                justifyContent:'center',
                fontSize:24, fontWeight:900,
                background:'rgba(255,255,255,.2)',
                color:'#fff',
                border:'2px solid rgba(255,255,255,.3)',
                flexShrink:0
              }}>{sub.name[0]}</div>
              <div>
                <div style={{
                  fontSize:17, fontWeight:900, color:'#fff'
                }}>{sub.name}</div>
                <div style={{
                  fontSize:12, color:'rgba(255,255,255,.75)'
                }}>{sub.phone}</div>
              </div>
              <div style={{ marginRight:'auto' }}>
                {debt.length ? (
                  <span style={{
                    background:'rgba(255,255,255,.2)',
                    border:'1px solid rgba(225,29,72,.5)',
                    borderRadius:20, padding:'3px 10px',
                    fontSize:11, fontWeight:800, color:'#fca5a5'
                  }}>⚠️ {debt.length} شهر</span>
                ) : (
                  <span style={{
                    background:'rgba(255,255,255,.2)',
                    borderRadius:20, padding:'3px 10px',
                    fontSize:11, fontWeight:800, color:'#fff'
                  }}>✅ مدفوع</span>
                )}
              </div>
            </div>
            <div style={{
              display:'grid',
              gridTemplateColumns:'1fr 1fr 1fr', gap:9
            }}>
              {[
                ['الرسم الشهري',  fmt(sub.monthly_fee)],
                ['آخر دفع',       moLabel(sub.last_paid_month)],
                ['الديون',        debt.length
                  ? `${debt.length} شهر` : 'لا ديون ✅'],
              ].map(([l, v]) => (
                <div key={l} style={{
                  background:'rgba(255,255,255,.13)',
                  borderRadius:11, padding:11,
                  border:'1px solid rgba(255,255,255,.18)'
                }}>
                  <div style={{
                    fontSize:10,
                    color:'rgba(255,255,255,.65)',
                    fontWeight:700, marginBottom:2
                  }}>{l}</div>
                  <div style={{
                    fontSize:13, fontWeight:900, color:'#fff'
                  }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Subscription Info */}
        <div className="card" style={{ marginBottom:13 }}>
          <div className="card-body">
            <div className="card-title">📋 بيانات الاشتراك</div>
            <div className="info-grid">
              {[
                ['📅 تاريخ البداية', sub.start_date],
                ['💰 الرسم الشهري',  fmt(sub.monthly_fee)],
                ['✅ آخر دفع',       moLabel(sub.last_paid_month)],
                ['📝 ملاحظات',       sub.notes || '—'],
                ['🗓️ انتهاء الاشتراك', sub.subscription_end
                  ? new Date(sub.subscription_end).toLocaleDateString('ar-IQ')
                  : '—'],
              ].map(([l, v]) => (
                <div key={l} className="info-cell">
                  <div className="info-label">{l}</div>
                  <div className="info-value">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Debt Section */}
        {debt.length > 0 ? (
          <div className="card" style={{
            marginBottom:13,
            border:'1.5px solid rgba(225,29,72,.25)'
          }}>
            <div className="card-body">
              <div style={{
                display:'flex', justifyContent:'space-between',
                alignItems:'center', marginBottom:13
              }}>
                <div className="card-title"
                  style={{ margin:0, color:'var(--rose)' }}>
                  ⚠️ الديون المستحقة
                </div>
                <span className="badge badge-err">
                  {debt.length} شهر
                </span>
              </div>
              <div style={{
                borderRadius:8, overflow:'hidden',
                border:'1px solid var(--bdr)'
              }}>
                <div style={{
                  display:'grid',
                  gridTemplateColumns:'1fr 1fr',
                  background:'var(--bg2)', padding:'9px 15px'
                }}>
                  <span style={{
                    fontSize:11, fontWeight:700,
                    color:'var(--ink3)', letterSpacing:'.04em'
                  }}>الشهر</span>
                  <span style={{
                    fontSize:11, fontWeight:700,
                    color:'var(--ink3)', textAlign:'left'
                  }}>المبلغ</span>
                </div>
                {debt.map((mo, i) => (
                  <div key={mo} style={{
                    display:'grid',
                    gridTemplateColumns:'1fr 1fr',
                    padding:'10px 15px',
                    borderTop:'1px solid var(--bdr)',
                    background: i % 2 === 1 ? 'var(--bg2)' : 'transparent'
                  }}>
                    <span style={{ fontSize:13 }}>{moLabel(mo)}</span>
                    <span style={{
                      fontSize:13, fontWeight:700, textAlign:'left'
                    }}>{fmt(sub.monthly_fee)}</span>
                  </div>
                ))}
                <div style={{
                  display:'grid',
                  gridTemplateColumns:'1fr 1fr',
                  padding:'10px 15px',
                  borderTop:'2px solid rgba(225,29,72,.25)',
                  background:'rgba(225,29,72,.05)'
                }}>
                  <span style={{
                    fontWeight:900, color:'var(--rose)', fontSize:14
                  }}>الإجمالي</span>
                  <span style={{
                    fontWeight:900, color:'var(--rose)',
                    fontSize:14, textAlign:'left'
                  }}>{fmt(total)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            background:'linear-gradient(135deg,rgba(5,150,105,.08),rgba(16,185,129,.04))',
            border:'1.5px solid rgba(5,150,105,.2)',
            borderRadius:20, padding:20,
            textAlign:'center', marginBottom:13
          }}>
            <div style={{ fontSize:36, marginBottom:7 }}>🎉</div>
            <div style={{
              fontWeight:800, fontSize:15, color:'var(--green)'
            }}>جميع الأشهر مدفوعة</div>
            <div style={{
              fontSize:13, color:'var(--ink3)', marginTop:4
            }}>لا توجد ديون مستحقة</div>
          </div>
        )}

        {/* Payment History */}
        <div className="card" style={{ marginBottom:13 }}>
          <div className="card-body">
            <div className="card-title">📜 سجل الدفعات</div>
            {pays.length === 0 ? (
              <div style={{
                textAlign:'center', padding:18,
                color:'var(--ink3)', fontSize:13
              }}>لا يوجد سجل دفعات بعد</div>
            ) : pays.map((p, i) => (
              <div key={p.id} style={{
                display:'flex', justifyContent:'space-between',
                alignItems:'center', padding:'10px 0',
                borderBottom: i < pays.length - 1
                  ? '1px solid var(--bdr)' : 'none'
              }}>
                <div>
                  <div style={{
                    fontWeight:700, fontSize:13
                  }}>{moLabel(p.month)}</div>
                  <div style={{
                    fontSize:11, color:'var(--ink3)', marginTop:2
                  }}>{p.paid_at}</div>
                  {p.notes && (
                    <div style={{
                      fontSize:11, color:'var(--ink3)', marginTop:1
                    }}>📝 {p.notes}</div>
                  )}
                </div>
                <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                  <div style={{
                    fontWeight:900, fontSize:15,
                    background:'var(--gT)',
                    WebkitBackgroundClip:'text',
                    WebkitTextFillColor:'transparent'
                  }}>{fmt(p.amount)}</div>
                  {!isViewer && (
                    <button onClick={() => deletePayment(p.id, p.month)}
                      style={{background:'rgba(225,29,72,.08)',border:'none',
                        color:'var(--rose)',borderRadius:6,padding:'2px 8px',
                        fontSize:11,fontWeight:700,cursor:'pointer'}}>
                      🗑
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* WhatsApp quick button */}
        <button
          className="btn btn-whatsapp"
          onClick={sendWA}
          style={{ marginBottom:8 }}>
          📱 مراسلة عبر واتساب
        </button>

      </div>

      {/* ══════════ ACTION BAR ══════════ */}
      <div style={{
        position:'fixed', bottom:0, right:0, left:0,
        background:'rgba(255,255,255,.95)',
        backdropFilter:'blur(20px)',
        borderTop:'1px solid var(--bdr)',
        padding:'12px 15px',
        display:'flex', gap:9, zIndex:150,
        paddingBottom:'calc(12px + env(safe-area-inset-bottom))'
      }}>
        <button
          className="btn btn-primary"
          style={{ flex:2, display: isViewer ? 'none' : 'flex',
            alignItems:'center', justifyContent:'center', gap:6 }}
          onClick={() => {
            setPayForm({
              month:   debt.length > 0 ? debt[0] : curMo,
              amount:  sub.monthly_fee,
              paid_at: today,
              notes:   ''
            })
            setShowPay(true)
          }}>
          ✅ تسجيل دفعة جديدة
        </button>
        <button
          className="btn btn-whatsapp"
          style={{ flex:0, padding:'14px 18px', width:'auto' }}
          onClick={sendWA}>
          📱
        </button>
      </div>

      {/* ══════════ EDIT MODAL ══════════ */}
      {showEdit && (
        <div
          style={{
            position:'fixed', inset:0, zIndex:500,
            background:'rgba(4,8,22,.68)',
            backdropFilter:'blur(8px)',
            display:'flex', alignItems:'flex-end',
            justifyContent:'center'
          }}
          onClick={e => {
            if (e.target === e.currentTarget) setShowEdit(false)
          }}>
          <div style={{
            width:'100%', maxWidth:560,
            maxHeight:'92vh', overflowY:'auto',
            background:'var(--sur)',
            borderRadius:'26px 26px 0 0',
            padding:'10px 20px 32px',
            borderTop:'1px solid var(--bdr)'
          }}>
            <div style={{
              width:38, height:4, background:'var(--bdr)',
              borderRadius:4, margin:'8px auto 18px'
            }}/>
            <div style={{
              fontSize:17, fontWeight:800, color:'var(--ink)',
              marginBottom:20, display:'flex',
              alignItems:'center', gap:10
            }}>
              ✏️ <span>تعديل بيانات المشترك</span>
              <button
                onClick={() => setShowEdit(false)}
                style={{
                  marginRight:'auto', width:32, height:32,
                  borderRadius:'50%', background:'var(--bg2)',
                  border:'none', cursor:'pointer',
                  color:'var(--ink3)', fontSize:15
                }}>✕</button>
            </div>

            {[
              { label:'الاسم الكامل *',         key:'name',
                type:'text',  ph:'',     icon:'👤' },
              { label:'رقم الهاتف *',           key:'phone',
                type:'tel',   ph:'07XXXXXXXXX', icon:'📞' },
              { label:'تاريخ بداية الاشتراك',   key:'start_date',
                type:'date',  ph:'',     icon:'📅' },
              { label:'الرسم الشهري (د.ع) *',   key:'monthly_fee',
                type:'number',ph:'',     icon:'💰' },
              { label:'آخر شهر مدفوع',          key:'last_paid_month',
                type:'month', ph:'',     icon:'📅' },
              { label:'تاريخ انتهاء الاشتراك',   key:'subscription_end',
                type:'date',  ph:'',     icon:'🗓️' },
            ].map(f => (
              <div className="field" key={f.key}>
                <label className="field-label">{f.label}</label>
                <div className="field-wrap">
                  <span className="field-icon">{f.icon}</span>
                  <input
                    className="field-input"
                    type={f.type}
                    placeholder={f.ph}
                    value={form[f.key] || ''}
                    onChange={e => setForm({
                      ...form, [f.key]: e.target.value
                    })}/>
                </div>
              </div>
            ))}

            <div className="field">
              <label className="field-label">ملاحظات</label>
              <textarea
                className="field-input" rows={3}
                value={form.notes || ''}
                onChange={e => setForm({
                  ...form, notes: e.target.value
                })}/>
            </div>

            <button
              className="btn btn-primary"
              onClick={saveEdit}
              disabled={saving}>
              {saving ? '⏳ جاري الحفظ...' : '💾 حفظ التعديلات'}
            </button>
            <button
              className="btn btn-ghost"
              style={{ marginTop:9 }}
              onClick={() => setShowEdit(false)}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* ══════════ PAYMENT MODAL ══════════ */}
      {showPay && (
        <div
          style={{
            position:'fixed', inset:0, zIndex:500,
            background:'rgba(4,8,22,.68)',
            backdropFilter:'blur(8px)',
            display:'flex', alignItems:'flex-end',
            justifyContent:'center'
          }}
          onClick={e => {
            if (e.target === e.currentTarget) setShowPay(false)
          }}>
          <div style={{
            width:'100%', maxWidth:560,
            maxHeight:'92vh', overflowY:'auto',
            background:'var(--sur)',
            borderRadius:'26px 26px 0 0',
            padding:'10px 20px 32px',
            borderTop:'1px solid var(--bdr)'
          }}>
            <div style={{
              width:38, height:4, background:'var(--bdr)',
              borderRadius:4, margin:'8px auto 18px'
            }}/>
            <div style={{
              fontSize:17, fontWeight:800, color:'var(--ink)',
              marginBottom:20, display:'flex',
              alignItems:'center', gap:10
            }}>
              ✅ <span>تسجيل دفعة جديدة</span>
              <button
                onClick={() => setShowPay(false)}
                style={{
                  marginRight:'auto', width:32, height:32,
                  borderRadius:'50%', background:'var(--bg2)',
                  border:'none', cursor:'pointer',
                  color:'var(--ink3)', fontSize:15
                }}>✕</button>
            </div>

            {/* Subscriber info */}
            <div style={{
              background:'var(--bg2)',
              border:'1px solid var(--bdr)',
              borderRadius:14, padding:13, marginBottom:16
            }}>
              <div style={{
                fontWeight:800, fontSize:14, color:'var(--ink)'
              }}>{sub.name}</div>
              <div style={{
                fontSize:12, color:'var(--ink3)', marginTop:3
              }}>
                📞 {sub.phone} • الرسم: {fmt(sub.monthly_fee)}
              </div>
              <div style={{ marginTop:8 }}>
                {debt.length > 0 ? (
                  <span className="badge badge-err">
                    ⚠️ {debt.length} شهر متأخر —
                    إجمالي {fmt(total)}
                  </span>
                ) : (
                  <span className="badge badge-ok">
                    ✅ لا ديون
                  </span>
                )}
              </div>
            </div>

            {/* Month */}
            <div className="field">
              <label className="field-label">الشهر المدفوع</label>
              <select
                className="field-input"
                value={payForm.month}
                onChange={e => setPayForm({
                  ...payForm, month: e.target.value
                })}>
                {(debt.length > 0 ? debt : [curMo]).map(mo => (
                  <option key={mo} value={mo}>
                    {moLabel(mo)}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div className="field">
              <label className="field-label">المبلغ (د.ع) *</label>
              <div className="field-wrap">
                <span className="field-icon">💰</span>
                <input
                  className="field-input"
                  type="number"
                  value={payForm.amount}
                  onChange={e => setPayForm({
                    ...payForm, amount: e.target.value
                  })}/>
              </div>
            </div>

            {/* Date */}
            <div className="field">
              <label className="field-label">تاريخ الاستلام</label>
              <div className="field-wrap">
                <span className="field-icon">📅</span>
                <input
                  className="field-input"
                  type="date"
                  value={payForm.paid_at}
                  onChange={e => setPayForm({
                    ...payForm, paid_at: e.target.value
                  })}/>
              </div>
            </div>

            {/* Notes */}
            <div className="field">
              <label className="field-label">ملاحظات</label>
              <textarea
                className="field-input" rows={2}
                placeholder="ملاحظات اختيارية..."
                value={payForm.notes}
                onChange={e => setPayForm({
                  ...payForm, notes: e.target.value
                })}/>
            </div>

            <button
              className="btn btn-primary"
              onClick={() => setShowConfirm(true)}
              disabled={saving}>
              التالي: مراجعة وتأكيد →
            </button>
            <button
              className="btn btn-ghost"
              style={{ marginTop:9 }}
              onClick={() => setShowPay(false)}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* ════ Confirm Modal ════ */}
      {showConfirm && payForm.month && (
        <div style={{position:'fixed',inset:0,zIndex:600,
          background:'rgba(4,8,22,.82)',backdropFilter:'blur(14px)',
          display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
          onClick={e=>{if(e.target===e.currentTarget){setShowConfirm(false)}}}>
          <div style={{background:'var(--sur)',borderRadius:20,padding:28,
            maxWidth:420,width:'100%',border:'1px solid rgba(5,150,105,.3)'}}>
            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{fontSize:44}}>💵</div>
              <div style={{fontSize:18,fontWeight:900,color:'var(--ink)',marginTop:8}}>
                تأكيد تثبيت الدفعة
              </div>
            </div>
            {[
              ['المشترك', sub.name],
              ['الشهر',   moLabel(payForm.month)],
              ['المبلغ',  fmt(payForm.amount)],
              ['التاريخ', payForm.paid_at],
            ].map(([l,v]) => (
              <div key={l} style={{display:'flex',justifyContent:'space-between',
                padding:'9px 0',borderBottom:'1px solid var(--bdr)'}}>
                <span style={{fontSize:13,color:'var(--ink3)'}}>{l}</span>
                <span style={{fontSize:14,fontWeight:800,color:'var(--ink)'}}>{v}</span>
              </div>
            ))}
            <div style={{background:'rgba(5,150,105,.08)',border:'1px solid rgba(5,150,105,.2)',
              borderRadius:10,padding:'10px 14px',margin:'16px 0',fontSize:13,color:'#065f46',lineHeight:1.7}}>
              ✅ سيتم تثبيت الدفعة في:<br/>
              • سجل دفعات المشترك<br/>
              • صفحة سجل الدفعات العام<br/>
              • إحصائيات الشركة الشهرية
            </div>
            <button onClick={savePay} disabled={saving}
              style={{width:'100%',padding:14,borderRadius:12,border:'none',
                background:'linear-gradient(135deg,#065f46,#059669)',
                color:'#fff',fontWeight:800,fontSize:16,cursor:'pointer',marginBottom:10}}>
              {saving ? '⏳ جاري التثبيت...' : '✅ تثبيت الدفعة'}
            </button>
            <button onClick={() => setShowConfirm(false)}
              style={{width:'100%',padding:12,borderRadius:12,border:'1px solid var(--bdr)',
                background:'transparent',color:'var(--ink3)',fontWeight:700,fontSize:14,cursor:'pointer'}}>
              ← تعديل البيانات
            </button>
          </div>
        </div>
      )}

      {/* ════ Receipt Chooser ════ */}
      {showReceipt && receiptData && (
        <div style={{position:'fixed',inset:0,zIndex:700,
          background:'rgba(4,8,22,.88)',backdropFilter:'blur(16px)',
          display:'flex',alignItems:'flex-end',justifyContent:'center'}}
          onClick={e=>{if(e.target===e.currentTarget) setShowReceipt(false)}}>
          <div style={{width:'100%',maxWidth:540,background:'var(--sur)',
            borderRadius:'26px 26px 0 0',padding:'10px 20px 42px',
            borderTop:'1px solid rgba(5,150,105,.4)'}}>
            <div style={{width:38,height:4,background:'var(--bdr)',borderRadius:4,margin:'8px auto 18px'}}/>
            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{fontSize:36}}>🧾</div>
              <div style={{fontSize:17,fontWeight:800,color:'var(--ink)',marginTop:8}}>
                الدفعة مثبَّتة ✅
              </div>
              <div style={{fontSize:13,color:'var(--ink3)',marginTop:4}}>اختر طريقة إصدار الوصل</div>
            </div>
            {[
              {mode:'thermal',icon:'🖨️',label:'طابعة حرارية', desc:'72mm — طابعة الإيصالات',color:'#1a3fdb'},
              {mode:'normal', icon:'🖨️',label:'طابعة عادية',  desc:'A4 — أي طابعة',      color:'#6144f5'},
              {mode:'image',  icon:'🖼️',label:'صورة PNG',     desc:'تحميل وصل كصورة',   color:'#059669'},
              {mode:'pdf',    icon:'📄',label:'PDF',          desc:'حفظ أو إرسال كـ PDF', color:'#d97706'},
            ].map(opt => (
              <button key={opt.mode}
                onClick={() => { printReceipt({...receiptData,mode:opt.mode}); setShowReceipt(false) }}
                style={{width:'100%',padding:'13px 16px',borderRadius:12,
                  border:'1px solid var(--bdr)',background:'var(--bg2)',
                  cursor:'pointer',marginBottom:9,display:'flex',
                  alignItems:'center',gap:14,textAlign:'right'}}>
                <div style={{width:40,height:40,borderRadius:11,
                  background:`${opt.color}18`,display:'flex',alignItems:'center',
                  justifyContent:'center',fontSize:20,flexShrink:0}}>{opt.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:14,color:'var(--ink)'}}>{opt.label}</div>
                  <div style={{fontSize:12,color:'var(--ink3)',marginTop:1}}>{opt.desc}</div>
                </div>
                <span style={{fontSize:16,color:opt.color}}>←</span>
              </button>
            ))}
            <button onClick={() => setShowReceipt(false)}
              style={{width:'100%',padding:12,borderRadius:12,border:'1px solid var(--bdr)',
                background:'transparent',color:'var(--ink3)',fontWeight:700,fontSize:14,cursor:'pointer',marginTop:2}}>
              تخطي — بدون وصل
            </button>
          </div>
        </div>
      )}

      <style>{`
        [data-dark] div[style*="rgba(255,255,255,.95)"] {
          background: rgba(7,12,28,.95) !important;
        }
        .icon-btn {
          width:38px; height:38px; border-radius:10px;
          border:1px solid var(--bdr); background:var(--sur);
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; color:var(--ink2); font-size:17px;
          transition:.18s;
        }
        .icon-btn:hover {
          background:var(--gP); color:#fff; border-color:transparent;
        }
      `}</style>
    </div>
  )
                            }
