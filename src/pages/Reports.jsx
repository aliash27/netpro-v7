import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth }  from '../context/AuthContext'
import { toast }    from '../components/Toast'
import { SkeletonStatGrid } from '../components/Skeleton'
import { calcDebt, buildPaidMap, fmt, moLabel, avatarColor, MO } from '../utils'

export default function Reports() {
  const { company } = useAuth()
  const navigate    = useNavigate()

  const [subs, setSubs]       = useState([])
  const [pays, setPays]       = useState([])
  const [paidMap, setPaidMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    setLoading(true)
    const [{ data: s, error: e1 }, { data: p, error: e2 }] = await Promise.all([
      supabase.from('subscribers').select('*')
        .eq('company_id', company.id).eq('is_active', true),
      supabase.from('payments').select('*')
        .eq('company_id', company.id)
    ])
    if (e1 || e2) { toast('خطأ في تحميل التقارير', 'e'); setLoading(false); return }
    setSubs(s || [])
    setPays(p || [])
    setPaidMap(buildPaidMap(p || []))
    setLoading(false)
  }

  function exportCSV() {
    const H = ['الاسم', 'الهاتف', 'تاريخ البداية', 'الرسم الشهري', 'آخر شهر مدفوع', 'أشهر الدين', 'إجمالي الدين', 'الحالة']
    const rows = subs.map(s => {
      const d = calcDebt(s, paidMap[s.id] || [])
      return [s.name, s.phone, s.start_date, s.monthly_fee,
        moLabel(s.last_paid_month), d.length,
        d.length * s.monthly_fee,
        d.length > 0 ? 'متأخر' : 'مدفوع']
    })
    const csv = [H, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const a   = document.createElement('a')
    a.href    = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `netpro_report_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    toast('تم تصدير ملف CSV ✅', 's')
  }

  function printReport() {
    const late = subs.filter(s => calcDebt(s, paidMap[s.id] || []).length > 0)
    const totD = late.reduce((a, s) => a + calcDebt(s, paidMap[s.id] || []).length * s.monthly_fee, 0)
    const totR = pays.reduce((a, p) => a + Number(p.amount), 0)
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير نيت برو</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Tajawal,sans-serif;direction:rtl;color:#0a0f1e;padding:24px;background:#f8faff}
.hdr{background:linear-gradient(135deg,#1a3fdb,#6144f5);color:#fff;border-radius:14px;padding:22px 24px;margin-bottom:20px}
.hdr h1{font-size:22px;font-weight:900}.hdr p{font-size:12px;opacity:.8;margin-top:4px}
.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.k{border:1.5px solid #dde3ff;border-radius:11px;padding:14px;background:#fff}
.kl{font-size:11px;color:#6b7cc4;font-weight:700;margin-bottom:4px}
.kv{font-size:20px;font-weight:900}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;margin-bottom:20px;box-shadow:0 2px 12px rgba(0,0,0,.06)}
th{background:#eef1fd;color:#3d4a6b;font-size:12px;font-weight:700;padding:10px 12px;text-align:right}
td{padding:9px 12px;border-bottom:1px solid #f1f4fd;font-size:13px}
tr:last-child td{border-bottom:none}
.ok{background:#dcfce7;color:#059669;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:800}
.wa{background:#fef3c7;color:#d97706;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:800}
.rd{background:#fee2e2;color:#e11d48;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:800}
.ft{text-align:center;color:#8b96bb;font-size:11px;margin-top:24px}
@media print{body{background:#fff;padding:14px}.np{display:none}}
</style></head><body>
<div class="hdr">
  <h1>📡 تقرير نيت برو</h1>
  <p>${company?.name || ''} — ${new Date().toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
</div>
<div class="kpi">
  <div class="k"><div class="kl">إجمالي المشتركين</div><div class="kv">${subs.length}</div></div>
  <div class="k"><div class="kl">المتأخرون</div><div class="kv" style="color:#e11d48">${late.length}</div></div>
  <div class="k"><div class="kl">إجمالي الديون</div><div class="kv" style="color:#e11d48;font-size:15px">${fmt(totD)}</div></div>
  <div class="k"><div class="kl">إجمالي الإيرادات</div><div class="kv" style="color:#059669;font-size:15px">${fmt(totR)}</div></div>
</div>
<table>
<thead><tr><th>#</th><th>الاسم</th><th>الهاتف</th><th>الرسم الشهري</th><th>آخر دفع</th><th>الحالة</th><th>الدين</th></tr></thead>
<tbody>
${subs.map((sub, i) => {
  const d = calcDebt(sub, paidMap[sub.id] || [])
  const badge = d.length >= 3 ? 'rd' : d.length > 0 ? 'wa' : 'ok'
  const label = d.length >= 3 ? `🔴 ${d.length} شهر` : d.length > 0 ? `⚠️ ${d.length} شهر` : '✅ مدفوع'
  return `<tr>
    <td>${i + 1}</td>
    <td style="font-weight:700">${sub.name}</td>
    <td>${sub.phone || '—'}</td>
    <td>${fmt(sub.monthly_fee)}</td>
    <td>${moLabel(sub.last_paid_month)}</td>
    <td><span class="${badge}">${label}</span></td>
    <td style="font-weight:700;color:${d.length ? '#e11d48' : '#059669'}">${d.length ? fmt(d.length * sub.monthly_fee) : '—'}</td>
  </tr>`
}).join('')}
</tbody></table>
<div class="ft">نيت برو v10 — ${new Date().toLocaleString('ar-IQ')}</div>
<br/><button class="np" onclick="window.print()" style="padding:10px 24px;background:#1a3fdb;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-family:Tajawal,sans-serif;font-weight:700">🖨️ طباعة</button>
</body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 600)
  }

  if (loading) return <div className="page"><SkeletonStatGrid /></div>

  const late = subs.filter(s => calcDebt(s, paidMap[s.id] || []).length > 0)
  const paid = subs.filter(s => calcDebt(s, paidMap[s.id] || []).length === 0)
  const totD = late.reduce((a, s) => a + calcDebt(s, paidMap[s.id] || []).length * s.monthly_fee, 0)
  const totR = pays.reduce((a, p) => a + Number(p.amount), 0)

  const now   = new Date()
  const last6 = []
  for (let i = 5; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    last6.push({ key, label: MO[d.getMonth()].slice(0, 4), rev: pays.filter(p => p.month === key).reduce((a, p) => a + Number(p.amount), 0) })
  }
  const maxR = Math.max(...last6.map(m => m.rev), 1)
  const curMoKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="page-title" style={{ marginBottom: 0 }}>📊 التقارير</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={exportCSV}>📥 CSV</button>
          <button className="btn btn-ghost btn-sm" style={{ width: 'auto' }} onClick={printReport}>🖨️</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stat-grid fadeUp">
        {[
          { icon: 'si-4', emoji: '💵', label: 'إجمالي الإيرادات', val: fmt(totR), cls: 'ok' },
          { icon: 'si-3', emoji: '💸', label: 'إجمالي الديون', val: fmt(totD), cls: 'danger' },
          { icon: 'si-1', emoji: '📈', label: 'نسبة الالتزام', val: `${subs.length ? Math.round(paid.length / subs.length * 100) : 0}%`, cls: '' },
          { icon: 'si-2', emoji: '📋', label: 'إجمالي الدفعات', val: pays.length, cls: 'warn' },
        ].map((k, i) => (
          <div key={i} className={`stat-card fadeUp d${i + 1}`}>
            <div className={`stat-icon ${k.icon}`}>{k.emoji}</div>
            <div className="stat-label">{k.label}</div>
            <div className={`stat-value ${k.cls}`} style={{ fontSize: 'clamp(11px,2.8vw,18px)' }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="card fadeUp d3" style={{ marginBottom: 14 }}>
        <div className="card-body">
          <div className="card-title">📈 الإيرادات الشهرية (آخر 6 أشهر)</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, height: 120, padding: '0 2px', marginTop: 8 }}>
            {last6.map((m, i) => {
              const h = Math.max(6, Math.round(m.rev / maxR * 96))
              const isCur = m.key === curMoKey
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)' }}>
                    {m.rev ? Math.round(m.rev / 1000) + 'k' : ''}
                  </div>
                  <div style={{
                    width: '100%', height: h, background: isCur ? 'var(--gP)' : 'rgba(26,63,219,.18)',
                    borderRadius: '6px 6px 3px 3px',
                    boxShadow: isCur ? '0 4px 14px rgba(26,63,219,.3)' : 'none',
                    transition: 'height .5s ease'
                  }} />
                  <div style={{ fontSize: 10, fontWeight: isCur ? 800 : 600, color: isCur ? 'var(--blue)' : 'var(--ink3)' }}>
                    {m.label}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Pie chart */}
      <div className="card fadeUp d4" style={{ marginBottom: 14 }}>
        <div className="card-body">
          <div className="card-title">🥧 توزيع المشتركين</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginTop: 8 }}>
            <div style={{ position: 'relative', width: 104, height: 104, flexShrink: 0 }}>
              <svg viewBox="0 0 36 36" style={{ width: 104, height: 104, transform: 'rotate(-90deg)' }}>
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--bdr)" strokeWidth="3.2" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="url(#gOK)" strokeWidth="3.2"
                  strokeDasharray={`${subs.length ? (paid.length / subs.length * 100).toFixed(1) : 0} 100`}
                  strokeLinecap="round" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="url(#gBAD)" strokeWidth="3.2"
                  strokeDasharray={`${subs.length ? (late.length / subs.length * 100).toFixed(1) : 0} 100`}
                  strokeDashoffset={`-${subs.length ? (paid.length / subs.length * 100).toFixed(1) : 0}`}
                  strokeLinecap="round" />
                <defs>
                  <linearGradient id="gOK"><stop offset="0%" stopColor="#059669" /><stop offset="100%" stopColor="#14b8a6" /></linearGradient>
                  <linearGradient id="gBAD"><stop offset="0%" stopColor="#e11d48" /><stop offset="100%" stopColor="#f43f5e" /></linearGradient>
                </defs>
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--ink)' }}>{subs.length}</div>
                <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600 }}>مشترك</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              {[
                { label: 'مدفوعون ✅', count: paid.length, color: 'var(--gT)', textColor: 'var(--green)' },
                { label: 'متأخرون ⚠️', count: late.length, color: 'var(--gR)', textColor: 'var(--rose)' },
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0', borderBottom: idx === 0 ? '1px solid var(--bdr)' : 'none' }}>
                  <div style={{ width: 11, height: 11, borderRadius: 3, background: item.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{item.count} مشترك</div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: item.textColor }}>
                    {subs.length ? Math.round(item.count / subs.length * 100) : 0}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top 5 debtors */}
      {late.length > 0 && (
        <div className="card fadeUp d5" style={{ marginBottom: 14 }}>
          <div className="card-body">
            <div className="card-title">🏆 أكبر الديون (Top 5)</div>
            {[...late]
              .sort((a, b) => calcDebt(b, paidMap[b.id] || []).length * b.monthly_fee - calcDebt(a, paidMap[a.id] || []).length * a.monthly_fee)
              .slice(0, 5)
              .map((sub, i, arr) => {
                const d   = calcDebt(sub, paidMap[sub.id] || [])
                const tot = d.length * sub.monthly_fee
                const maxT = calcDebt(arr[0], paidMap[arr[0].id] || []).length * arr[0].monthly_fee
                const pct  = Math.round(tot / maxT * 100)
                const col  = avatarColor(sub.name)
                return (
                  <div key={sub.id} style={{ padding: '9px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--bdr)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: `${col}22`, color: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13 }}>{sub.name[0]}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                            onClick={() => navigate(`/subscribers/${sub.id}`)}>{sub.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{d.length} شهر</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--rose)' }}>{fmt(tot)}</div>
                    </div>
                    <div style={{ height: 4, background: 'var(--bdr)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--gR)', borderRadius: 4, transition: 'width .6s ease' }} />
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }} className="fadeUp d6">
        <button className="btn btn-primary" onClick={exportCSV}>📥 تصدير CSV</button>
        <button className="btn btn-ghost" onClick={printReport}>🖨️ طباعة التقرير</button>
      </div>
    </div>
  )
}
