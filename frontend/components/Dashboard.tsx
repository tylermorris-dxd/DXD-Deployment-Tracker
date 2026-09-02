'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { MainTab } from '@/app/page'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:      '#0a0b0d',
  card:    '#111318',
  surface2:'#181c23',
  border:  '#252b38',
  red:     '#D2232A',
  green:   '#22c55e',
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
export default function Dashboard({ onOpenDeal, onSwitchTab }: Props) {
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

  // ── Stat computations (nothing task-derived — only steady-state flag +
  //    HubSpot deal amounts) ───────────────────────────────────────────────
  const activeCount    = projects.filter(p => !p.steadyState).length
  const steadyCount    = projects.filter(p => p.steadyState).length
  const pipelineValue  = activeData
    .filter(a => a.deal.properties.dealstage !== 'closedlost')
    .reduce((s, a) => s + (parseFloat(a.deal.properties.amount || '0') || 0), 0)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 28px 60px' }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 800, fontSize: 22, color: C.text, letterSpacing: -0.5, marginBottom: 5 }}>
          Operations Dashboard
        </h1>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.muted }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        <StatCard label="Active Deals"   value={String(activeCount)}    sub={`${projects.length} total tracked`} color={C.blue}  />
        <StatCard label="Steady State"   value={String(steadyCount)}    sub="in ongoing operations"              color={C.green} />
        <StatCard label="Pipeline Value" value={fmtMoney(pipelineValue)} sub="open deals"                         color={C.green} />
      </div>

      {/* Widgets grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

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

        {/* HubSpot Sync */}
        <Widget>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: hsStatus?.connected ? C.green : C.muted, boxShadow: hsStatus?.connected ? `0 0 6px ${C.green}` : 'none', flexShrink: 0 }} />
            <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 14, color: C.text }}>HubSpot Sync</span>
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.muted, marginBottom: 14 }}>
            {hsStatus?.connected ? 'Connected and syncing' : 'Not connected — configure to sync deals'}
          </div>
          <button
            onClick={() => onSwitchTab('admin')}
            style={{ width: '100%', padding: '9px 0', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7, color: C.text2, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, cursor: 'pointer', letterSpacing: 0.5, transition: 'border-color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = C.text2)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
          >
            Configure HubSpot →
          </button>
        </Widget>

      </div>
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 18px 0', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 90, height: 90, background: `radial-gradient(circle at top right, ${color}18, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 1.5, color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: -1, lineHeight: 1, marginBottom: 6 }}>{value}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.text2, marginBottom: 16 }}>{sub}</div>
      <div style={{ height: 2, background: color, marginLeft: -18, marginRight: -18 }} />
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
