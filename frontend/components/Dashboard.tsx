'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { MainTab } from '@/app/page'
import FleetMap from './FleetMap'
import LiveWeatherStrip from './LiveWeatherStrip'
import { useIsMobile } from '@/lib/useIsMobile'
import { useRecentActivity, activityLabel, activityColor, timeAgo } from '@/lib/activity'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:      '#0a0b0d',
  card:    '#111318',
  surface2:'#181c23',
  border:  '#252b38',
  red:     '#D2232A',
  green:   '#3FB95A',
  amber:   '#f59e0b',
  blue:    '#3b82f6',
  purple:  '#a855f7',
  text:    '#e8eaf0',
  text2:   '#9aa3b8',
  muted:   '#5a6380',
}

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  onOpenDeal:  (id: string) => void
  onSwitchTab: (tab: MainTab) => void
}

// ── Component ─────────────────────────────────────────────────────────────────
// Time-of-day greeting. Reads a little different at 3am vs 3pm on purpose —
// the operator opening the tool late feels seen without it being cheesy.
function timeOfDayHeader(): { line1: string; line2: string; accent: string } {
  const h = new Date().getHours()
  if (h < 5)  return { line1: 'OPERATIONS · EYES OPEN', line2: 'Late shift · everything quiet', accent: '#3b82f6' }
  if (h < 12) return { line1: 'GOOD MORNING, OPERATOR',  line2: "Today's fleet, in one glance",    accent: '#D2232A' }
  if (h < 17) return { line1: 'DXD OPERATIONS',           line2: 'Afternoon situation report',      accent: '#D2232A' }
  if (h < 21) return { line1: 'GOOD EVENING, OPERATOR',   line2: 'End-of-day fleet snapshot',       accent: '#f59e0b' }
  return       { line1: 'OPERATIONS · NIGHT WATCH',       line2: 'Overnight fleet status',          accent: '#a855f7' }
}

