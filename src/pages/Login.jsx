import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { signIn } = useAuth()
  const navigate   = useNavigate()

  const [mode, setMode]       = useState('login')   // 'login' | 'register' | 'forgot'
  const [email, setEmail]     = useState('')
  const [password, setPass]   = useState('')
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [showPass, setShowPass] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)

    try {
      if (mode === 'login') {
        await signIn(email, password)
        navigate('/dashboard', { replace: true })

      } else if (mode === 'register') {
        if (!company.trim()) throw new Error('أدخل اسم الشركة')
        if (password.length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل')

        const { error: signUpErr } = await supabase.auth.signUp({
          email, password,
          options: { data: { company_name: company } }
        })
        if (signUpErr) throw signUpErr
        setSuccess('✅ تم إنشاء الحساب! تحقق من بريدك الإلكتروني لتأكيد الحساب.')
        setMode('login')

      } else if (mode === 'forgot') {
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`
        })
        if (resetErr) throw resetErr
        setSuccess('✅ تم إرسال رابط إعادة التعيين إلى بريدك.')
      }
    } catch (err) {
      const msgs = {
        'Invalid login credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
        'Email not confirmed':       'يرجى تأكيد بريدك الإلكتروني أولاً',
        'User already registered':   'هذا البريد مسجّل مسبقاً',
      }
      setError(msgs[err.message] ?? err.message)
    } finally {
      setLoading(false)
    }
  }

  const titles = {
    login:    { h: 'مرحباً بعودتك', sub: 'سجّل دخولك للمتابعة' },
    register: { h: 'إنشاء حساب جديد', sub: 'ابدأ تجربتك المجانية لمدة 7 أيام' },
    forgot:   { h: 'نسيت كلمة المرور؟', sub: 'أدخل بريدك وسنرسل لك رابط إعادة التعيين' },
  }

  return (
    <div dir="rtl" style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: 'system-ui, -apple-system, sans-serif',
      position: 'relative', overflow: 'hidden'
    }}>
      {/* خلفية زخرفية */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {[
          { top: '-20%', right: '-10%', size: 500, color: 'rgba(99,102,241,.08)' },
          { bottom: '-20%', left: '-10%', size: 400, color: 'rgba(139,92,246,.06)' },
          { top: '40%', left: '40%', size: 300, color: 'rgba(59,130,246,.05)' },
        ].map((c, i) => (
          <div key={i} style={{
            position: 'absolute', borderRadius: '50%',
            width: c.size, height: c.size,
            background: c.color,
            filter: 'blur(80px)',
            top: c.top, bottom: c.bottom, left: c.left, right: c.right,
          }} />
        ))}
      </div>

      <div style={{
        width: '100%', maxWidth: 440, position: 'relative', zIndex: 1
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 72, height: 72, borderRadius: 20,
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            fontSize: 36, marginBottom: 14,
            boxShadow: '0 0 40px rgba(99,102,241,.4)'
          }}>📡</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>
            نيت برو
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            منصة إدارة اشتراكات الإنترنت
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(30,41,59,.9)',
          backdropFilter: 'blur(20px)',
          borderRadius: 24,
          padding: '32px 36px',
          border: '1px solid rgba(99,102,241,.2)',
          boxShadow: '0 25px 60px rgba(0,0,0,.5)'
        }}>
          {/* Tab Switcher (login/register only) */}
          {mode !== 'forgot' && (
            <div style={{ display: 'flex', background: '#0f172a', borderRadius: 12, padding: 4, marginBottom: 28 }}>
              {[{ id: 'login', label: 'دخول' }, { id: 'register', label: 'تسجيل' }].map(t => (
                <button key={t.id} onClick={() => { setMode(t.id); setError(''); setSuccess('') }}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 10, border: 'none',
                    cursor: 'pointer', fontWeight: 700, fontSize: 14, transition: 'all .25s',
                    background: mode === t.id ? 'linear-gradient(135deg,#3b82f6,#8b5cf6)' : 'transparent',
                    color: mode === t.id ? '#fff' : '#64748b',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Title */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>{titles[mode].h}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{titles[mode].sub}</div>
          </div>

          {/* Alerts */}
          {error   && <Alert type="error"   msg={error}   />}
          {success && <Alert type="success" msg={success} />}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gap: 16 }}>

              {/* اسم الشركة (تسجيل فقط) */}
              {mode === 'register' && (
                <Field label="اسم الشركة">
                  <input
                    type="text" placeholder="شركة الاتصالات العراقية..."
                    value={company} onChange={e => setCompany(e.target.value)}
                    required style={inputStyle}
                  />
                </Field>
              )}

              {/* البريد */}
              <Field label="البريد الإلكتروني">
                <input
                  type="email" placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)}
                  required style={inputStyle} autoComplete="email"
                />
              </Field>

              {/* كلمة المرور */}
              {mode !== 'forgot' && (
                <Field label="كلمة المرور">
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPass ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password} onChange={e => setPass(e.target.value)}
                      required style={{ ...inputStyle, paddingLeft: 44 }}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    />
                    <button type="button" onClick={() => setShowPass(p => !p)}
                      style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#64748b' }}>
                      {showPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                </Field>
              )}

              {/* نسيت كلمة المرور */}
              {mode === 'login' && (
                <div style={{ textAlign: 'left' }}>
                  <button type="button" onClick={() => { setMode('forgot'); setError(''); setSuccess('') }}
                    style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 13 }}>
                    نسيت كلمة المرور؟
                  </button>
                </div>
              )}

              {/* زر الإرسال */}
              <button type="submit" disabled={loading}
                style={{
                  width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                  background: loading ? '#334155' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  color: '#fff', fontWeight: 700, fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer',
                  marginTop: 4, transition: 'all .3s',
                  boxShadow: loading ? 'none' : '0 4px 20px rgba(99,102,241,.4)'
                }}>
                {loading ? '⏳ جاري التحميل...' :
                  mode === 'login'    ? 'تسجيل الدخول ←' :
                  mode === 'register' ? 'إنشاء الحساب مجاناً ←' :
                  'إرسال رابط التعيين ←'}
              </button>

              {/* رجوع من forgot */}
              {mode === 'forgot' && (
                <button type="button" onClick={() => { setMode('login'); setError(''); setSuccess('') }}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, textAlign: 'center' }}>
                  ← العودة لتسجيل الدخول
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', color: '#334155', fontSize: 12, marginTop: 20 }}>
          © {new Date().getFullYear()} نيت برو — جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────
const inputStyle = {
  width: '100%', background: '#0f172a',
  border: '1px solid #334155', borderRadius: 10,
  padding: '11px 14px', color: '#f1f5f9',
  fontSize: 14, outline: 'none', boxSizing: 'border-box',
  transition: 'border-color .2s',
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Alert({ type, msg }) {
  const s = type === 'error'
    ? { bg: 'rgba(239,68,68,.1)', border: '#ef444444', color: '#fca5a5' }
    : { bg: 'rgba(16,185,129,.1)', border: '#10b98144', color: '#6ee7b7' }
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: s.color, lineHeight: 1.5 }}>
      {msg}
    </div>
  )
}
