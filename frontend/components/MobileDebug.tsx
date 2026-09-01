'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'

// Small in-page diagnostic overlay for mobile Safari where we can't attach
// a devtools inspector. Reads window state, runs a probe request against
// /api/me and /api/projects, and displays the results as tappable rows.
// Hidden by default; tap the tiny corner chip to expand.
export default function MobileDebug() {
  const [open, setOpen] = useState(false)
  const [ww, setWw] = useState(0)
  const [wh, setWh] = useState(0)
  const [ua, setUa] = useState('')
  const [meState, setMeState] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle')
  const [meVal, setMeVal] = useState<string>('')
  const [projState, setProjState] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle')
  const [projVal, setProjVal] = useState<string>('')
  const [caughtErrs, setCaughtErrs] = useState<string[]>([])

  useEffect(() => {
    setWw(window.innerWidth)
    setWh(window.innerHeight)
    setUa(navigator.userAgent)
    const onError = (e: ErrorEvent) => {
      setCaughtErrs(prev => [...prev.slice(-5), `${e.message} @ ${e.filename}:${e.lineno}`])
    }
    const onReject = (e: PromiseRejectionEvent) => {
      const reason = e.reason instanceof Error ? e.reason.message : String(e.reason)
      setCaughtErrs(prev => [...prev.slice(-5), `Promise rejected: ${reason}`])
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onReject)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onReject)
    }
  }, [])

  const probe = useCallback(async () => {
    setMeState('loading'); setMeVal('')
    try {
      const me = await api.me()
      setMeState('ok'); setMeVal(JSON.stringify(me))
    } catch (e) {
      setMeState('err'); setMeVal(e instanceof Error ? e.message : String(e))
    }
    setProjState('loading'); setProjVal('')
    try {
      const list = await api.projects.list()
      setProjState('ok'); setProjVal(`${list.length} project(s)`)
    } catch (e) {
      setProjState('err'); setProjVal(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => { probe() }, [probe])

  // Only expose the widget on narrow viewports (mobile). Desktop users
  // shouldn't see it. We don't gate this in a useState — a simple
  // window.innerWidth check is fine because the widget rerenders when
  // the chip is tapped.
  if (ww === 0 || ww > 900) return null

  const chip = (label: string, state: string, ok = 'ok') => {
    const color = state === 'loading' ? '#f5c45b' : state === ok ? '#4ec94e' : state === 'err' ? '#e24b4a' : '#888'
    return <span style={{ padding: '2px 6px', borderRadius: 4, background: `${color}22`, color, fontSize: 10, marginLeft: 4 }}>{label}: {state}</span>
  }

  return (
    <>
      {/* Corner tap target */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed', right: 8, bottom: 8, zIndex: 9999,
          background: open ? '#c0392b' : 'rgba(0,0,0,0.85)',
          color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 20, padding: '6px 12px',
          fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        }}
      >
        {open ? 'CLOSE' : 'DEBUG'}
      </button>

      {open && (
        <div
          style={{
            position: 'fixed', inset: '40px 8px 60px 8px', zIndex: 9998,
            background: 'rgba(10,11,13,0.98)', border: '1px solid #444', borderRadius: 8,
            padding: 12, color: '#e8e8e8', fontFamily: 'monospace', fontSize: 11,
            overflowY: 'auto', lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8, color: '#4a9eff' }}>MOBILE DIAGNOSTIC</div>

          <div>Viewport: {ww} × {wh}</div>
          <div style={{ wordBreak: 'break-all', color: '#aaa', fontSize: 10, marginTop: 4 }}>{ua}</div>

          <div style={{ marginTop: 12, fontWeight: 700, color: '#4a9eff' }}>API PROBE</div>
          <div>/api/me {chip(meVal || '—', meState)}</div>
          <div>/api/projects {chip(projVal || '—', projState)}</div>
          <button
            onClick={probe}
            style={{ marginTop: 6, padding: '5px 10px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, fontFamily: 'monospace', fontSize: 11 }}
          >
            RE-PROBE
          </button>

          <div style={{ marginTop: 12, fontWeight: 700, color: '#4a9eff' }}>CAUGHT ERRORS ({caughtErrs.length})</div>
          {caughtErrs.length === 0 ? (
            <div style={{ color: '#4ec94e' }}>None</div>
          ) : (
            caughtErrs.map((e, i) => (
              <div key={i} style={{ color: '#e24b4a', wordBreak: 'break-all', paddingTop: 2 }}>{e}</div>
            ))
          )}

          <div style={{ marginTop: 12, fontSize: 10, color: '#666' }}>
            Tap CLOSE (top-right) to dismiss. Screenshot this and send it back if the app still isn&apos;t working.
          </div>
        </div>
      )}
    </>
  )
}
