import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const PLANS = [
  { key: 'trial',    label: 'تجريبي',     color: '#6b7280' },
  { key: 'starter',  label: 'البداية',    color: '#3b82f6' },
  { key: 'pro',      label: 'الاحترافي',  color: '#8b5cf6' },
  { key: 'business', label: 'الأعمال',    color: '#f59e0b' },
]

export default function AdminDashboard() {
  const { isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  const [companies, setCompanies]       = useState([])
  const [requests, setRequests]         = useState([])
  const [stats, setStats]               = useState(null)
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [tab, setTab]                   = useState('companies') // 'companies' | 'requests'
  const [editModal, setEditModal]       = useState(null)
  const [createModal, setCreateModal]   = useState(false)
  const [toast, setToast]               = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [filterPlan, setFilterPlan]     = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  // ─── حماية: فقط الأدمن ────────────────────────────────
  useEffect(() => {
    if (!isAdmin) navigate('/dashboard', { replace: true })
  }, [isAdmin, navigate])

  // ─── تحميل البيانات ────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // جلب كل الشركات (غير الأدمن)
      const { data: companiesData, error: cErr } = await supabase
        .from('companies')
        .select('*')
        .eq('is_admin', false)
        .order('created_at', { ascending: false })

      if (cErr) throw cErr
      setCompanies(companiesData ?? [])

      // إحصائيات
      const total    = companiesData?.length ?? 0
      const active   = companiesData?.filter(c => c.is_active !== false).length ?? 0
      const trial    = companiesData?.filter(c => c.plan === 'trial').length ?? 0
      const paid     = companiesData?.filter(c => !['trial','free'].includes(c.plan)).length ?? 0

      setStats({ total, active, trial, paid })

      // طلبات الترقية
      const { data: reqData } = await supabase
        .from('subscription_requests')
        .select('*, companies(name, email)')
        .order('requested_at', { ascending: false })

      setRequests(reqData ?? [])
    } catch (err) {
      showToast('حدث خطأ في تحميل البيانات: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (isAdmin) loadData() }, [isAdmin, loadData])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ─── فلترة الشركات ────────────────────────────────────
  const filtered = companies.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    const matchPlan   = filterPlan   === 'all' || c.plan === filterPlan
    const matchStatus = filterStatus === 'all' ||
      (filterStatus === 'active'   && c.is_active !== false) ||
      (filterStatus === 'inactive' && c.is_active === false)
    return matchSearch && matchPlan && matchStatus
  })

  // ─── تفعيل/تعطيل حساب ────────────────────────────────
  async function toggleActive(comp) {
    const newVal = !(comp.is_active !== false)
    const { error } = await supabase
      .from('companies')
      .update({ is_active: newVal })
      .eq('id', comp.id)
    if (error) return showToast('فشل تحديث الحالة', 'error')
    setCompanies(prev => prev.map(c => c.id === comp.id ? { ...c, is_active: newVal } : c))
    showToast(newVal ? 'تم تفعيل الحساب ✓' : 'تم تعطيل الحساب')
  }

  // ─── حذف شركة ─────────────────────────────────────────
  async function deleteCompany(id) {
    const { error } = await supabase.from('companies').delete().eq('id', id)
    if (error) return showToast('فشل الحذف: ' + error.message, 'error')
    setCompanies(prev => prev.filter(c => c.id !== id))
    setConfirmDelete(null)
    showToast('تم حذف الحساب نهائياً')
  }

  // ─── تعديل شركة ────────────────────────────────────────
  async function saveEdit(form) {
    const { error } = await supabase
      .from('companies')
      .update({
        name: form.name,
        email: form.email,
        phone: form.phone,
        plan: form.plan,
        plan_end_date: form.plan_end_date || null,
        is_active: form.is_active,
        city: form.city,
      })
      .eq('id', editModal.id)
    if (error) return showToast('فشل الحفظ: ' + error.message, 'error')
    setCompanies(prev => prev.map(c => c.id === editModal.id ? { ...c, ...form } : c))
    setEditModal(null)
    showToast('تم حفظ التعديلات ✓')
  }

  // ─── إنشاء حساب جديد ─────────────────────────────────
  async function createAccount(form) {
    try {
      // إنشاء مستخدم عبر Supabase Auth (Admin API)
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { company_name: form.name } }
      })
      if (error) throw error
      showToast('تم إنشاء الحساب ✓ — تحقق من الإيميل')
      setCreateModal(false)
      setTimeout(loadData, 1500)
    } catch (err) {
      showToast('فشل الإنشاء: ' + err.message, 'error')
    }
  }

  // ─── قبول/رفض طلب ترقية ────────────────────────────────
  async function reviewRequest(req, action) {
    const updates = {
      status: action,
      reviewed_by: 'admin',
      reviewed_at: new Date().toISOString(),
    }
    const { error } = await supabase
      .from('subscription_requests')
      .update(updates)
      .eq('id', req.id)
    if (error) return showToast('فشل التحديث', 'error')

    if (action === 'approved') {
      await supabase.from('companies').update({
        plan: req.plan_key,
        plan_end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        is_active: true,
      }).eq('id', req.company_id)
    }

    setRequests(prev => prev.map(r => r.id === req.id ? { ...r, ...updates } : r))
    showToast(action === 'approved' ? 'تم قبول الطلب ✓' : 'تم رفض الطلب')
  }

  // ─── إعادة تعيين كلمة مرور ────────────────────────────
  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    if (error) return showToast('فشل الإرسال', 'error')
    showToast('تم إرسال رابط إعادة التعيين ✓')
  }

  // ─── مساعد ────────────────────────────────────────────
  function planLabel(plan) {
    return PLANS.find(p => p.key === plan)?.label ?? plan
  }
  function planColor(plan) {
    return PLANS.find(p => p.key === plan)?.color ?? '#6b7280'
  }
  function formatDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  if (!isAdmin) return null

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, padding: '12px 24px', borderRadius: 10, fontWeight: 600,
          background: toast.type === 'error' ? '#ef4444' : '#10b981',
          color: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          animation: 'fadeIn .2s ease'
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#0f172a)', padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', borderRadius: 12, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚡</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>لوحة تحكم الأدمن</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>NetPro — نظام إدارة المنصة</div>
          </div>
        </div>
        <button onClick={() => { signOut(); navigate('/login') }}
          style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          تسجيل خروج
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, padding: '24px 28px 8px' }}>
          {[
            { label: 'إجمالي الشركات', value: stats.total,  icon: '🏢', color: '#3b82f6' },
            { label: 'حسابات نشطة',   value: stats.active, icon: '✅', color: '#10b981' },
            { label: 'حسابات تجريبية',value: stats.trial,  icon: '⏳', color: '#f59e0b' },
            { label: 'حسابات مدفوعة', value: stats.paid,   icon: '💎', color: '#8b5cf6' },
            { label: 'طلبات معلقة',   value: requests.filter(r => r.status === 'pending').length, icon: '🔔', color: '#ef4444' },
          ].map(s => (
            <div key={s.label} style={{ background: '#1e293b', borderRadius: 14, padding: '18px 20px', borderTop: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 26 }}>{s.icon}</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: s.color, marginTop: 6 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ padding: '16px 28px 0', display: 'flex', gap: 8 }}>
        {[
          { id: 'companies', label: `الشركات (${companies.length})` },
          { id: 'requests',  label: `طلبات الترقية (${requests.filter(r => r.status === 'pending').length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? 'linear-gradient(135deg,#3b82f6,#8b5cf6)' : '#1e293b',
              color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px',
              cursor: 'pointer', fontWeight: 600, fontSize: 14,
              transition: 'all .2s'
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── TAB: COMPANIES ─────────────────────────────── */}
      {tab === 'companies' && (
        <div style={{ padding: '20px 28px' }}>
          {/* أدوات البحث والفلتر */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 بحث بالاسم أو الإيميل أو الهاتف..."
              style={{ flex: 1, minWidth: 220, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '10px 16px', color: '#fff', fontSize: 14, outline: 'none' }} />
            <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)}
              style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
              <option value="all">كل الباقات</option>
              {PLANS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
              <option value="all">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="inactive">معطّل</option>
            </select>
            <button onClick={() => setCreateModal(true)}
              style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
              + إنشاء حساب
            </button>
            <button onClick={loadData}
              style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontSize: 18 }}>
              🔄
            </button>
          </div>

          {/* عداد النتائج */}
          <div style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
            {filtered.length} شركة {search ? `من أصل ${companies.length}` : ''}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>⏳ جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>لا توجد نتائج</div>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {filtered.map(comp => (
                <CompanyCard
                  key={comp.id}
                  comp={comp}
                  planLabel={planLabel}
                  planColor={planColor}
                  formatDate={formatDate}
                  onEdit={() => setEditModal({ ...comp })}
                  onToggle={() => toggleActive(comp)}
                  onDelete={() => setConfirmDelete(comp)}
                  onReset={() => resetPassword(comp.email)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: REQUESTS ──────────────────────────────── */}
      {tab === 'requests' && (
        <div style={{ padding: '20px 28px' }}>
          <div style={{ display: 'grid', gap: 14 }}>
            {requests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>لا توجد طلبات</div>
            ) : requests.map(req => (
              <RequestCard
                key={req.id}
                req={req}
                planLabel={planLabel}
                formatDate={formatDate}
                onApprove={() => reviewRequest(req, 'approved')}
                onReject={() => reviewRequest(req, 'rejected')}
              />
            ))}
          </div>
        </div>
      )}

      {/* ─── Modal: تعديل شركة ────────────────────────── */}
      {editModal && (
        <EditModal
          comp={editModal}
          plans={PLANS}
          onSave={saveEdit}
          onClose={() => setEditModal(null)}
        />
      )}

      {/* ─── Modal: إنشاء حساب ────────────────────────── */}
      {createModal && (
        <CreateModal
          onSave={createAccount}
          onClose={() => setCreateModal(false)}
        />
      )}

      {/* ─── Modal: تأكيد الحذف ───────────────────────── */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', borderRadius: 16, padding: 32, maxWidth: 380, width: '90%', border: '1px solid #ef4444', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>تأكيد الحذف النهائي</div>
            <div style={{ color: '#94a3b8', marginBottom: 24, fontSize: 14 }}>
              سيتم حذف شركة "<strong style={{ color: '#ef4444' }}>{confirmDelete.name}</strong>" مع كل بياناتها نهائياً ولا يمكن التراجع.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => deleteCompany(confirmDelete.id)}
                style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontWeight: 700 }}>
                حذف نهائياً
              </button>
              <button onClick={() => setConfirmDelete(null)}
                style={{ background: '#334155', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', cursor: 'pointer' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
    </div>
  )
}

// ─── CompanyCard ──────────────────────────────────────────
function CompanyCard({ comp, planLabel, planColor, formatDate, onEdit, onToggle, onDelete, onReset }) {
  const isActive  = comp.is_active !== false
  const expired   = comp.plan === 'trial' && comp.trial_end && new Date(comp.trial_end) < new Date()

  return (
    <div style={{
      background: '#1e293b', borderRadius: 14, padding: '18px 22px',
      border: `1px solid ${isActive ? '#334155' : '#ef444440'}`,
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start',
      opacity: isActive ? 1 : .7
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#f1f5f9' }}>{comp.name}</span>
          <span style={{ background: planColor(comp.plan) + '22', color: planColor(comp.plan), borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
            {planLabel(comp.plan)}
          </span>
          {!isActive && <span style={{ background: '#ef444422', color: '#ef4444', borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>معطّل</span>}
          {expired   && <span style={{ background: '#f59e0b22', color: '#f59e0b', borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>منتهي الصلاحية</span>}
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, color: '#94a3b8' }}>
          {comp.email && <span>📧 {comp.email}</span>}
          {comp.phone && <span>📞 {comp.phone}</span>}
          {comp.city  && <span>📍 {comp.city}</span>}
          <span>📅 {formatDate(comp.created_at)}</span>
          {comp.plan_end_date && <span style={{ color: '#f59e0b' }}>⏰ ينتهي: {formatDate(comp.plan_end_date)}</span>}
          {comp.plan === 'trial' && comp.trial_end && (
            <span style={{ color: expired ? '#ef4444' : '#10b981' }}>
              🎁 تجريبي حتى: {formatDate(comp.trial_end)}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <Btn onClick={onEdit}   color="#3b82f6" title="تعديل">✏️</Btn>
        <Btn onClick={onToggle} color={isActive ? '#f59e0b' : '#10b981'} title={isActive ? 'تعطيل' : 'تفعيل'}>
          {isActive ? '🔒' : '🔓'}
        </Btn>
        <Btn onClick={onReset}  color="#8b5cf6" title="إعادة كلمة المرور">🔑</Btn>
        <Btn onClick={onDelete} color="#ef4444" title="حذف نهائي">🗑️</Btn>
      </div>
    </div>
  )
}

function Btn({ onClick, color, title, children }) {
  return (
    <button onClick={onClick} title={title}
      style={{ background: color + '22', color, border: `1px solid ${color}44`, borderRadius: 8, width: 36, height: 36, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s' }}
      onMouseEnter={e => e.currentTarget.style.background = color + '44'}
      onMouseLeave={e => e.currentTarget.style.background = color + '22'}>
      {children}
    </button>
  )
}

// ─── RequestCard ──────────────────────────────────────────
function RequestCard({ req, planLabel, formatDate, onApprove, onReject }) {
  const statusColor = { pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444' }
  const statusLabel = { pending: 'معلق', approved: 'مقبول', rejected: 'مرفوض' }
  const sc = statusColor[req.status] ?? '#6b7280'

  return (
    <div style={{ background: '#1e293b', borderRadius: 14, padding: '18px 22px', border: `1px solid ${sc}44` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
            {req.companies?.name ?? 'شركة غير معروفة'}
            <span style={{ marginRight: 10, background: sc + '22', color: sc, borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
              {statusLabel[req.status]}
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <span>📧 {req.companies?.email}</span>
            <span>📦 الباقة المطلوبة: <strong style={{ color: '#f1f5f9' }}>{planLabel(req.plan_key)}</strong></span>
            {req.amount && <span>💰 المبلغ: {req.amount}$</span>}
            <span>🕐 {formatDate(req.requested_at)}</span>
          </div>
          {req.payment_image_url && (
            <a href={req.payment_image_url} target="_blank" rel="noreferrer"
              style={{ display: 'inline-block', marginTop: 8, color: '#3b82f6', fontSize: 13 }}>
              🖼️ عرض صورة الدفع
            </a>
          )}
        </div>
        {req.status === 'pending' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onApprove}
              style={{ background: '#10b98122', color: '#10b981', border: '1px solid #10b98144', borderRadius: 10, padding: '8px 18px', cursor: 'pointer', fontWeight: 700 }}>
              ✓ قبول
            </button>
            <button onClick={onReject}
              style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444', borderRadius: 10, padding: '8px 18px', cursor: 'pointer', fontWeight: 700 }}>
              ✕ رفض
            </button>
          </div>
        )}
        {req.status !== 'pending' && (
          <div style={{ fontSize: 13, color: '#64748b' }}>
            راجعه: {req.reviewed_by} — {formatDate(req.reviewed_at)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── EditModal ────────────────────────────────────────────
function EditModal({ comp, plans, onSave, onClose }) {
  const [form, setForm] = useState({
    name: comp.name ?? '',
    email: comp.email ?? '',
    phone: comp.phone ?? '',
    plan: comp.plan ?? 'trial',
    plan_end_date: comp.plan_end_date ? comp.plan_end_date.split('T')[0] : '',
    is_active: comp.is_active !== false,
    city: comp.city ?? '',
  })

  const inp = { background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, width: '100%', outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#1e293b', borderRadius: 18, padding: 28, width: '100%', maxWidth: 500, border: '1px solid #334155', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>✏️ تعديل بيانات الشركة</div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>اسم الشركة</label>
            <input style={inp} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>البريد الإلكتروني</label>
            <input style={inp} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>رقم الهاتف</label>
              <input style={inp} value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>المدينة</label>
              <input style={inp} value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>الباقة</label>
              <select style={{ ...inp, cursor: 'pointer' }} value={form.plan} onChange={e => setForm(p => ({ ...p, plan: e.target.value }))}>
                {plans.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>تاريخ انتهاء الباقة</label>
              <input type="date" style={inp} value={form.plan_end_date} onChange={e => setForm(p => ({ ...p, plan_end_date: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} style={{ width: 18, height: 18, cursor: 'pointer' }} />
            <label htmlFor="is_active" style={{ cursor: 'pointer', fontSize: 14 }}>الحساب نشط</label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={() => onSave(form)}
            style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontWeight: 700 }}>
            حفظ التعديلات
          </button>
          <button onClick={onClose}
            style={{ background: '#334155', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer' }}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── CreateModal ──────────────────────────────────────────
function CreateModal({ onSave, onClose }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' })
  const inp = { background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, width: '100%', outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#1e293b', borderRadius: 18, padding: 28, width: '100%', maxWidth: 440, border: '1px solid #10b98144' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>➕ إنشاء حساب جديد</div>
        <div style={{ display: 'grid', gap: 14 }}>
          {[
            { label: 'اسم الشركة', key: 'name', type: 'text', placeholder: 'شركة الاتصالات...' },
            { label: 'البريد الإلكتروني', key: 'email', type: 'email', placeholder: 'info@company.com' },
            { label: 'كلمة المرور', key: 'password', type: 'password', placeholder: '••••••••' },
            { label: 'رقم الهاتف (اختياري)', key: 'phone', type: 'tel', placeholder: '07XXXXXXXXX' },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>{f.label}</label>
              <input type={f.type} placeholder={f.placeholder} style={inp}
                value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={() => onSave(form)}
            style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontWeight: 700 }}>
            إنشاء الحساب
          </button>
          <button onClick={onClose}
            style={{ background: '#334155', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer' }}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}
