import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../components/Toast'

const MO = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران',
            'تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول']

function calcDebt(sub, paidMonths = []) {
  if (!sub?.start_date) return []
  const now     = new Date()
  const paidSet = new Set(paidMonths)
  const months  = []

  if (paidMonths.length > 0) {
    const startD = new Date(sub.start_date)
    let y = startD.getFullYear(), m = startD.getMonth() + 1
    while (new Date(y, m - 1) <= now) {
      const key = `${y}-${String(m).padStart(2,'0')}`
      if (!paidSet.has(key)) months.push(key)
      m++; if (m > 12) { m = 1; y++ }
    }
    return months
  }

  if (sub.last_paid_month) {
    const [ly, lm] = sub.last_paid_month.split('-').map(Number)
    let y = ly, m = lm + 1
    if (m > 12) { m = 1; y++ }
    while (new Date(y, m - 1) <= now) {
      months.push(`${y}-${String(m).padStart(2,'0')}`)
      m++; if (m > 12) { m = 1; y++ }
    }
    return months
  }

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
function avatarColor(name) {
  const c = ['#1a3fdb','#059669','#d97706','#e11d48','#7c3aed','#0d9488']
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % c.length
  return c[h]
}

export default function Reports() {
  const { company } = useAuth()
  const navigate = useNavigate()
  const [subs, setSubs] = useState([])
  const [pays, setPays] = useState([])
  const [loading, setLoading] = useState(true)
  const [paidMap, setPaidMap]   = useState({})

  const now = new Date()

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    setLoading(true)
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from('subscribers').select('*')
        .eq('company_id', company.id).eq('is_active', true),
      supabase.from('payments').select('*')
        .eq('company_id', company.id)
    ])
    setSubs(s || [])
    setPays(p || [])
    // Build paidMap
    const pm = {}
    for (const pay of (p||[])) {
      if (!pm[pay.subscriber_id]) pm[pay.subscriber_id] = []
      pm[pay.subscriber_id].push(pay.month)
    }
    setPaidMap(pm)
    setLoading(false)
  }

  function exportCSV() {
    const H = ['الاسم','الهاتف','تاريخ البداية','الرسم الشهري',
               'آخر شهر مدفوع','أشهر الدين','إجمالي الدين','ملاحظات']
    const rows = subs.map(s => {
      const d = calcDebt(s, paidMap[s.id]||[])
      return [s.name, s.phone, s.start_date, s.monthly_fee,
              moLabel(s.last_paid_month), d.length,
              d.length * s.monthly_fee, s.notes || '']
    })
    const csv = [H, ...rows].map(r =>
      r.map(c => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(
      new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `netpro_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    toast('تم تصدير ملف CSV ✅', 's')
  }

  function printReport() {
    const late = subs.filter(s => calcDebt(s, paidMap[s.id]||[]).length > 0)
    const totD = late.reduce((a,s) => a + calcDebt(s, paidMap[s.id]||[]).length * s.monthly_fee, 0)
    const totR = pays.reduce((a,p) => a + p.amount, 0)
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"><title>تقرير نيت برو</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Tajawal,sans-serif;direction:rtl;color:#0a0f1e;padding:28px;}
.hdr{background:linear-gradient(135deg,#1a3fdb,#6144f5,#9c27b0);color:#fff;border-radius:14px;padding:22px 24px;margin-bottom:20px;}
.hdr h1{font-size:22px;font-weight:900;}.hdr p{font-size:12px;opacity:.8;margin-top:3px;}
.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;}
.k{border:1.5px solid #e8eeff;border-radius:11px;padding:13px;}
.kl{font-size:11px;color:#6b7cc4;font-weight:700;margin-bottom:3px;}
.kv{font-size:18px;font-weight:900;}
table{width:100%;border-collapse:collapse;margin-bottom:20px;}
th{background:#f4f6fd;color:#3d4a6b;font-size:12px;font-weight:700;padding:9px 11px;text-align:right;}
td{padding:9px 11px;border-bottom:1px solid #ebeffe;font-size:13px;}
.ok{background:#dcfce7;color:#059669;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:800;}
.wa{background:#fef3c7;color:#d97706;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:800;}
.ft{text-align:center;color:#8b96bb;font-size:11px;margin-top:28px;}
@media print{body{padding:14px;}}
</style></head><body>
<div class="hdr">
  <h1>📡 تقرير نيت برو</h1>
  <p>${company?.name || ''} — ${new Date().toLocaleDateString('ar-IQ',{year:'numeric',month:'long',day:'numeric'})}</p>
</div>
<div class="kpi">
  <div class="k"><div class="kl">إجمالي المشتركين</div><div class="kv">${subs.length}</div></div>
  <div class="k"><div class="kl">المتأخرون</div><div class="kv" style="color:#e11d48">${late.length}</div></div>
  <div class="k"><div class="kl">إجمالي الديون</div><div class="kv" style="color:#e11d48;font-size:14px">${fmt(totD)}</div></div>
  <div class="k"><div class="kl">إجمالي الإيرادات</div><div class="kv" style="color:#059669;font-size:14px">${fmt(totR)}</div></div>
</div>
<table>
<thead><tr><th>#</th><th>الاسم</th><th>الهاتف</th><th>الرسم الشهري</th><th>آخر دفع</th><th>الحالة</th><th>الدين</th></tr></thead>
<tbody>
${subs.map((sub,i) => {
  const d = calcDebt(sub, paidMap[sub.id]||[]), t = d.length * sub.monthly_fee
  return `<tr>
    <td>${i+1}</td>
    <td style="font-weight:700">${sub.name}</td>
    <td>${sub.phone}</td>
    <td>${fmt(sub.monthly_fee)}</td>
    <td>${moLabel(sub.last_paid_month)}</td>
    <td>${d.length
      ? `<span class="wa">⚠️ ${d.length} شهر</span>`
      : `<span class="ok">✅ مدفوع</span>`}</td>
    <td style="font-weight:700;color:${d.length?'#e11d48':'#059669'}">
      ${d.length ? fmt(t) : '—'}
    </td>
  </tr>`
}).join('')}
</tbody></table>
<div class="ft">نيت برو v1.0 — ${new Date().toLocaleString('ar-IQ')}</div>
</body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 700)
  }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',
      minHeight:'60vh',fontSize:24}}>⏳</div>
  )

  const late  = subs.filter(s => calcDebt(s, paidMap[s.id]||[]).length > 0)
  const paid  = subs.filter(s => calcDebt(s, paidMap[s.id]||[]).length === 0)
  const totD  = late.reduce((a,s) => a + calcDebt(s, paidMap[s.id]||[]).length * s.monthly_fee, 0)
  const totR  = pays.reduce((a,p) => a + p.amount, 0)

  // Last 6 months revenue
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
  }
  const mRev = months.map(m =>
    pays.filter(p => p.month === m).reduce((a,p) => a + p.amount, 0))
  const maxR = Math.max(...mRev, 1)

  return (
    <div className="page">
      <div style={{display:'flex',alignItems:'center',
        justifyContent:'space-between',marginBottom:16}}>
        <div className="page-title" style={{marginBottom:0}}>📊 التقارير</div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-primary btn-sm"
            style={{width:'auto'}} onClick={exportCSV}>
            📥 CSV
          </button>
          <button className="btn btn-ghost btn-sm"
            style={{width:'auto'}} onClick={printReport}>
            🖨️
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="stat-grid fadeUp">
        <div className="stat-card">
          <div className="stat-icon si-4">💵</div>
          <div className="stat-label">إجمالي الإيرادات</div>
          <div className="stat-value ok"
            style={{fontSize:'clamp(11px,2.5vw,16px)'}}>
            {fmt(totR)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon si-3">💸</div>
          <div className="stat-label">إجمالي الديون</div>
          <div className="stat-value danger"
            style={{fontSize:'clamp(11px,2.5vw,16px)'}}>
            {fmt(totD)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon si-1">📈</div>
          <div className="stat-label">نسبة الالتزام</div>
          <div className="stat-value" style={{
            background:'var(--gT)',WebkitBackgroundClip:'text',
            WebkitTextFillColor:'transparent'}}>
            {subs.length ? Math.round(paid.length/subs.length*100) : 0}%
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon si-2">📋</div>
          <div className="stat-label">الدفعات المسجلة</div>
          <div className="stat-value warn">{pays.length}</div>
        </div>
      </div>

      {/* Monthly revenue chart */}
      <div className="card fadeUp d2" style={{marginBottom:14}}>
        <div className="card-body">
          <div className="card-title">📈 الإيرادات الشهرية (آخر 6 أشهر)</div>
          <div style={{display:'flex',alignItems:'flex-end',
            gap:7,height:130,padding:'0 2px'}}>
            {mRev.map((v, i) => {
              const h   = Math.max(6, Math.round(v / maxR * 110))
              const lbl = MO[parseInt(months[i].split('-')[1]) - 1].slice(0, 3)
              const isMax = v === maxR && v > 0
              return (
                <div key={i} style={{flex:1,display:'flex',
                  flexDirection:'column',alignItems:'center',gap:3}}>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--ink3)'}}>
                    {v ? Math.round(v/1000)+'k' : ''}
                  </div>
                  <div style={{
                    width:'100%', height:h,
                    background:'var(--gP)', borderRadius:'6px 6px 3px 3px',
                    opacity: v ? 1 : .18,
                    boxShadow: isMax ? '0 4px 14px rgba(26,63,219,.35)' : 'none'
                  }}/>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--ink3)'}}>
                    {lbl}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Pie chart */}
      <div className="card fadeUp d3" style={{marginBottom:14}}>
        <div className="card-body">
          <div className="card-title">🥧 توزيع المشتركين</div>
          <div style={{display:'flex',alignItems:'center',
            gap:20,flexWrap:'wrap'}}>
            <div style={{position:'relative',width:104,height:104,flexShrink:0}}>
              <svg viewBox="0 0 36 36"
                style={{width:104,height:104,transform:'rotate(-90deg)'}}>
                <circle cx="18" cy="18" r="15.9" fill="none"
                  stroke="var(--bdr)" strokeWidth="3.2"/>
                <circle cx="18" cy="18" r="15.9" fill="none"
                  stroke="url(#gOK)" strokeWidth="3.2"
                  strokeDasharray={`${subs.length
                    ? (paid.length/subs.length*100).toFixed(1) : 0} 100`}
                  strokeLinecap="round"/>
                <circle cx="18" cy="18" r="15.9" fill="none"
                  stroke="url(#gBAD)" strokeWidth="3.2"
                  strokeDasharray={`${subs.length
                    ? (late.length/subs.length*100).toFixed(1) : 0} 100`}
                  strokeDashoffset={`-${subs.length
                    ? (paid.length/subs.length*100).toFixed(1) : 0}`}
                  strokeLinecap="round"/>
                <defs>
                  <linearGradient id="gOK">
                    <stop offset="0%" stopColor="#059669"/>
                    <stop offset="100%" stopColor="#14b8a6"/>
                  </linearGradient>
                  <linearGradient id="gBAD">
                    <stop offset="0%" stopColor="#e11d48"/>
                    <stop offset="100%" stopColor="#f43f5e"/>
                  </linearGradient>
                </defs>
              </svg>
              <div style={{position:'absolute',inset:0,display:'flex',
                flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                <div style={{fontSize:20,fontWeight:900,color:'var(--ink)'}}>
                  {subs.length}
                </div>
                <div style={{fontSize:10,color:'var(--ink3)',fontWeight:600}}>
                  مشترك
                </div>
              </div>
            </div>
            <div style={{flex:1,minWidth:130}}>
              {[
                { label:'مدفوعون ✅', count:paid.length, color:'var(--gT)', textColor:'var(--green)' },
                { label:'متأخرون ⚠️', count:late.length, color:'var(--gR)', textColor:'var(--rose)' },
              ].map(item => (
                <div key={item.label} style={{display:'flex',alignItems:'center',
                  gap:9,padding:'9px 0',
                  borderBottom:item.label.includes('مدفوعون')
                    ? '1px solid var(--bdr)' : 'none'}}>
                  <div style={{width:11,height:11,borderRadius:3,
                    background:item.color,flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700}}>{item.label}</div>
                    <div style={{fontSize:11,color:'var(--ink3)'}}>
                      {item.count} مشترك
                    </div>
                  </div>
                  <div style={{fontSize:16,fontWeight:900,color:item.textColor}}>
                    {subs.length ? Math.round(item.count/subs.length*100) : 0}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top debtors */}
      <div className="card fadeUp d4" style={{marginBottom:14}}>
        <div className="card-body">
          <div className="card-title">🏆 أكبر الديون</div>
          {!late.length ? (
            <div style={{textAlign:'center',padding:16,
              color:'var(--ink3)',fontSize:13}}>
              🎉 لا يوجد ديون!
            </div>
          ) : [...late]
            .sort((a,b) =>
              calcDebt(b,paidMap[b.id]||[]).length*b.monthly_fee -
              calcDebt(a,paidMap[a.id]||[]).length*a.monthly_fee)
            .slice(0, 5)
            .map((sub, i, arr) => {
              const d = calcDebt(sub, paidMap[sub.id]||[])
              const tot = d.length * sub.monthly_fee
              const maxT = Math.max(...late.map(s =>
                calcDebt(s, paidMap[s.id]||[]).length * s.monthly_fee))
              const pct = Math.round(tot / maxT * 100)
              const color = avatarColor(sub.name)
              return (
                <div key={sub.id} style={{
                  padding:'9px 0',
                  borderBottom: i < arr.length-1
                    ? '1px solid var(--bdr)' : 'none'}}>
                  <div style={{display:'flex',justifyContent:'space-between',
                    alignItems:'center',marginBottom:5}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:28,height:28,borderRadius:8,
                        background:`${color}22`,color,display:'flex',
                        alignItems:'center',justifyContent:'center',
                        fontWeight:900,fontSize:13}}>
                        {sub.name[0]}
                      </div>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,
                          cursor:'pointer'}}
                          onClick={() => navigate(`/subscribers/${sub.id}`)}>
                          {sub.name}
                        </div>
                        <div style={{fontSize:11,color:'var(--ink3)'}}>
                          {d.length} شهر
                        </div>
                      </div>
                    </div>
                    <div style={{fontSize:13,fontWeight:900,color:'var(--rose)'}}>
                      {fmt(tot)}
                    </div>
                  </div>
                  <div style={{height:4,background:'var(--bdr)',
                    borderRadius:4,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${pct}%`,
                      background:'var(--gR)',borderRadius:4}}/>
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}
        className="fadeUp d5">
        <button className="btn btn-primary" onClick={exportCSV}>
          📥 تصدير CSV
        </button>
        <button className="btn btn-ghost" onClick={printReport}>
          🖨️ طباعة
        </button>
      </div>
    </div>
  )
}
