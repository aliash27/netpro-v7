import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../components/Toast'

export default function Accountants() {
  const { company, user, isViewer } = useAuth()
  const [list, setList]       = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [form, setForm]       = useState({
    name: '', email: '', phone: '', role: 'accountant', password: ''
  })

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('sub_accountants').select('*')
      .eq('company_id', company.id)
      .eq('is_active', true)
      .order('invited_at', { ascending: false })
    setList(data || [])
    setLoading(false)
  }

  async function add() {
    if (!form.name || !form.email || !form.password) {
      toast('يرجى ملء الاسم والبريد وكلمة المرور', 'e'); return
    }
    if (form.password.length < 6) {
      toast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'e'); return
    }
    setSaving(true)

    // 1. Create real Supabase Auth account for the accountant
    const { data: authData, error: authError } = await supabase.auth.admin
      ? await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            data: {
              role: form.role,
              company_id: company.id,
              is_sub_accountant: true
            }
          }
        })
      : await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            data: {
              role: form.role,
              company_id: company.id,
              is_sub_accountant: true
            }
          }
        })

    if (authError) {
      toast('خطأ في إنشاء الحساب: ' + authError.message, 'e')
      setSaving(false)
      return
    }

    const authUserId = authData?.user?.id

    // 2. Save to sub_accountants table with auth_user_id
    const { error: dbError } = await supabase.from('sub_accountants').insert({
      company_id:   company.id,
      name:         form.name.trim(),
      email:        form.email.trim(),
      phone:        form.phone.trim(),
      role:         form.role,
      auth_user_id: authUserId || null,
      invited_by:   user?.id || null,
    })

    setSaving(false)
    if (dbError) { toast('خطأ في حفظ البيانات: ' + dbError.message, 'e'); return }

    toast('تمت إضافة المحاسب بنجاح ✅ — تم إرسال رابط التفعيل على بريده', 's')
    setForm({ name:'', email:'', phone:'', role:'accountant', password:'' })
    setShowAdd(false)
    load()
  }

  async function remove(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المحاسب؟ سيتم إلغاء وصوله.')) return
    await supabase.from('sub_accountants')
      .update({ is_active: false }).eq('id', id)
    toast('تم حذف المحاسب وإلغاء وصوله', 's')
    load()
  }

  const roleNames = { accountant: '📊 محاسب', viewer: '👁 مراقب' }

  return (
    <div className="page">
      <div style={{display:'flex',alignItems:'center',
        justifyContent:'space-between',marginBottom:16}}>
        <div className="page-title" style={{marginBottom:0}}>
          👥 المحاسبون الفرعيون
        </div>
        {!isViewer && <button className="btn btn-primary btn-sm"
          style={{width:'auto'}}
          onClick={() => setShowAdd(true)}>
          ➕ إضافة
        </button>}
      </div>

      {/* Info box */}
      <div style={{background:'rgba(26,63,219,.06)',border:'1px solid rgba(26,63,219,.15)',
        borderRadius:12,padding:13,marginBottom:16,fontSize:13,
        color:'var(--ink2)',lineHeight:1.7}}>
        <strong>صلاحيات المحاسبين الفرعيين</strong><br/>
        • <strong>محاسب:</strong> يمكنه إضافة مشتركين وتسجيل دفعات<br/>
        • <strong>مراقب:</strong> يمكنه عرض البيانات فقط بدون تعديل<br/>
        <span style={{fontSize:11,color:'var(--ink3)',marginTop:4,display:'block'}}>
          ⚠️ يتم إنشاء حساب Supabase Auth حقيقي لكل محاسب عند الإضافة
        </span>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:40,fontSize:24}}>⏳</div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <div className="empty-art">👤</div>
          <div className="empty-title">لا يوجد محاسبون فرعيون</div>
          <div className="empty-sub">أضف محاسباً لمساعدتك في إدارة المشتركين</div>
        </div>
      ) : list.map(acc => (
        <div key={acc.id} className="card" style={{marginBottom:10}}>
          <div className="card-body" style={{padding:'14px 16px'}}>
            <div style={{display:'flex',justifyContent:'space-between',
              alignItems:'flex-start'}}>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:'var(--ink)'}}>
                  {acc.name}
                </div>
                <div style={{fontSize:12,color:'var(--ink3)',marginTop:2}}>
                  📧 {acc.email}
                </div>
                {acc.phone && (
                  <div style={{fontSize:12,color:'var(--ink3)',marginTop:2}}>
                    📞 {acc.phone}
                  </div>
                )}
                <div style={{marginTop:6,display:'flex',gap:6,flexWrap:'wrap'}}>
                  <span className="badge badge-blue">
                    {roleNames[acc.role]}
                  </span>
                  {acc.auth_user_id ? (
                    <span className="badge badge-ok" style={{fontSize:10}}>
                      ✅ حساب فعّال
                    </span>
                  ) : (
                    <span className="badge" style={{
                      background:'rgba(234,179,8,.12)',color:'#92400e',fontSize:10}}>
                      ⏳ بانتظار التفعيل
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => remove(acc.id)}
                style={{background:'rgba(225,29,72,.1)',border:'none',
                  color:'var(--rose)',borderRadius:8,padding:'6px 10px',
                  fontSize:12,fontWeight:700,cursor:'pointer'}}>
                🗑 حذف
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Add Modal */}
      {showAdd && (
        <div style={{position:'fixed',inset:0,zIndex:500,
          background:'rgba(4,8,22,.68)',backdropFilter:'blur(8px)',
          display:'flex',alignItems:'flex-end',justifyContent:'center'}}
          onClick={e => { if(e.target===e.currentTarget) setShowAdd(false) }}>
          <div style={{width:'100%',maxWidth:560,background:'var(--sur)',
            borderRadius:'26px 26px 0 0',padding:'10px 20px 32px',
            borderTop:'1px solid var(--bdr)',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{width:38,height:4,background:'var(--bdr)',
              borderRadius:4,margin:'8px auto 18px'}}/>
            <div style={{fontSize:17,fontWeight:800,color:'var(--ink)',
              marginBottom:20,display:'flex',alignItems:'center',gap:10}}>
              👤 إضافة محاسب فرعي
              <button onClick={() => setShowAdd(false)}
                style={{marginRight:'auto',width:32,height:32,borderRadius:'50%',
                  background:'var(--bg2)',border:'none',cursor:'pointer',
                  color:'var(--ink3)',fontSize:15}}>✕</button>
            </div>

            <div style={{background:'rgba(26,63,219,.06)',borderRadius:10,
              padding:'10px 12px',marginBottom:16,fontSize:12,color:'var(--ink2)'}}>
              🔐 سيتم إنشاء حساب دخول حقيقي لهذا المحاسب — تأكد من مشاركة كلمة المرور معه
            </div>

            {[
              { label:'الاسم الكامل *', key:'name', type:'text', ph:'اسم المحاسب', icon:'👤' },
              { label:'البريد الإلكتروني *', key:'email', type:'email', ph:'email@example.com', icon:'📧' },
              { label:'كلمة المرور *', key:'password', type:'password', ph:'6 أحرف على الأقل', icon:'🔒' },
              { label:'رقم الهاتف', key:'phone', type:'tel', ph:'07XXXXXXXXX', icon:'📞' },
            ].map(f => (
              <div className="field" key={f.key}>
                <label className="field-label">{f.label}</label>
                <div className="field-wrap">
                  <span className="field-icon">{f.icon}</span>
                  <input className="field-input" type={f.type}
                    placeholder={f.ph} value={form[f.key]}
                    onChange={e => setForm({...form,[f.key]:e.target.value})}/>
                </div>
              </div>
            ))}

            <div className="field">
              <label className="field-label">الصلاحية</label>
              <select className="field-input"
                value={form.role}
                onChange={e => setForm({...form,role:e.target.value})}>
                <option value="accountant">📊 محاسب — يمكنه التعديل</option>
                <option value="viewer">👁 مراقب — عرض فقط</option>
              </select>
            </div>

            <button className="btn btn-primary"
              onClick={add} disabled={saving}>
              {saving ? '⏳ جاري الإنشاء...' : '✅ إنشاء الحساب وإضافة المحاسب'}
            </button>
            <button className="btn btn-ghost" style={{marginTop:9}}
              onClick={() => setShowAdd(false)}>
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
