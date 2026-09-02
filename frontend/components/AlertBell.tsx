'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useAlerts, markAllSeen, dismissAlert, generateAlerts, Alert } from '@/lib/alerts'
import { requestOpenDeal } from '@/lib/nav'
import { sfx } from '@/lib/sfx'

const toneColor = (t: Alert['tone']) => {
  switch (t) {
    case 'urgent': return '#D2232A'
    case 'warn':   return '#f59e0b'
    case 'good':   return '#3FB95A'
    default:       return '#3b82f6'
  }
}

export default function AlertBell() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const store = useAlerts()

  const unseen = store.alerts.filter(a => !store.seenIds.includes(a.id))
  const hasUnseen = unseen.length > 0

  // Kick off the first generation on mount (respects the 24h dedupe).
  useEffect(() => { void generateAlerts(false) }, [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle() {
    setOpen(v => {
      const next = !v
      if (next && hasUnseen) markAllSeen()
      sfx.click()
      return next
    })
  }

  async function refresh() {
    sfx.ping()
    await generateAlerts(true)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={toggle}
        title="Fleet Sentry alerts"
        aria-label="Alerts"
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32,
          background: open ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${open ? 'rgba(255,255,255,0.15)' : '#252b38'}`,
          borderRadius: 7, color: '#9aa3b8', cursor: 'pointer', padding: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1.5c-2 0-3.5 1.5-3.5 3.5v2L2 9v.5h10V9l-1.5-2v-2C10.5 3 9 1.5 7 1.5z"
            stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M5.7 11c.2.6.7 1 1.3 1s1.1-.4 1.3-1"
            stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        {hasUnseen && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            minWidth: 14, height: 14, borderRadius: 8, padding: '0 4px',
            background: '#D2232A', color: '#fff',
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 8px rgba(210,35,42,0.6)',
            border: '1px solid #0a0b0d',
          }}>
            {unseen.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          // On mobile pin below the topbar and center; the anchored popover
          // was drifting off-screen when the topbar wraps. Cap to 70dvh so
          // long lists scroll instead of getting cut off by iOS chrome.
          top: 60, right: 12, left: 'auto',
          width: 380, maxWidth: 'calc(100vw - 24px)', maxHeight: '70dvh', overflowY: 'auto',
          background: '#12141a', border: '1px solid #2a3040',
          borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', zIndex: 400,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: 'linear-gradient(135deg, #D2232A, #7a1c22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M7 1.5c-2 0-3.5 1.5-3.5 3.5v2L2 9v.5h10V9l-1.5-2v-2C10.5 3 9 1.5 7 1.5z" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M5.7 11c.2.6.7 1 1.3 1s1.1-.4 1.3-1" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 700, color: '#e8eaf0' }}>
                Fleet Sentry
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380' }}>
                {store.generatedAt ? `Refreshed ${new Date(store.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'Awaiting first scan'}
              </div>
            </div>
            <button
              onClick={refresh}
              style={{ padding: '4px 10px', background: 'transparent', border: '1px solid #2a3040', borderRadius: 5, color: '#9aa3b8', cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}
            >
              Rescan
            </button>
          </div>

          {store.alerts.length === 0 ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#5a6380' }}>
              System nominal. No alerts today.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {store.alerts.map(a => {
                const color = toneColor(a.tone)
                return (
                  <div key={a.id} style={{
                    display: 'flex', gap: 10, padding: '12px 14px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}88`, flexShrink: 0, marginTop: 5 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 700, color: '#e8eaf0', flex: 1 }}>
                          {a.title}
                        </span>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color, letterSpacing: 1, textTransform: 'uppercase' as const }}>
                          {a.tone}
                        </span>
                      </div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#9aa3b8', marginTop: 4, lineHeight: 1.5 }}>
                        {a.body}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                        {a.projectId && (
                          <button
                            onClick={() => { requestOpenDeal(a.projectId!); setOpen(false) }}
                            style={{ padding: '3px 10px', background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 5, color, cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 0.5 }}
                          >
                            Open {a.projectName ? `→ ${a.projectName}` : 'deal'}
                          </button>
                        )}
                        <button
                          onClick={() => dismissAlert(a.id)}
                          style={{ padding: '3px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#5a6380', cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 0.5 }}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380', textAlign: 'center' as const }}>
            Scanned by Claude Haiku · auto-refresh every 24h
          </div>
        </div>
      )}
    </div>
  )
}
