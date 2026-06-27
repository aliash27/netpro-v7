import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../components/Toast'
import { SkeletonList } from '../components/Skeleton'
import { confirm, ConfirmDialog, useConfirmDialog } from '../components/ConfirmDialog'

// ── Helpers ────────────────────────────────────────────────────
function getToday() {
  return new Date().toISOString().split('T')[0]
}

function fmt(n) {
  return Number(n || 0).toLocaleString('ar-IQ') + ' د.ع'
}

function avatarColor(name = '') {
  const colors = ['#1a3fdb', '#059669', '#d97706', '#e11d48', '#7c3aed', '#0d9488']
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % colors.length
  return colors[h]
}

function moKey(dateStr) {
  if (!dateStr) return null
  return String(dateStr).slice(0, 7)
}

function buildPaidSets(payments = []) {
  const map = {}
  for (const p of payments) {
    const key = moKey(p.paid_at)
    if (!key || !p.subscriber_id) continue
    if (!map[p.subscriber_id]) map[p.subscriber_id] = new Set()
    map[p.subscriber_id].add(key)
  }
  return map
}

function calcUnpaid(sub, paidSet) {
  if (!sub?.start_date) return []
  const now   = new Date()
  const curMo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const start = new Date(sub.start_date)
  const unpaid = []
  let y = start.getFullYear()
  let m = start.getMonth() + 1
  while (true) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    if (key >= curMo) break
    if (!paidSet?.has(key)) unpaid.push(key)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return unpaid
}

