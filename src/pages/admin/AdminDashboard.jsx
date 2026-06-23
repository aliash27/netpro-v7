// src/pages/admin/AdminDashboard.jsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

// ── Plan definitions ───────────────────────────────────────────
const PLANS = [
  { key: 'trial',    label: 'تجريبي',    color: '#6b7280', price: 0,   maxSubs: 50   },
  { key: 'starter',  label: 'البداية',   color: '#3b82f6', price: 5,   maxSubs: 100  },
  { key: 'pro',      label: 'الاحترافي', color: '#8b5cf6', price: 12,  maxSubs: 99999 },
  { key: 'business', label: 'الأعمال',   color: '#f59e0b', price: 25,  maxSubs: 99999 },
]

function planLabel(plan) { return PLANS.find(p => p.key === plan)?.label ?? plan ?? '—' }
function planColor(plan) { return PLANS.find(p => p.key === plan)?.color ?? '#6b7280' }
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' })
}
function daysLeft(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - Date.now()) / 86400000)
}

// ── Reusable icon button ───────────────────────────────────────
function Btn({ onClick, color, title, children, disabled = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        background: color + '22', color, border: `1px solid ${color}44`,
        borderRadius: 8, width: 36, height: 36, cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .2s', opacity: disabled ? .5 : 1,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = color + '44' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = color + '22' }}
    >
      {children}
    </button>
  )
}

// ── Toast helper ───────────────────────────────────────────────
function Toast({ toast }) {
  if (!toast) return null
  return (
    <div style={{
      position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, padding: '12px 28px', borderRadius: 10, fontWeight: 600,
      background: toast.type === 'error' ? '#ef4444' : '#10b981',
      color: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,.5)',
      whiteSpace: 'nowrap', animation: 'npFadeIn .2s ease',
    }}>
      {toast.msg}
    </div>
  )
}

