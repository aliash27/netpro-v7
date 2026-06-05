import { useState, useEffect, useCallback } from 'react'

let addToastFn = null

export function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    addToastFn = (msg, type = 's', dur = 3500) => {
      const id = Date.now()
      setToasts(prev => [...prev, { id, msg, type }])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, dur)
    }
    return () => { addToastFn = null }
  }, [])

  const icons = { s: '✅', e: '❌', i: 'ℹ️', w: '⚠️' }
  const classes = { s: 'ts', e: 'te', i: 'ti', w: 'tw' }

  return (
    <div style={{
      position: 'fixed', bottom: 84, left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 8000, display: 'flex',
      flexDirection: 'column', gap: 8,
      alignItems: 'center', pointerEvents: 'none'
    }}>
      {toasts.map(t => (
        <div key={t.id} className={`toast ${classes[t.type] || 'ti'}`}>
          <span>{icons[t.type] || 'ℹ️'}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  )
}

export function toast(msg, type = 's', dur = 3500) {
  if (addToastFn) addToastFn(msg, type, dur)
}