// ── Component ──────────────────────────────────────────────────
export default function Subscribers() {
  const { company, isViewer } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const dlg      = useConfirmDialog()

  const [subs,       setSubs]       = useState([])
  const [paidSets,   setPaidSets]   = useState({})
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [filter,     setFilter]     = useState('all')
  const [showModal,  setShowModal]  = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [csvText,    setCsvText]    = useState('')
  const [importing,  setImporting]  = useState(false)
  const [editId,     setEditId]     = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [form,       setForm]       = useState({
    name: '', phone: '', start_date: getToday(),
    monthly_fee: '', subscription_end: '', notes: '',
  })

  useEffect(() => { if (company?.id) load() }, [company?.id])
  useEffect(() => { if (location.state?.openAdd) openAdd() }, [location.state])

  // ── Data loading ───────────────────────────────────────────
  async function load() {
    setLoading(true)
    const [
      { data: subsData, error: e1 },
      { data: paysData, error: e2 },
    ] = await Promise.all([
      supabase
        .from('subscribers')
        .select('id, name, phone, start_date, monthly_fee, subscription_end, notes, created_at')
        .eq('company_id', company.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('payments')
        .select('subscriber_id, paid_at')
        .eq('company_id', company.id),
    ])

    if (e1) { toast('خطأ في تحميل المشتركين: ' + e1.message, 'e'); setLoading(false); return }
    if (e2) console.warn('payments load error:', e2.message)

    setSubs(subsData ?? [])
    setPaidSets(buildPaidSets(paysData ?? []))
    setLoading(false)
  }

  // ── Modal helpers ──────────────────────────────────────────
  function openAdd() {
    setEditId(null)
    setForm({ name: '', phone: '', start_date: getToday(), monthly_fee: '', subscription_end: '', notes: '' })
    setShowModal(true)
  }

  function openEdit(e, sub) {
    e.stopPropagation()
    setEditId(sub.id)
    setForm({
      name:             sub.name             ?? '',
      phone:            sub.phone            ?? '',
      start_date:       sub.start_date       ?? getToday(),
      monthly_fee:      sub.monthly_fee      ?? '',
      subscription_end: sub.subscription_end ?? '',
      notes:            sub.notes            ?? '',
    })
    setShowModal(true)
  }

  // ── Save subscriber ────────────────────────────────────────
  async function save() {
    if (!form.name.trim())    { toast('الاسم مطلوب', 'e'); return }
    if (!form.phone.trim())   { toast('رقم الهاتف مطلوب', 'e'); return }
    if (!form.start_date)     { toast('تاريخ البداية مطلوب', 'e'); return }
    if (!form.monthly_fee || parseFloat(form.monthly_fee) <= 0) {
      toast('الرسم الشهري يجب أن يكون أكبر من صفر', 'e'); return
    }

    setSaving(true)

    // Exact columns that exist in the schema — nothing extra
    const payload = {
      name:             form.name.trim(),
      phone:            form.phone.trim(),
      start_date:       form.start_date,
      monthly_fee:      parseFloat(form.monthly_fee),
      subscription_end: form.subscription_end || null,
      notes:            form.notes.trim(),
    }

    let error
    if (editId) {
      ;({ error } = await supabase.from('subscribers').update(payload).eq('id', editId))
    } else {
      ;({ error } = await supabase.from('subscribers').insert({
        ...payload,
        company_id: company.id,
        is_active:  true,
      }))
    }

    setSaving(false)

    if (error) { toast('خطأ: ' + error.message, 'e'); return }

    toast(editId ? 'تم تعديل البيانات ✅' : 'تم إضافة المشترك ✅', 's')
    setShowModal(false)
    load()
  }

  // ── Delete ─────────────────────────────────────────────────
  async function deleteSub(e, id, name) {
    e.stopPropagation()
    const yes = await confirm({
      title: `حذف ${name}؟`,
      body:  'سيتم أرشفة هذا المشترك ولن يظهر في القوائم.',
      danger: true,
    })
    if (!yes) return
    const { error } = await supabase.from('subscribers').update({ is_active: false }).eq('id', id)
    if (error) { toast('خطأ في الحذف', 'e'); return }
    toast('تم حذف المشترك', 's')
    load()
  }

  // ── CSV import ─────────────────────────────────────────────
  async function importFromCSV() {
    if (!csvText.trim()) { toast('الصق بيانات CSV أولاً', 'e'); return }
    setImporting(true)

    const lines = csvText.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) { toast('البيانات غير كافية', 'e'); setImporting(false); return }

    const sep    = lines[0].includes('\t') ? '\t' : ','
    const header = lines[0].split(sep).map(h => h.trim().replace(/"/g, '').toLowerCase())

    const findCol = (...keys) => {
      for (const k of keys) {
        const i = header.findIndex(h => h.includes(k))
        if (i >= 0) return i
      }
      return -1
    }

    const nameIdx  = findCol('اسم', 'name')
    const phoneIdx = findCol('هاتف', 'phone', 'موبايل', 'tel')
    const feeIdx   = findCol('شهري', 'fee', 'رسم', 'price', 'مبلغ')
    const dateIdx  = findCol('بداية', 'start', 'تاريخ', 'date')

    if (nameIdx < 0) { toast('لم يُعثر على عمود الاسم', 'e'); setImporting(false); return }

    let imported = 0, skipped = 0
    for (const line of lines.slice(1)) {
      const cols = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''))
      const name = cols[nameIdx]?.trim()
      if (!name) { skipped++; continue }

      const { error } = await supabase.from('subscribers').insert({
        company_id:  company.id,
        name,
        phone:       phoneIdx >= 0 ? cols[phoneIdx]?.trim() || '' : '',
        monthly_fee: feeIdx   >= 0 ? parseFloat(cols[feeIdx]) || 0 : 0,
        start_date:  dateIdx >= 0 && cols[dateIdx]?.trim()
          ? cols[dateIdx].trim().slice(0, 10)
          : getToday(),
        is_active: true,
      })
      if (!error) imported++; else skipped++
    }

    setImporting(false)
    toast(`تم استيراد ${imported} مشترك ✅ (تخطي: ${skipped})`, 's')
    if (imported > 0) { setShowImport(false); setCsvText(''); load() }
  }

  // ── Filtered list ──────────────────────────────────────────
  let list = subs
  if (search) {
    const q = search.toLowerCase()
    list = list.filter(s => s.name?.toLowerCase().includes(q) || s.phone?.includes(search))
  }
  if (filter === 'late') list = list.filter(s => calcUnpaid(s, paidSets[s.id]).length > 0)
  if (filter === 'paid') list = list.filter(s => calcUnpaid(s, paidSets[s.id]).length === 0)

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="page">
      <ConfirmDialog {...dlg} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="page-title" style={{ marginBottom: 0 }}>👥 المشتركون</div>
        {!isViewer && (
          <button className="btn btn-ghost btn-sm" style={{ width: 'auto' }}
            onClick={() => setShowImport(true)}>
            📥 استيراد CSV
          </button>
        )}
      </div>

      <div className="search-wrap">
        <span className="search-icon">🔍</span>
        <input className="search-input" placeholder="بحث باسم أو هاتف..."
          value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
      </div>

      <div className="chips">
        {[['all', 'الكل'], ['late', '⚠️ متأخرون'], ['paid', '✅ مدفوعون']].map(([v, l]) => (
          <div key={v} className={`chip ${filter === v ? 'active' : ''}`}
            onClick={() => setFilter(v)}>
            {l}
          </div>
        ))}
      </div>

      <div className="sec-header">
        <div className="sec-title">قائمة المشتركين</div>
        <div className="sec-count">{list.length}</div>
      </div>

      {loading ? (
        <SkeletonList count={6} />
      ) : list.length === 0 ? (
        <div className="empty-state">
          <div className="empty-art">👥</div>
          <div className="empty-title">لا يوجد مشتركون</div>
          <div className="empty-sub">
            {filter !== 'all' ? 'جرب تغيير الفلتر' : 'اضغط ➕ لإضافة أول مشترك'}
          </div>
        </div>
      ) : list.map(sub => {
        const unpaid = calcUnpaid(sub, paidSets[sub.id])
        const color  = avatarColor(sub.name)
        return (
          <div key={sub.id} className="sub-row"
            onClick={() => navigate(`/subscribers/${sub.id}`)}>
            <div className="sub-avatar" style={{ background: `${color}22`, color }}>
              {sub.name?.[0] ?? '?'}
            </div>
            <div className="sub-info">
              <div className="sub-name">{sub.name}</div>
              <div className="sub-phone">{sub.phone}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
              <span className={`badge ${unpaid.length ? 'badge-warn' : 'badge-ok'}`}>
                {unpaid.length ? `⚠️ ${unpaid.length} شهر` : '✅ مدفوع'}
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{fmt(sub.monthly_fee)}</span>
                {!isViewer && (
                  <>
                    <button onClick={e => openEdit(e, sub)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 2 }}>
                      ✏️
                    </button>
                    <button onClick={e => deleteSub(e, sub.id, sub.name)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 2 }}>
                      🗑
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {!isViewer && <button className="fab" onClick={openAdd}>+</button>}

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(4,8,22,.68)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{
            width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto',
            background: 'var(--sur)', borderRadius: '26px 26px 0 0',
            padding: '10px 20px 32px', borderTop: '1px solid var(--bdr)',
            animation: 'slideUp .35s ease',
          }}>
            <div style={{ width: 38, height: 4, background: 'var(--bdr)', borderRadius: 4, margin: '8px auto 18px' }} />
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              {editId ? '✏️ تعديل بيانات المشترك' : '➕ إضافة مشترك جديد'}
              <button onClick={() => setShowModal(false)} style={{
                marginRight: 'auto', width: 32, height: 32, borderRadius: '50%',
                background: 'var(--bg2)', border: 'none', cursor: 'pointer',
                color: 'var(--ink3)', fontSize: 15,
              }}>✕</button>
            </div>

            {[
              { label: 'الاسم الكامل *',         key: 'name',             type: 'text',   ph: 'أدخل الاسم الكامل', icon: '👤' },
              { label: 'رقم الهاتف *',           key: 'phone',            type: 'tel',    ph: '07XXXXXXXXX',        icon: '📞' },
              { label: 'تاريخ بداية الاشتراك *', key: 'start_date',       type: 'date',   ph: '',                   icon: '📅' },
              { label: 'الرسم الشهري (د.ع) *',   key: 'monthly_fee',      type: 'number', ph: '30000',              icon: '💰' },
              { label: 'تاريخ انتهاء الاشتراك',  key: 'subscription_end', type: 'date',   ph: '',                   icon: '🗓️' },
            ].map(f => (
              <div className="field" key={f.key}>
                <label className="field-label">{f.label}</label>
                <div className="field-wrap">
                  <span className="field-icon">{f.icon}</span>
                  <input className="field-input" type={f.type}
                    placeholder={f.ph} value={form[f.key] ?? ''}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              </div>
            ))}

            <div className="field">
              <label className="field-label">ملاحظات (اختياري)</label>
              <textarea className="field-input" rows={3} placeholder="أي ملاحظات..."
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>

            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? '⏳ جاري الحفظ...' : '💾 حفظ المشترك'}
            </button>
            <button className="btn btn-ghost" style={{ marginTop: 9 }} onClick={() => setShowModal(false)}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* ── CSV Import Modal ── */}
      {showImport && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(4,8,22,.75)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={e => e.target === e.currentTarget && setShowImport(false)}>
          <div style={{
            width: '100%', maxWidth: 560, background: 'var(--sur)',
            borderRadius: '26px 26px 0 0', padding: '10px 20px 36px',
            borderTop: '1px solid var(--bdr)', maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ width: 38, height: 4, background: 'var(--bdr)', borderRadius: 4, margin: '8px auto 18px' }} />
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              📥 استيراد من CSV
              <button onClick={() => setShowImport(false)} style={{
                marginRight: 'auto', width: 32, height: 32, borderRadius: '50%',
                background: 'var(--bg2)', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 15,
              }}>✕</button>
            </div>

            <div style={{
              background: 'rgba(26,63,219,.06)', borderRadius: 12,
              padding: '11px 14px', marginBottom: 14,
              fontSize: 13, color: 'var(--ink2)', lineHeight: 1.8,
            }}>
              <strong>الأعمدة المدعومة:</strong><br />
              الاسم، رقم الهاتف، الرسم الشهري، تاريخ البداية<br />
              <span style={{ fontSize: 11, color: 'var(--ink3)' }}>العمود الوحيد المطلوب هو "الاسم"</span>
            </div>

            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>
              الصق بيانات CSV:
            </label>
            <textarea style={{
              width: '100%', height: 180, padding: 12, borderRadius: 10,
              border: '1px solid var(--bdr)', background: 'var(--bg2)',
              color: 'var(--ink)', fontFamily: 'monospace', fontSize: 12,
              resize: 'vertical', outline: 'none', direction: 'ltr',
              boxSizing: 'border-box', marginBottom: 10,
            }}
              placeholder={'الاسم,الهاتف,الرسم الشهري\nأحمد محمد,07701234567,35000'}
              value={csvText}
              onChange={e => setCsvText(e.target.value)} />

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>
                أو ارفع ملف CSV:
              </label>
              <input type="file" accept=".csv,.txt" style={{ fontSize: 13, color: 'var(--ink)' }}
                onChange={e => {
                  const file = e.target.files[0]
                  if (!file) return
                  const r = new FileReader()
                  r.onload = ev => setCsvText(ev.target.result)
                  r.readAsText(file, 'utf-8')
                }} />
            </div>

            <button onClick={importFromCSV} disabled={importing || !csvText.trim()} style={{
              width: '100%', padding: 14, borderRadius: 12, border: 'none',
              background: csvText.trim() ? 'linear-gradient(135deg,#065f46,#059669)' : '#d1d5db',
              color: '#fff', fontWeight: 800, fontSize: 15,
              cursor: csvText.trim() ? 'pointer' : 'not-allowed',
              marginBottom: 9, fontFamily: 'inherit',
            }}>
              {importing ? '⏳ جاري الاستيراد...' : '📥 استيراد المشتركين'}
            </button>
            <button onClick={() => { setShowImport(false); setCsvText('') }} style={{
              width: '100%', padding: 12, borderRadius: 12,
              border: '1px solid var(--bdr)', background: 'transparent',
              color: 'var(--ink3)', fontWeight: 700, fontSize: 14,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      <style>{`
        .sec-count {
          font-size: 11px; font-weight: 700; color: var(--ink3);
          background: var(--bg2); border: 1px solid var(--bdr);
          padding: 3px 10px; border-radius: 20px;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