export default function Dashboard({ onOpenDeal, onSwitchTab }: Props) {
  const isMobile = useIsMobile()
  const activity = useRecentActivity(10)
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn:  () => api.projects.list(),
    staleTime: 30_000,
  })

  const { data: activeData = [] } = useQuery({
    queryKey: ['hs-active'],
    queryFn:  () => api.hubspot.getActive(),
    staleTime: 60_000,
    retry: false,
  })

  const { data: hsStatus } = useQuery({
    queryKey: ['hs-status'],
    queryFn:  () => api.hubspot.getStatus(),
    staleTime: 300_000,
    retry: false,
  })

  const dealMap = new Map(activeData.map(a => [a.projectId, a.deal]))
  const now = Date.now()

  // Bucket counts + pipeline value — no task derivations.
  const activeCount   = projects.filter(p => !p.steadyState).length
  const steadyCount   = projects.filter(p => p.steadyState).length
  const faaCount      = projects.filter(p => p.faaAuthorizationRequired).length
  const pipelineValue = activeData
    .filter(a => a.deal.properties.dealstage !== 'closedlost')
    .reduce((s, a) => s + (parseFloat(a.deal.properties.amount || '0') || 0), 0)
  // Steady-state MRR — sum of HubSpot amounts across steady-state projects.
  // The HubSpot amount is stored as MRR directly per the workspace's
  // convention (not annual), so no ÷12 here. Deals not linked to HubSpot
  // are skipped.
  const steadyMrr = projects
    .filter(p => p.steadyState)
    .reduce((s, p) => {
      const deal = activeData.find(a => a.projectId === p.id)?.deal
      return s + (parseFloat(deal?.properties.amount || '0') || 0)
    }, 0)

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const nowStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  const tod = timeOfDayHeader()

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '16px 14px 40px' : '28px 28px 60px' }}>

      {/* ─── HERO ─────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(210,35,42,0.10), rgba(17,19,24,0.6) 60%)',
        border: `1px solid ${C.border}`, borderRadius: 14, padding: isMobile ? '20px 18px' : '28px 32px', marginBottom: isMobile ? 16 : 22,
      }}>
        {/* Faint scanline flourish so the hero doesn't read empty */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `repeating-linear-gradient(0deg, transparent 0, transparent 3px, rgba(255,255,255,0.02) 3px, rgba(255,255,255,0.02) 4px)`,
          pointerEvents: 'none',
        }} />
        {/* Radar sweep — slow-rotating conic gradient anchored to the top-right
            corner. Nods to the tactical aesthetic without being noisy. */}
        <div style={{
          position: 'absolute',
          top: '-40%', right: '-15%',
          width: 460, height: 460,
          borderRadius: '50%',
          background: `conic-gradient(from 0deg, transparent 0%, rgba(210,35,42,0.14) 8%, transparent 16%, transparent 100%)`,
          animation: 'dxd-sweep 10s linear infinite',
          pointerEvents: 'none',
          maskImage: 'radial-gradient(circle at center, black 0%, black 55%, transparent 68%)',
          WebkitMaskImage: 'radial-gradient(circle at center, black 0%, black 55%, transparent 68%)',
        }} />
        <style>{`@keyframes dxd-sweep { to { transform: rotate(360deg) } }`}</style>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
            <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: 2.5, color: tod.accent, textTransform: 'uppercase' }}>
              {tod.line1}
            </span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.muted }}>
              {tod.line2} · {today} · {nowStr}Z
            </span>
          </div>

          {/* Hero row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 40, flexWrap: 'wrap', marginTop: 14 }}>
            <div>
              <div style={{
                fontFamily: "'Chakra Petch', sans-serif", fontWeight: 800,
                fontSize: isMobile ? 64 : 96, lineHeight: 0.9, color: C.text, letterSpacing: isMobile ? -2 : -4,
                textShadow: '0 0 40px rgba(210,35,42,0.15)',
              }}>
                {projects.length}
              </div>
              <div style={{
                fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700,
                fontSize: 13, letterSpacing: 3, color: C.text2, marginTop: 6, textTransform: 'uppercase',
              }}>
                Deployments Tracked
              </div>
            </div>

            {/* Sub-metrics stacked as three chips */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, flex: 1, minWidth: 260 }}>
              <SubMetric label="Active"        value={String(activeCount)}   color={C.red}   />
              <SubMetric label="Steady State"  value={String(steadyCount)}   color={C.green} />
              <SubMetric label="Steady MRR"    value={fmtMoney(steadyMrr)}   color={C.green} tint sub="from HubSpot amount" />
              <SubMetric label="Pipeline"      value={fmtMoney(pipelineValue)} color={C.green} tint />
              <SubMetric label="FAA Pending"   value={String(faaCount)}      color={C.blue}  />
            </div>
          </div>
        </div>
      </div>

      {/* ─── LIVE WEATHER STRIP ──────────────────────────────────────────── */}
      <LiveWeatherStrip />

      {/* ─── LIVE FLEET MAP ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.red, boxShadow: `0 0 8px ${C.red}88` }} />
            <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: 2.4, color: C.text }}>
              LIVE FLEET
            </span>
          </div>
          <button
            onClick={() => onSwitchTab('fleet')}
            style={{ padding: '5px 10px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text2, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 0.6, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = C.text2)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
          >
            Open full map →
          </button>
        </div>
        <FleetMap onOpenDeal={onOpenDeal} height={isMobile ? 300 : 420} />
      </div>

      {/* ─── Supporting widgets ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 14 : 20 }}>

        {/* Regulatory Tracker */}
        <Widget>
          <WHeader title="Regulatory Tracker" sub="FAA Auth" />
          {(() => {
            const faaDeals = projects.filter(p => p.faaAuthorizationRequired)
            if (faaDeals.length === 0) return <Empty>No FAA authorization tracked — enable per deal</Empty>
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {faaDeals.map(p => {
                  const startMs = p.faaAuthStartedAt ? new Date(p.faaAuthStartedAt).getTime() : new Date(p.createdAt).getTime()
                  const ageDays = Math.round((now - startMs) / 86_400_000)
                  const pct     = Math.min(ageDays / 112, 1)
                  const barColor = ageDays > 60 ? C.red : ageDays > 30 ? C.amber : C.green
                  const deal = dealMap.get(p.id)
                  return (
                    <div key={p.id} onClick={() => onOpenDeal(p.id)} style={{ cursor: 'pointer' }}>
                      <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 600, fontSize: 12, color: C.text, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {deal?.properties.dealname ?? p.name}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: C.muted }}>Day {ageDays} of ~112</span>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: barColor }}>{Math.round(pct * 100)}%</span>
                      </div>
                      <div style={{ height: 4, background: C.surface2, borderRadius: 2, overflow: 'hidden', marginBottom: 3 }}>
                        <div style={{ width: `${pct * 100}%`, height: '100%', background: barColor, borderRadius: 2 }} />
                      </div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: C.muted }}>FAA waiver: 4–24 weeks typical</div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </Widget>

        {/* Activity Feed */}
        <Widget>
          <WHeader title="Recent Activity" sub={`${activity.length}`} />
          {activity.length === 0 ? (
            <Empty>
              No activity yet. Toggle FAA or steady state on a deal to start the log.
            </Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
              {activity.map(e => {
                const color = activityColor(e.kind)
                return (
                  <div
                    key={e.id}
                    onClick={() => e.projectId && onOpenDeal(e.projectId)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '6px 4px', cursor: e.projectId ? 'pointer' : 'default',
                      borderRadius: 6, transition: 'background 0.1s',
                    }}
                    onMouseEnter={ev => { if (e.projectId) ev.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                    onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}66`, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {activityLabel(e)}
                    </span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: C.muted, flexShrink: 0 }}>
                      {timeAgo(e.ts)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          {/* HubSpot connection line — inline instead of full widget */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 10, borderTop: `1px solid rgba(255,255,255,0.05)` }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: hsStatus?.connected ? C.green : C.muted, boxShadow: hsStatus?.connected ? `0 0 6px ${C.green}` : 'none', flexShrink: 0 }} />
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.muted, flex: 1 }}>
              HubSpot {hsStatus?.connected ? 'connected' : 'disconnected'}
            </span>
            <button
              onClick={() => onSwitchTab('admin')}
              style={{ padding: '3px 8px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, color: C.text2, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, cursor: 'pointer', letterSpacing: 0.5 }}
            >
              Configure
            </button>
          </div>
        </Widget>

      </div>
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SubMetric({ label, value, color, tint, sub }: { label: string; value: string; color: string; tint?: boolean; sub?: string }) {
  return (
    <div style={{
      background: tint ? `${color}10` : 'rgba(24,28,35,0.6)',
      border: `1px solid ${tint ? `${color}35` : C.border}`,
      borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 1.5, color: C.muted, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 22, fontWeight: 800, color, letterSpacing: -0.5, lineHeight: 1.1, marginTop: 4 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 0.5, color: C.muted, marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function Widget({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px' }}>
      {children}
    </div>
  )
}

function WHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 14, color: C.text }}>{title}</span>
        {sub && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.muted }}>({sub})</span>}
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.muted, padding: '18px 0', textAlign: 'center' }}>
      {children}
    </div>
  )
}