// ── CompanyCard ────────────────────────────────────────────────
function CompanyCard({ comp, subCounts, onEdit, onToggle, onDelete, onReset, onExtend }) {
  const isActive = comp.is_active !== false
  const dl = daysLeft(comp.trial_end || comp.plan_end_date)
  const expiring = dl !== null && dl <= 7 && dl > 0
  const expired  = dl !== null && dl <= 0

  return (
    <div style={{
      background: '#1e293b', borderRadius: 14, padding: '16px 20px',
      border: `1px solid ${expired ? '#ef444450' : expiring ? '#f59e0b50' : '#334155'}`,
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'start',
      opacity: isActive ? 1 : .65, transition: 'border .2s',
    }}>
      <div>
        {/* Name + badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#f1f5f9' }}>{comp.name}</span>
          <span style={{
            background: planColor(comp.plan) + '25', color: planColor(comp.plan),
            borderRadius: 6, padding: '2px 9px', fontSize: 11, fontWeight: 700,
          }}>{planLabel(comp.plan)}</span>
          {!isActive && (
            <span style={{ background: '#ef444420', color: '#ef4444', borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>
              🔒 معطّل
            </span>
          )}
          {expired && (
            <span style={{ background: '#ef444420', color: '#ef4444', borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>
              🔴 منتهي
            </span>
          )}
          {expiring && !expired && (
            <span style={{ background: '#f59e0b20', color: '#f59e0b', borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>
              ⏳ {dl} أيام
            </span>
          )}
        </div>

        {/* Info row */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#94a3b8' }}>
          {comp.email && <span>📧 {comp.email}</span>}
          {comp.phone && <span>📞 {comp.phone}</span>}
          {comp.city  && <span>📍 {comp.city}</span>}
          <span>👥 {subCounts[comp.id] ?? 0} مشترك</span>
          <span>📅 {fmtDate(comp.created_at)}</span>
          {(comp.trial_end || comp.plan_end_date) && (
            <span style={{ color: expired ? '#ef4444' : expiring ? '#f59e0b' : '#10b981' }}>
              🗓 ينتهي: {fmtDate(comp.trial_end || comp.plan_end_date)}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <Btn onClick={onEdit}   color="#3b82f6" title="تعديل">✏️</Btn>
        <Btn onClick={onExtend} color="#10b981" title="+30 يوم">📅</Btn>
        <Btn onClick={onToggle} color={isActive ? '#f59e0b' : '#10b981'} title={isActive ? 'تعطيل' : 'تفعيل'}>
          {isActive ? '🔒' : '🔓'}
        </Btn>
        <Btn onClick={onReset}  color="#8b5cf6" title="إعادة كلمة المرور">🔑</Btn>
        <Btn onClick={onDelete} color="#ef4444" title="حذف نهائي">🗑️</Btn>
      </div>
    </div>
  )
}

// ── RequestCard ────────────────────────────────────────────────
function RequestCard({ req, onApprove, onReject }) {
  const SC = { pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444' }
  const SL = { pending: '⏳ معلق', approved: '✅ مقبول', rejected: '❌ مرفوض' }
  const sc = SC[req.status] ?? '#6b7280'

  return (
    <div style={{ background: '#1e293b', borderRadius: 14, padding: '18px 22px', border: `1px solid ${sc}44` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#f1f5f9' }}>
              {req.companies?.name ?? req.company_id}
            </span>
            <span style={{ background: sc + '22', color: sc, borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
              {SL[req.status]}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#94a3b8' }}>
            <span>📧 {req.companies?.email ?? '—'}</span>
            <span>📦 {planLabel(req.plan_key)}</span>
            {req.amount && <span>💰 ${req.amount}</span>}
            <span>🕐 {fmtDate(req.requested_at)}</span>
          </div>
          {req.payment_image_url && (
            <a href={req.payment_image_url} target="_blank" rel="noreferrer"
              style={{ display: 'inline-block', marginTop: 8, color: '#3b82f6', fontSize: 12, textDecoration: 'underline' }}>
              🖼️ عرض صورة الدفع
            </a>
          )}
          {req.admin_notes && (
            <div style={{ marginTop: 8, background: '#0f172a', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#94a3b8' }}>
              💬 {req.admin_notes}
            </div>
          )}
        </div>

        {req.status === 'pending' ? (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={onApprove} style={{
              background: '#10b98122', color: '#10b981', border: '1px solid #10b98144',
              borderRadius: 10, padding: '8px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
            }}>✓ قبول</button>
            <button onClick={onReject} style={{
              background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444',
              borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
            }}>✕ رفض</button>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#475569', flexShrink: 0 }}>
            {req.reviewed_by} — {fmtDate(req.reviewed_at)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── EditModal ──────────────────────────────────────────────────
function EditModal({ comp, onSave, onClose }) {
  const [form, setForm] = useState({
    name:         comp.name         ?? '',
    email:        comp.email        ?? '',
    phone:        comp.phone        ?? '',
    city:         comp.city         ?? '',
    plan:         comp.plan         ?? 'trial',
    plan_end_date: comp.plan_end_date
      ? new Date(comp.plan_end_date).toISOString().split('T')[0]
      : comp.trial_end
        ? new Date(comp.trial_end).toISOString().split('T')[0]
        : '',
    max_subscribers: comp.max_subscribers ?? 99999,
    is_active:    comp.is_active !== false,
  })

  const inp = {
    background: '#0f172a', border: '1px solid #334155', borderRadius: 10,
    padding: '10px 14px', color: '#fff', fontSize: 14, width: '100%',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }

  function handlePlanChange(planKey) {
    const p = PLANS.find(x => x.key === planKey)
    setForm(prev => ({
      ...prev,
      plan: planKey,
      max_subscribers: p?.maxSubs ?? prev.max_subscribers,
    }))
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: '#1e293b', borderRadius: 18, padding: 28,
        width: '100%', maxWidth: 540, border: '1px solid #334155',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9', marginBottom: 22 }}>
          ✏️ تعديل بيانات الشركة
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          {/* Name */}
          <div>
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 5, fontWeight: 700 }}>
              اسم الشركة *
            </label>
            <input style={inp} value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>

          {/* Email */}
          <div>
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 5, fontWeight: 700 }}>
              البريد الإلكتروني
            </label>
            <input style={inp} type="email" value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </div>

          {/* Phone + City */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 5, fontWeight: 700 }}>
                رقم الهاتف
              </label>
              <input style={inp} value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 5, fontWeight: 700 }}>
                المدينة
              </label>
              <input style={inp} value={form.city}
                onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
            </div>
          </div>

          {/* Plan selector */}
          <div>
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 8, fontWeight: 700 }}>
              الباقة
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7 }}>
              {PLANS.map(p => (
                <button key={p.key} onClick={() => handlePlanChange(p.key)} style={{
                  padding: '9px 4px', borderRadius: 9, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: form.plan === p.key ? 800 : 600,
                  border: `2px solid ${form.plan === p.key ? p.color : '#334155'}`,
                  background: form.plan === p.key ? p.color + '20' : '#0f172a',
                  color: form.plan === p.key ? p.color : '#64748b',
                  transition: 'all .18s',
                }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Plan expiry + max subs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 5, fontWeight: 700 }}>
                تاريخ انتهاء الباقة
              </label>
              <input type="date" style={inp} value={form.plan_end_date}
                onChange={e => setForm(p => ({ ...p, plan_end_date: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 5, fontWeight: 700 }}>
                حد المشتركين
              </label>
              <input type="number" style={inp} value={form.max_subscribers}
                onChange={e => setForm(p => ({ ...p, max_subscribers: parseInt(e.target.value) || 0 }))} />
            </div>
          </div>

          {/* Active toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_active}
              onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#10b981' }} />
            <span style={{ fontSize: 14, color: '#e2e8f0' }}>الحساب نشط</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={() => onSave(form)} style={{
            background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff',
            border: 'none', borderRadius: 10, padding: '11px 26px',
            cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
          }}>
            💾 حفظ التعديلات
          </button>
          <button onClick={onClose} style={{
            background: '#334155', color: '#cbd5e1', border: 'none',
            borderRadius: 10, padding: '11px 20px', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CreateModal ────────────────────────────────────────────────
function CreateModal({ onSave, onClose }) {
  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '', plan: 'trial',
  })
  const [saving, setSaving] = useState(false)

  const inp = {
    background: '#0f172a', border: '1px solid #334155', borderRadius: 10,
    padding: '10px 14px', color: '#fff', fontSize: 14, width: '100%',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }

  async function handleSave() {
    if (!form.name || !form.email || !form.password) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: '#1e293b', borderRadius: 18, padding: 28,
        width: '100%', maxWidth: 460, border: '1px solid #10b98144',
      }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9', marginBottom: 22 }}>
          ➕ إنشاء حساب شركة جديد
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          {[
            { label: 'اسم الشركة *',        key: 'name',     type: 'text',     ph: 'شركة الاتصالات...' },
            { label: 'البريد الإلكتروني *',  key: 'email',    type: 'email',    ph: 'info@company.com' },
            { label: 'كلمة المرور *',        key: 'password', type: 'password', ph: '6 أحرف على الأقل' },
            { label: 'رقم الهاتف (اختياري)', key: 'phone',    type: 'tel',      ph: '07XXXXXXXXX' },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 5, fontWeight: 700 }}>
                {f.label}
              </label>
              <input type={f.type} placeholder={f.ph} style={inp}
                value={form[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
            </div>
          ))}

          {/* Plan */}
          <div>
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 8, fontWeight: 700 }}>
              الباقة الابتدائية
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7 }}>
              {PLANS.map(p => (
                <button key={p.key} onClick={() => setForm(prev => ({ ...prev, plan: p.key }))} style={{
                  padding: '8px 4px', borderRadius: 9, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 11, fontWeight: form.plan === p.key ? 800 : 600,
                  border: `2px solid ${form.plan === p.key ? p.color : '#334155'}`,
                  background: form.plan === p.key ? p.color + '20' : '#0f172a',
                  color: form.plan === p.key ? p.color : '#64748b',
                }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={handleSave} disabled={saving || !form.name || !form.email || !form.password} style={{
            background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff',
            border: 'none', borderRadius: 10, padding: '11px 26px',
            cursor: (saving || !form.name || !form.email || !form.password) ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
            opacity: (saving || !form.name || !form.email || !form.password) ? .6 : 1,
          }}>
            {saving ? '⏳ جاري الإنشاء...' : '✅ إنشاء الحساب'}
          </button>
          <button onClick={onClose} style={{
            background: '#334155', color: '#cbd5e1', border: 'none',
            borderRadius: 10, padding: '11px 20px', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════
export default function AdminDashboard() {
  const { isSuperAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  const [companies,     setCompanies]     = useState([])
  const [subCounts,     setSubCounts]     = useState({})  // { companyId: count }
  const [requests,      setRequests]      = useState([])
  const [stats,         setStats]         = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [search,        setSearch]        = useState('')
  const [filterPlan,    setFilterPlan]    = useState('all')
  const [filterStatus,  setFilterStatus]  = useState('all')
  const [tab,           setTab]           = useState('companies')
  const [editModal,     setEditModal]     = useState(null)
  const [createModal,   setCreateModal]   = useState(false)
  const [confirmDel,    setConfirmDel]    = useState(null)
  const [toast,         setToast]         = useState(null)
  const [deleting,      setDeleting]      = useState(false)

  // ── Guard ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSuperAdmin) navigate('/dashboard', { replace: true })
  }, [isSuperAdmin, navigate])

  // ── Show toast ───────────────────────────────────────────────
  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Load all data ────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch all companies except super-admin's own row
      const { data: comps, error: cErr } = await supabase
        .from('companies')
        .select('*')
        .or('is_super_admin.is.null,is_super_admin.eq.false')
        .order('created_at', { ascending: false })

      if (cErr) throw cErr

      // Filter out the is_admin rows too (belt-and-suspenders)
      const nonAdmin = (comps ?? []).filter(c => !c.is_super_admin && !c.is_admin)
      setCompanies(nonAdmin)

      // Subscriber counts per company — single efficient query
      const { data: subsRaw } = await supabase
        .from('subscribers')
        .select('company_id')
        .eq('is_active', true)

      const counts = {}
      for (const s of subsRaw ?? []) {
        counts[s.company_id] = (counts[s.company_id] ?? 0) + 1
      }
      setSubCounts(counts)

      // Stats
      const total    = nonAdmin.length
      const active   = nonAdmin.filter(c => c.is_active !== false).length
      const trial    = nonAdmin.filter(c => c.plan === 'trial').length
      const paid     = nonAdmin.filter(c => !['trial', 'free', null].includes(c.plan)).length
      const expiring = nonAdmin.filter(c => {
        const dl = daysLeft(c.trial_end || c.plan_end_date)
        return dl !== null && dl <= 7 && dl > 0
      }).length
      setStats({ total, active, trial, paid, expiring })

      // Upgrade requests
      const { data: reqs } = await supabase
        .from('subscription_requests')
        .select('*, companies(name, email)')
        .order('requested_at', { ascending: false })
      setRequests(reqs ?? [])

    } catch (err) {
      showToast('خطأ في تحميل البيانات: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (isSuperAdmin) loadData() }, [isSuperAdmin, loadData])

  // ── Toggle active/inactive ───────────────────────────────────
  async function toggleActive(comp) {
    const newVal = !(comp.is_active !== false)
    const { error } = await supabase
      .from('companies').update({ is_active: newVal }).eq('id', comp.id)
    if (error) return showToast('فشل تحديث الحالة: ' + error.message, 'error')
    setCompanies(prev => prev.map(c => c.id === comp.id ? { ...c, is_active: newVal } : c))
    showToast(newVal ? 'تم تفعيل الحساب ✓' : 'تم تعطيل الحساب ✓')
  }

  // ── Extend trial/plan by 30 days ─────────────────────────────
  async function extendPlan(comp) {
    const base = comp.plan_end_date || comp.trial_end
    const current = base ? new Date(base) : new Date()
    if (current < new Date()) current.setTime(Date.now())
    current.setDate(current.getDate() + 30)
    const iso = current.toISOString()

    const { error } = await supabase.from('companies').update({
      plan_end_date: iso,
      trial_end:     iso,
      is_active:     true,
    }).eq('id', comp.id)
    if (error) return showToast('فشل التمديد: ' + error.message, 'error')
    setCompanies(prev => prev.map(c =>
      c.id === comp.id ? { ...c, plan_end_date: iso, trial_end: iso, is_active: true } : c
    ))
    showToast(`تم تمديد ${comp.name} 30 يوماً ✓`)
  }

  // ── Delete company ───────────────────────────────────────────
  async function deleteCompany(id) {
    setDeleting(true)
    const { error } = await supabase.from('companies').delete().eq('id', id)
    setDeleting(false)
    if (error) return showToast('فشل الحذف: ' + error.message, 'error')
    setCompanies(prev => prev.filter(c => c.id !== id))
    setConfirmDel(null)
    showToast('تم حذف الشركة نهائياً')
  }

  // ── Save edit ────────────────────────────────────────────────
  async function saveEdit(form) {
    const expiry = form.plan_end_date
      ? new Date(form.plan_end_date).toISOString()
      : null

    const { error } = await supabase.from('companies').update({
      name:            form.name.trim(),
      email:           form.email.trim(),
      phone:           form.phone.trim(),
      city:            form.city.trim(),
      plan:            form.plan,
      plan_end_date:   expiry,
      trial_end:       expiry,   // keep both in sync
      max_subscribers: form.max_subscribers,
      is_active:       form.is_active,
    }).eq('id', editModal.id)

    if (error) return showToast('فشل الحفظ: ' + error.message, 'error')
    setCompanies(prev => prev.map(c =>
      c.id === editModal.id ? { ...c, ...form, plan_end_date: expiry, trial_end: expiry } : c
    ))
    setEditModal(null)
    showToast('تم حفظ التعديلات ✓')
  }

  // ── Create new company account ───────────────────────────────
  async function createAccount(form) {
    // signUp creates auth user → trigger creates companies row
    const { error } = await supabase.auth.signUp({
      email:    form.email.trim(),
      password: form.password,
      options:  { data: { company_name: form.name.trim() } },
    })
    if (error) { showToast('فشل الإنشاء: ' + error.message, 'error'); return }

    // Small delay to let the trigger fire, then set the plan
    setTimeout(async () => {
      const { data: newComp } = await supabase
        .from('companies')
        .select('id')
        .eq('email', form.email.trim())
        .maybeSingle()

      if (newComp) {
        const expiry = new Date(Date.now() + 7 * 86400000).toISOString()
        await supabase.from('companies').update({
          plan:      form.plan,
          phone:     form.phone?.trim() || null,
          trial_end: expiry,
          is_active: true,
        }).eq('id', newComp.id)
      }
      loadData()
    }, 2000)

    setCreateModal(false)
    showToast('تم إنشاء الحساب ✓ — سيظهر خلال ثوانٍ')
  }

  // ── Review upgrade request ───────────────────────────────────
  async function reviewRequest(req, action) {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('subscription_requests')
      .update({ status: action, reviewed_by: 'super-admin', reviewed_at: now })
      .eq('id', req.id)
    if (error) return showToast('فشل التحديث: ' + error.message, 'error')

    if (action === 'approved') {
      const plan = PLANS.find(p => p.key === req.plan_key)
      const expiry = new Date(Date.now() + 30 * 86400000).toISOString()
      await supabase.from('companies').update({
        plan:            req.plan_key,
        plan_end_date:   expiry,
        trial_end:       expiry,
        max_subscribers: plan?.maxSubs ?? 99999,
        is_active:       true,
      }).eq('id', req.company_id)
    }

    setRequests(prev => prev.map(r =>
      r.id === req.id ? { ...r, status: action, reviewed_by: 'super-admin', reviewed_at: now } : r
    ))
    showToast(action === 'approved' ? '✅ تم قبول الطلب وتفعيل الباقة' : '❌ تم رفض الطلب')
  }

  // ── Reset password ───────────────────────────────────────────
  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) return showToast('فشل الإرسال: ' + error.message, 'error')
    showToast('تم إرسال رابط إعادة التعيين ✓')
  }

  // ── Filtered list ────────────────────────────────────────────
  const filtered = companies.filter(c => {
    const q = search.toLowerCase()
    const ms = !q || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q)
    const mp = filterPlan   === 'all' || c.plan === filterPlan
    const mst = filterStatus === 'all' ||
      (filterStatus === 'active'   && c.is_active !== false) ||
      (filterStatus === 'inactive' && c.is_active === false)
    return ms && mp && mst
  })

  const pendingCount = requests.filter(r => r.status === 'pending').length

  if (!isSuperAdmin) return null

  // ── Render ───────────────────────────────────────────────────
  return (
    <div dir="rtl" style={{
      minHeight: '100vh', background: '#0f172a',
      color: '#e2e8f0', fontFamily: "'Tajawal', system-ui, sans-serif",
    }}>
      <Toast toast={toast} />

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg,#1e3a5f,#0f172a)',
        padding: '18px 28px', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid #1e293b', position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
            borderRadius: 12, width: 44, height: 44,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>📡</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>لوحة تحكم Super Admin</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>NetPro — إدارة المنصة</div>
          </div>
        </div>
        <button
          onClick={async () => { await signOut(); navigate('/login') }}
          style={{
            background: '#ef4444', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 18px', cursor: 'pointer',
            fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
          }}>
          🚪 خروج
        </button>
      </div>

      <div style={{ padding: '20px 24px 60px', maxWidth: 1100, margin: '0 auto' }}>

        {/* ── KPI cards ── */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 22 }}>
            {[
              { label: 'إجمالي الشركات',  value: stats.total,    icon: '🏢', color: '#3b82f6' },
              { label: 'حسابات نشطة',     value: stats.active,   icon: '✅', color: '#10b981' },
              { label: 'حسابات تجريبية',  value: stats.trial,    icon: '⏳', color: '#f59e0b' },
              { label: 'حسابات مدفوعة',   value: stats.paid,     icon: '💎', color: '#8b5cf6' },
              { label: 'تنتهي خلال 7 أيام',value: stats.expiring, icon: '🔔', color: '#ef4444' },
              { label: 'طلبات معلقة',     value: pendingCount,   icon: '📋', color: '#ec4899' },
            ].map(s => (
              <div key={s.label} style={{
                background: '#1e293b', borderRadius: 14,
                padding: '16px 18px', borderTop: `3px solid ${s.color}`,
              }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { id: 'companies', label: `🏢 الشركات (${companies.length})` },
            { id: 'requests',  label: `📋 طلبات الترقية${pendingCount ? ` (${pendingCount} جديد)` : ` (${requests.length})`}` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: tab === t.id ? 'linear-gradient(135deg,#3b82f6,#8b5cf6)' : '#1e293b',
              color: '#fff', border: 'none', borderRadius: 10, padding: '10px 22px',
              cursor: 'pointer', fontWeight: tab === t.id ? 800 : 600,
              fontSize: 13, transition: 'all .2s', fontFamily: 'inherit',
              boxShadow: tab === t.id ? '0 4px 14px rgba(59,130,246,.3)' : 'none',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ TAB: COMPANIES ══ */}
        {tab === 'companies' && (
          <>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 2, minWidth: 200 }}>
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="بحث بالاسم أو الإيميل أو الهاتف..."
                  style={{
                    width: '100%', background: '#1e293b', border: '1px solid #334155',
                    borderRadius: 10, padding: '10px 38px 10px 14px', color: '#fff',
                    fontSize: 13, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)} style={{
                background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
                padding: '10px 14px', color: '#fff', fontSize: 13, cursor: 'pointer',
              }}>
                <option value="all">كل الباقات</option>
                {PLANS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{
                background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
                padding: '10px 14px', color: '#fff', fontSize: 13, cursor: 'pointer',
              }}>
                <option value="all">كل الحالات</option>
                <option value="active">نشط</option>
                <option value="inactive">معطّل</option>
              </select>
              <button onClick={() => setCreateModal(true)} style={{
                background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff',
                border: 'none', borderRadius: 10, padding: '10px 20px',
                cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
              }}>
                ➕ إنشاء حساب
              </button>
              <button onClick={loadData} title="تحديث" style={{
                background: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
                borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontSize: 18,
              }}>
                🔄
              </button>
            </div>

            <div style={{ fontSize: 12, color: '#475569', marginBottom: 12 }}>
              عرض {filtered.length} من {companies.length} شركة
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#475569', fontSize: 16 }}>⏳ جاري التحميل...</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🏢</div>
                <div style={{ fontWeight: 700 }}>لا توجد شركات مطابقة</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {filtered.map(comp => (
                  <CompanyCard
                    key={comp.id}
                    comp={comp}
                    subCounts={subCounts}
                    onEdit={() => setEditModal({ ...comp })}
                    onToggle={() => toggleActive(comp)}
                    onDelete={() => setConfirmDel(comp)}
                    onReset={() => resetPassword(comp.email)}
                    onExtend={() => extendPlan(comp)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ══ TAB: REQUESTS ══ */}
        {tab === 'requests' && (
          <>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>⏳ جاري التحميل...</div>
            ) : requests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
                <div style={{ fontWeight: 700 }}>لا توجد طلبات</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {requests.map(req => (
                  <RequestCard
                    key={req.id}
                    req={req}
                    onApprove={() => reviewRequest(req, 'approved')}
                    onReject={() => reviewRequest(req, 'rejected')}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Edit Modal ── */}
      {editModal && (
        <EditModal
          comp={editModal}
          onSave={saveEdit}
          onClose={() => setEditModal(null)}
        />
      )}

      {/* ── Create Modal ── */}
      {createModal && (
        <CreateModal
          onSave={createAccount}
          onClose={() => setCreateModal(false)}
        />
      )}

      {/* ── Confirm Delete ── */}
      {confirmDel && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#1e293b', borderRadius: 16, padding: 32,
            maxWidth: 400, width: '90%', border: '1px solid #ef444466', textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: '#f1f5f9' }}>
              تأكيد الحذف النهائي
            </div>
            <div style={{ color: '#94a3b8', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
              سيتم حذف شركة{' '}
              <strong style={{ color: '#ef4444' }}>"{confirmDel.name}"</strong>{' '}
              مع جميع مشتركيها ودفعاتها نهائياً ولا يمكن التراجع.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => deleteCompany(confirmDel.id)}
                disabled={deleting}
                style={{
                  background: '#ef4444', color: '#fff', border: 'none',
                  borderRadius: 10, padding: '10px 24px', cursor: deleting ? 'not-allowed' : 'pointer',
                  fontWeight: 700, fontFamily: 'inherit', opacity: deleting ? .7 : 1,
                }}>
                {deleting ? '⏳ جاري الحذف...' : '🗑 حذف نهائياً'}
              </button>
              <button
                onClick={() => setConfirmDel(null)}
                style={{
                  background: '#334155', color: '#fff', border: 'none',
                  borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes npFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}
