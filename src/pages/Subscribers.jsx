import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../components/Toast'

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
function avatarColor(name) {
  const c = ['#1a3fdb','#059669','#d97706','#e11d48','#7c3aed','#0d9488']
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % c.length
  return c[h]
}

const today = new Date().toISOString().split('T')[0]
const curMo  = today.slice(0, 7)

export default function Subscribers() {
  const { company, isViewer } = useAuth()
  const navigate    = useNavigate()
  const location    = useLocation()

  const [subs, setSubs]     = useState([])
  const [paidMap, setPaidMap]  = useState({})
  const [showImport, setShowImport] = useState(false)
  const [csvText, setCsvText]       = useState('')
  const [importing, setImporting]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm]     = useState({
    name:'', phone:'', start_date: today,
    monthly_fee:'', last_paid_month:'', subscription_end:'', notes:''
  })

  useEffect(() => { if (company) load() }, [company])
  useEffect(() => {
    if (location.state?.openAdd) openAdd()
  }, [location.state])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('subscribers').select('*')
      .eq('company_id', company.id).eq('is_active', true)
      .order('created_at', { ascending: false })
    setSubs(data || [])
    // Fetch paid months for accurate debt calculation
    const { data: paysData } = await supabase
      .from('payments').select('subscriber_id, month')
      .eq('company_id', company.id)
    const pm = {}
    for (const p of (paysData||[])) {
      if (!pm[p.subscriber_id]) pm[p.subscriber_id] = []
      pm[p.subscriber_id].push(p.month)
    }
    setPaidMap(pm)
    setLoading(false)
  }

  function openAdd() {
    setEditId(null)
    setForm({ name:'', phone:'', start_date: today,
      monthly_fee:'', last_paid_month: curMo, notes:'' })
    setShowModal(true)
  }

  function openEdit(sub) {
    setEditId(sub.id)
    setForm({
      name: sub.name, phone: sub.phone,
      start_date: sub.start_date,
      monthly_fee: sub.monthly_fee,
      last_paid_month: sub.last_paid_month || '',
      subscription_end: sub.subscription_end || '',
      notes: sub.notes || ''
    })
    setShowModal(true)
  }

  async function save() {
    if (!form.name || !form.phone || !form.start_date || !form.monthly_fee) {
      toast('يرجى ملء الحقول المطلوبة *', 'e'); return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      start_date: form.start_date,
      monthly_fee: parseFloat(form.monthly_fee),
      last_paid_month: form.last_paid_month || (() => {
        const d = new Date(form.start_date)
        d.setMonth(d.getMonth() - 1)
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      })(),
      subscription_end: form.subscription_end || null,
      notes: form.notes.trim()
    }

    if (editId) {
      const { error } = await supabase
        .from('subscribers').update(payload).eq('id', editId)
      if (error) { toast('خطأ في التعديل', 'e'); setSaving(false); return }
      toast('تم تعديل البيانات ✅', 's')
    } else {
      const { error } = await supabase
        .from('subscribers')
        .insert({ ...payload, company_id: company.id })
      if (error) { toast('خطأ في الإضافة', 'e'); setSaving(false); return }
      toast('تم إضافة المشترك ✅', 's')
    }
    setSaving(false)
    setShowModal(false)
    load()
  }

  async function deleteSub(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المشترك؟')) return
    await supabase.from('subscribers').update({ is_active: false }).eq('id', id)
    toast('تم حذف المشترك', 's')
    load()
  }

  let list = subs
  if (search) list = list.filter(s =>
    s.name.includes(search) || s.phone.includes(search))
  if (filter === 'late') list = list.filter(s => calcDebt(s, paidMap[s.id]||[]).length > 0)
  if (filter === 'paid') list = list.filter(s => calcDebt(s, paidMap[s.id]||[]).length === 0)

  async function importFromCSV() {
    if (!csvText.trim()) { toast('الصق بيانات CSV أولاً','e'); return }
    setImporting(true)
    const lines = csvText.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) { toast('البيانات غير كافية','e'); setImporting(false); return }
    
    // Parse header to find columns
    const sep    = lines[0].includes('\t') ? '\t' : ','
    const header = lines[0].split(sep).map(h => h.trim().replace(/"/g,'').toLowerCase())
    
    const findCol = (...keys) => {
      for (const k of keys) {
        const i = header.findIndex(h => h.includes(k))
        if (i >= 0) return i
      }
      return -1
    }
    
    const nameIdx  = findCol('اسم','name')
    const phoneIdx = findCol('هاتف','phone','موبايل','tel')
    const feeIdx   = findCol('شهري','fee','رسم','price','مبلغ')
    const dateIdx  = findCol('بداية','start','تاريخ','date')
    const paidIdx  = findCol('مدفوع','paid','last')

    if (nameIdx < 0) { toast('لم يُعثر على عمود الاسم في CSV','e'); setImporting(false); return }

    let imported = 0, skipped = 0
    for (const line of lines.slice(1)) {
      const cols = line.split(sep).map(v => v.trim().replace(/^"|"$/g,''))
      const name = cols[nameIdx]?.trim()
      if (!name) { skipped++; continue }

      const payload = {
        company_id:    company.id,
        name,
        phone:         phoneIdx >= 0 ? cols[phoneIdx]?.trim() || '' : '',
        monthly_fee:   feeIdx   >= 0 ? parseFloat(cols[feeIdx]) || 0 : 0,
        start_date:    dateIdx  >= 0 && cols[dateIdx]?.trim()
                         ? cols[dateIdx].trim().slice(0,10)
                         : new Date().toISOString().slice(0,10),
        last_paid_month: paidIdx >= 0 ? cols[paidIdx]?.trim() || null : null,
        is_active:     true,
      }

      const { error } = await supabase.from('subscribers').insert(payload)
      if (!error) imported++; else skipped++
    }
    
    setImporting(false)
    toast(`تم استيراد ${imported} مشترك ✅ (تخطي: ${skipped})`, 's')
    if (imported > 0) { setShowImport(false); setCsvText(''); load() }
  }

  return (
    <div className="page">
      <div className="page-title">المشتركون</div>

      <div className="search-wrap">
        <span className="search-icon">🔍</span>
        <input className="search-input" placeholder="بحث باسم أو هاتف..."
          value={search} onChange={e => setSearch(e.target.value)} />
        {search && (
          <button className="search-clear" onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      <div className="chips">
        {[['all','الكل'],['late','⚠️ متأخرون'],['paid','✅ مدفوعون']].map(([v,l]) => (
          <div key={v} className={`chip ${filter===v?'active':''}`}
            onClick={() => setFilter(v)}>{l}</div>
        ))}
      </div>

      <div className="sec-header">
        <div className="sec-title">قائمة المشتركين</div>
        <div className="sec-count">{list.length}</div>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:40,fontSize:24}}>⏳</div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <div className="empty-art">👥</div>
          <div className="empty-title">لا يوجد مشتركون</div>
          <div className="empty-sub">جرب تغيير الفلتر أو أضف مشتركاً جديداً</div>
        </div>
      ) : list.map(sub => {
        const d = calcDebt(sub, paidMap[sub.id]||[])
        const color = avatarColor(sub.name)
        return (
          <div key={sub.id} className="sub-row"
            onClick={() => navigate(`/subscribers/${sub.id}`)}>
            <div className="sub-avatar" style={{background:`${color}22`,color}}>
              {sub.name[0]}
            </div>
            <div className="sub-info">
              <div className="sub-name">{sub.name}</div>
              <div className="sub-phone">{sub.phone}</div>
            </div>
            <div style={{display:'flex',flexDirection:'column',
              alignItems:'flex-end',gap:5,flexShrink:0}}>
              <span className={`badge ${d.length?'badge-warn':'badge-ok'}`}>
                {d.length ? `⚠️ ${d.length} شهر` : '✅ مدفوع'}
              </span>
              {sub.subscription_end && new Date(sub.subscription_end) <= new Date(Date.now()+7*86400000) && (
                <span style={{fontSize:10,background:'rgba(225,29,72,.1)',color:'#e11d48',
                  padding:'1px 6px',borderRadius:20,fontWeight:700}}>
                  {new Date(sub.subscription_end) < new Date() ? '🔴 منتهي' : '⏳ قريباً'}
                </span>
              )}
              <span style={{fontSize:11,color:'var(--ink3)'}}>
                {fmt(sub.monthly_fee)}
              </span>
            </div>
          </div>
        )
      })}

      {!isViewer && <button className="fab" onClick={openAdd}>+</button>}

      {/* Modal Add/Edit */}
      {showModal && (
        <div className="modal-overlay open" onClick={e => {
          if (e.target === e.currentTarget) setShowModal(false)
        }}>
          <div className="modal-sheet">
            <div className="modal-pill" />
            <div className="modal-header">
              <span>{editId ? '✏️' : '➕'}</span>
              <span>{editId ? 'تعديل بيانات المشترك' : 'إضافة مشترك جديد'}</span>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {[
              { label:'الاسم الكامل *', key:'name', type:'text', ph:'أدخل الاسم الكامل', icon:'👤' },
              { label:'رقم الهاتف *', key:'phone', type:'tel', ph:'07XXXXXXXXX', icon:'📞' },
              { label:'تاريخ بداية الاشتراك *', key:'start_date', type:'date', ph:'', icon:'📅' },
              { label:'الرسم الشهري (د.ع) *', key:'monthly_fee', type:'number', ph:'30000', icon:'💰' },
              { label:'آخر شهر مدفوع', key:'last_paid_month', type:'month', ph:'', icon:'📅' },
              { label:'تاريخ انتهاء الاشتراك', key:'subscription_end', type:'date', ph:'', icon:'🗓️' },
            ].map(f => (
              <div className="field" key={f.key}>
                <label className="field-label">{f.label}</label>
                <div className="field-wrap">
                  <span className="field-icon">{f.icon}</span>
                  <input className="field-input" type={f.type}
                    placeholder={f.ph} value={form[f.key]}
                    onChange={e => setForm({...form,[f.key]:e.target.value})} />
                </div>
              </div>
            ))}

            <div className="field">
              <label className="field-label">ملاحظات (اختياري)</label>
              <textarea className="field-input" rows={3}
                placeholder="أي ملاحظات..."
                value={form.notes}
                onChange={e => setForm({...form,notes:e.target.value})} />
            </div>

            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? '⏳ جاري الحفظ...' : '💾 حفظ المشترك'}
            </button>
            <button className="btn btn-ghost" style={{marginTop:9}}
              onClick={() => setShowModal(false)}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* ════ CSV Import Modal ════ */}
      {showImport && (
        <div style={{position:'fixed',inset:0,zIndex:500,
          background:'rgba(4,8,22,.75)',backdropFilter:'blur(8px)',
          display:'flex',alignItems:'flex-end',justifyContent:'center'}}
          onClick={e=>{if(e.target===e.currentTarget)setShowImport(false)}}>
          <div style={{width:'100%',maxWidth:560,background:'var(--sur)',
            borderRadius:'26px 26px 0 0',padding:'10px 20px 36px',
            borderTop:'1px solid var(--bdr)',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{width:38,height:4,background:'var(--bdr)',
              borderRadius:4,margin:'8px auto 18px'}}/>
            <div style={{fontSize:17,fontWeight:800,color:'var(--ink)',
              marginBottom:6,display:'flex',alignItems:'center',gap:10}}>
              📥 استيراد مشتركين من CSV أو Google Sheets
              <button onClick={()=>setShowImport(false)}
                style={{marginRight:'auto',width:32,height:32,borderRadius:'50%',
                  background:'var(--bg2)',border:'none',cursor:'pointer',
                  color:'var(--ink3)',fontSize:15}}>✕</button>
            </div>

            <div style={{background:'rgba(26,63,219,.06)',borderRadius:12,
              padding:'11px 14px',marginBottom:14,fontSize:13,color:'var(--ink2)',lineHeight:1.8}}>
              <strong>تنسيق الأعمدة المدعومة:</strong><br/>
              الاسم، رقم الهاتف، الرسم الشهري، تاريخ البداية، آخر شهر مدفوع<br/>
              <span style={{fontSize:11,color:'var(--ink3)'}}>
                ملاحظة: العمود الوحيد المطلوب هو "الاسم"، الباقي اختياري
              </span>
            </div>

            <div style={{background:'rgba(5,150,105,.06)',border:'1px solid rgba(5,150,105,.2)',
              borderRadius:12,padding:'11px 14px',marginBottom:14,fontSize:12,
              color:'var(--ink2)',lineHeight:1.8}}>
              <strong>📊 لجلب من Google Sheets:</strong><br/>
              1. افتح الجدول → File → Download → CSV<br/>
              2. افتح الملف بـ Notepad وانسخ المحتوى<br/>
              3. الصقه في الحقل أدناه
            </div>

            <div style={{marginBottom:14}}>
              <label style={{fontSize:13,fontWeight:700,color:'var(--ink2)',
                display:'block',marginBottom:6}}>
                الصق بيانات CSV هنا:
              </label>
              <textarea
                style={{width:'100%',height:180,padding:12,borderRadius:10,
                  border:'1px solid var(--bdr)',background:'var(--bg2)',
                  color:'var(--ink)',fontFamily:'monospace',fontSize:12,
                  resize:'vertical',outline:'none',direction:'ltr',
                  boxSizing:'border-box'}}
                placeholder={"الاسم,الهاتف,الرسم الشهري,تاريخ البداية\nأحمد محمد,07701234567,35000,2025-01-01\nعلي حسن,07709876543,25000,2025-03-01"}
                value={csvText}
                onChange={e=>setCsvText(e.target.value)}/>
            </div>

            {/* File upload option */}
            <div style={{marginBottom:14}}>
              <label style={{fontSize:13,fontWeight:700,color:'var(--ink2)',
                display:'block',marginBottom:6}}>
                أو ارفع ملف CSV:
              </label>
              <input type="file" accept=".csv,.txt"
                style={{fontSize:13,color:'var(--ink)'}}
                onChange={e=>{
                  const file = e.target.files[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = ev => setCsvText(ev.target.result)
                  reader.readAsText(file,'utf-8')
                }}/>
            </div>

            <button onClick={importFromCSV} disabled={importing || !csvText.trim()}
              style={{width:'100%',padding:14,borderRadius:12,border:'none',
                background: csvText.trim()
                  ? 'linear-gradient(135deg,#065f46,#059669)' : '#d1d5db',
                color:'#fff',fontWeight:800,fontSize:15,
                cursor:csvText.trim()?'pointer':'not-allowed',marginBottom:9}}>
              {importing ? '⏳ جاري الاستيراد...' : '📥 استيراد المشتركين'}
            </button>
            <button onClick={()=>{setShowImport(false);setCsvText('')}}
              style={{width:'100%',padding:12,borderRadius:12,
                border:'1px solid var(--bdr)',background:'transparent',
                color:'var(--ink3)',fontWeight:700,fontSize:14,cursor:'pointer'}}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay { position:fixed;inset:0;z-index:500;background:rgba(4,8,22,.68);
          backdrop-filter:blur(8px);display:flex;align-items:flex-end;
          justify-content:center; }
        .modal-sheet { width:100%;max-width:560px;max-height:92vh;overflow-y:auto;
          background:var(--sur);border-radius:26px 26px 0 0;
          padding:10px 20px 32px;animation:slideUp .38s ease;
          border-top:1px solid var(--bdr); }
        .modal-pill { width:38px;height:4px;background:var(--bdr);
          border-radius:4px;margin:8px auto 18px; }
        .modal-header { font-size:17px;font-weight:800;color:var(--ink);
          margin-bottom:20px;display:flex;align-items:center;gap:10px; }
        .modal-close { margin-right:auto;width:32px;height:32px;border-radius:50%;
          background:var(--bg2);border:none;color:var(--ink3);
          display:flex;align-items:center;justify-content:center;
          font-size:15px;cursor:pointer; }
        @keyframes slideUp {
          from{opacity:0;transform:translateY(100%)}
          to{opacity:1;transform:translateY(0)}
        }
        .sec-count { font-size:11px;font-weight:700;color:var(--ink3);
          background:var(--bg2);border:1px solid var(--bdr);
          padding:3px 10px;border-radius:20px; }
      `}</style>
    </div>
  )
}
