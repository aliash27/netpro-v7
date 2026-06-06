import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../components/Toast'

const MO = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران',
            'تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول']

function moLabel(ym) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return `${MO[parseInt(m)-1]} ${y}`
}
function fmt(n) { return Number(n).toLocaleString('ar-IQ') + ' د.ع' }
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
function avatarColor(name) {
  const c = ['#1a3fdb','#059669','#d97706','#e11d48','#7c3aed','#0d9488']
  let h = 0; for (const ch of name) h = (h*31+ch.charCodeAt(0)) % c.length
  return c[h]
}

const today = new Date().toISOString().split('T')[0]
const curMo  = today.slice(0,7)

// ── Receipt printer ───────────────────────────────────────────
function printReceipt({ sub, month, amount, company, paidAt, recordedBy, mode }) {
  const fmtR = n => Number(n||0).toLocaleString('ar-IQ') + ' د.ع'
  if (mode === 'thermal') {
    const win = window.open('','_blank','width=380,height=600')
    win.document.write(`<html dir="rtl"><head><meta charset="utf-8">
    <style>*{margin:0;padding:0}body{font-family:'Courier New',monospace;font-size:13px;width:72mm;margin:8px auto;padding:8px;background:#fff;color:#000}
    .c{text-align:center}.b{font-weight:bold}.sep{border-top:1px dashed #000;margin:6px 0}.row{display:flex;justify-content:space-between;margin:3px 0}
    @media print{body{width:72mm}button{display:none}}</style></head><body>
    <div class="c b" style="font-size:16px">${company?.name||'نيت برو'}</div>
    <div class="sep"></div><div class="c">وصل دفع اشتراك</div><div class="sep"></div>
    <div class="row"><span>الاسم:</span><span>${sub.name}</span></div>
    <div class="row"><span>الشهر:</span><span>${moLabel(month)}</span></div>
    <div class="row"><span>المبلغ:</span><span class="b">${fmtR(amount)}</span></div>
    <div class="row"><span>التاريخ:</span><span>${paidAt}</span></div>
    <div class="row"><span>بواسطة:</span><span>${recordedBy}</span></div>
    <div class="sep"></div><div class="c">شكراً لاشتراككم 🙏</div><br/>
    <button onclick="window.print()" style="width:100%;padding:8px;font-size:14px;cursor:pointer">🖨️ طباعة</button>
    </body></html>`)
    win.document.close(); setTimeout(() => win.print(), 400)
  } else if (mode === 'normal' || mode === 'pdf') {
    const win = window.open('','_blank','width=600,height=700')
    win.document.write(`<html dir="rtl"><head><meta charset="utf-8">
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Tajawal',sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .r{background:#fff;border-radius:16px;padding:36px;max-width:450px;width:100%}
    .logo{text-align:center;font-size:36px}.co{text-align:center;font-size:20px;font-weight:900;color:#1a1a2e}
    .ti{text-align:center;font-size:13px;color:#6b7280;margin-bottom:20px}
    .sep{border:none;border-top:2px dashed #e5e7eb;margin:14px 0}
    .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6}
    .lbl{font-size:13px;color:#6b7280}.val{font-size:14px;font-weight:700;color:#111827}
    .amt{font-size:22px;font-weight:900;color:#059669}
    .ft{text-align:center;font-size:12px;color:#9ca3af;margin-top:16px}
    @media print{body{background:#fff}.np{display:none}}</style></head><body>
    <div class="r"><div class="logo">📡</div><div class="co">${company?.name||'نيت برو'}</div>
    <div class="ti">وصل دفع اشتراك إنترنت</div><hr class="sep"/>
    <div class="row"><span class="lbl">الاسم</span><span class="val">${sub.name}</span></div>
    <div class="row"><span class="lbl">الشهر</span><span class="val">${moLabel(month)}</span></div>
    <div class="row"><span class="lbl">المبلغ</span><span class="amt">${fmtR(amount)}</span></div>
    <div class="row"><span class="lbl">التاريخ</span><span class="val">${paidAt}</span></div>
    <div class="row"><span class="lbl">بواسطة</span><span class="val">${recordedBy}</span></div>
    <hr class="sep"/><div class="ft">شكراً لثقتكم 🙏 — ${company?.name||''}</div><br/>
    <button class="np" onclick="window.print()" style="width:100%;padding:12px;font-size:15px;border-radius:10px;border:none;background:#1a3fdb;color:#fff;cursor:pointer;font-family:Tajawal,sans-serif;font-weight:700">
      ${mode==='pdf'?'📄 حفظ كـ PDF':'🖨️ طباعة'}</button></div>
    </body></html>`)
    win.document.close()
    if (mode==='pdf') setTimeout(() => win.print(), 500)
  } else if (mode === 'image') {
    const canvas = document.createElement('canvas')
    canvas.width=500; canvas.height=480
    const ctx = canvas.getContext('2d')
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,500,480)
    const g = ctx.createLinearGradient(0,0,500,90)
    g.addColorStop(0,'#1a3fdb'); g.addColorStop(1,'#6144f5')
    ctx.fillStyle=g; ctx.fillRect(0,0,500,90)
    ctx.fillStyle='#fff'; ctx.font='bold 20px Arial'; ctx.textAlign='center'
    ctx.fillText(company?.name||'نيت برو', 250, 38)
    ctx.font='13px Arial'; ctx.fillStyle='rgba(255,255,255,.8)'
    ctx.fillText('وصل دفع اشتراك', 250, 62)
    const rows=[['الاسم',sub.name],['الشهر',moLabel(month)],['المبلغ',fmtR(amount)],['التاريخ',paidAt],['بواسطة',recordedBy]]
    rows.forEach(([l,v],i) => {
      const y=110+i*60
      ctx.fillStyle=i%2===0?'#f9fafb':'#fff'; ctx.fillRect(20,y-18,460,52)
      ctx.fillStyle='#6b7280'; ctx.font='13px Arial'; ctx.textAlign='right'
      ctx.fillText(l,470,y+10)
      ctx.fillStyle='#111827'; ctx.font='bold 14px Arial'; ctx.textAlign='left'
      ctx.fillText(v,30,y+10)
    })
    ctx.fillStyle='#9ca3af'; ctx.font='12px Arial'; ctx.textAlign='center'
    ctx.fillText('شكراً لثقتكم 🙏',250,450)
    const a=document.createElement('a')
    a.download=`receipt-${sub.name}-${month}.png`
    a.href=canvas.toDataURL('image/png'); a.click()
  }
}

