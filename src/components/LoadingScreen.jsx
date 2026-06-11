export default function LoadingScreen() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'linear-gradient(145deg,#eef1ff,#e6ecff,#f2eeff)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 20, fontFamily: "'Tajawal', system-ui, sans-serif"
    }}>
      {/* Logo */}
      <div style={{
        width: 72, height: 72, borderRadius: 22,
        background: 'linear-gradient(135deg,#1a3fdb,#6144f5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 36,
        boxShadow: '0 0 40px rgba(26,63,219,.3)',
        animation: 'npFloat 4s ease-in-out infinite, npGlow 3s infinite'
      }}>📡</div>

      {/* اسم */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 20, fontWeight: 900,
          background: 'linear-gradient(135deg,#1a3fdb,#6144f5,#9c27b0)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>نيت برو</div>
        <div style={{ fontSize: 12, color: '#4a5580', fontWeight: 600, marginTop: 4 }}>
          جاري التحميل...
        </div>
      </div>

      {/* شريط التحميل */}
      <div style={{
        width: 200, height: 3, background: 'rgba(80,100,220,.13)',
        borderRadius: 3, overflow: 'hidden'
      }}>
        <div style={{
          height: '100%', borderRadius: 3, width: '70%',
          background: 'linear-gradient(90deg,#1a3fdb,#6144f5)',
          backgroundSize: '200% 100%',
          animation: 'npShimmer 1.2s ease infinite'
        }} />
      </div>

      <style>{`
        @keyframes npFloat {
          0%,100%{ transform:translateY(0) }
          50%{ transform:translateY(-8px) }
        }
        @keyframes npGlow {
          0%,100%{ box-shadow:0 0 40px rgba(26,63,219,.3) }
          50%{ box-shadow:0 0 60px rgba(26,63,219,.5) }
        }
        @keyframes npShimmer {
          0%{ background-position:-200% 0 }
          100%{ background-position:200% 0 }
        }
      `}</style>
    </div>
  )
}
