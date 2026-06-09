// ConfirmDialog — replaces browser confirm() with beautiful modal
import { useState } from 'react'

let _resolve = null
let _setOpen = null
let _setOpts = null

export function useConfirmDialog() {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState({ title: '', body: '', danger: false })
  _setOpen = setOpen
  _setOpts = setOpts

  function onConfirm() { setOpen(false); _resolve?.(true) }
  function onCancel()  { setOpen(false); _resolve?.(false) }

  return { open, opts, onConfirm, onCancel }
}

// Call this anywhere: const yes = await confirm({ title, body, danger })
export function confirm({ title = 'تأكيد', body = '', danger = false } = {}) {
  return new Promise(resolve => {
    _resolve = resolve
    _setOpts?.({ title, body, danger })
    _setOpen?.(true)
  })
}

export function ConfirmDialog({ open, opts, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(4,8,22,.78)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{
        background: 'var(--sur)', borderRadius: 20, padding: 28,
        maxWidth: 380, width: '100%',
        border: `1px solid ${opts.danger ? 'rgba(225,29,72,.3)' : 'var(--bdr)'}`,
        animation: 'scaleIn .2s ease'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>
            {opts.danger ? '⚠️' : '❓'}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>
            {opts.title}
          </div>
          {opts.body && (
            <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 8, lineHeight: 1.6 }}>
              {opts.body}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={onCancel} style={{
            padding: 13, borderRadius: 12, border: '1px solid var(--bdr)',
            background: 'transparent', color: 'var(--ink3)',
            fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit'
          }}>إلغاء</button>
          <button onClick={onConfirm} style={{
            padding: 13, borderRadius: 12, border: 'none',
            background: opts.danger
              ? 'linear-gradient(135deg,#b91c1c,#e11d48)'
              : 'linear-gradient(135deg,#1a3fdb,#6144f5)',
            color: '#fff', fontWeight: 800, fontSize: 14,
            cursor: 'pointer', fontFamily: 'inherit'
          }}>
            {opts.danger ? '🗑 حذف' : '✅ تأكيد'}
          </button>
        </div>
      </div>
      <style>{`@keyframes scaleIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  )
}
