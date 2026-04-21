'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

const C = { bg: '#0a0b0d', card: '#111318', surface2: '#181c23', border: '#252b38', red: '#D2232A', green: '#22c55e', amber: '#f59e0b', blue: '#3b82f6', text: '#e8eaf0', text2: '#9aa3b8', muted: '#5a6380' }

const STAGE_NAMES: Record<number, string> = {
  1: 'Identify & Qualify', 2: 'Discovery & Assessment', 3: 'Opportunity Capture',
  4: 'Solution Design', 5: 'Proposal & Scoping', 6: 'Negotiation & Close',
  7: 'Deployment Prep', 8: 'Site Preparation', 9: 'Installation',
  10: 'Testing & Validation', 11: 'Ops Transition', 12: 'Active Operations',
}

function stageColor(n: number) { return n <= 3 ? '#D2232A' : n <= 6 ? '#2563EB' : '#16A34A' }
function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

interface Props { onOpenDeal: (id: string) => void }

export default function PipelineView({ onOpenDeal }: Props) {
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => api.projects.list(), staleTime: 30_000 })
  const { data: activeData = [] } = useQuery({ queryKey: ['hs-active'], queryFn: () => api.hubspot.getActive(), staleTime: 60_000, retry: false })

  const dealMap = new Map(activeData.map(a => [a.projectId, a.deal]))

  const stages = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1
    const stageProjects = projects.filter(p => p.currentStage === n)
    const value = stageProjects.reduce((s, p) => s + (parseFloat(dealMap.get(p.id)?.properties.amount || '0') || 0), 0)
    return { n, name: STAGE_NAMES[n] ?? `Stage ${n}`, projects: stageProjects, value, color: stageColor(n) }
  }).filter(s => s.projects.length > 0)

  const maxCount = Math.max(...stages.map(s => s.projects.length), 1)

  if (stages.length === 0) {
    return (
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '80px 28px', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18, color: C.text2, marginBottom: 10 }}>Pipeline</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.muted }}>No deals with stage data yet</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 28px 48px' }}>
      <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22, color: C.text, letterSpacing: -0.5, marginBottom: 6 }}>Pipeline</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.muted, marginBottom: 28 }}>{projects.filter(p => p.currentStage != null).length} active deals across {stages.length} stages</div>

      {/* Phase legend */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
        {[{ label: 'Phase A — Capture', color: '#D2232A', range: 'S1–S3' }, { label: 'Phase B — Solutions', color: '#2563EB', range: 'S4–S6' }, { label: 'Phase C — Delivery', color: '#16A34A', range: 'S7–S12' }].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.text2 }}>{l.label}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.muted }}>({l.range})</span>
          </div>
        ))}
      </div>

      {/* Funnel rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stages.map(stage => (
          <div key={stage.n} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {/* Stage header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid ${stage.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: stage.color, fontWeight: 600 }}>{stage.n}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 6 }}>{stage.name}</div>
                <div style={{ height: 6, background: C.surface2, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${(stage.projects.length / maxCount) * 100}%`, height: '100%', background: stage.color, borderRadius: 3, transition: 'width 0.4s ease' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20, color: C.text }}>{stage.projects.length}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.muted }}>deals</div>
                </div>
                {stage.value > 0 && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: C.green }}>{fmtMoney(stage.value)}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.muted }}>value</div>
                  </div>
                )}
              </div>
            </div>

            {/* Deal chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 18px 14px' }}>
              {stage.projects.map(p => {
                const deal = dealMap.get(p.id)
                const name = deal?.properties.dealname ?? p.name
                return (
                  <div
                    key={p.id}
                    onClick={() => onOpenDeal(p.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 20, cursor: 'pointer', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = stage.color + '60')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.text2, whiteSpace: 'nowrap' }}>{name.length > 28 ? name.slice(0, 26) + '…' : name}</span>
                    {p.totalTasks > 0 && (
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.muted }}>
                        {Math.round((p.doneTasks / p.totalTasks) * 100)}%
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