export default function Payments() {
  const { company, user, isViewer } = useAuth()
  const [pays, setPays]         = useState([])
  const [subs, setSubs]         = useState([])
  const [paidMap, setPaidMap]   = useState({})
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filterMonth, setFilterMonth] = useState('')

  // New payment modal
  const [showNew, setShowNew]     = useState(false)
  const [subSearch, setSubSearch] = useState('')
  const [selSub, setSelSub]       = useState(null)
  const [payForm, setPayForm]     = useState({ month:curMo, amount:'', paid_at:today, notes:'' })
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving]       = useState(false)

  // Receipt
  const [receiptData, setReceiptData]   = useState(null)
  const [showReceipt, setShowReceipt]   = useState(false)

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    setLoading(true)
    const [{ data: pData }, { data: sData }] = await Promise.all([
      supabase.from('payments').select('*')
        .eq('company_id', company.id)
        .order('paid_at', { ascending: false }),
      supabase.from('subscribers').select('*')
        .eq('company_id', company.id).eq('is_active', true)
        .order('name')
    ])
    setPays(pData || [])
    setSubs(sData || [])
    const pm = {}
    for (const p of (pData||[])) {
      if (!pm[p.subscriber_id]) pm[p.subscriber_id] = []
      pm[p.subscriber_id].push(p.month)
    }
    setPaidMap(pm)
    setLoading(false)
  }

  // ── Select subscriber ──────────────────────────────────────
  function selectSub(sub) {
    setSelSub(sub)
    const debt = calcDebt(sub, paidMap[sub.id]||[])
    setPayForm({
      month:   debt[0] || curMo,
      amount:  String(sub.monthly_fee || ''),
      paid_at: today,
      notes:   ''
    })
    setSubSearch('')
  }

  // ── Save payment ───────────────────────────────────────────
  async function savePay() {
    if (!selSub || !payForm.month || !payForm.amount) {
      toast('يرجى اختيار مشترك وملء المبلغ','e'); return
    }
    const alreadyPaid = (paidMap[selSub.id]||[]).includes(payForm.month)
    if (alreadyPaid) {
      toast(`شهر ${moLabel(payForm.month)} مسجل مسبقاً ⚠️`,'e'); return
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
    if (error) { toast('خطأ: '+error.message,'e'); setSaving(false); return }

    // Update last_paid_month
    const allPaid = [...(paidMap[selSub.id]||[]), payForm.month].sort()
    await supabase.from('subscribers')
      .update({ last_paid_month: allPaid[allPaid.length-1] })
      .eq('id', selSub.id)

    toast(`✅ تم تسجيل دفعة ${moLabel(payForm.month)} لـ ${selSub.name}`,'s')
    setSaving(false)
    setReceiptData({
      sub: selSub, month: payForm.month, amount: parseFloat(payForm.amount),
      paidAt: payForm.paid_at, recordedBy: recorderName, company
    })
    setShowConfirm(false)
    setShowNew(false)
    setSelSub(null)
    setShowReceipt(true)
    load()
  }

  // Filter display list
  const months   = [...new Set(pays.map(p => p.month))].sort().reverse()
  const list     = pays.filter(p => {
    const ms = !search || p.subscriber_name.includes(search) || moLabel(p.month).includes(search)
    const mm = !filterMonth || p.month === filterMonth
    return ms && mm
  })
  const totalFiltered = list.reduce((s,p) => s + Number(p.amount), 0)

  // Filtered subscribers for sub-search
  const subList = subSearch.trim()
    ? subs.filter(s => s.name.includes(subSearch) || s.phone.includes(subSearch))
    : subs

  return (
    <div className="page">
      {/* Header row */}
      <div style={{display:'flex',alignItems:'center',
        justifyContent:'space-between',marginBottom:16}}>
        <div className="page-title" style={{marginBottom:0}}>📋 سجل الدفعات</div>
        {!isViewer && (
          <button className="btn btn-primary btn-sm"
            style={{width:'auto',display:'flex',alignItems:'center',gap:6}}
            onClick={() => { setShowNew(true); setSelSub(null); setSubSearch('') }}>
            ➕ دفعة جديدة
          </button>
        )}
      </div>

      {/* Stats row */}
      {pays.length > 0 && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9,marginBottom:14}}>
          <div style={{background:'var(--sur)',border:'1px solid var(--bdr)',
            borderRadius:14,padding:'12px 14px',textAlign:'center'}}>
            <div style={{fontSize:11,color:'var(--ink3)',fontWeight:700,marginBottom:3}}>
              إجمالي الدفعات
            </div>
            <div style={{fontSize:22,fontWeight:900,color:'var(--ink)'}}>{pays.length}</div>
          </div>
          <div style={{background:'var(--sur)',border:'1px solid var(--bdr)',
            borderRadius:14,padding:'12px 14px',textAlign:'center'}}>
            <div style={{fontSize:11,color:'var(--ink3)',fontWeight:700,marginBottom:3}}>
              إجمالي الإيرادات
            </div>
            <div style={{fontSize:14,fontWeight:900,
              background:'var(--gT)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
              {fmt(pays.reduce((a,p)=>a+Number(p.amount),0))}
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="search-wrap">
        <span className="search-icon">🔍</span>
        <input className="search-input" placeholder="بحث باسم أو شهر..."
          value={search} onChange={e => setSearch(e.target.value)}/>
        {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
      </div>

      {/* Month filter */}
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
        <select style={{flex:1,minWidth:150,padding:'8px 12px',borderRadius:10,
          border:'1px solid var(--bdr)',background:'var(--sur)',color:'var(--ink)',fontSize:13}}
          value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
          <option value="">📅 كل الأشهر</option>
          {months.map(m => <option key={m} value={m}>{moLabel(m)}</option>)}
        </select>
        {filterMonth && (
          <button style={{padding:'8px 14px',borderRadius:10,border:'1px solid var(--bdr)',
            background:'var(--bg2)',color:'var(--ink3)',fontSize:12,cursor:'pointer'}}
            onClick={() => setFilterMonth('')}>✕ إلغاء</button>
        )}
      </div>

      {/* Filtered summary */}
      {(filterMonth || search) && list.length > 0 && (
        <div style={{background:'rgba(26,63,219,.06)',border:'1px solid rgba(26,63,219,.15)',
          borderRadius:12,padding:'12px 16px',marginBottom:12,
          display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontSize:13,color:'var(--ink2)'}}>
            {filterMonth ? `💡 ${moLabel(filterMonth)}` : '🔍 نتائج البحث'}
            <span style={{fontSize:11,color:'var(--ink3)',marginRight:6}}>({list.length} دفعة)</span>
          </div>
          <div style={{fontSize:15,fontWeight:900,
            background:'var(--gP)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
            {fmt(totalFiltered)}
          </div>
        </div>
      )}

      <div className="sec-header">
        <div className="sec-title">الدفعات المسجلة</div>
        <div className="sec-count">{list.length}</div>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:40,fontSize:24}}>⏳</div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <div className="empty-art">📋</div>
          <div className="empty-title">لا يوجد دفعات</div>
          <div className="empty-sub">
            {search || filterMonth
              ? 'لا توجد نتائج لهذا الفلتر'
              : 'اضغط ➕ دفعة جديدة لتسجيل أول دفعة'}
          </div>
          {!isViewer && !search && !filterMonth && (
            <button className="btn btn-primary" style={{marginTop:16,maxWidth:240}}
              onClick={() => { setShowNew(true); setSelSub(null); setSubSearch('') }}>
              ➕ تسجيل أول دفعة
            </button>
          )}
        </div>
      ) : list.map(p => (
        <div key={p.id} className="card" style={{marginBottom:9}}>
          <div className="card-body" style={{padding:'13px 15px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{
                  width:36,height:36,borderRadius:10,flexShrink:0,
                  background:`${avatarColor(p.subscriber_name)}22`,
                  color:avatarColor(p.subscriber_name),
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:16,fontWeight:900
                }}>{p.subscriber_name[0]}</div>
                <div>
                  <div style={{fontWeight:800,fontSize:14,color:'var(--ink)'}}>
                    {p.subscriber_name}
                  </div>
                  <div style={{fontSize:12,color:'var(--ink3)',marginTop:2}}>
                    📅 {moLabel(p.month)} &nbsp;•&nbsp; {p.paid_at}
                  </div>
                  <div style={{fontSize:11,color:'var(--ink3)',marginTop:1}}>
                    👤 {p.recorded_by || '—'}
                  </div>
                </div>
              </div>
              <div style={{textAlign:'left'}}>
                <div style={{fontSize:17,fontWeight:900,
                  background:'var(--gT)',WebkitBackgroundClip:'text',
                  WebkitTextFillColor:'transparent'}}>
                  {fmt(p.amount)}
                </div>
                <span className="badge badge-ok" style={{marginTop:5,display:'block',textAlign:'center'}}>
                  ✅ مسجل
                </span>
              </div>
            </div>
            {p.notes && (
              <div style={{marginTop:8,fontSize:12,color:'var(--ink3)',
                background:'var(--bg2)',borderRadius:8,padding:'6px 10px'}}>
                📝 {p.notes}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* ════ NEW PAYMENT MODAL ════ */}
      {showNew && !showConfirm && (
        <div style={{position:'fixed',inset:0,zIndex:500,
          background:'rgba(4,8,22,.7)',backdropFilter:'blur(8px)',
          display:'flex',alignItems:'flex-end',justifyContent:'center'}}
          onClick={e => { if(e.target===e.currentTarget) setShowNew(false) }}>
          <div style={{width:'100%',maxWidth:560,background:'var(--sur)',
            borderRadius:'26px 26px 0 0',padding:'10px 20px 36px',
            borderTop:'1px solid var(--bdr)',maxHeight:'92vh',overflowY:'auto'}}>
            <div style={{width:38,height:4,background:'var(--bdr)',
              borderRadius:4,margin:'8px auto 18px'}}/>
            <div style={{fontSize:17,fontWeight:800,color:'var(--ink)',
              marginBottom:18,display:'flex',alignItems:'center',gap:10}}>
              💵 تسجيل دفعة جديدة
              <button onClick={() => setShowNew(false)}
                style={{marginRight:'auto',width:32,height:32,borderRadius:'50%',
                  background:'var(--bg2)',border:'none',cursor:'pointer',
                  color:'var(--ink3)',fontSize:15}}>✕</button>
            </div>

            {/* Step 1: Select subscriber */}
            <div style={{marginBottom:16}}>
              <label style={{fontSize:13,fontWeight:700,color:'var(--ink2)',
                display:'block',marginBottom:6}}>
                1️⃣ اختيار المشترك *
              </label>

              {selSub ? (
                /* Selected subscriber chip */
                <div style={{background:'rgba(26,63,219,.08)',
                  border:'1px solid rgba(26,63,219,.2)',borderRadius:12,
                  padding:'11px 14px',display:'flex',alignItems:'center',gap:11}}>
                  <div style={{width:38,height:38,borderRadius:10,
                    background:`${avatarColor(selSub.name)}22`,
                    color:avatarColor(selSub.name),
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:18,fontWeight:900,flexShrink:0}}>
                    {selSub.name[0]}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:14,color:'var(--ink)'}}>
                      {selSub.name}
                    </div>
                    <div style={{fontSize:12,color:'var(--ink3)',marginTop:1}}>
                      {selSub.phone} &nbsp;•&nbsp; {fmt(selSub.monthly_fee)}/شهر
                    </div>
                    {calcDebt(selSub, paidMap[selSub.id]||[]).length > 0 && (
                      <div style={{fontSize:11,color:'var(--rose)',marginTop:2,fontWeight:700}}>
                        ⚠️ {calcDebt(selSub, paidMap[selSub.id]||[]).length} شهر متأخر
                      </div>
                    )}
                  </div>
                  <button onClick={() => setSelSub(null)}
                    style={{background:'var(--bg2)',border:'none',borderRadius:8,
                      padding:'5px 10px',cursor:'pointer',fontSize:12,
                      color:'var(--ink3)',fontWeight:700}}>
                    تغيير
                  </button>
                </div>
              ) : (
                /* Subscriber search */
                <div>
                  <div className="field-wrap" style={{marginBottom:8}}>
                    <span className="field-icon">🔍</span>
                    <input className="field-input" type="text"
                      placeholder="ابحث بالاسم أو الهاتف..."
                      value={subSearch}
                      onChange={e => setSubSearch(e.target.value)}
                      autoFocus/>
                  </div>
                  <div style={{maxHeight:200,overflowY:'auto',
                    border:'1px solid var(--bdr)',borderRadius:10,
                    background:'var(--sur)'}}>
                    {subList.length === 0 ? (
                      <div style={{padding:16,textAlign:'center',
                        fontSize:13,color:'var(--ink3)'}}>
                        لا يوجد مشتركون
                      </div>
                    ) : subList.map(sub => {
                      const d = calcDebt(sub, paidMap[sub.id]||[])
                      const col = avatarColor(sub.name)
                      return (
                        <div key={sub.id}
                          onClick={() => selectSub(sub)}
                          style={{display:'flex',alignItems:'center',gap:10,
                            padding:'11px 14px',cursor:'pointer',
                            borderBottom:'1px solid var(--bdr)',transition:'.15s'}}
                          onMouseEnter={e => e.currentTarget.style.background='var(--bg2)'}
                          onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          <div style={{width:34,height:34,borderRadius:9,
                            background:`${col}22`,color:col,
                            display:'flex',alignItems:'center',justifyContent:'center',
                            fontSize:15,fontWeight:900,flexShrink:0}}>
                            {sub.name[0]}
                          </div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13,fontWeight:700,color:'var(--ink)'}}>
                              {sub.name}
                            </div>
                            <div style={{fontSize:11,color:'var(--ink3)'}}>
                              {sub.phone}
                            </div>
                          </div>
                          <div style={{textAlign:'left'}}>
                            {d.length > 0 ? (
                              <span style={{fontSize:11,fontWeight:800,
                                background:'rgba(225,29,72,.1)',color:'#e11d48',
                                padding:'2px 8px',borderRadius:20}}>
                                ⚠️ {d.length} شهر
                              </span>
                            ) : (
                              <span style={{fontSize:11,fontWeight:700,
                                background:'rgba(5,150,105,.1)',color:'#059669',
                                padding:'2px 8px',borderRadius:20}}>
                                ✅ مدفوع
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Payment details (only after subscriber selected) */}
            {selSub && (
              <>
                <div style={{fontSize:13,fontWeight:700,color:'var(--ink2)',
                  marginBottom:10}}>2️⃣ تفاصيل الدفعة</div>

                {/* Month */}
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:13,fontWeight:700,color:'var(--ink2)',
                    display:'block',marginBottom:6}}>الشهر المدفوع *</label>
                  <select className="field-input" value={payForm.month}
                    onChange={e => setPayForm({...payForm,month:e.target.value})}>
                    {(calcDebt(selSub, paidMap[selSub.id]||[]).length > 0
                      ? calcDebt(selSub, paidMap[selSub.id]||[])
                      : [curMo]).map(mo => (
                      <option key={mo} value={mo}>{moLabel(mo)}</option>
                    ))}
                    {/* Allow selecting any recent month */}
                    {Array.from({length:6},(_,i)=>{
                      const d = new Date(); d.setMonth(d.getMonth()-i)
                      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
                    }).filter(m => !calcDebt(selSub, paidMap[selSub.id]||[]).includes(m)).map(m=>(
                      <option key={m} value={m}>{moLabel(m)} (مدفوع)</option>
                    ))}
                  </select>
                </div>

                {/* Amount */}
                <div className="field">
                  <label className="field-label">المبلغ (د.ع) *</label>
                  <div className="field-wrap">
                    <span className="field-icon">💰</span>
                    <input className="field-input" type="number"
                      value={payForm.amount}
                      onChange={e => setPayForm({...payForm,amount:e.target.value})}/>
                  </div>
                </div>

                {/* Date */}
                <div className="field">
                  <label className="field-label">تاريخ الاستلام</label>
                  <div className="field-wrap">
                    <span className="field-icon">📅</span>
                    <input className="field-input" type="date"
                      value={payForm.paid_at}
                      onChange={e => setPayForm({...payForm,paid_at:e.target.value})}/>
                  </div>
                </div>

                {/* Notes */}
                <div className="field" style={{marginBottom:18}}>
                  <label className="field-label">ملاحظات (اختياري)</label>
                  <textarea className="field-input" rows={2}
                    placeholder="أي ملاحظات..."
                    value={payForm.notes}
                    onChange={e => setPayForm({...payForm,notes:e.target.value})}/>
                </div>

                <button onClick={() => setShowConfirm(true)}
                  style={{width:'100%',padding:14,borderRadius:12,border:'none',
                    background:'linear-gradient(135deg,#065f46,#059669)',
                    color:'#fff',fontWeight:800,fontSize:15,cursor:'pointer',marginBottom:9}}>
                  التالي: مراجعة وتأكيد →
                </button>
              </>
            )}

            <button onClick={() => setShowNew(false)}
              style={{width:'100%',padding:12,borderRadius:12,border:'1px solid var(--bdr)',
                background:'transparent',color:'var(--ink3)',fontWeight:700,fontSize:14,cursor:'pointer'}}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* ════ CONFIRM MODAL ════ */}
      {showConfirm && selSub && (
        <div style={{position:'fixed',inset:0,zIndex:510,
          background:'rgba(4,8,22,.82)',backdropFilter:'blur(14px)',
          display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
          onClick={e=>{if(e.target===e.currentTarget) setShowConfirm(false)}}>
          <div style={{background:'var(--sur)',borderRadius:20,padding:28,
            maxWidth:420,width:'100%',border:'1px solid rgba(5,150,105,.3)'}}>
            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{fontSize:44}}>💵</div>
              <div style={{fontSize:18,fontWeight:900,color:'var(--ink)',marginTop:8}}>
                تأكيد تثبيت الدفعة
              </div>
            </div>
            {[
              ['المشترك', selSub.name],
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
              borderRadius:10,padding:'10px 14px',margin:'16px 0',fontSize:13,
              color:'#065f46',lineHeight:1.7}}>
              ✅ ستُثبَّت الدفعة في:<br/>
              • سجل دفعات المشترك<br/>
              • صفحة سجل الدفعات هذه<br/>
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

      {/* ════ RECEIPT CHOOSER ════ */}
      {showReceipt && receiptData && (
        <div style={{position:'fixed',inset:0,zIndex:600,
          background:'rgba(4,8,22,.88)',backdropFilter:'blur(16px)',
          display:'flex',alignItems:'flex-end',justifyContent:'center'}}
          onClick={e=>{if(e.target===e.currentTarget) setShowReceipt(false)}}>
          <div style={{width:'100%',maxWidth:540,background:'var(--sur)',
            borderRadius:'26px 26px 0 0',padding:'10px 20px 42px',
            borderTop:'1px solid rgba(5,150,105,.4)'}}>
            <div style={{width:38,height:4,background:'var(--bdr)',
              borderRadius:4,margin:'8px auto 18px'}}/>
            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{fontSize:36}}>🧾</div>
              <div style={{fontSize:17,fontWeight:800,color:'var(--ink)',marginTop:8}}>
                الدفعة مثبَّتة ✅
              </div>
              <div style={{fontSize:13,color:'var(--ink3)',marginTop:4}}>
                اختر طريقة إصدار الوصل
              </div>
            </div>
            {[
              {mode:'thermal',icon:'🖨️',label:'طابعة حرارية', desc:'72mm — طابعة الإيصالات',color:'#1a3fdb'},
              {mode:'normal', icon:'🖨️',label:'طابعة عادية',  desc:'A4 — أي طابعة',        color:'#6144f5'},
              {mode:'image',  icon:'🖼️',label:'صورة PNG',     desc:'تحميل وصل كصورة',    color:'#059669'},
              {mode:'pdf',    icon:'📄',label:'PDF',          desc:'حفظ أو إرسال كـ PDF',  color:'#d97706'},
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
        .sec-count { font-size:11px;font-weight:700;color:var(--ink3);
          background:var(--bg2);border:1px solid var(--bdr);
          padding:3px 10px;border-radius:20px; }
      `}</style>
    </div>
  )
}
