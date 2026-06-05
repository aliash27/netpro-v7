import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../components/Toast'

const MO = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران',
            'تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول']

function calcDebt(sub, paidMonths = []) {
  if (!sub?.start_date) return []
  const now    = new Date()
  const startD = new Date(sub.start_date)
  const paidSet = new Set(paidMonths)
  const months = []
  let y = startD.getFullYear(), m = startD.getMonth() + 1
  while (new Date(y, m - 1) <= now) {
    const key = `${y}-${String(m).padStart(2,'0')}`
    if (!paidSet.has(key)) months.push(key)
    m++; if (m > 12) { m = 1; y++ }
  }
  return months
}

function fmt(n) { return Number(n||0).toLocaleString('ar-IQ') + ' د.ع' }
function moLabel(ym) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return `${MO[parseInt(m)-1]} ${y}`
}
function avatarColor(name) {
  const c = ['#1a3fdb','#059669','#d97706','#e11d48','#7c3aed','#0d9488']
  let h = 0; for (const ch of name) h = (h*31+ch.charCodeAt(0)) % c.length
  return c[h]
}

const today  = new Date().toISOString().split('T')[0]
const curMo  = today.slice(0,7)

// ── Receipt printer ──────────────────────────────────────────────────────────
function printReceipt({ sub, month, amount, company, paidAt, recordedBy, mode }) {
  const lines = [
    `=================================`,
    `   ${company?.name || 'نيت برو'}`,
    `=================================`,
    `وصل دفع`,
    `---------------------------------`,
    `الاسم   : ${sub.name}`,
    `الهاتف  : ${sub.phone || '—'}`,
    `الشهر   : ${moLabel(month)}`,
    `المبلغ  : ${fmt(amount)}`,
    `التاريخ : ${paidAt}`,
    `بواسطة  : ${recordedBy}`,
    `---------------------------------`,
    `شكراً لاشتراككم`,
    `=================================`,
  ].join('\n')

  if (mode === 'thermal') {
    // ESC/POS - open in new window
    const win = window.open('','_blank','width=380,height=600')
    win.document.write(`
      <html dir="rtl"><head><meta charset="utf-8">
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Courier New',monospace; font-size:13px;
          width:72mm; margin:8px auto; padding:8px; background:#fff; color:#000; }
        .center { text-align:center; }
        .bold { font-weight:bold; }
        .big { font-size:16px; }
        .sep { border-top:1px dashed #000; margin:6px 0; }
        .row { display:flex; justify-content:space-between; margin:3px 0; }
        @media print { body { width:72mm; } button { display:none; } }
      </style></head><body>
        <div class="center bold big">${company?.name || 'نيت برو'}</div>
        <div class="sep"></div>
        <div class="center">وصل دفع اشتراك</div>
        <div class="sep"></div>
        <div class="row"><span>الاسم:</span><span>${sub.name}</span></div>
        <div class="row"><span>الشهر:</span><span>${moLabel(month)}</span></div>
        <div class="row"><span>المبلغ:</span><span class="bold">${fmt(amount)}</span></div>
        <div class="row"><span>التاريخ:</span><span>${paidAt}</span></div>
        <div class="row"><span>بواسطة:</span><span>${recordedBy}</span></div>
        <div class="sep"></div>
        <div class="center">شكراً لاشتراككم 🙏</div>
        <br/>
        <button onclick="window.print()" style="width:100%;padding:8px;font-size:14px;cursor:pointer">🖨️ طباعة</button>
      </body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 400)

  } else if (mode === 'normal') {
    const win = window.open('','_blank','width=600,height=700')
    win.document.write(`
      <html dir="rtl"><head><meta charset="utf-8">
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Tajawal',sans-serif; background:#f5f5f5; display:flex; align-items:center; justify-content:center; min-height:100vh; }
        .receipt {
          background:#fff; border-radius:16px; padding:32px;
          max-width:420px; width:100%; box-shadow:0 4px 30px rgba(0,0,0,.12);
          border:1px solid #e5e7eb;
        }
        .logo { text-align:center; font-size:32px; margin-bottom:4px; }
        .company { text-align:center; font-size:20px; font-weight:900; color:#1a1a2e; margin-bottom:4px; }
        .title { text-align:center; font-size:13px; color:#6b7280; margin-bottom:18px; }
        .sep { border:none; border-top:2px dashed #e5e7eb; margin:16px 0; }
        .row { display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid #f3f4f6; }
        .row:last-child { border-bottom:none; }
        .label { font-size:13px; color:#6b7280; }
        .value { font-size:14px; font-weight:700; color:#111827; }
        .amount { font-size:22px; font-weight:900; color:#059669; }
        .footer { text-align:center; font-size:12px; color:#9ca3af; margin-top:16px; }
        @media print { body { background:#fff; } .no-print { display:none; } }
      </style></head><body>
        <div class="receipt">
          <div class="logo">📡</div>
          <div class="company">${company?.name || 'نيت برو'}</div>
          <div class="title">وصل دفع اشتراك إنترنت</div>
          <hr class="sep"/>
          <div class="row"><span class="label">اسم المشترك</span><span class="value">${sub.name}</span></div>
          <div class="row"><span class="label">رقم الهاتف</span><span class="value">${sub.phone||'—'}</span></div>
          <div class="row"><span class="label">الشهر المدفوع</span><span class="value">${moLabel(month)}</span></div>
          <div class="row"><span class="label">المبلغ المدفوع</span><span class="amount">${fmt(amount)}</span></div>
          <div class="row"><span class="label">تاريخ الدفع</span><span class="value">${paidAt}</span></div>
          <div class="row"><span class="label">بواسطة</span><span class="value">${recordedBy}</span></div>
          <hr class="sep"/>
          <div class="footer">شكراً لثقتكم 🙏 — ${company?.name}</div>
          <br/>
          <button class="no-print" onclick="window.print()" style="width:100%;padding:12px;font-size:15px;border-radius:10px;border:none;background:#1a3fdb;color:#fff;cursor:pointer;font-family:Tajawal,sans-serif;font-weight:700">🖨️ طباعة</button>
        </div>
      </body></html>`)
    win.document.close()

  } else if (mode === 'image') {
    // Canvas-based receipt image
    const canvas = document.createElement('canvas')
    canvas.width  = 500
    canvas.height = 520
    const ctx = canvas.getContext('2d')
    // Background
    ctx.fillStyle = '#ffffff'
    ctx.roundRect(0,0,500,520,16)
    ctx.fill()
    // Header gradient
    const grad = ctx.createLinearGradient(0,0,500,100)
    grad.addColorStop(0,'#1a3fdb')
    grad.addColorStop(1,'#6144f5')
    ctx.fillStyle = grad
    ctx.roundRect(0,0,500,90,16)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 22px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('📡 ' + (company?.name || 'نيت برو'), 250, 38)
    ctx.font = '14px Arial'
    ctx.fillStyle = 'rgba(255,255,255,.8)'
    ctx.fillText('وصل دفع اشتراك', 250, 65)
    // Rows
    ctx.textAlign = 'right'
    const rows = [
      ['الاسم', sub.name],
      ['الشهر', moLabel(month)],
      ['المبلغ', fmt(amount)],
      ['التاريخ', paidAt],
      ['بواسطة', recordedBy],
    ]
    rows.forEach(([label, val], i) => {
      const y = 125 + i * 56
      ctx.fillStyle = i%2===0 ? '#f9fafb' : '#ffffff'
      ctx.fillRect(20, y-20, 460, 50)
      ctx.fillStyle = '#6b7280'; ctx.font = '14px Arial'
      ctx.fillText(label, 460, y+8)
      ctx.fillStyle = '#111827'; ctx.font = 'bold 15px Arial'
      ctx.textAlign = 'left'
      ctx.fillText(val, 40, y+8)
      ctx.textAlign = 'right'
    })
    ctx.fillStyle = '#e5e7eb'
    ctx.fillRect(20, 415, 460, 1)
    ctx.fillStyle = '#9ca3af'; ctx.font = '13px Arial'; ctx.textAlign = 'center'
    ctx.fillText('شكراً لثقتكم 🙏', 250, 445)
    const link = document.createElement('a')
    link.download = `receipt-${sub.name}-${month}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()

  } else if (mode === 'pdf') {
    const win = window.open('','_blank','width=600,height=700')
    win.document.write(`
      <html dir="rtl"><head><meta charset="utf-8">
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Tajawal',sans-serif; background:#f5f5f5; display:flex; align-items:center; justify-content:center; min-height:100vh; }
        .receipt { background:#fff; border-radius:16px; padding:40px; max-width:500px; width:100%; }
        .logo { text-align:center; font-size:40px; margin-bottom:8px; }
        .company { text-align:center; font-size:22px; font-weight:900; color:#1a1a2e; }
        .title { text-align:center; font-size:14px; color:#6b7280; margin-bottom:24px; }
        hr { border:none; border-top:2px dashed #e5e7eb; margin:16px 0; }
        .row { display:flex; justify-content:space-between; padding:9px 0; border-bottom:1px solid #f3f4f6; }
        .label { font-size:14px; color:#6b7280; }
        .value { font-size:15px; font-weight:700; color:#111827; }
        .amount { font-size:24px; font-weight:900; color:#059669; }
        .footer { text-align:center; font-size:13px; color:#9ca3af; margin-top:20px; }
        @media print { 
          body { background:#fff; } 
          .no-print { display:none; }
          @page { margin:1cm; }
        }
      </style></head><body>
        <div class="receipt">
          <div class="logo">📡</div>
          <div class="company">${company?.name || 'نيت برو'}</div>
          <div class="title">وصل دفع اشتراك إنترنت</div>
          <hr/>
          <div class="row"><span class="label">اسم المشترك</span><span class="value">${sub.name}</span></div>
          <div class="row"><span class="label">رقم الهاتف</span><span class="value">${sub.phone||'—'}</span></div>
          <div class="row"><span class="label">الشهر المدفوع</span><span class="value">${moLabel(month)}</span></div>
          <div class="row"><span class="label">المبلغ المدفوع</span><span class="amount">${fmt(amount)}</span></div>
          <div class="row"><span class="label">تاريخ الدفع</span><span class="value">${paidAt}</span></div>
          <div class="row"><span class="label">بواسطة</span><span class="value">${recordedBy}</span></div>
          <hr/>
          <div class="footer">شكراً لثقتكم 🙏 — ${company?.name}</div>
          <br/>
          <button class="no-print" onclick="window.print()" style="width:100%;padding:12px;font-size:15px;border-radius:10px;border:none;background:#1a3fdb;color:#fff;cursor:pointer;font-family:Tajawal,sans-serif;font-weight:700">
            📄 حفظ كـ PDF (Ctrl+P → Save as PDF)
          </button>
        </div>
      </body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Debts() {
  const { company, user, isViewer } = useAuth()
  const navigate          = useNavigate()

  const [subs, setSubs]         = useState([])
  const [paidMap, setPaidMap]   = useState({}) // {sub_id: [months...]}
  const [loading, setLoading]   = useState(true)

  // Pay modal
  const [payTarget, setPayTarget]   = useState(null)   // sub object
  const [payForm, setPayForm]       = useState({ month:curMo, amount:'', paid_at:today, notes:'' })
  const [paying, setPaying]         = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Receipt mode chooser
  const [receiptData, setReceiptData]   = useState(null)
  const [showReceipt, setShowReceipt]   = useState(false)

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    setLoading(true)
    const { data: subsData } = await supabase
      .from('subscribers').select('*')
      .eq('company_id', company.id).eq('is_active', true)

    const { data: paysData } = await supabase
      .from('payments').select('subscriber_id, month')
      .eq('company_id', company.id)

    const pm = {}
    for (const p of (paysData || [])) {
      if (!pm[p.subscriber_id]) pm[p.subscriber_id] = []
      pm[p.subscriber_id].push(p.month)
    }
    setSubs(subsData || [])
    setPaidMap(pm)
    setLoading(false)
  }

  function openPay(sub) {
    const debt = calcDebt(sub, paidMap[sub.id] || [])
    setPayTarget(sub)
    setPayForm({
      month:   debt[0] || curMo,
      amount:  String(sub.monthly_fee || ''),
      paid_at: today,
      notes:   ''
    })
    setShowConfirm(false)
  }

  async function confirmPay() {
    if (!payForm.amount || !payForm.month) {
      toast('يرجى ملء المبلغ والشهر','e'); return
    }
    // Duplicate check
    const already = (paidMap[payTarget.id]||[]).includes(payForm.month)
    if (already) {
      toast(`شهر ${moLabel(payForm.month)} مسجل مسبقاً ⚠️`,'e'); return
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
    if (error) { toast('خطأ في تسجيل الدفعة: '+error.message,'e'); setPaying(false); return }

    // Update last_paid_month
    const allPaid = [...(paidMap[payTarget.id]||[]), payForm.month].sort()
    await supabase.from('subscribers')
      .update({ last_paid_month: allPaid[allPaid.length-1] })
      .eq('id', payTarget.id)

    toast(`✅ تم تسجيل دفعة ${moLabel(payForm.month)} لـ ${payTarget.name}`, 's')
    setPaying(false)

    // Store receipt data and show receipt chooser
    setReceiptData({
      sub:         payTarget,
      month:       payForm.month,
      amount:      parseFloat(payForm.amount),
      paidAt:      payForm.paid_at,
      recordedBy:  recorderName,
      company,
    })
    setPayTarget(null)
    setShowConfirm(false)
    setShowReceipt(true)
    load()
  }

  const late       = subs.filter(s => calcDebt(s, paidMap[s.id]||[]).length > 0)
  const totalDebt  = late.reduce((a,s) => a + calcDebt(s, paidMap[s.id]||[]).length * s.monthly_fee, 0)

  function sendWA(sub) {
    const d     = calcDebt(sub, paidMap[sub.id]||[])
    const total = d.length * sub.monthly_fee
    const tmpl  = company?.whatsapp_template ||
      'عزيزي {name}، لديك {months} شهر متأخر بمبلغ {amount} د.ع. شكراً — {company}'
    const msg = tmpl
      .replace(/{name}/g, sub.name)
      .replace(/{months}/g, d.length)
      .replace(/{amount}/g, total.toLocaleString('ar-IQ'))
      .replace(/{company}/g, company?.name||'المنصة')
    window.open(`https://wa.me/${sub.phone.replace(/^0/,'964')}?text=${encodeURIComponent(msg)}`,'_blank')
  }

  function sendAllWA() {
    if (!late.length) { toast('لا يوجد متأخرون','i'); return }
    toast(`جاري فتح ${late.length} محادثات...`,'i')
    late.forEach((sub,i) => setTimeout(() => sendWA(sub), i*1100))
  }

  return (
    <div className="page">
      <div className="page-title">⚠️ الديون المستحقة</div>

      {/* Summary */}
      <div className="stat-grid" style={{marginBottom:16}}>
        <div className="stat-card">
          <div className="stat-icon si-2">👥</div>
          <div className="stat-label">متأخرون</div>
          <div className="stat-value warn">{late.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon si-3">💰</div>
          <div className="stat-label">إجمالي الديون</div>
          <div className="stat-value danger" style={{fontSize:'clamp(11px,3vw,18px)'}}>
            {fmt(totalDebt)}
          </div>
        </div>
      </div>

      {late.length > 0 && (
        <button className="btn btn-whatsapp" style={{marginBottom:16}} onClick={sendAllWA}>
          📨 مراسلة جميع المتأخرين
        </button>
      )}

      <div className="sec-header">
        <div className="sec-title">المتأخرون عن الدفع</div>
        <div className="sec-count">{late.length}</div>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:40,fontSize:24}}>⏳</div>
      ) : late.length === 0 ? (
        <div className="empty-state">
          <div className="empty-art">🎉</div>
          <div className="empty-title">لا يوجد متأخرون!</div>
          <div className="empty-sub">جميع المشتركين مدفوعون. عمل رائع!</div>
        </div>
      ) : late.map(sub => {
        const d     = calcDebt(sub, paidMap[sub.id]||[])
        const total = d.length * sub.monthly_fee
        const color = avatarColor(sub.name)
        return (
          <div key={sub.id} className="card" style={{marginBottom:11}}>
            <div className="card-body" style={{padding:15}}>
              <div style={{display:'flex',alignItems:'center',gap:11,marginBottom:11}}>
                <div className="sub-avatar" style={{background:`${color}22`,color}}>
                  {sub.name[0]}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:14,cursor:'pointer',color:'var(--ink)'}}
                    onClick={() => navigate(`/subscribers/${sub.id}`)}>
                    {sub.name}
                  </div>
                  <div style={{fontSize:12,color:'var(--ink3)'}}>{sub.phone}</div>
                </div>
                <div style={{textAlign:'left'}}>
                  <span className="badge badge-err">⚠️ {d.length} شهر</span>
                  <div style={{fontSize:14,fontWeight:900,color:'var(--rose)',marginTop:4}}>
                    {fmt(total)}
                  </div>
                </div>
              </div>

              <div style={{fontSize:12,color:'var(--ink3)',marginBottom:10}}>
                آخر دفع: <strong style={{color:'var(--ink)'}}>{moLabel(sub.last_paid_month)}</strong>
                {' · '} أشهر الدين: <strong style={{color:'var(--rose)'}}>{d.map(moLabel).join('، ')}</strong>
              </div>

              {/* 3-button row */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:7}}>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => navigate(`/subscribers/${sub.id}`)}>
                  📋 تفاصيل
                </button>
                <button className="btn btn-whatsapp btn-sm"
                  onClick={() => sendWA(sub)}>
                  📱 مراسلة
                </button>
                {!isViewer && <button
                  onClick={() => openPay(sub)}
                  style={{
                    padding:'8px 4px',borderRadius:10,border:'none',
                    background:'linear-gradient(135deg,#065f46,#059669)',
                    color:'#fff',fontWeight:700,fontSize:12,cursor:'pointer'
                  }}>
                  💵 تسجيل دفعة
                </button>}
              </div>
            </div>
          </div>
        )
      })}

      {/* ════ Pay Modal ════ */}
      {payTarget && !showConfirm && (
        <div style={{position:'fixed',inset:0,zIndex:500,
          background:'rgba(4,8,22,.7)',backdropFilter:'blur(8px)',
          display:'flex',alignItems:'flex-end',justifyContent:'center'}}
          onClick={e => { if(e.target===e.currentTarget) setPayTarget(null) }}>
          <div style={{width:'100%',maxWidth:540,background:'var(--sur)',
            borderRadius:'26px 26px 0 0',padding:'10px 20px 36px',
            borderTop:'1px solid var(--bdr)',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{width:38,height:4,background:'var(--bdr)',borderRadius:4,margin:'8px auto 18px'}}/>
            <div style={{fontSize:17,fontWeight:800,color:'var(--ink)',marginBottom:6,display:'flex',alignItems:'center',gap:10}}>
              💵 تسجيل دفعة
              <button onClick={() => setPayTarget(null)}
                style={{marginRight:'auto',width:32,height:32,borderRadius:'50%',
                  background:'var(--bg2)',border:'none',cursor:'pointer',color:'var(--ink3)',fontSize:15}}>✕</button>
            </div>

            {/* Subscriber info */}
            <div style={{background:'rgba(26,63,219,.06)',border:'1px solid rgba(26,63,219,.15)',
              borderRadius:12,padding:'12px 14px',marginBottom:18,display:'flex',gap:12,alignItems:'center'}}>
              <div style={{width:42,height:42,borderRadius:12,
                background:`${avatarColor(payTarget.name)}22`,
                color:avatarColor(payTarget.name),
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:20,fontWeight:900}}>{payTarget.name[0]}</div>
              <div>
                <div style={{fontWeight:800,fontSize:15,color:'var(--ink)'}}>{payTarget.name}</div>
                <div style={{fontSize:12,color:'var(--ink3)'}}>{payTarget.phone}</div>
                <div style={{fontSize:12,color:'var(--rose)',marginTop:2}}>
                  ⚠️ {calcDebt(payTarget, paidMap[payTarget.id]||[]).length} شهر متأخر
                </div>
              </div>
            </div>

            {/* Month select */}
            <div style={{marginBottom:14}}>
              <label style={{fontSize:13,fontWeight:700,color:'var(--ink2)',display:'block',marginBottom:6}}>
                الشهر المدفوع *
              </label>
              <select className="field-input" value={payForm.month}
                onChange={e => setPayForm({...payForm,month:e.target.value})}>
                {(calcDebt(payTarget, paidMap[payTarget.id]||[]).length > 0
                  ? calcDebt(payTarget, paidMap[payTarget.id]||[])
                  : [curMo]).map(mo => (
                  <option key={mo} value={mo}>{moLabel(mo)}</option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div style={{marginBottom:14}}>
              <label style={{fontSize:13,fontWeight:700,color:'var(--ink2)',display:'block',marginBottom:6}}>
                المبلغ (د.ع) *
              </label>
              <div className="field-wrap">
                <span className="field-icon">💰</span>
                <input className="field-input" type="number"
                  value={payForm.amount}
                  onChange={e => setPayForm({...payForm,amount:e.target.value})}/>
              </div>
            </div>

            {/* Date */}
            <div style={{marginBottom:14}}>
              <label style={{fontSize:13,fontWeight:700,color:'var(--ink2)',display:'block',marginBottom:6}}>
                تاريخ الاستلام
              </label>
              <div className="field-wrap">
                <span className="field-icon">📅</span>
                <input className="field-input" type="date"
                  value={payForm.paid_at}
                  onChange={e => setPayForm({...payForm,paid_at:e.target.value})}/>
              </div>
            </div>

            {/* Notes */}
            <div style={{marginBottom:18}}>
              <label style={{fontSize:13,fontWeight:700,color:'var(--ink2)',display:'block',marginBottom:6}}>
                ملاحظات (اختياري)
              </label>
              <textarea className="field-input" rows={2}
                placeholder="ملاحظات..."
                value={payForm.notes}
                onChange={e => setPayForm({...payForm,notes:e.target.value})}/>
            </div>

            <button onClick={() => setShowConfirm(true)}
              style={{width:'100%',padding:14,borderRadius:12,border:'none',
                background:'linear-gradient(135deg,#065f46,#059669)',
                color:'#fff',fontWeight:800,fontSize:15,cursor:'pointer',marginBottom:10}}>
              التالي: مراجعة الدفعة →
            </button>
            <button onClick={() => setPayTarget(null)}
              style={{width:'100%',padding:12,borderRadius:12,border:'1px solid var(--bdr)',
                background:'transparent',color:'var(--ink3)',fontWeight:700,fontSize:14,cursor:'pointer'}}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* ════ Confirm Modal ════ */}
      {payTarget && showConfirm && (
        <div style={{position:'fixed',inset:0,zIndex:501,
          background:'rgba(4,8,22,.8)',backdropFilter:'blur(12px)',
          display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
          onClick={e => { if(e.target===e.currentTarget){ setShowConfirm(false); setPayTarget(null) }}}>
          <div style={{background:'var(--sur)',borderRadius:20,padding:28,maxWidth:420,width:'100%',
            border:'1px solid rgba(5,150,105,.3)'}}>
            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{fontSize:44}}>💵</div>
              <div style={{fontSize:18,fontWeight:900,color:'var(--ink)',marginTop:8}}>
                تأكيد تثبيت الدفعة
              </div>
            </div>

            {/* Summary */}
            {[
              ['المشترك',   payTarget.name],
              ['الشهر',     moLabel(payForm.month)],
              ['المبلغ',    fmt(payForm.amount)],
              ['التاريخ',   payForm.paid_at],
            ].map(([l,v]) => (
              <div key={l} style={{display:'flex',justifyContent:'space-between',
                padding:'9px 0',borderBottom:'1px solid var(--bdr)'}}>
                <span style={{fontSize:13,color:'var(--ink3)'}}>{l}</span>
                <span style={{fontSize:14,fontWeight:800,color:'var(--ink)'}}>{v}</span>
              </div>
            ))}

            <div style={{background:'rgba(5,150,105,.08)',border:'1px solid rgba(5,150,105,.2)',
              borderRadius:10,padding:'10px 14px',margin:'16px 0',fontSize:13,color:'#065f46',lineHeight:1.6}}>
              ✅ سيتم تثبيت الدفعة في:<br/>
              • سجل دفعات المشترك<br/>
              • صفحة سجل الدفعات<br/>
              • إحصائيات الشركة الشهرية
            </div>

            <button onClick={confirmPay} disabled={paying}
              style={{width:'100%',padding:14,borderRadius:12,border:'none',
                background:'linear-gradient(135deg,#065f46,#059669)',
                color:'#fff',fontWeight:800,fontSize:16,cursor:'pointer',marginBottom:10}}>
              {paying ? '⏳ جاري التثبيت...' : '✅ تثبيت الدفعة'}
            </button>
            <button onClick={() => { setShowConfirm(false) }}
              style={{width:'100%',padding:12,borderRadius:12,border:'1px solid var(--bdr)',
                background:'transparent',color:'var(--ink3)',fontWeight:700,fontSize:14,cursor:'pointer'}}>
              ← تعديل البيانات
            </button>
          </div>
        </div>
      )}

      {/* ════ Receipt Chooser ════ */}
      {showReceipt && receiptData && (
        <div style={{position:'fixed',inset:0,zIndex:600,
          background:'rgba(4,8,22,.85)',backdropFilter:'blur(14px)',
          display:'flex',alignItems:'flex-end',justifyContent:'center'}}
          onClick={e => { if(e.target===e.currentTarget) setShowReceipt(false) }}>
          <div style={{width:'100%',maxWidth:540,background:'var(--sur)',
            borderRadius:'26px 26px 0 0',padding:'10px 20px 40px',
            borderTop:'1px solid rgba(5,150,105,.4)'}}>
            <div style={{width:38,height:4,background:'var(--bdr)',borderRadius:4,margin:'8px auto 18px'}}/>
            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{fontSize:36}}>🧾</div>
              <div style={{fontSize:17,fontWeight:800,color:'var(--ink)',marginTop:8}}>
                الدفعة مثبَّتة ✅
              </div>
              <div style={{fontSize:13,color:'var(--ink3)',marginTop:4}}>
                اختر طريقة إصدار الوصل
              </div>
            </div>

            {/* 4 receipt modes */}
            {[
              { mode:'thermal', icon:'🖨️', label:'طابعة حرارية',    desc:'72mm — مناسب لطابعة الإيصالات', color:'#1a3fdb' },
              { mode:'normal',  icon:'🖨️', label:'طابعة عادية',     desc:'A4 — مناسب لأي طابعة',           color:'#6144f5' },
              { mode:'image',   icon:'🖼️', label:'صورة PNG',        desc:'تحميل وصل كصورة',                color:'#059669' },
              { mode:'pdf',     icon:'📄', label:'PDF',             desc:'حفظ أو إرسال كملف PDF',          color:'#d97706' },
            ].map(opt => (
              <button key={opt.mode}
                onClick={() => { printReceipt({...receiptData, mode:opt.mode}); setShowReceipt(false) }}
                style={{
                  width:'100%',padding:'14px 16px',borderRadius:12,border:'1px solid var(--bdr)',
                  background:'var(--bg2)',cursor:'pointer',marginBottom:9,
                  display:'flex',alignItems:'center',gap:14,textAlign:'right',
                  transition:'.18s'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor=opt.color}
                onMouseLeave={e => e.currentTarget.style.borderColor='var(--bdr)'}>
                <div style={{
                  width:42,height:42,borderRadius:11,
                  background:`${opt.color}18`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:22,flexShrink:0
                }}>{opt.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:14,color:'var(--ink)'}}>{opt.label}</div>
                  <div style={{fontSize:12,color:'var(--ink3)',marginTop:2}}>{opt.desc}</div>
                </div>
                <span style={{fontSize:18,color:opt.color}}>←</span>
              </button>
            ))}

            <button onClick={() => setShowReceipt(false)}
              style={{width:'100%',padding:12,borderRadius:12,border:'1px solid var(--bdr)',
                background:'transparent',color:'var(--ink3)',fontWeight:700,fontSize:14,
                cursor:'pointer',marginTop:2}}>
              تخطي — بدون وصل
            </button>
          </div>
        </div>
      )}

      <style>{`
        .sec-count { font-size:11px;font-weight:700;color:var(--ink3);
          background:var(--bg2);border:1px solid var(--bdr);
          padding:3px 10px;border-radius:20px; }
      `}</style>
    </div>
  )
}
