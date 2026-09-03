'use client'

import React, { useEffect, useState } from 'react'

// One-time boot animation. Runs on the very first session load and any
// time the user hard-reloads. Skippable — click or press any key. Stays
// out of the way once dismissed for the rest of the tab's lifetime.

const STAGE_KEY = 'dxd-booted-this-session'

const LINES: Array<{ label: string; delay: number }> = [
  { label: 'BOOTING DEUS X CORE',        delay: 60  },
  { label: 'AUTHENTICATING OPERATOR',    delay: 220 },
  { label: 'ACQUIRING FLEET TELEMETRY',  delay: 420 },
  { label: 'SYNCING HUBSPOT PIPELINE',   delay: 620 },
  { label: 'GEOCODE CACHE HOT',          delay: 800 },
  { label: 'READY',                      delay: 980 },
]

export default function BootSequence() {
  // Only run the boot sequence once per tab session.
  const [show, setShow] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem(STAGE_KEY) !== '1'
  })
  const [step, setStep] = useState(0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (!show) return
    const timers = LINES.map((line, i) => setTimeout(() => setStep(i + 1), line.delay))
    const fadeT = setTimeout(() => setFading(true), 1200)
    const doneT = setTimeout(() => {
      try { sessionStorage.setItem(STAGE_KEY, '1') } catch { /* private mode */ }
      setShow(false)
    }, 1550)
    // Belt-and-suspenders: no matter what timers get throttled or dropped,
    // the boot overlay is gone by 3s. Prevents the classic "iOS backgrounded
    // the tab" bug where setTimeout(1550) stalls forever.
    const safetyT = setTimeout(() => setShow(false), 3000)
    const skip = () => {
      try { sessionStorage.setItem(STAGE_KEY, '1') } catch { /* private mode */ }
      setFading(true)
      setTimeout(() => setShow(false), 200)
    }
    window.addEventListener('keydown', skip)
    window.addEventListener('mousedown', skip)
    // touchstart was missing — on iOS Safari tapping the boot sequence to
    // skip did nothing, so if the auto-timer also missed (throttled tab,
    // low-power mode) the overlay stayed up and blocked all interaction.
    window.addEventListener('touchstart', skip, { passive: true })
    return () => {
      timers.forEach(clearTimeout)
      clearTimeout(fadeT); clearTimeout(doneT); clearTimeout(safetyT)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('mousedown', skip)
      window.removeEventListener('touchstart', skip)
    }
  }, [show])

  if (!show) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#050608', color: '#e8eaf0',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      transition: 'opacity 0.3s',
      opacity: fading ? 0 : 1,
      pointerEvents: fading ? 'none' : 'auto',
    }}>
      <style>{`
        @keyframes dxd-scan {
          0%   { background-position: 0 -800px; }
          100% { background-position: 0 800px; }
        }
        @keyframes dxd-cursor {
          50% { opacity: 0; }
        }
      `}</style>

      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `repeating-linear-gradient(180deg,
          transparent 0px,
          transparent 2px,
          rgba(255,255,255,0.02) 2px,
          rgba(255,255,255,0.02) 3px)`,
        animation: 'dxd-scan 8s linear infinite',
        opacity: 0.6,
      }} />
      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.85) 100%)',
      }} />

      {/* Center block */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, minWidth: 340 }}>

        {/* Logo mark — SVG drawn stroke by stroke */}
        <svg width="72" height="72" viewBox="0 0 72 72" style={{ display: 'block' }}>
          <rect x="6" y="6" width="60" height="60" rx="10" fill="none" stroke="#D2232A" strokeWidth="2"
            strokeDasharray="240" strokeDashoffset="240"
            style={{ animation: 'dxd-draw 0.9s ease forwards' }} />
          <text x="36" y="46" textAnchor="middle" fill="#D2232A" fontFamily="'Chakra Petch', sans-serif" fontWeight="800" fontSize="26" letterSpacing="-1"
            style={{ opacity: 0, animation: 'dxd-fadein 0.6s ease 0.6s forwards' }}>
            DXD
          </text>
          <style>{`
            @keyframes dxd-draw   { to { stroke-dashoffset: 0 } }
            @keyframes dxd-fadein { to { opacity: 1 } }
          `}</style>
        </svg>

        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, letterSpacing: 4, color: '#D2232A', textTransform: 'uppercase' }}>
          Deus X Defense · Ops Tracker
        </div>

        {/* Ticker */}
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#9aa3b8',
          minHeight: 130, minWidth: 300,
        }}>
          {LINES.slice(0, step).map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, animation: 'dxd-fadein 0.3s ease' }}>
              <span style={{ color: l.label === 'READY' ? '#3FB95A' : '#3FB95A' }}>[OK]</span>
              <span style={{ color: l.label === 'READY' ? '#e8eaf0' : '#9aa3b8' }}>{l.label}</span>
            </div>
          ))}
          {step < LINES.length && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#f59e0b' }}>[…]</span>
              <span>{LINES[step]?.label ?? ''}</span>
              <span style={{ animation: 'dxd-cursor 1s steps(1) infinite', color: '#9aa3b8' }}>_</span>
            </div>
          )}
        </div>

        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380', letterSpacing: 2 }}>
          CLICK OR PRESS ANY KEY TO SKIP
        </div>
      </div>
    </div>
  )
}
