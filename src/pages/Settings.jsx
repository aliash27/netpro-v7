import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../components/Toast'

const planNames = {
  trial:    '⭐ تجريبي',
  starter:  '⚡ البداية ($5/شهر)',
  pro:      '💎 الاحترافي ($12/شهر)',
  business: '🏢 الأعمال ($25/شهر)'
}

const DEFAULT_WA = 'عزيزي {name}، لديك {months} شهر متأخر بمبلغ {amount} د.ع. نرجو السداد قبل نهاية الشهر. شكراً — {company}'

export default function Settings() {
  const { user, company, accountant, isViewer, refreshCompany, signOut } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ name:'', phone:'', whatsapp_template:'' })
  const [pwForm, setPwForm] = useState({ newPw:'', confirm:'' })
  const [dark, setDark]         = useState(false)
  const [saving, setSaving]     = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const [subCount, setSubCount] = useState(0)
  const [payCount, setPayCount] = useState(0)
  const [totalRev, setTotalRev] = useState(0)

  useEffect(() => {
    setDark(document.documentElement.hasAttribute('data-dark'))
    if (company) {
      setForm({
        name: company.name || '',
        phone: company.phone || '',
        whatsapp_template: company.whatsapp_template || DEFAULT_WA
      })
      loadStats()
    }
  }, [company])

  async function loadStats() {
    if (!company?.id) return
    try {
      const [{ count: sc }, { count: pc }, { data: rd }] = await Promise.all([
        supabase.from('subscribers').select('*',{count:'exact',head:true})
          .eq('company_id', company.id).eq('is_active', true),
        supabase.from('payments').select('*',{count:'exact',head:true})
          .eq('company_id', company.id),
        supabase.from('payments').select('amount').eq('company_id', company.id)
      ])
      setSubCount(sc || 0)
      setPayCount(pc || 0)
      setTotalRev((rd||[]).reduce((a,p) => a + Number(p.amount), 0))
    } catch (_) {}
  }

  async function saveCompany() {
    if (!form.name.trim()) { toast('اسم الشركة مطلوب','e'); return }
    setSaving(true)
    const { error } = await supabase.from('companies').update({
      name: form.name.trim(),
      phone: form.phone.trim(),
      whatsapp_template: form.whatsapp_template
    }).eq('id', company.id)
    if (error) { toast('خطأ في الحفظ: '+error.message,'e'); setSaving(false); return }
    await refreshCompany()
    toast('تم حفظ الإعدادات ✅','s')
    setSaving(false)
  }

  async function changePassword() {
    if (!pwForm.newPw) { toast('يرجى إدخال كلمة المرور الجديدة','e'); return }
    if (pwForm.newPw !== pwForm.confirm) { toast('كلمتا المرور غير متطابقتين','e'); return }
    if (pwForm.newPw.length < 6) { toast('6 أحرف على الأقل','e'); return }
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: pwForm.newPw })
    setSavingPw(false)
    if (error) { toast('خطأ: '+error.message,'e'); return }
    toast('تم تحديث كلمة المرور ✅','s')
    setPwForm({ newPw:'', confirm:'' })
  }

  function toggleTheme() {
    const nd = !dark; setDark(nd)
    if (nd) { document.documentElement.setAttribute('data-dark',''); localStorage.setItem('np_theme','dark') }
    else { document.documentElement.removeAttribute('data-dark'); localStorage.setItem('np_theme','light') }
  }

  async function handleExportData() {
    const [{ data: subs }, { data: pays }] = await Promise.all([
      supabase.from('subscribers').select('*').eq('company_id', company.id),
      supabase.from('payments').select('*').eq('company_id', company.id)
    ])
    const blob = new Blob([JSON.stringify({ subs, pays, exportedAt: new Date().toISOString() }, null, 2)],
      { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `netpro-backup-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    toast('تم تصدير البيانات ✅','s')
  }

  const fmt = n => Number(n).toLocaleString('ar-IQ') + ' د.ع'

  return (
    <div className="page">
      <div className="page-title">⚙️ الإعدادات</div>

      {/* ── Viewer banner ── */}
      {isViewer && (
        <div style={{background:'rgba(97,68,245,.08)',border:'1px solid rgba(97,68,245,.2)',
          borderRadius:12,padding:'11px 14px',marginBottom:16,fontSize:13,
          color:'#6144f5',fontWeight:700}}>
          👁 أنت مراقب — يمكنك عرض الإعدادات فقط بدون تعديل
        </div>
      )}

      {/* ── Account overview ── */}
      <div style={{background:'linear-gradient(135deg,#0a0f1e,#1a3fdb,#6144f5)',
        borderRadius:18,padding:'20px 18px',marginBottom:14,
        display:'flex',flexDirection:'column',gap:4}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:46,height:46,borderRadius:14,
            background:'rgba(255,255,255,.15)',display:'flex',
            alignItems:'center',justifyContent:'center',
            fontSize:22,fontWeight:900,color:'#fff'}}>
            {(company?.name||'N')[0].toUpperCase()}
          </div>
          <div>
            <div style={{fontSize:17,fontWeight:900,color:'#fff'}}>{company?.name}</div>
            <div style={{fontSize:12,color:'rgba(255,255,255,.65)'}}>{user?.email}</div>
          </div>
          <span style={{marginRight:'auto',background:'rgba(255,255,255,.15)',
            borderRadius:20,padding:'3px 12px',fontSize:12,fontWeight:700,color:'#fff'}}>
            {planNames[company?.plan] || '⭐ تجريبي'}
          </span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginTop:10}}>
          {[
            ['👥','المشتركون',subCount],
            ['💳','الدفعات',payCount],
            ['💰','الإيرادات',fmt(totalRev)]
          ].map(([icon,label,val]) => (
            <div key={label} style={{background:'rgba(255,255,255,.1)',
              borderRadius:10,padding:'8px 6px',textAlign:'center'}}>
              <div style={{fontSize:16}}>{icon}</div>
              <div style={{fontWeight:900,color:'#fff',fontSize:'clamp(11px,3vw,18px)'}}>{val}</div>
              <div style={{fontSize:10,color:'rgba(255,255,255,.6)',marginTop:1}}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Company info ── */}
      {!isViewer && (
        <div className="settings-card">
          <div className="settings-header">
            <div className="settings-icon" style={{background:'rgba(26,63,219,.08)'}}>🏢</div>
            <div className="settings-title">بيانات الشركة</div>
          </div>
          <div className="settings-body">
            {[
              {label:'اسم الشركة *', key:'name', type:'text', icon:'🏢', ph:'اسم شركتك'},
              {label:'رقم الهاتف',   key:'phone', type:'tel', icon:'📞', ph:'07XXXXXXXXX'},
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
            <button className="btn btn-primary" onClick={saveCompany} disabled={saving}>
              {saving ? '⏳ جاري الحفظ...' : '💾 حفظ بيانات الشركة'}
            </button>
          </div>
        </div>
      )}

      {/* ── WhatsApp template ── */}
      {!isViewer && (
        <div className="settings-card">
          <div className="settings-header">
            <div className="settings-icon" style={{background:'rgba(37,211,102,.1)'}}>📱</div>
            <div className="settings-title">قالب رسائل الواتساب</div>
          </div>
          <div className="settings-body">
            <div style={{background:'var(--bg2)',borderRadius:10,padding:'9px 12px',
              marginBottom:11,fontSize:12,color:'var(--ink2)',lineHeight:1.7}}>
              المتغيرات المتاحة:<br/>
              <code style={{background:'var(--bdr)',padding:'1px 5px',borderRadius:4,marginLeft:4}}>{'{name}'}</code> اسم المشترك
              <code style={{background:'var(--bdr)',padding:'1px 5px',borderRadius:4,marginLeft:4,marginRight:4}}>{'{months}'}</code> عدد الأشهر
              <code style={{background:'var(--bdr)',padding:'1px 5px',borderRadius:4,marginLeft:4}}>{'{amount}'}</code> المبلغ
              <code style={{background:'var(--bdr)',padding:'1px 5px',borderRadius:4,marginLeft:4}}>{'{company}'}</code> اسم شركتك
            </div>
            <textarea className="field-input" rows={4}
              value={form.whatsapp_template}
              onChange={e => setForm({...form,whatsapp_template:e.target.value})}
              style={{marginBottom:8}}/>
            <div style={{fontSize:11,color:'var(--ink3)',marginBottom:10,
              background:'var(--bg2)',borderRadius:8,padding:'7px 10px'}}>
              <strong>معاينة:</strong> {form.whatsapp_template
                .replace('{name}','أحمد محمد')
                .replace('{months}','3')
                .replace('{amount}','90,000')
                .replace('{company}', company?.name||'شركتك')}
            </div>
            <button className="btn btn-whatsapp" onClick={saveCompany} disabled={saving}>
              {saving ? '⏳...' : '💾 حفظ القالب'}
            </button>
            <button className="btn btn-ghost" style={{marginTop:8}}
              onClick={() => setForm({...form, whatsapp_template:DEFAULT_WA})}>
              🔄 استعادة القالب الافتراضي
            </button>
          </div>
        </div>
      )}

      {/* ── Password ── */}
      <div className="settings-card">
        <div className="settings-header">
          <div className="settings-icon" style={{background:'rgba(124,58,237,.08)'}}>🔑</div>
          <div className="settings-title">تغيير كلمة المرور</div>
        </div>
        <div className="settings-body">
          {[
            {label:'كلمة المرور الجديدة', key:'newPw',   icon:'🔒'},
            {label:'تأكيد كلمة المرور',   key:'confirm', icon:'🔒'},
          ].map(f => (
            <div className="field" key={f.key}>
              <label className="field-label">{f.label}</label>
              <div className="field-wrap">
                <span className="field-icon">{f.icon}</span>
                <input className="field-input" type="password"
                  placeholder="••••••••" value={pwForm[f.key]}
                  onChange={e => setPwForm({...pwForm,[f.key]:e.target.value})}/>
              </div>
            </div>
          ))}
          <button className="btn btn-primary" onClick={changePassword} disabled={savingPw}>
            {savingPw ? '⏳ جاري التحديث...' : '🔑 تحديث كلمة المرور'}
          </button>
        </div>
      </div>

      {/* ── Appearance ── */}
      <div className="settings-card">
        <div className="settings-header">
          <div className="settings-icon" style={{background:'rgba(212,160,23,.08)'}}>🎨</div>
          <div className="settings-title">المظهر</div>
        </div>
        <div className="settings-body">
          <div className="toggle-row">
            <span className="toggle-label">الوضع الليلي 🌙</span>
            <label className="toggle">
              <input type="checkbox" checked={dark} onChange={toggleTheme}/>
              <span className="toggle-track"/>
              <span className="toggle-thumb"/>
            </label>
          </div>
        </div>
      </div>

      {/* ── Backup ── */}
      {!isViewer && (
        <div className="settings-card">
          <div className="settings-header">
            <div className="settings-icon" style={{background:'rgba(5,150,105,.08)'}}>💾</div>
            <div className="settings-title">النسخ الاحتياطي</div>
          </div>
          <div className="settings-body">
            <div style={{fontSize:13,color:'var(--ink3)',marginBottom:12,lineHeight:1.6}}>
              تصدير جميع بيانات المشتركين والدفعات كملف JSON يمكنك الاحتفاظ به كنسخة احتياطية.
            </div>
            <button className="btn btn-primary" onClick={handleExportData}
              style={{background:'linear-gradient(135deg,#065f46,#059669)'}}>
              📦 تصدير نسخة احتياطية (JSON)
            </button>
          </div>
        </div>
      )}

      {/* ── About / Account info ── */}
      <div className="settings-card">
        <div className="settings-header">
          <div className="settings-icon" style={{background:'var(--bg2)'}}>ℹ️</div>
          <div className="settings-title">حول المنصة</div>
        </div>
        <div className="settings-body">
          {[
            ['الإصدار',           'v3.0 Final'],
            ['خطتك الحالية',      planNames[company?.plan] || '⭐ تجريبي'],
            ['البريد الإلكتروني', user?.email || '—'],
            ...(accountant ? [['دورك', accountant.role === 'viewer' ? '👁 مراقب' : '📊 محاسب']] : []),
          ].map(([label, value], i, arr) => (
            <div key={label} style={{display:'flex',justifyContent:'space-between',
              padding:'9px 0',
              borderBottom: i<arr.length-1 ? '1px solid var(--bdr)':'none'}}>
              <span style={{fontSize:13,color:'var(--ink3)'}}>{label}</span>
              <span style={{fontSize:13,fontWeight:800}}>{value}</span>
            </div>
          ))}

          <button className="btn btn-whatsapp" style={{marginTop:14}}
            onClick={() => window.open('https://wa.me/9647707505999','_blank')}>
            📱 الدعم الفني — واتساب
          </button>
          {!isViewer && (
            <button className="btn btn-gold" style={{marginTop:9}}
              onClick={() => navigate('/pricing')}>
              💎 ترقية الخطة
            </button>
          )}
          <button className="btn btn-ghost" style={{marginTop:9,color:'var(--rose)'}}
            onClick={async () => { await signOut(); navigate('/login') }}>
            🚪 تسجيل الخروج
          </button>
        </div>
      </div>

      <style>{`
        .settings-card {
          background:var(--sur); border:1px solid var(--bdr);
          border-radius:18px; margin-bottom:14px;
          overflow:hidden; box-shadow:var(--shC);
        }
        .settings-header {
          display:flex; align-items:center; gap:12px;
          padding:14px 16px; border-bottom:1px solid var(--bdr);
        }
        .settings-icon {
          width:36px; height:36px; border-radius:10px;
          display:flex; align-items:center; justify-content:center;
          font-size:18px; flex-shrink:0;
        }
        .settings-title { font-size:14px; font-weight:800; color:var(--ink); }
        .settings-body { padding:16px; }
        .toggle-row {
          display:flex; align-items:center;
          justify-content:space-between; padding:4px 0;
        }
        .toggle-label { font-size:14px; font-weight:600; color:var(--ink2); }
        .toggle { position:relative; display:flex; align-items:center; cursor:pointer; }
        .toggle input { opacity:0; width:0; height:0; }
        .toggle-track {
          width:44px; height:24px; background:var(--bdr); border-radius:12px;
          transition:.25s; display:block;
        }
        .toggle input:checked ~ .toggle-track { background:var(--blue); }
        .toggle-thumb {
          position:absolute; right:22px; width:18px; height:18px;
          background:#fff; border-radius:50%;
          top:3px; transition:.25s; box-shadow:0 1px 4px rgba(0,0,0,.2);
        }
        .toggle input:checked ~ .toggle-track ~ .toggle-thumb { right:4px; }
      `}</style>
    </div>
  )
}
