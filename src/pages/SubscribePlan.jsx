import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../components/Toast'

const PLANS = {
  starter:  { name:'⚡ البداية',   price:5,  nameAr:'البداية',   color:'#6144f5' },
  pro:      { name:'💎 الاحترافي', price:12, nameAr:'الاحترافي', color:'#1a3fdb' },
  business: { name:'🏢 الأعمال',  price:25, nameAr:'الأعمال',   color:'#059669' },
}
const ADMIN_PHONE = '+9647707505999'

// Stepper steps
const STEPS = [
  { num:1, icon:'💎', label:'اختيار الباقة'   },
  { num:2, icon:'💳', label:'الدفع ورفع الإيصال' },
  { num:3, icon:'⏳', label:'الانتظار والتفعيل' },
]

function Stepper({ current }) {
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',
      marginBottom:24,gap:0}}>
      {STEPS.map((s,i) => (
        <div key={s.num} style={{display:'flex',alignItems:'center'}}>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
            <div style={{
              width:40,height:40,borderRadius:'50%',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize: current===s.num ? 18 : 16,
              fontWeight:900,transition:'.3s',
              background: current > s.num
                ? 'linear-gradient(135deg,#065f46,#059669)'
                : current === s.num
                  ? 'linear-gradient(135deg,#1a3fdb,#6144f5)'
                  : 'var(--bg2)',
              border: current===s.num ? '2px solid transparent'
                : current < s.num ? '2px solid var(--bdr)' : 'none',
              boxShadow: current===s.num ? '0 4px 16px rgba(26,63,219,.3)' : 'none',
              color: current >= s.num ? '#fff' : 'var(--ink3)',
            }}>
              {current > s.num ? '✓' : s.icon}
            </div>
            <div style={{
              fontSize:10,fontWeight:700,
              color: current === s.num ? 'var(--blue)' : 'var(--ink3)',
              whiteSpace:'nowrap',textAlign:'center',maxWidth:70
            }}>
              {s.label}
            </div>
          </div>
          {i < STEPS.length-1 && (
            <div style={{
              width:40,height:2,margin:'0 4px',marginBottom:18,
              background: current > s.num
                ? 'linear-gradient(90deg,#059669,#6144f5)'
                : 'var(--bdr)',
              transition:'.3s'
            }}/>
          )}
        </div>
      ))}
    </div>
  )
}

