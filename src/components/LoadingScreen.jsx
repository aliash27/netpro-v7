export default function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-logo">📡</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 20, fontWeight: 900,
          background: 'var(--gP)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          نيت برو
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600, marginTop: 4 }}>
          جاري التحميل...
        </div>
      </div>
      <div className="loading-bar">
        <div className="loading-fill" style={{ width: '70%' }} />
      </div>
      <style>{`
        @keyframes float {
          0%,100%{ transform:translateY(0) }
          50%{ transform:translateY(-8px) }
        }
        @keyframes glow {
          0%,100%{ box-shadow:0 0 40px rgba(26,63,219,.18) }
          50%{ box-shadow:0 0 60px rgba(26,63,219,.4) }
        }
        @keyframes shimmer {
          0%{ background-position:-200% 0 }
          100%{ background-position:200% 0 }
        }
      `}</style>
    </div>
  )
}
