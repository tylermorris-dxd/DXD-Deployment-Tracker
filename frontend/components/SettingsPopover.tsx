'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useSettings, updateSettings } from '@/lib/settings'
import { sfx } from '@/lib/sfx'

export default function SettingsPopover() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const settings = useSettings()

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

  const row = (label: string, desc: string, on: boolean, onChange: () => void, kbdHint?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 600, color: '#e8eaf0' }}>{label}</span>
          {kbdHint && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380' }}>{kbdHint}</span>}
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#5a6380', marginTop: 2 }}>{desc}</div>
      </div>
      <button
        onClick={() => { onChange(); if (!on) sfx.ack(); else sfx.click() }}
        role="switch"
        aria-checked={on}
        style={{
          width: 36, height: 20, borderRadius: 12, padding: 2,
          background: on ? 'rgba(63,185,90,0.5)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${on ? 'rgba(63,185,90,0.7)' : 'rgba(255,255,255,0.15)'}`,
          cursor: 'pointer', transition: 'all 0.15s',
          display: 'flex', flexShrink: 0,
        }}
      >
        <span style={{
          width: 14, height: 14, borderRadius: '50%', background: on ? '#3FB95A' : '#9aa3b8',
          transform: on ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
          boxShadow: on ? '0 0 6px #3FB95A88' : 'none',
        }} />
      </button>
    </div>
  )

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen(v => !v); sfx.click() }}
        title="Settings"
        aria-label="Settings"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32,
          background: open ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${open ? 'rgba(255,255,255,0.15)' : '#252b38'}`,
          borderRadius: 7, color: '#9aa3b8', cursor: 'pointer', padding: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="1.8" stroke="currentColor" strokeWidth="1.3" />
          <path d="M7 1.5v1.5M7 11v1.5M1.5 7h1.5M11 7h1.5M2.9 2.9l1.1 1.1M10 10l1.1 1.1M2.9 11.1l1.1-1.1M10 4l1.1-1.1"
            stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'fixed', top: 60, right: 12, left: 'auto',
          width: 320, maxWidth: 'calc(100vw - 24px)',
          background: '#12141a', border: '1px solid #2a3040',
          borderRadius: 10, overflow: 'hidden', zIndex: 300,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 700, color: '#e8eaf0', letterSpacing: 0.5 }}>
              INTERFACE SETTINGS
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380', marginTop: 3 }}>
              Local to this browser
            </div>
          </div>
          {row(
            'Sound',
            'Sonar chirps on palette open, action commit, and toast.',
            settings.sound,
            () => updateSettings({ sound: !settings.sound }),
          )}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
          {row(
            'Crosshair cursor',
            'Tactical crosshair when hovering the Fleet Map.',
            settings.crosshair,
            () => updateSettings({ crosshair: !settings.crosshair }),
          )}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
          {row(
            'Small physics',
            'Springy micro-animations on cards, pills, and toggles.',
            settings.physics,
            () => updateSettings({ physics: !settings.physics }),
          )}
        </div>
      )}
    </div>
  )
}
