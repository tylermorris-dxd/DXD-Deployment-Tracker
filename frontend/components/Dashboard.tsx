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

const STAGE_NAMES: Record<number, string> = {
  1:  'Identify & Qualify',      2:  'Discovery & Assessment',  3:  'Opportunity Capture',
  4:  'Solution Design',         5:  'Proposal & Scoping',      6:  'Negotiation & Close',
  7:  'Deployment Prep',         8:  'Site Preparation',        9:  'Installation',
  10: 'Testing & Validation',    11: 'Ops Transition',          12: 'Active Operations',
}

const HANDOFF_INFO: Record<number, { from: string; to: string; desc: string }> = {
  3:  { from: 'Capture',   to: 'Solutions', desc: 'Capture → Solutions handoff required' },
  6:  { from: 'Solutions', to: 'Delivery',  desc: 'Solutions → Delivery handoff required' },
  10: { from: 'Delivery',  to: 'Operations',desc: 'Delivery → Ops handoff required' },
}

function stageColor(n: number) { return n <= 3 ? '#D2232A' : n <= 6 ? '#2563EB' : '#16A34A' }
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

  // ── Stat computations ──────────────────────────────────────────────────────
  const activeProjects     = projects.filter(p => p.currentStage != null)
  const pipelineValue      = activeData
    .filter(a => a.deal.properties.dealstage !== 'closedlost')
    .reduce((s, a) => s + (parseFloat(a.deal.properties.amount || '0') || 0), 0)
  const pendingHandoffs    = projects.filter(p => p.currentStage === 3 || p.currentStage === 6 || p.currentStage === 10)
  const atRisk             = projects.filter(p => {
    if (!p.currentStage) return false
    const ageDays = (now - new Date(p.createdAt).getTime()) / 86_400_000
    return ageDays > 30 && p.totalTasks > 0 && p.doneTasks / p.totalTasks < 0.15
  })
  const closedWon30d       = activeData.filter(a => {
    const d = a.deal.properties
    if (d.dealstage !== 'closedwon') return false
    const ms = new Date(d.closedate || '').getTime()
    return ms > 0 && now - ms <= 30 * 86_400_000
  })
  const closedWon30dValue  = closedWon30d.reduce((s, a) => s + (parseFloat(a.deal.properties.amount || '0') || 0), 0)

  // ── Pipeline by stage ──────────────────────────────────────────────────────
  const stageDist = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1
    const ps = projects.filter(p => p.currentStage === n)
    const val = ps.reduce((s, p) => s + (parseFloat(dealMap.get(p.id)?.properties.amount || '0') || 0), 0)
    return { n, name: STAGE_NAMES[n] ?? `Stage ${n}`, count: ps.length, value: val, color: stageColor(n), projects: ps }
  }).filter(s => s.count > 0)

  const maxCount = Math.max(...stageDist.map(s => s.count), 1)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 28px 60px' }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22, color: C.text, letterSpacing: -0.5, marginBottom: 5 }}>
          Operations Dashboard
        </h1>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.muted }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
          <span style={{ color: C.text2 }}>DXD Defense</span>
        </div>
      </div>

      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 28 }}>
        <StatCard label="Active Deals"      value={String(activeProjects.length)}   sub={`${projects.length} total tracked`}                                   color={C.blue}   />
        <StatCard label="Pipeline Value"    value={fmtMoney(pipelineValue)}          sub="open deals"                                                          color={C.green}  />
        <StatCard label="Pending Handoffs"  value={String(pendingHandoffs.length)}   sub="at stages 3, 6 & 10"                                                 color={C.red}    />
        <StatCard label="At Risk"           value={String(atRisk.length)}            sub=">30 days · <15% complete"                                             color={C.amber}  />
        <StatCard label="Closed Won (30d)"  value={String(closedWon30d.length)}      sub={closedWon30d.length ? fmtMoney(closedWon30dValue) : 'no recent closes'} color={C.purple} />
      </div>

      {/* Two-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

        {/* ── Left column ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Critical Handoffs */}
          <Widget>
            <WHeader title="Critical Handoffs" badge={pendingHandoffs.length} badgeColor={C.red} />
            {pendingHandoffs.length === 0 ? (
              <Empty>No pending handoffs — all clear ✓</Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendingHandoffs.map(p => {
                  const stage = p.currentStage!
                  const info  = HANDOFF_INFO[stage]
                  const deal  = dealMap.get(p.id)
                  return (
                    <div key={p.id} onClick={() => onOpenDeal(p.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = C.red + '50')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.red, flexShrink: 0, boxShadow: `0 0 6px ${C.red}` }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {deal?.properties.dealname ?? p.name}
                        </div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.muted, marginTop: 2 }}>
                          {info?.desc} · {info?.from} → {info?.to}
                        </div>
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.red, background: 'rgba(210,35,42,0.1)', border: `1px solid rgba(210,35,42,0.25)`, borderRadius: 5, padding: '2px 8px', flexShrink: 0 }}>
                        S{stage}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Widget>

          {/* Pipeline by Stage */}
          <Widget>
            <WHeader title="Pipeline by Stage" action={{ label: 'View All →', onClick: () => onSwitchTab('pipeline') }} />
            {stageDist.length === 0 ? (
              <Empty>No deals with stage data yet</Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {stageDist.map(s => (
                  <div key={s.n} onClick={() => onSwitchTab('pipeline')}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 7, cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.surface2)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ width: 24, height: 24, borderRadius: '50%', border: `1.5px solid ${s.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: s.color, fontWeight: 600 }}>{s.n}</span>
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.text2, width: 168, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    <div style={{ flex: 1, height: 5, background: C.surface2, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${(s.count / maxCount) * 100}%`, height: '100%', background: s.color, borderRadius: 3, transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.text, width: 18, textAlign: 'right', flexShrink: 0 }}>{s.count}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.green, width: 52, textAlign: 'right', flexShrink: 0 }}>
                      {s.value > 0 ? fmtMoney(s.value) : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Widget>

        </div>

        {/* ── Right column ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Recent Activity */}
          <Widget>
            <WHeader title="Recent Activity" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeProjects.slice(0, 5).map(p => {
                const deal = dealMap.get(p.id)
                const pct  = p.totalTasks > 0 ? Math.round((p.doneTasks / p.totalTasks) * 100) : 0
                return (
                  <div key={p.id} onClick={() => onOpenDeal(p.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.surface2)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: C.surface2, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: p.currentStage ? stageColor(p.currentStage) : C.green, fontWeight: 700 }}>
                        {p.currentStage ?? '✓'}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {deal?.properties.dealname ?? p.name}
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.muted, marginTop: 1 }}>
                        {p.doneTasks}/{p.totalTasks} tasks · {pct}% complete
                      </div>
                    </div>
                  </div>
                )
              })}
              {activeProjects.length === 0 && <Empty>No active deals</Empty>}
            </div>
          </Widget>

          {/* Regulatory Tracker */}
          <Widget>
            <WHeader title="Regulatory Tracker" sub="Drone Deals" />
            {(() => {
              const faaDeals = projects.filter(p => p.currentStage === 7 || p.currentStage === 8)
              if (faaDeals.length === 0) return <Empty>No deals in FAA waiver window</Empty>
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {faaDeals.map(p => {
                    const ageDays = Math.round((now - new Date(p.createdAt).getTime()) / 86_400_000)
                    const pct     = Math.min(ageDays / 112, 1)
                    const barColor = ageDays > 60 ? C.red : ageDays > 30 ? C.amber : C.green
                    const deal = dealMap.get(p.id)
                    return (
                      <div key={p.id} onClick={() => onOpenDeal(p.id)} style={{ cursor: 'pointer' }}>
                        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, color: C.text, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {deal?.properties.dealname ?? p.name}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.muted }}>Day {ageDays} of ~112</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: barColor }}>{Math.round(pct * 100)}%</span>
                        </div>
                        <div style={{ height: 4, background: C.surface2, borderRadius: 2, overflow: 'hidden', marginBottom: 3 }}>
                          <div style={{ width: `${pct * 100}%`, height: '100%', background: barColor, borderRadius: 2 }} />
                        </div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.muted }}>FAA waiver: 4–24 weeks typical</div>
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
              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, color: C.text }}>HubSpot Sync</span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.muted, marginBottom: 14 }}>
              {hsStatus?.connected ? 'Connected and syncing' : 'Not connected — configure to sync deals'}
            </div>
            <button
              onClick={() => onSwitchTab('hubspot')}
              style={{ width: '100%', padding: '9px 0', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7, color: C.text2, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, cursor: 'pointer', letterSpacing: 0.5, transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = C.text2)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
            >
              Configure HubSpot →
            </button>
          </Widget>

        </div>
      </div>
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 18px 0', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 90, height: 90, background: `radial-gradient(circle at top right, ${color}18, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 1.5, color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: -1, lineHeight: 1, marginBottom: 6 }}>{value}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.text2, marginBottom: 16 }}>{sub}</div>
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

function WHeader({ title, sub, badge, badgeColor, action }: {
  title: string; sub?: string; badge?: number; badgeColor?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, color: C.text }}>{title}</span>
        {sub && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.muted }}>({sub})</span>}
        {badge != null && badge > 0 && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: badgeColor ?? C.red, background: `${badgeColor ?? C.red}18`, border: `1px solid ${badgeColor ?? C.red}35`, borderRadius: 10, padding: '1px 7px' }}>
            {badge}
          </span>
        )}
      </div>
      {action && (
        <button onClick={action.onClick} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.muted, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, padding: '3px 9px', cursor: 'pointer', letterSpacing: 0.5 }}>
          {action.label}
        </button>
      )}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.muted, padding: '18px 0', textAlign: 'center' }}>
      {children}
    </div>
  )
}
