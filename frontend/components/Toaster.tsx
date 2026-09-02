'use client'

import React, { useEffect, useState } from 'react'
import { toastBus, ToastPayload } from '@/lib/toast'
import { sfx } from '@/lib/sfx'

// Global toast renderer. Subscribes to the toast bus and stacks live
// toasts in the lower-right. Each toast tracks its own countdown ring
// so an undoable toast visibly runs out of time.

interface LiveToast extends ToastPayload {
  bornAt: number
  gone?: boolean
}

export default function Toaster() {
  const [toasts, setToasts] = useState<LiveToast[]>([])

  useEffect(() => {
    return toastBus.subscribe(t => {
      setToasts(prev => [...prev, { ...t, bornAt: Date.now() }])
      // Slight sonar chirp so the operator hears success without looking.
      if (t.tone === 'error') sfx.err()
      else if (t.tone === 'undo') sfx.whoosh()
      else sfx.ack()
    })
  }, [])

  // Tick every 100ms so the countdown ring animates smoothly-ish.
  const [, force] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => force(v => v + 1), 100)
    return () => clearInterval(iv)
  }, [])

  // Commit + expire toasts whose window has elapsed.
  useEffect(() => {
    const now = Date.now()
    const expired = toasts.filter(t => now - t.bornAt >= t.durationMs && !t.gone)
    if (expired.length === 0) return
    for (const t of expired) {
      // If it has undo, commit now (unless the user already undid).
      if (t.undo && !t.undo.committed && !t.undo.undone) t.undo.onCommit()
    }
    setToasts(prev => prev.map(p => expired.some(e => e.id === p.id) ? { ...p, gone: true } : p))
    const cleanup = setTimeout(() => {
      setToasts(prev => prev.filter(p => !expired.some(e => e.id === p.id)))
    }, 260)
    return () => clearTimeout(cleanup)
  })

  const dismiss = (id: string) => {
    // Undoing before expiry
    const t = toasts.find(x => x.id === id)
    if (t?.undo && !t.undo.committed && !t.undo.undone) t.undo.onUndo()
    setToasts(prev => prev.map(p => p.id === id ? { ...p, gone: true } : p))
    setTimeout(() => setToasts(prev => prev.filter(p => p.id !== id)), 260)
  }

  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 1000,
      display: 'flex', flexDirection: 'column-reverse', gap: 10,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => {
        const c = toneColor(t.tone)
        const elapsed = Date.now() - t.bornAt
        const remaining = Math.max(0, 1 - elapsed / t.durationMs)
        return (
          <div key={t.id} style={{
            minWidth: 280, maxWidth: 380,
            background: 'rgba(17,19,24,0.96)', border: `1px solid ${c.border}`,
            borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 12,
            alignItems: 'center', pointerEvents: 'auto',
            boxShadow: `0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px ${c.glow} inset`,
            transform: t.gone ? 'translateX(20px)' : 'translateX(0)',
            opacity: t.gone ? 0 : 1,
            transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          }}>
            {/* Countdown ring */}
            <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
              <circle cx="9" cy="9" r="7" fill="none" stroke={`${c.dot}30`} strokeWidth="2" />
              <circle
                cx="9" cy="9" r="7" fill="none" stroke={c.dot} strokeWidth="2"
                strokeDasharray={`${(remaining * 44).toFixed(2)} 44`}
                transform="rotate(-90 9 9)"
                strokeLinecap="round"
              />
              <circle cx="9" cy="9" r="2.5" fill={c.dot} />
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 700, color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title}
              </div>
              {t.detail && (
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#9aa3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.detail}
                </div>
              )}
            </div>
            {t.undo ? (
              <button
                onClick={() => dismiss(t.id)}
                style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 5, color: c.dot, cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 0.8, flexShrink: 0 }}
              >
                {t.undo.label}
              </button>
            ) : (
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                style={{ background: 'transparent', border: 'none', color: '#5a6380', cursor: 'pointer', padding: 2, fontSize: 14, lineHeight: 1, flexShrink: 0 }}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function toneColor(tone: ToastPayload['tone']): { dot: string; border: string; glow: string } {
  switch (tone) {
    case 'success': return { dot: '#3FB95A', border: '#2a3040', glow: 'rgba(63,185,90,0.12)' }
    case 'warn':    return { dot: '#f59e0b', border: '#2a3040', glow: 'rgba(245,158,11,0.12)' }
    case 'error':   return { dot: '#D2232A', border: '#2a3040', glow: 'rgba(210,35,42,0.12)' }
    case 'undo':    return { dot: '#f59e0b', border: '#3a2a1a', glow: 'rgba(245,158,11,0.14)' }
    default:        return { dot: '#3b82f6', border: '#2a3040', glow: 'rgba(59,130,246,0.12)' }
  }
}
