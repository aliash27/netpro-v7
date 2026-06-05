import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../components/Toast'

function calcDebt(sub, paidMonths = []) {
  if (!sub?.start_date) return []
  const now = new Date()
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
