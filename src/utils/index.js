// ═══════════════════════════════════════════════════════════
// NetPro v10 — Shared Utilities
// Single source of truth — imported by all pages
// ═══════════════════════════════════════════════════════════

export const MO = [
  'كانون الثاني','شباط','آذار','نيسان','أيار','حزيران',
  'تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'
]

// Always computed fresh — never stale after midnight
export const getToday = () => new Date().toISOString().split('T')[0]
export const getCurMo = () => getToday().slice(0, 7)

// Iraqi Dinar formatter
export const fmt = (n) => Number(n || 0).toLocaleString('ar-IQ') + ' د.ع'

// Month label: "2025-06" → "حزيران 2025"
export const moLabel = (ym) => {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return `${MO[parseInt(m) - 1]} ${y}`
}

// Deterministic avatar color from name
export const avatarColor = (name = '') => {
  const colors = ['#1a3fdb','#059669','#d97706','#e11d48','#7c3aed','#0d9488']
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % colors.length
  return colors[h]
}

// Phone number validation (Iraqi format)
export const validatePhone = (phone) => {
  const cleaned = phone.replace(/\s/g, '')
  return /^(07\d{9}|9647\d{9}|\+9647\d{9})$/.test(cleaned)
}

// ─── Core debt calculation ────────────────────────────────────────────────────
// Returns array of unpaid month strings ["2025-01", "2025-02", ...]
export function calcDebt(sub, paidMonths = []) {
  if (!sub?.start_date) return []
  const now = new Date()
  const months = []

  if (paidMonths.length > 0) {
    const paidSet = new Set(paidMonths)
    const startD  = new Date(sub.start_date)
    let y = startD.getFullYear(), m = startD.getMonth() + 1
    while (new Date(y, m - 1) <= now) {
      const key = `${y}-${String(m).padStart(2, '0')}`
      if (!paidSet.has(key)) months.push(key)
      m++
      if (m > 12) { m = 1; y++ }
    }
    return months
  }

  if (sub.last_paid_month) {
    const [ly, lm] = sub.last_paid_month.split('-').map(Number)
    let y = ly, m = lm + 1
    if (m > 12) { m = 1; y++ }
    while (new Date(y, m - 1) <= now) {
      months.push(`${y}-${String(m).padStart(2, '0')}`)
      m++
      if (m > 12) { m = 1; y++ }
    }
    return months
  }

  const startD = new Date(sub.start_date)
  let y = startD.getFullYear(), m = startD.getMonth() + 1
  while (new Date(y, m - 1) <= now) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

// Build paidMap from payments array: { subId: ['2025-01', ...] }
export function buildPaidMap(payments = []) {
  const pm = {}
  for (const p of payments) {
    if (!pm[p.subscriber_id]) pm[p.subscriber_id] = []
    pm[p.subscriber_id].push(p.month)
  }
  return pm
}

// ─── Receipt Printer ─────────────────────────────────────────────────────────
export function printReceipt({ sub, month, amount, company, paidAt, recordedBy, mode }) {
  const fmtR     = n  => Number(n || 0).toLocaleString('ar-IQ') + ' د.ع'
  const moLabelR = ym => {
    if (!ym) return '—'
    const [y, m] = ym.split('-')
    return `${MO[parseInt(m) - 1]} ${y}`
  }

  if (mode === 'thermal') {
    const win = window.open('', '_blank', 'width=380,height=620')
    win.document.write(`<html dir="rtl"><head><meta charset="utf-8">
    <style>*{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',monospace;font-size:13px;width:72mm;margin:8px auto;padding:8px;background:#fff;color:#000}
    .c{text-align:center}.b{font-weight:bold}.big{font-size:16px}
    .sep{border-top:1px dashed #000;margin:6px 0}
    .row{display:flex;justify-content:space-between;margin:3px 0}
    button{width:100%;padding:8px;font-size:14px;cursor:pointer;margin-top:8px;border:1px solid #000;background:#fff}
    @media print{body{width:72mm}button{display:none}}</style></head><body>
    <div class="c b big">${company?.name || 'نيت برو'}</div>
    <div class="sep"></div><div class="c">وصل دفع اشتراك</div><div class="sep"></div>
    <div class="row"><span>الاسم:</span><span>${sub.name}</span></div>
    <div class="row"><span>الهاتف:</span><span>${sub.phone || '—'}</span></div>
    <div class="row"><span>الشهر:</span><span>${moLabelR(month)}</span></div>
    <div class="row"><span>المبلغ:</span><span class="b">${fmtR(amount)}</span></div>
    <div class="row"><span>التاريخ:</span><span>${paidAt}</span></div>
    <div class="row"><span>بواسطة:</span><span>${recordedBy}</span></div>
    <div class="sep"></div><div class="c">شكراً لاشتراككم 🙏</div>
    <button onclick="window.print()">🖨️ طباعة</button>
    </body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 400)

  } else if (mode === 'normal' || mode === 'pdf') {
    const win = window.open('', '_blank', 'width=620,height=720')
    win.document.write(`<html dir="rtl"><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
    <style>*{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Tajawal,sans-serif;background:#f0f4ff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
    .r{background:#fff;border-radius:20px;padding:40px;max-width:460px;width:100%;box-shadow:0 8px 40px rgba(26,63,219,.12)}
    .logo{text-align:center;font-size:40px;margin-bottom:6px}
    .co{text-align:center;font-size:22px;font-weight:900;color:#1a1a2e}
    .ti{text-align:center;font-size:13px;color:#6b7280;margin-bottom:22px}
    .sep{border:none;border-top:2px dashed #e5e7eb;margin:16px 0}
    .row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f3f4f6}
    .lbl{font-size:13px;color:#6b7280}.val{font-size:14px;font-weight:700;color:#111827}
    .amt{font-size:26px;font-weight:900;color:#059669}
    .ft{text-align:center;font-size:12px;color:#9ca3af;margin-top:18px}
    .btn{width:100%;padding:14px;font-size:15px;border-radius:12px;border:none;background:#1a3fdb;color:#fff;cursor:pointer;font-family:Tajawal,sans-serif;font-weight:700;margin-top:16px}
    @media print{body{background:#fff}.np{display:none}@page{margin:1.5cm}}</style></head><body>
    <div class="r"><div class="logo">📡</div>
    <div class="co">${company?.name || 'نيت برو'}</div>
    <div class="ti">وصل دفع اشتراك إنترنت</div><hr class="sep"/>
    <div class="row"><span class="lbl">اسم المشترك</span><span class="val">${sub.name}</span></div>
    <div class="row"><span class="lbl">رقم الهاتف</span><span class="val">${sub.phone || '—'}</span></div>
    <div class="row"><span class="lbl">الشهر المدفوع</span><span class="val">${moLabelR(month)}</span></div>
    <div class="row"><span class="lbl">المبلغ المدفوع</span><span class="amt">${fmtR(amount)}</span></div>
    <div class="row"><span class="lbl">تاريخ الدفع</span><span class="val">${paidAt}</span></div>
    <div class="row"><span class="lbl">بواسطة</span><span class="val">${recordedBy}</span></div>
    <hr class="sep"/><div class="ft">شكراً لثقتكم 🙏 — ${company?.name || ''}</div>
    <button class="np btn" onclick="window.print()">${mode === 'pdf' ? '📄 حفظ كـ PDF' : '🖨️ طباعة'}</button>
    </div></body></html>`)
    win.document.close()
    if (mode === 'pdf') setTimeout(() => win.print(), 500)

  } else if (mode === 'image') {
    const canvas = document.createElement('canvas')
    canvas.width  = 520
    canvas.height = 510
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 520, 510)
    const g = ctx.createLinearGradient(0, 0, 520, 100)
    g.addColorStop(0, '#1a3fdb')
    g.addColorStop(1, '#6144f5')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 520, 96)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 21px Arial'
    ctx.textAlign = 'center'
    ctx.fillText((company?.name || 'نيت برو'), 260, 42)
    ctx.font = '13px Arial'
    ctx.fillStyle = 'rgba(255,255,255,.8)'
    ctx.fillText('وصل دفع اشتراك', 260, 68)
    const rows = [
      ['الاسم', sub.name],
      ['الشهر', moLabelR(month)],
      ['المبلغ', fmtR(amount)],
      ['التاريخ', paidAt],
      ['بواسطة', recordedBy],
    ]
    rows.forEach(([label, val], i) => {
      const y = 124 + i * 58
      ctx.fillStyle = i % 2 === 0 ? '#f9fafb' : '#fff'
      ctx.fillRect(20, y - 22, 480, 52)
      ctx.fillStyle = '#6b7280'
      ctx.font = '13px Arial'
      ctx.textAlign = 'right'
      ctx.fillText(label, 490, y + 8)
      ctx.fillStyle = '#111827'
      ctx.font = 'bold 14px Arial'
      ctx.textAlign = 'left'
      ctx.fillText(val, 34, y + 8)
    })
    ctx.fillStyle = '#e5e7eb'
    ctx.fillRect(20, 422, 480, 1)
    ctx.fillStyle = '#9ca3af'
    ctx.font = '13px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('شكراً لثقتكم 🙏', 260, 456)
    const a = document.createElement('a')
    a.download = `receipt-${sub.name}-${month}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
  }
}
