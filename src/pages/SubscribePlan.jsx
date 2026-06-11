import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../components/Toast'

const PLANS = {
  starter:  { name: '⚡ البداية',   price: 20,  nameAr: 'البداية',   color: '#6144f5', desc: 'حتى 100 مشترك' },
  pro:      { name: '💎 الاحترافي', price: 35, nameAr: 'الاحترافي', color: '#1a3fdb', desc: 'مشتركون غير محدودين', popular: true },
  business: { name: '🏢 الأعمال',  price: 50, nameAr: 'الأعمال',   color: '#059669', desc: 'محاسبون فرعيون + كل الميزات' },
}
const ADMIN_PHONE = '+9647707505999'

export default function SubscribePlan() {
  const { plan: planParam } = useParams()
  const navigate = useNavigate()
  const { company } = useAuth()

  const [selectedPlan, setSelectedPlan] = useState(planParam || null)
  const [step, setStep]       = useState(planParam ? 1 : 0)
  const [image, setImage]     = useState(null)
  const [preview, setPreview] = useState(null)
  const [notes, setNotes]     = useState('')
  const [loading, setLoading] = useState(false)
  const [requestId, setRequestId]     = useState(null)
  const [requestStatus, setRequestStatus] = useState('pending')

  const planInfo = selectedPlan ? PLANS[selectedPlan] : null

  // Realtime: watch for admin approval
  useEffect(() => {
    if (step !== 3 || !requestId) return
    const channel = supabase
      .channel('req-' + requestId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'subscription_requests',
        filter: `id=eq.${requestId}`
      }, ({ new: n }) => {
        setRequestStatus(n.status)
        if (n.status === 'approved') toast('🎉 تمت الموافقة وتفعيل الباقة!', 's', 0)
        else if (n.status === 'rejected') toast('تم رفض الطلب — تواصل مع الدعم', 'e', 0)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [step, requestId])

  function handleImage(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast('الصورة أكبر من 5MB', 'e'); return }
    setImage(file)
    setPreview(URL.createObjectURL(file))
  }

  async function submit() {
    if (!image) { toast('يرجى رفع صورة إيصال الدفع', 'e'); return }
    setLoading(true)
    try {
      const ext  = image.name.split('.').pop()
      const path = `${company.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('payment-proofs').upload(path, image)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('payment-proofs').getPublicUrl(path)

      const { data: reqData, error: dbErr } = await supabase
        .from('subscription_requests')
        .insert({
          company_id:        company.id,
          plan_key:          selectedPlan,
          plan_name:         planInfo.nameAr,
          amount:            planInfo.price,
          payment_image_url: urlData.publicUrl,
          status:            'pending',
          admin_notes:       notes,
          requested_at:      new Date().toISOString(),
        })
        .select().single()
      if (dbErr) throw dbErr

      setRequestId(reqData.id)
      setStep(3)
      toast('تم إرسال طلبك بنجاح ✅', 's')
    } catch (err) {
      toast('حدث خطأ: ' + err.message, 'e')
    } finally {
      setLoading(false)
    }
  }

  // ── STEP 0: اختيار الباقة ──────────────────────────────
  if (step === 0) return (
    <div className="page">
      <div className="page-title">💎 اختر باقتك</div>
      <p style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 20 }}>
        جميع الباقات تشمل ربط Google Sheets والمراسلة عبر واتساب
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
        {Object.entries(PLANS).map(([key, p]) => (
          <div key={key} onClick={() => { setSelectedPlan(key); setStep(1) }}
            style={{
              background: 'var(--sur)', border: `2px solid ${p.popular ? p.color : 'var(--bdr)'}`,
              borderRadius: 18, padding: '18px 20px', cursor: 'pointer',
              position: 'relative', transition: 'all .2s',
              boxShadow: p.popular ? `0 4px 20px ${p.color}22` : 'var(--shC)'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = p.color}
            onMouseLeave={e => e.currentTarget.style.borderColor = p.popular ? p.color : 'var(--bdr)'}>
            {p.popular && (
              <div style={{
                position: 'absolute', top: -1, right: 20,
                background: `linear-gradient(135deg,${p.color},${p.color}cc)`,
                color: '#fff', fontSize: 11, fontWeight: 800,
                padding: '3px 12px', borderRadius: '0 0 10px 10px'
              }}>⭐ الأكثر طلباً</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--ink)', marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{p.desc}</div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: p.color }}>${p.price}</span>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>/شهر</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: 'rgba(37,211,102,.08)', border: '1px solid rgba(37,211,102,.2)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 8 }}>📞 للاستفسار قبل الدفع</div>
        <a href={`https://wa.me/${ADMIN_PHONE.replace('+', '')}`} target="_blank" rel="noreferrer"
          className="btn btn-whatsapp btn-sm" style={{ display: 'inline-flex', width: 'auto', textDecoration: 'none' }}>
          📱 تواصل عبر واتساب
        </a>
      </div>
    </div>
  )

  if (!planInfo) return <div className="page"><div className="empty-state"><div className="empty-art">❓</div><div className="empty-title">باقة غير موجودة</div></div></div>

  // ── STEP 1: تأكيد الباقة ──────────────────────────────
  if (step === 1) return (
    <div className="page">
      <button onClick={() => setStep(0)} style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16, padding: 0, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
        ← رجوع
      </button>

      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>{planInfo.name.split(' ')[0]}</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, background: 'var(--gP)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 4 }}>
          باقة {planInfo.nameAr}
        </h1>
        <div style={{ fontSize: 32, fontWeight: 900, color: planInfo.color }}>${planInfo.price}<span style={{ fontSize: 14, color: 'var(--ink3)' }}>/شهر</span></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="card-title">📋 خطوات الاشتراك</div>
          {[
            { icon: '💎', title: 'اختيار الباقة', desc: 'اخترت باقة ' + planInfo.nameAr, done: true },
            { icon: '💳', title: 'الدفع ورفع الإيصال', desc: `حوّل $${planInfo.price} وارفع صورة الإيصال` },
            { icon: '✅', title: 'انتظار التفعيل', desc: 'يتم التفعيل خلال 24 ساعة' },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: i < 2 ? '1px solid var(--bdr)' : 'none' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                background: row.done ? 'linear-gradient(135deg,#065f46,#059669)' : `${planInfo.color}18`,
                color: row.done ? '#fff' : planInfo.color
              }}>{row.done ? '✓' : row.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: row.done ? '#059669' : 'var(--ink)' }}>{row.title}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{row.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={() => setStep(2)} className="btn btn-primary" style={{ marginBottom: 9 }}>
        التالي: الدفع والإيصال →
      </button>
      <button onClick={() => setStep(0)} className="btn btn-ghost">إلغاء</button>
    </div>
  )

  // ── STEP 2: رفع الإيصال ───────────────────────────────
  if (step === 2) return (
    <div className="page">
      <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16, padding: 0, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
        ← رجوع
      </button>

      <div className="page-title">💳 الدفع ورفع الإيصال</div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-body">
          <div className="card-title">📋 تعليمات الدفع</div>
          <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: 14, fontSize: 13, color: 'var(--ink2)', lineHeight: 2 }}>
            1️⃣ حوّل مبلغ <strong style={{ color: 'var(--blue)' }}>${planInfo.price}</strong> إلى حسابنا<br />
            2️⃣ احتفظ بصورة واضحة لإيصال التحويل<br />
            3️⃣ ارفع صورة الإيصال في الحقل أدناه<br />
            4️⃣ اضغط "إرسال الطلب"
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--bdr)', marginTop: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--ink3)' }}>الباقة</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{planInfo.name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
            <span style={{ fontSize: 13, color: 'var(--ink3)' }}>المبلغ</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: planInfo.color }}>${planInfo.price}/شهر</span>
          </div>
        </div>
      </div>

      {/* رفع صورة */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-body">
          <div className="card-title">📷 صورة إيصال الدفع *</div>
          <label style={{ display: 'block', cursor: 'pointer' }}>
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImage} />
            {preview ? (
              <div style={{ position: 'relative' }}>
                <img src={preview} alt="إيصال" style={{ width: '100%', borderRadius: 12, maxHeight: 260, objectFit: 'cover', border: `2px solid ${planInfo.color}44` }} />
                <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 8, padding: '4px 10px', fontSize: 12 }}>اضغط لتغيير</div>
              </div>
            ) : (
              <div style={{ border: '2px dashed var(--bdr)', borderRadius: 14, padding: 36, textAlign: 'center', background: 'var(--bg2)' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📤</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>اضغط لرفع صورة الإيصال</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>JPG, PNG — حتى 5MB</div>
              </div>
            )}
          </label>
        </div>
      </div>

      {/* ملاحظات */}
      <div className="field" style={{ marginBottom: 18 }}>
        <label className="field-label">ملاحظات (اختياري)</label>
        <textarea className="field-input" rows={3} placeholder="أي ملاحظات إضافية..."
          value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <button onClick={submit} disabled={loading || !image} className="btn btn-primary"
        style={{ background: image ? 'linear-gradient(135deg,#065f46,#059669)' : 'var(--bdr)', marginBottom: 9 }}>
        {loading ? '⏳ جاري الإرسال...' : '📤 إرسال طلب الاشتراك'}
      </button>
      <button onClick={() => setStep(1)} className="btn btn-ghost">← رجوع</button>
    </div>
  )

  // ── STEP 3: الانتظار ──────────────────────────────────
  return (
    <div className="page">
      {requestStatus === 'approved' ? (
        <div style={{ textAlign: 'center', padding: '32px 20px', background: 'var(--sur)', borderRadius: 24, border: '2px solid rgba(5,150,105,.2)', boxShadow: 'var(--shH)' }}>
          <div style={{ fontSize: 70, marginBottom: 12 }}>🎉</div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#059669', marginBottom: 8 }}>تم تفعيل باقتك!</h2>
          <p style={{ fontSize: 14, color: 'var(--ink3)', marginBottom: 20 }}>تمت الموافقة على طلبك وتفعيل باقة <strong>{planInfo.name}</strong></p>
          <button onClick={() => navigate('/dashboard')} className="btn btn-primary" style={{ width: 'auto', padding: '12px 32px' }}>
            الذهاب للرئيسية ✓
          </button>
        </div>
      ) : requestStatus === 'rejected' ? (
        <div style={{ textAlign: 'center', padding: '32px 20px', background: 'var(--sur)', borderRadius: 24, border: '2px solid rgba(225,29,72,.2)' }}>
          <div style={{ fontSize: 70, marginBottom: 12 }}>❌</div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--rose)', marginBottom: 8 }}>تم رفض الطلب</h2>
          <p style={{ fontSize: 14, color: 'var(--ink3)', marginBottom: 16 }}>يرجى التواصل مع الدعم الفني.</p>
          <button onClick={() => { setStep(2); setRequestStatus('pending') }} className="btn btn-danger" style={{ width: 'auto', padding: '10px 24px' }}>
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '32px 20px' }}>
            <div style={{ fontSize: 60, marginBottom: 12, animation: 'float 3s ease-in-out infinite' }}>⏳</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, background: 'var(--gP)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 8 }}>طلبك قيد المراجعة</h2>
            <p style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.9, marginBottom: 20 }}>
              تم استلام طلبك بنجاح ✅<br />
              سيتم مراجعته والرد خلال <strong style={{ color: 'var(--blue)' }}>24 ساعة</strong><br />
              ستتحدث هذه الصفحة تلقائياً عند الموافقة
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: 'var(--ink3)', marginBottom: 20 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#059669', animation: 'pulse 1.5s infinite' }} />
              مراقبة مباشرة — ستظهر الموافقة تلقائياً
            </div>
            <div style={{ background: 'rgba(37,211,102,.08)', border: '1px solid rgba(37,211,102,.2)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 8 }}>في حالة التأخر أكثر من 24 ساعة</div>
              <a href={`https://wa.me/${ADMIN_PHONE.replace('+', '')}`} target="_blank" rel="noreferrer"
                className="btn btn-whatsapp btn-sm" style={{ display: 'inline-flex', width: 'auto', textDecoration: 'none' }}>
                💬 تواصل عبر واتساب
              </a>
            </div>
            <button onClick={() => navigate('/dashboard')} className="btn btn-ghost">العودة للرئيسية</button>
          </div>
        </div>
      )}
    </div>
  )
}