export default function SubscribePlan() {
  const { plan }    = useParams()
  const navigate    = useNavigate()
  const { company } = useAuth()
  const planInfo    = PLANS[plan]

  const [step, setStep]       = useState(1)  // 1=choose, 2=pay, 3=waiting
  const [image, setImage]     = useState(null)
  const [preview, setPreview] = useState(null)
  const [notes, setNotes]     = useState('')
  const [loading, setLoading] = useState(false)
  const [requestId, setRequestId] = useState(null)
  const [requestStatus, setRequestStatus] = useState('pending')

  if (!planInfo) { navigate('/pricing'); return null }

  // ── Realtime: watch for admin approval ────────────────────────
  useEffect(() => {
    if (step !== 3 || !requestId) return
    const channel = supabase
      .channel('request-status-' + requestId)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'subscription_requests',
        filter: `id=eq.${requestId}`
      }, (payload) => {
        const newStatus = payload.new.status
        setRequestStatus(newStatus)
        if (newStatus === 'approved') {
          toast('🎉 تمت الموافقة على طلبك وتفعيل الباقة!','s',0)
        } else if (newStatus === 'rejected') {
          toast('تم رفض الطلب — تواصل مع الدعم','e',0)
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [step, requestId])

  function handleImage(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5*1024*1024) { toast('الصورة أكبر من 5MB','e'); return }
    setImage(file)
    setPreview(URL.createObjectURL(file))
  }

  async function submit() {
    if (!image) { toast('يرجى رفع صورة إيصال الدفع','e'); return }
    setLoading(true)
    try {
      let publicUrl = null
      // Upload image
      const ext  = image.name.split('.').pop()
      const path = `${company.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('payment-proofs').upload(path, image)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage
        .from('payment-proofs').getPublicUrl(path)
      publicUrl = urlData.publicUrl

      // Save request
      const { data: reqData, error: dbErr } = await supabase
        .from('subscription_requests')
        .insert({
          company_id:        company.id,
          plan_key:          plan,
          plan_name:         planInfo.nameAr,
          amount:            planInfo.price,
          payment_image_url: publicUrl,
          status:            'pending',
          admin_notes:       notes,
          requested_at:      new Date().toISOString(),
        })
        .select().single()
      if (dbErr) throw dbErr

      setRequestId(reqData.id)
      setStep(3)
      toast('تم إرسال طلبك بنجاح ✅','s')
    } catch(err) {
      toast('حدث خطأ: ' + err.message,'e')
    } finally {
      setLoading(false)
    }
  }

  // ════════════════════════════════════════════════════
  // STEP 1 — اختيار الباقة (confirm)
  // ════════════════════════════════════════════════════
  if (step === 1) return (
    <div style={{minHeight:'100vh',background:'linear-gradient(145deg,#eef1ff,#e6ecff)',
      padding:'20px 16px',fontFamily:'Tajawal,sans-serif',direction:'rtl'}}>
      <div style={{maxWidth:480,margin:'0 auto'}}>
        <button onClick={() => navigate('/pricing')}
          style={{background:'none',border:'none',color:'var(--blue)',
            fontSize:14,fontWeight:700,cursor:'pointer',
            display:'flex',alignItems:'center',gap:6,marginBottom:20,padding:0}}>
          ← رجوع
        </button>

        <Stepper current={1}/>

        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:52,marginBottom:8}}>{planInfo.name.split(' ')[0]}</div>
          <h1 style={{fontSize:22,fontWeight:900,
            background:'linear-gradient(135deg,#1a3fdb,#6144f5)',
            WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
            باقة {planInfo.nameAr}
          </h1>
          <div style={{fontSize:32,fontWeight:900,marginTop:6,
            background:'linear-gradient(135deg,#1a3fdb,#9c27b0)',
            WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
            ${planInfo.price}
            <span style={{fontSize:14,color:'var(--ink3)',
              WebkitTextFillColor:'var(--ink3)'}}>/شهر</span>
          </div>
        </div>

        {/* Plan card */}
        <div style={{background:'white',borderRadius:20,padding:20,
          marginBottom:16,boxShadow:'0 4px 20px rgba(26,63,219,.1)',
          border:`2px solid ${planInfo.color}30`}}>
          <div style={{fontSize:14,fontWeight:800,color:'var(--ink)',marginBottom:12}}>
            📋 خطوات الاشتراك
          </div>
          {[
            {n:'1', icon:'💎', title:'اختيار الباقة', desc:'اخترت باقة '+planInfo.nameAr, done:true},
            {n:'2', icon:'💳', title:'الدفع ورفع الإيصال', desc:`حوّل $${planInfo.price} وارفع صورة الإيصال`},
            {n:'3', icon:'✅', title:'انتظار التفعيل', desc:'يتم التفعيل خلال 24 ساعة من استلام الطلب'},
          ].map((row,i) => (
            <div key={i} style={{display:'flex',gap:12,alignItems:'flex-start',
              padding:'10px 0',
              borderBottom: i<2 ? '1px solid #f3f4f6' : 'none'}}>
              <div style={{
                width:32,height:32,borderRadius:'50%',flexShrink:0,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:15,
                background: row.done ? 'linear-gradient(135deg,#065f46,#059669)'
                  : `${planInfo.color}18`,
                color: row.done ? '#fff' : planInfo.color
              }}>
                {row.done ? '✓' : row.icon}
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:800,color: row.done?'#059669':'var(--ink)'}}>
                  {row.title}
                </div>
                <div style={{fontSize:12,color:'var(--ink3)',marginTop:2}}>{row.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div style={{background:'rgba(37,211,102,.08)',border:'1px solid rgba(37,211,102,.2)',
          borderRadius:14,padding:14,marginBottom:20,textAlign:'center'}}>
          <div style={{fontSize:12,color:'var(--ink3)',marginBottom:6}}>
            📞 للاستفسار قبل الدفع
          </div>
          <a href={`https://wa.me/${ADMIN_PHONE.replace(/\+/,'')}`}
            target="_blank" rel="noreferrer"
            style={{display:'inline-flex',alignItems:'center',gap:6,
              background:'linear-gradient(135deg,#075e40,#25d366)',
              color:'#fff',padding:'9px 20px',borderRadius:20,
              fontSize:13,fontWeight:700,textDecoration:'none'}}>
            📱 تواصل عبر واتساب
          </a>
        </div>

        <button onClick={() => setStep(2)}
          style={{width:'100%',padding:15,borderRadius:14,border:'none',
            background:`linear-gradient(135deg,#1a3fdb,#6144f5)`,
            color:'#fff',fontWeight:900,fontSize:16,cursor:'pointer',
            boxShadow:'0 4px 20px rgba(26,63,219,.3)',marginBottom:9}}>
          التالي: الدفع والإيصال →
        </button>
        <button onClick={() => navigate('/pricing')}
          style={{width:'100%',padding:12,borderRadius:12,border:'1px solid #e5e7eb',
            background:'transparent',color:'#6b7280',fontWeight:700,fontSize:14,cursor:'pointer'}}>
          إلغاء
        </button>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════
  // STEP 2 — الدفع ورفع الإيصال
  // ════════════════════════════════════════════════════
  if (step === 2) return (
    <div style={{minHeight:'100vh',background:'linear-gradient(145deg,#eef1ff,#e6ecff)',
      padding:'20px 16px',fontFamily:'Tajawal,sans-serif',direction:'rtl'}}>
      <div style={{maxWidth:480,margin:'0 auto'}}>
        <button onClick={() => setStep(1)}
          style={{background:'none',border:'none',color:'var(--blue)',
            fontSize:14,fontWeight:700,cursor:'pointer',
            display:'flex',alignItems:'center',gap:6,marginBottom:20,padding:0}}>
          ← رجوع
        </button>

        <Stepper current={2}/>

        <div style={{textAlign:'center',marginBottom:20}}>
          <div style={{fontSize:40}}>💳</div>
          <h2 style={{fontSize:20,fontWeight:900,marginTop:6,
            background:'linear-gradient(135deg,#1a3fdb,#6144f5)',
            WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
            الدفع ورفع الإيصال
          </h2>
        </div>

        {/* Payment instructions */}
        <div style={{background:'white',borderRadius:20,padding:20,
          marginBottom:16,boxShadow:'0 4px 20px rgba(26,63,219,.08)'}}>
          <div style={{fontSize:14,fontWeight:800,color:'var(--ink)',marginBottom:12}}>
            📋 تعليمات الدفع
          </div>
          <div style={{background:'rgba(26,63,219,.05)',borderRadius:12,
            padding:14,fontSize:13,color:'var(--ink2)',lineHeight:2}}>
            1️⃣ حوّل مبلغ <strong style={{color:'#1a3fdb'}}>${planInfo.price}</strong> إلى حسابنا<br/>
            2️⃣ احتفظ بصورة واضحة لإيصال التحويل<br/>
            3️⃣ ارفع صورة الإيصال في الحقل أدناه<br/>
            4️⃣ اضغط "إرسال الطلب"
          </div>
          <div style={{display:'flex',justifyContent:'space-between',
            padding:'10px 0',borderTop:'1px solid #f3f4f6',marginTop:12}}>
            <span style={{fontSize:13,color:'#6b7280'}}>الباقة المختارة</span>
            <span style={{fontSize:13,fontWeight:800}}>{planInfo.name}</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0'}}>
            <span style={{fontSize:13,color:'#6b7280'}}>المبلغ</span>
            <span style={{fontSize:16,fontWeight:900,
              background:'linear-gradient(135deg,#1a3fdb,#6144f5)',
              WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
              ${planInfo.price}/شهر
            </span>
          </div>
        </div>

        {/* Upload image */}
        <div style={{background:'white',borderRadius:20,padding:20,
          marginBottom:16,boxShadow:'0 4px 20px rgba(26,63,219,.08)'}}>
          <div style={{fontSize:14,fontWeight:800,color:'var(--ink)',marginBottom:12}}>
            📷 صورة إيصال الدفع *
          </div>
          <label style={{display:'block',cursor:'pointer'}}>
            <input type="file" accept="image/*"
              style={{display:'none'}} onChange={handleImage}/>
            {preview ? (
              <div style={{position:'relative'}}>
                <img src={preview} alt="إيصال"
                  style={{width:'100%',borderRadius:12,maxHeight:280,objectFit:'cover',
                    border:'2px solid rgba(26,63,219,.2)'}}/>
                <div style={{position:'absolute',top:8,left:8,
                  background:'rgba(0,0,0,.55)',color:'#fff',
                  borderRadius:8,padding:'4px 10px',fontSize:12,backdropFilter:'blur(4px)'}}>
                  اضغط لتغيير
                </div>
              </div>
            ) : (
              <div style={{border:'2px dashed rgba(26,63,219,.3)',borderRadius:14,
                padding:36,textAlign:'center',background:'rgba(26,63,219,.03)',
                transition:'.2s'}}>
                <div style={{fontSize:40,marginBottom:8}}>📤</div>
                <div style={{fontSize:14,fontWeight:700,color:'#1a3fdb'}}>
                  اضغط لرفع صورة الإيصال
                </div>
                <div style={{fontSize:12,color:'#9ca3af',marginTop:4}}>
                  JPG, PNG, WEBP — حتى 5MB
                </div>
              </div>
            )}
          </label>
        </div>

        {/* Notes */}
        <div style={{background:'white',borderRadius:20,padding:20,
          marginBottom:16,boxShadow:'0 4px 20px rgba(26,63,219,.08)'}}>
          <div style={{fontSize:14,fontWeight:800,color:'var(--ink)',marginBottom:10}}>
            📝 ملاحظات (اختياري)
          </div>
          <textarea style={{width:'100%',padding:12,borderRadius:10,
            border:'1px solid #e5e7eb',fontFamily:'Tajawal,sans-serif',
            fontSize:13,resize:'none',outline:'none',color:'var(--ink)',
            background:'var(--bg2)',boxSizing:'border-box'}}
            rows={3} placeholder="أي ملاحظات إضافية..."
            value={notes} onChange={e => setNotes(e.target.value)}/>
        </div>

        <button onClick={submit} disabled={loading || !image}
          style={{width:'100%',padding:15,borderRadius:14,border:'none',
            background: image
              ? 'linear-gradient(135deg,#065f46,#059669)'
              : '#d1d5db',
            color:'#fff',fontWeight:900,fontSize:16,
            cursor: image ? 'pointer' : 'not-allowed',
            boxShadow: image ? '0 4px 20px rgba(5,150,105,.3)' : 'none',
            marginBottom:9,transition:'.2s'}}>
          {loading ? '⏳ جاري الإرسال...' : '📤 إرسال طلب الاشتراك'}
        </button>
        <button onClick={() => setStep(1)}
          style={{width:'100%',padding:12,borderRadius:12,border:'1px solid #e5e7eb',
            background:'transparent',color:'#6b7280',fontWeight:700,fontSize:14,cursor:'pointer'}}>
          ← رجوع
        </button>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════
  // STEP 3 — الانتظار والتفعيل (Realtime)
  // ════════════════════════════════════════════════════
  return (
    <div style={{minHeight:'100vh',background:'linear-gradient(145deg,#eef1ff,#e6ecff)',
      padding:'20px 16px',fontFamily:'Tajawal,sans-serif',direction:'rtl'}}>
      <div style={{maxWidth:480,margin:'0 auto'}}>

        <Stepper current={3}/>

        {/* Status card */}
        {requestStatus === 'approved' ? (
          <div style={{textAlign:'center',padding:'32px 20px',
            background:'white',borderRadius:24,marginBottom:16,
            boxShadow:'0 8px 40px rgba(5,150,105,.15)',
            border:'2px solid rgba(5,150,105,.2)'}}>
            <div style={{fontSize:70,marginBottom:12}}>🎉</div>
            <h2 style={{fontSize:24,fontWeight:900,color:'#059669',marginBottom:8}}>
              تم تفعيل باقتك!
            </h2>
            <p style={{fontSize:14,color:'#6b7280',lineHeight:1.8,marginBottom:20}}>
              تمت الموافقة على طلبك وتفعيل باقة <strong>{planInfo.name}</strong>
            </p>
            <button onClick={() => navigate('/')}
              style={{padding:'12px 32px',borderRadius:12,border:'none',
                background:'linear-gradient(135deg,#065f46,#059669)',
                color:'#fff',fontWeight:800,fontSize:15,cursor:'pointer'}}>
              الذهاب للرئيسية ✓
            </button>
          </div>
        ) : requestStatus === 'rejected' ? (
          <div style={{textAlign:'center',padding:'32px 20px',
            background:'white',borderRadius:24,marginBottom:16,
            boxShadow:'0 8px 40px rgba(225,29,72,.12)',
            border:'2px solid rgba(225,29,72,.2)'}}>
            <div style={{fontSize:70,marginBottom:12}}>❌</div>
            <h2 style={{fontSize:22,fontWeight:900,color:'#e11d48',marginBottom:8}}>
              تم رفض الطلب
            </h2>
            <p style={{fontSize:14,color:'#6b7280',lineHeight:1.8,marginBottom:16}}>
              يرجى التواصل مع الدعم الفني لمعرفة السبب وإعادة المحاولة.
            </p>
            <button onClick={() => { setStep(2); setRequestStatus('pending') }}
              style={{padding:'12px 24px',borderRadius:12,border:'none',
                background:'linear-gradient(135deg,#7f1d1d,#dc2626)',
                color:'#fff',fontWeight:800,fontSize:14,cursor:'pointer'}}>
              إعادة المحاولة
            </button>
          </div>
        ) : (
          /* Pending state */
          <div style={{background:'white',borderRadius:24,padding:28,
            marginBottom:16,boxShadow:'0 4px 24px rgba(26,63,219,.1)',
            textAlign:'center'}}>
            {/* Animated waiting icon */}
            <div style={{position:'relative',width:80,height:80,
              margin:'0 auto 16px',display:'flex',
              alignItems:'center',justifyContent:'center'}}>
              <div style={{position:'absolute',inset:0,borderRadius:'50%',
                background:'rgba(26,63,219,.08)',
                animation:'pulseRing 2s ease-out infinite'}}/>
              <div style={{position:'absolute',inset:6,borderRadius:'50%',
                background:'rgba(26,63,219,.12)',
                animation:'pulseRing 2s ease-out infinite .4s'}}/>
              <div style={{fontSize:36,position:'relative',zIndex:1}}>⏳</div>
            </div>

            <h2 style={{fontSize:20,fontWeight:900,marginBottom:8,
              background:'linear-gradient(135deg,#1a3fdb,#6144f5)',
              WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
              طلبك قيد المراجعة
            </h2>
            <p style={{fontSize:13,color:'#6b7280',lineHeight:1.9,marginBottom:20}}>
              تم استلام طلبك بنجاح ✅<br/>
              سيتم مراجعته والرد خلال <strong style={{color:'#1a3fdb'}}>24 ساعة</strong> كحد أقصى<br/>
              ستتحدث هذه الصفحة تلقائياً عند الموافقة
            </p>

            {/* Request summary */}
            <div style={{background:'#f8faff',borderRadius:14,padding:14,
              marginBottom:18,textAlign:'right'}}>
              {[
                ['الباقة المطلوبة', planInfo.name],
                ['المبلغ', `$${planInfo.price}/شهر`],
                ['حالة الطلب', '⏳ قيد المراجعة'],
                ['وقت الإرسال', new Date().toLocaleString('ar-IQ')],
              ].map(([l,v]) => (
                <div key={l} style={{display:'flex',justifyContent:'space-between',
                  padding:'7px 0',borderBottom:'1px solid #eef0f5'}}>
                  <span style={{fontSize:12,color:'#6b7280'}}>{l}</span>
                  <span style={{fontSize:12,fontWeight:700,color:'#111827'}}>{v}</span>
                </div>
              ))}
            </div>

            {/* Live indicator */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',
              gap:6,fontSize:12,color:'#6b7280',marginBottom:16}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:'#059669',
                animation:'blink 1.5s infinite'}}/>
              مراقبة مباشرة — ستظهر الموافقة تلقائياً
            </div>
          </div>
        )}

        {/* Support section */}
        <div style={{background:'rgba(37,211,102,.08)',
          border:'1px solid rgba(37,211,102,.2)',
          borderRadius:18,padding:18,textAlign:'center'}}>
          <div style={{fontSize:14,fontWeight:800,color:'var(--ink)',marginBottom:4}}>
            📞 في حالة التأخر أكثر من 24 ساعة
          </div>
          <div style={{fontSize:12,color:'#6b7280',marginBottom:12}}>
            تواصل معنا مباشرة عبر واتساب أو الهاتف
          </div>
          <a href={`tel:${ADMIN_PHONE}`}
            style={{display:'block',fontSize:20,fontWeight:900,
              color:'#059669',textDecoration:'none',marginBottom:10}}>
            {ADMIN_PHONE}
          </a>
          <a href={`https://wa.me/${ADMIN_PHONE.replace(/\+/,'')}`}
            target="_blank" rel="noreferrer"
            style={{display:'inline-flex',alignItems:'center',gap:8,
              background:'linear-gradient(135deg,#075e40,#25d366)',
              color:'#fff',padding:'11px 24px',borderRadius:20,
              fontSize:14,fontWeight:700,textDecoration:'none'}}>
            💬 تواصل عبر واتساب
          </a>
        </div>

        {requestStatus === 'pending' && (
          <button onClick={() => navigate('/')}
            style={{width:'100%',padding:12,borderRadius:12,marginTop:12,
              border:'1px solid #e5e7eb',background:'transparent',
              color:'#6b7280',fontWeight:700,fontSize:14,cursor:'pointer'}}>
            العودة للرئيسية والمتابعة لاحقاً
          </button>
        )}
      </div>

      <style>{`
        @keyframes pulseRing {
          0% { transform: scale(.85); opacity:.8 }
          70% { transform: scale(1.2); opacity:0 }
          100% { transform: scale(1.2); opacity:0 }
        }
        @keyframes blink {
          0%,100% { opacity:1 } 50% { opacity:.3 }
        }
      `}</style>
    </div>
  )
}
