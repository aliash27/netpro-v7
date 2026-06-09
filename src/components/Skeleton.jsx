// Skeleton loaders — replaces ⏳ emoji loading states

export function SkeletonLine({ w = '100%', h = 14, mb = 8, radius = 8 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: radius,
      background: 'var(--skeleton)', marginBottom: mb,
      animation: 'shimmer 1.4s ease-in-out infinite'
    }} />
  )
}

export function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--sur)', border: '1px solid var(--bdr)',
      borderRadius: 16, padding: '14px 15px', marginBottom: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12, flexShrink: 0,
          background: 'var(--skeleton)', animation: 'shimmer 1.4s ease-in-out infinite'
        }} />
        <div style={{ flex: 1 }}>
          <SkeletonLine w="55%" h={13} mb={6} />
          <SkeletonLine w="35%" h={11} mb={0} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <SkeletonLine w={60} h={20} mb={5} />
          <SkeletonLine w={50} h={11} mb={0} />
        </div>
      </div>
    </div>
  )
}

export function SkeletonStatGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 14 }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{
          background: 'var(--sur)', border: '1px solid var(--bdr)',
          borderRadius: 16, padding: 16
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, marginBottom: 10,
            background: 'var(--skeleton)', animation: 'shimmer 1.4s ease-in-out infinite'
          }} />
          <SkeletonLine w="60%" h={11} mb={6} />
          <SkeletonLine w="80%" h={22} mb={0} />
        </div>
      ))}
    </div>
  )
}

export function SkeletonList({ count = 5 }) {
  return (
    <div>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
