'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

const C = { bg: '#0a0b0d', card: '#111318', surface2: '#181c23', border: '#252b38', red: '#D2232A', green: '#22c55e', amber: '#f59e0b', text: '#e8eaf0', text2: '#9aa3b8', muted: '#5a6380' }

const STAGE_NAMES: Record<number, string> = {
  1: 'Identify', 2: 'Discovery', 3: 'Opp. Capture',
  4: 'Solution Design', 5: 'Proposal', 6: 'Negotiation',
  7: 'Deploy Prep', 8: 'Site Prep', 9: 'Installation',
  10: 'Testing', 11: 'Ops Transition', 12: 'Active Ops',
}
function stageColor(n: number) { return n <= 3 ? '#D2232A' : n <= 6 ? '#2563EB' : '#16A34A' }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface Props { onOpenDeal: (id: string) => void }

export default function AllDealsTable({ onOpenDeal }: Props) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'stage' | 'progress' | 'created'>('stage')
  const [sortDir, setSortDir] = useState<1 | -1>(1)

  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: () => api.projects.list(), staleTime: 30_000 })
  const { data: activeData = [] } = useQuery({ queryKey: ['hs-active'], queryFn: () => api.hubspot.getActive(), staleTime: 60_000, retry: false })

  const dealMap = new Map(activeData.map(a => [a.projectId, a.deal]))

  function sort(key: typeof sortKey) {
    if (key === sortKey) setSortDir(d => d === 1 ? -1 : 1)
    else { setSortKey(key); setSortDir(1) }
  }

  const filtered = projects
    .filter(p => {
      const q = search.toLowerCase()
      return !q || p.name.toLowerCase().includes(q) || (p.client ?? '').toLowerCase().includes(q) || (p.site ?? '').toLowerCase().includes(q)
    })
    .sort((a, b) => {
      let v = 0
      if (sortKey === 'name')     v = a.name.localeCompare(b.name)
      if (sortKey === 'stage')    v = (a.currentStage ?? 99) - (b.currentStage ?? 99)
      if (sortKey === 'progress') v = (a.doneTasks / Math.max(a.totalTasks, 1)) - (b.doneTasks / Math.max(b.totalTasks, 1))
      if (sortKey === 'created')  v = a.createdAt.localeCompare(b.createdAt)
      return v * sortDir
    })

  const thStyle = (key: typeof sortKey): React.CSSProperties => ({
    fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: sortKey === key ? C.text2 : C.muted,
    letterSpacing: 1.2, textTransform: 'uppercase', textAlign: 'left',
    padding: '0 12px 10px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
  })

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 28px 48px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22, color: C.text, letterSpacing: -0.5, marginBottom: 4 }}>All Deals</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.muted }}>{filtered.length} of {projects.length} deals</div>
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search deals…"
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 14px', color: C.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, outline: 'none', width: 240 }}
        />
      </div>

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th style={thStyle('name')} onClick={() => sort('name')}>Deal{sortKey === 'name' ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}</th>
              <th style={{ ...thStyle('name'), cursor: 'default' }}>Client</th>
              <th style={thStyle('stage')} onClick={() => sort('stage')}>Stage{sortKey === 'stage' ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}</th>
              <th style={thStyle('progress')} onClick={() => sort('progress')}>Progress{sortKey === 'progress' ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}</th>
              <th style={{ ...thStyle('name'), cursor: 'default' }}>Tasks</th>
              <th style={thStyle('created')} onClick={() => sort('created')}>Created{sortKey === 'created' ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}</th>
              <th style={{ ...thStyle('name'), cursor: 'default' }}>HS</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.muted }}>Loading…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.muted }}>No deals found</td></tr>
            )}
            {filtered.map((p, i) => {
              const pct = p.totalTasks > 0 ? Math.round((p.doneTasks / p.totalTasks) * 100) : 0
              const stage = p.currentStage
              const deal = dealMap.get(p.id)
              return (
                <tr
                  key={p.id}
                  onClick={() => onOpenDeal(p.id)}
                  style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.surface2)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Deal name */}
                  <td style={{ padding: '12px 12px', maxWidth: 240 }}>
                    <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    {p.site && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {p.site}</div>}
                  </td>
                  {/* Client */}
                  <td style={{ padding: '12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.text2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.client || <span style={{ color: C.muted }}>—</span>}
                  </td>
                  {/* Stage */}
                  <td style={{ padding: '12px' }}>
                    {stage != null ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${stageColor(stage)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, color: stageColor(stage), fontWeight: 700 }}>{stage}</span>
                        </div>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.text2, whiteSpace: 'nowrap' }}>{STAGE_NAMES[stage]}</span>
                      </div>
                    ) : (
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.green }}>Complete</span>
                    )}
                  </td>
                  {/* Progress bar */}
                  <td style={{ padding: '12px', width: 120 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: C.surface2, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? C.green : stageColor(stage ?? 1), borderRadius: 2 }} />
                      </div>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: pct === 100 ? C.green : C.text2, width: 28, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  </td>
                  {/* Tasks */}
                  <td style={{ padding: '12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.muted, whiteSpace: 'nowrap' }}>
                    {p.doneTasks}/{p.totalTasks}
                  </td>
                  {/* Created */}
                  <td style={{ padding: '12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.muted, whiteSpace: 'nowrap' }}>
                    {fmtDate(p.createdAt)}
                  </td>
                  {/* HubSpot linked */}
                  <td style={{ padding: '12px' }}>
                    {deal ? (
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF7A59', margin: '0 auto' }} title="HubSpot linked" />
                    ) : (
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.border, margin: '0 auto' }} />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
