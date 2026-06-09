// ReceiptModal — shared receipt chooser used in Payments, Debts, SubscriberDetail
import { printReceipt } from '../utils'

const RECEIPT_OPTS = [
  { mode: 'thermal', icon: '🖨️', label: 'طابعة حرارية',  desc: '72mm — طابعة الإيصالات', color: '#1a3fdb' },
  { mode: 'normal',  icon: '🖨️', label: 'طابعة عادية',   desc: 'A4 — أي طابعة',          color: '#6144f5' },
  { mode: 'image',   icon: '🖼️', label: 'صورة PNG',      desc: 'تحميل وصل كصورة',       color: '#059669' },
  { mode: 'pdf',     icon: '📄', label: 'PDF',           desc: 'حفظ أو إرسال كـ PDF',    color: '#d97706' },
]

export default function ReceiptModal({ data, onClose }) {
  if (!data) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 700,
      background: 'rgba(4,8,22,.88)', backdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: '100%', maxWidth: 540,
        background: 'var(--sur)',
        borderRadius: '26px 26px 0 0',
        padding: '10px 20px 44px',
        borderTop: '1px solid rgba(5,150,105,.4)',
        animation: 'slideUp .32s ease'
      }}>
        <div style={{
          width: 38, height: 4, background: 'var(--bdr)',
          borderRadius: 4, margin: '8px auto 20px'
        }} />
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 38 }}>🧾</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginTop: 8 }}>
            الدفعة مثبَّتة ✅
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4 }}>
            اختر طريقة إصدار الوصل
          </div>
        </div>

        {RECEIPT_OPTS.map(opt => (
          <button
            key={opt.mode}
            onClick={() => { printReceipt({ ...data, mode: opt.mode }); onClose() }}
            style={{
              width: '100%', padding: '13px 16px', borderRadius: 13,
              border: '1px solid var(--bdr)', background: 'var(--bg2)',
              cursor: 'pointer', marginBottom: 9,
              display: 'flex', alignItems: 'center', gap: 14,
              textAlign: 'right', transition: 'all .18s', fontFamily: 'inherit'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = opt.color; e.currentTarget.style.background = `${opt.color}0d` }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bdr)'; e.currentTarget.style.background = 'var(--bg2)' }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: `${opt.color}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, flexShrink: 0
            }}>{opt.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>{opt.label}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{opt.desc}</div>
            </div>
            <span style={{ fontSize: 18, color: opt.color }}>←</span>
          </button>
        ))}

        <button onClick={onClose} style={{
          width: '100%', padding: 12, borderRadius: 12,
          border: '1px solid var(--bdr)', background: 'transparent',
          color: 'var(--ink3)', fontWeight: 700, fontSize: 14,
          cursor: 'pointer', marginTop: 2, fontFamily: 'inherit'
        }}>
          تخطي — بدون وصل
        </button>
      </div>
    </div>
  )
}
