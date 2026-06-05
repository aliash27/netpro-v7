import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const plans = [
  {
    key: 'starter', name: '⚡ البداية', price: 5,
    desc: 'مثالي للشبكات الصغيرة',
    features: [
      { ok: true,  text: 'حتى 50 مشترك' },
      { ok: true,  text: 'ربط Google Sheets' },
      { ok: true,  text: 'مراسلة واتساب فردية' },
      { ok: true,  text: 'تقارير أساسية' },
      { ok: false, text: 'مراسلة جماعية' },
      { ok: false, text: 'تعدد المستخدمين' },
    ]
  },
  {
    key: 'pro', name: '💎 الاحترافي', price: 12,
    desc: 'للمشغّلين المحترفين', popular: true,
    features: [
      { ok: true, text: 'مشتركون غير محدودين' },
      { ok: true, text: 'ربط Google Sheets متقدم' },
      { ok: true, text: 'مراسلة جماعية واتساب' },
      { ok: true, text: 'تقارير تفصيلية + مخططات' },
      { ok: true, text: '3 مستخدمين' },
      { ok: true, text: 'تصدير CSV + طباعة' },
    ]
  },
  {
    key: 'business', name: '🏢 الأعمال', price: 25,
    desc: 'للشركات والمزودين الكبار',
    features: [
      { ok: true, text: 'كل ميزات الاحترافي' },
      { ok: true, text: 'ربط متعدد Google Sheets' },
      { ok: true, text: 'API واتساب متكاملة' },
      { ok: true, text: 'لوحة BI متقدمة' },
      { ok: true, text: 'مستخدمون غير محدودين' },
      { ok: true, text: 'دعم مخصص 24/7' },
    ]
  }
]

export default function Pricing() {
  const navigate = useNavigate()
  const { trialDaysLeft } = useAuth()

  return (
    <div className="pricing-wrap">
      <button onClick={() => navigate('/')}
        style={{background:'none',border:'none',color:'var(--blue)',
          fontSize:14,fontWeight:700,cursor:'pointer',
          display:'flex',alignItems:'center',gap:6,
          marginBottom:18,padding:0}}>
        ← رجوع
      </button>

      <div className="pricing-head fadeUp">
        <h2 className="grad-text">اختر خطتك الاحترافية</h2>
        <p>جميع الخطط تشمل ربط Google Sheets والمراسلة عبر واتساب</p>
      </div>

      <div className="plan-grid">
        {plans.map((plan, i) => (
          <div key={plan.key}
            className={`plan-card fadeUp ${plan.popular ? 'popular' : ''}`}
            style={{animationDelay:`${i*0.1}s`}}>
            {plan.popular && <div className="plan-tag">⭐ الأكثر طلباً</div>}
            <div className="plan-name"
              style={plan.popular ? {
                background:'var(--gP)',
                WebkitBackgroundClip:'text',
                WebkitTextFillColor:'transparent'
              } : {}}>
              {plan.name}
            </div>
            <div className="plan-price"
              style={plan.popular ? {
                background:'var(--gP)',
                WebkitBackgroundClip:'text',
                WebkitTextFillColor:'transparent'
              } : {}}>
              <span className="plan-currency">$</span>
              {plan.price}
              <span className="plan-period"> / شهرياً</span>
            </div>
            <div className="plan-desc">{plan.desc}</div>
            <ul className="plan-features">
              {plan.features.map((f, j) => (
                <li key={j}>
                  <span className={f.ok ? 'check' : 'cross'}>
                    {f.ok ? '✓' : '✗'}
                  </span>
                  {f.text}
                </li>
              ))}
            </ul>
            <button
              className={`btn ${plan.popular ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => navigate(`/subscribe/${plan.key}`)}>
              {plan.popular ? 'ابدأ الاحترافي الآن' : 'اختيار الخطة'}
            </button>
          </div>
        ))}
      </div>

      <div style={{marginTop:22,padding:16,background:'var(--sur)',
        borderRadius:20,border:'1px solid var(--bdr)',textAlign:'center'}}>
        <div style={{fontSize:13,color:'var(--ink3)'}}>
          الفترة التجريبية المجانية
        </div>
        <div style={{fontSize:26,fontWeight:900,margin:'5px 0',
          background:'var(--gP)',WebkitBackgroundClip:'text',
          WebkitTextFillColor:'transparent'}}>
          {trialDaysLeft}
        </div>
        <div style={{fontSize:13,color:'var(--ink3)'}}>
          أيام متبقية — جميع الميزات مفعّلة
        </div>
      </div>
    </div>
  )
}
