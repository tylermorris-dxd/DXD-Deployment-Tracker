'use client'

import React, { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import FleetMap from './FleetMap'
import { useRecentActivity, activityLabel, activityColor, timeAgo } from '@/lib/activity'
import { sfx } from '@/lib/sfx'

// Command Bridge — fullscreen tactical HUD. Feels like a mission-control
// board: fleet map full-bleed behind, corner-anchored metrics glowing,
// activity streaming down the right, live UTC clock, breathing scanlines.
// Meant for a spare monitor, a boardroom TV, or "hey what does DXD do?"
// moments where you want to point at a screen.
//
// Toggle: press F from anywhere (unless typing). Esc exits.

interface Props {
  open: boolean
  onClose: () => void
  onOpenDeal: (id: string) => void
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export default function CommandBridge({ open, onClose, onOpenDeal }: Props) {
  const [now, setNow] = useState(new Date())
  const activity = useRecentActivity(15)

  // Live-tick the clock every second while open.
  useEffect(() => {
    if (!open) return
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); sfx.whoosh() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects.list(),
    staleTime: 30_000,
    enabled: open,
  })
  const { data: activeDeals = [] } = useQuery({
    queryKey: ['hs-active'],
    queryFn: () => api.hubspot.getActive(),
    staleTime: 60_000,
    enabled: open,
    retry: false,
  })

  if (!open) return null

  const activeCount = projects.filter(p => !p.steadyState).length
  const steadyCount = projects.filter(p =>  p.steadyState).length
  const faaCount    = projects.filter(p =>  p.faaAuthorizationRequired).length
  const pipeline = activeDeals
    .filter(a => a.deal.properties.dealstage !== 'closedlost')
    .reduce((s, a) => s + (parseFloat(a.deal.properties.amount || '0') || 0), 0)

  const zulu = now.toISOString().slice(11, 19) + 'Z'
  const dateStr = now.toISOString().slice(0, 10)
  const dow = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()

  return (
    <div
      role="dialog"
      aria-label="Command Bridge"
      style={{
        position: 'fixed', inset: 0, zIndex: 800,
        background: '#050608', color: '#e8eaf0',
        overflow: 'hidden',
        animation: 'dxd-cb-fade 0.35s ease',
      }}
    >
      <style>{`
        @keyframes dxd-cb-fade   { from { opacity: 0 } to { opacity: 1 } }
        @keyframes dxd-cb-sweep  { to { transform: rotate(360deg) } }
        @keyframes dxd-cb-scan   { 0% { background-position: 0 -800px } 100% { background-position: 0 800px } }
        @keyframes dxd-cb-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes dxd-cb-blink  { 50% { opacity: 0 } }
      `}</style>

      {/* Fullscreen fleet map — the actual living background */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <FleetMap onOpenDeal={onOpenDeal} height="100%" />
      </div>

      {/* Ambient scanlines over the whole thing */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10,
        background: `repeating-linear-gradient(180deg, transparent 0, transparent 2px, rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 3px)`,
        animation: 'dxd-cb-scan 10s linear infinite',
        opacity: 0.5,
        mixBlendMode: 'screen' as const,
      }} />

      {/* Slow radar sweep in the top-right corner */}
      <div style={{
        position: 'absolute', top: '-8%', right: '-6%',
        width: 620, height: 620, borderRadius: '50%',
        background: 'conic-gradient(from 0deg, transparent 0%, rgba(210,35,42,0.18) 6%, transparent 14%, transparent 100%)',
        animation: 'dxd-cb-sweep 14s linear infinite',
        pointerEvents: 'none', zIndex: 15,
        maskImage: 'radial-gradient(circle at center, black 0%, black 55%, transparent 68%)',
        WebkitMaskImage: 'radial-gradient(circle at center, black 0%, black 55%, transparent 68%)',
      }} />

      {/* Vignette so corners darken */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 12,
        background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.75) 100%)',
      }} />

      {/* ── Top strip: brand, time, exit ────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: 20, padding: '14px 22px',
        background: 'linear-gradient(180deg, rgba(6,7,10,0.9), rgba(6,7,10,0))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#D2232A', boxShadow: '0 0 12px #D2232A88', animation: 'dxd-cb-blink 1.6s steps(2) infinite' }} />
          <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: 3, color: '#D2232A', textTransform: 'uppercase' }}>
            Command Bridge
          </span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#5a6380', letterSpacing: 1 }}>
            DXD · OPERATIONS · ACTIVE
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: 2, color: '#e8eaf0' }}>
            {zulu}
          </span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#9aa3b8', letterSpacing: 1 }}>
            {dow} · {dateStr}
          </span>
        </div>
        <button
          onClick={onClose}
          title="Exit Command Bridge (Esc / F)"
          style={{
            padding: '5px 12px', background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
            color: '#9aa3b8', cursor: 'pointer',
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 1,
          }}
        >
          EXIT
        </button>
      </div>

      {/* ── Left column: hero metric + sub-metrics ──────────────────────── */}
      <div style={{
        position: 'absolute', top: 76, left: 22, zIndex: 20,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <HudPanel accent="#D2232A" label="Total deployments" wide>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 800, fontSize: 88, lineHeight: 0.9, letterSpacing: -3, color: '#e8eaf0', textShadow: '0 0 40px rgba(210,35,42,0.25)' }}>
            {projects.length}
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#5a6380', letterSpacing: 1.5, marginTop: 4 }}>
            in fleet inventory
          </div>
        </HudPanel>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 148px)', gap: 8 }}>
          <HudPanel accent="#D2232A" label="Active"        value={String(activeCount)} />
          <HudPanel accent="#3FB95A" label="Steady"        value={String(steadyCount)} />
          <HudPanel accent="#3b82f6" label="FAA Pending"   value={String(faaCount)} />
          <HudPanel accent="#3FB95A" label="Pipeline"      value={fmtMoney(pipeline)} />
        </div>
      </div>

      {/* ── Right column: activity stream ───────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 76, right: 22, width: 320, zIndex: 20,
        background: 'rgba(6,7,10,0.75)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10, padding: '14px 16px',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3FB95A', boxShadow: '0 0 8px #3FB95A' }} />
          <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: 2, color: '#e8eaf0' }}>
            LIVE ACTIVITY
          </span>
          <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380' }}>
            {activity.length}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '58vh', overflowY: 'auto' }}>
          {activity.length === 0 ? (
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#5a6380', padding: '12px 0' }}>
              System quiet. Nothing to report.
            </div>
          ) : activity.map(e => {
            const color = activityColor(e.kind)
            return (
              <div
                key={e.id}
                onClick={() => e.projectId && (onOpenDeal(e.projectId), onClose())}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: e.projectId ? 'pointer' : 'default' }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}66`, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activityLabel(e)}
                </span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380', flexShrink: 0 }}>
                  {timeAgo(e.ts)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Bottom marquee: rolling deal ticker ─────────────────────────── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20,
        padding: '10px 0', background: 'linear-gradient(0deg, rgba(6,7,10,0.95), rgba(6,7,10,0))',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', gap: 24, whiteSpace: 'nowrap', width: 'fit-content', animation: `dxd-cb-marquee ${Math.max(30, projects.length * 6)}s linear infinite` }}>
          {[...projects, ...projects].map((p, i) => {
            const color = p.steadyState ? '#3FB95A' : p.faaAuthorizationRequired ? '#f59e0b' : '#D2232A'
            const state = p.steadyState ? 'STEADY' : p.faaAuthorizationRequired ? 'FAA' : 'ACTIVE'
            return (
              <div key={`${p.id}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#9aa3b8' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}88` }} />
                <span style={{ color: '#e8eaf0', fontWeight: 600 }}>{p.name}</span>
                <span style={{ color: '#5a6380' }}>·</span>
                <span style={{ color: '#5a6380' }}>{p.client || '—'}</span>
                <span style={{ color: '#5a6380' }}>·</span>
                <span style={{ color, letterSpacing: 1 }}>{state}</span>
                <span style={{ color: '#5a6380' }}>·</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Bottom hint ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 44, left: 22, zIndex: 25,
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380', letterSpacing: 2,
      }}>
        PRESS <span style={{ color: '#9aa3b8' }}>F</span> OR <span style={{ color: '#9aa3b8' }}>ESC</span> TO EXIT · <span style={{ color: '#9aa3b8' }}>⌘K</span> COMMAND
      </div>
    </div>
  )
}

function HudPanel({ accent, label, value, children, wide }: {
  accent: string
  label: string
  value?: string
  children?: React.ReactNode
  wide?: boolean
}) {
  return (
    <div style={{
      position: 'relative',
      background: 'rgba(6,7,10,0.7)', border: `1px solid ${accent}30`,
      borderRadius: 10, padding: '14px 16px',
      minWidth: wide ? 304 : 140,
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 2, color: `${accent}cc`, textTransform: 'uppercase' }}>
        {label}
      </div>
      {value != null ? (
        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 800, fontSize: 26, color: '#e8eaf0', letterSpacing: -0.5, marginTop: 4 }}>
          {value}
        </div>
      ) : children}
    </div>
  )
}
