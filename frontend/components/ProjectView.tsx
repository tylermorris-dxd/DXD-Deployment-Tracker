'use client'

import React, { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { s, progressColor } from '@/lib/styles'
import { Icons } from '@/lib/icons'
import PhasePanel from './PhasePanel'
import KanbanView from './KanbanView'
import PricingView from './PricingView'
import WeatherIntel from './WeatherIntel'
import AirspaceIntel from './AirspaceIntel'
import ConnectivityView from './ConnectivityView'
import SiteMapper from './SiteMapper'
import StakeholdersView from './StakeholdersView'
import ProjectSettingsView from './ProjectSettingsView'

interface Props {
  projectId: string
  onBack: () => void
}

type ViewMode = 'list' | 'kanban' | 'pricing' | 'wx' | 'airspace' | 'map' | 'network' | 'stakeholders' | 'settings'

// ── Shared tab-button styles ───────────────────────────────────────────────────

const tabBtn = (active: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '6px 12px',
  background: active ? 'rgba(229,57,53,0.15)' : 'rgba(255,255,255,0.04)',
  border: active ? '1px solid rgba(229,57,53,0.4)' : '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  color: active ? '#E53935' : 'rgba(255,255,255,0.4)',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: "'Chakra Petch', sans-serif",
  fontWeight: 600,
  letterSpacing: 0.5,
  transition: 'all 0.2s',
})

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS: Array<{ id: ViewMode; label: string; icon: React.ReactNode }> = [
  {
    id: 'list', label: 'List',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 3h12M1 7h12M1 11h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  },
  {
    id: 'kanban', label: 'Kanban',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="3.5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="5.25" y="1" width="3.5" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="9.5" y="1" width="3.5" height="10" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg>,
  },
  {
    id: 'pricing', label: 'Pricing',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M4.5 3.5h3.75a1.75 1.75 0 010 3.5H4M4.5 7h4.25a1.75 1.75 0 010 3.5H4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    id: 'wx', label: 'WX',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="5" r="3" stroke="currentColor" strokeWidth="1.2"/><path d="M2 11c0-2 2.5-3.5 5-3.5s5 1.5 5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M10.5 3.5l1-1M3.5 3.5l-1-1M7 1V0M11 6h1M2 6H1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>,
  },
  {
    id: 'airspace', label: 'Airspace',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1l5 4v6H2V5l5-4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M1 13h12M4 8h6M5.5 5.5h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>,
  },
  {
    id: 'map', label: 'Map',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polygon points="1,2 5,4 9,2 13,4 13,12 9,10 5,12 1,10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><line x1="5" y1="4" x2="5" y2="12" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/><line x1="9" y1="2" x2="9" y2="10" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>,
  },
  {
    id: 'network', label: 'Network',
    icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.3"/><path d="M6.5 1v1.5M6.5 10.5V12M1 6.5h1.5M10.5 6.5H12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M2.9 2.9l1.1 1.1M9 9l1.1 1.1M9 4L7.9 5.1M4 9L2.9 10.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  },
  {
    id: 'stakeholders', label: 'Contacts',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1 12c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="11" cy="4.5" r="1.8" stroke="currentColor" strokeWidth="1.1"/><path d="M11 8.5c1.8 0 3 1 3 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>,
  },
  {
    id: 'settings', label: 'Settings',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.9 2.9l1.1 1.1M10 10l1.1 1.1M10 4L8.9 5.1M4 10L2.9 11.1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>,
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectView({ projectId, onBack }: Props) {
  const qc = useQueryClient()
  const [activePhaseIdx, setActivePhaseIdx] = useState(0)
  const [viewMode, setViewMode]             = useState<ViewMode>('list')

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId),
  })

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team'],
    queryFn: api.team.list,
  })

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: ['project', projectId] }), [qc, projectId])

  const deleteMutation = useMutation({
    mutationFn: () => api.projects.delete(projectId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); onBack() },
  })

  // ── Cache update helpers — write JSON string to DB then re-fetch ──────────
  const updateMapCache = useCallback(async (data: unknown) => {
    try {
      await api.projects.update(projectId, { mapCache: data ? JSON.stringify(data) : null })
      invalidate()
    } catch (_) { /* non-fatal */ }
  }, [projectId, invalidate])

  const updateAirspaceCache = useCallback(async (data: unknown) => {
    try {
      await api.projects.update(projectId, { airspaceCache: data ? JSON.stringify(data) : null })
      invalidate()
    } catch (_) { /* non-fatal */ }
  }, [projectId, invalidate])

  const updateNetworkCache = useCallback(async (data: unknown) => {
    try {
      await api.projects.update(projectId, { networkCache: data ? JSON.stringify(data) : null })
      invalidate()
    } catch (_) { /* non-fatal */ }
  }, [projectId, invalidate])

  const updateWeatherCache = useCallback(async (data: unknown) => {
    try {
      await api.projects.update(projectId, { weatherCache: data ? JSON.stringify(data) : null })
      invalidate()
    } catch (_) { /* non-fatal */ }
  }, [projectId, invalidate])

  // ── Loading / error states ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ ...s.container, textAlign: 'center', paddingTop: 80 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
          Loading project...
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div style={{ ...s.container, textAlign: 'center', paddingTop: 80 }}>
        <div style={{ color: '#ef4444', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
          Failed to load project.
        </div>
        <button style={{ ...s.ghostBtn, marginTop: 16 }} onClick={onBack}>{Icons.back} Back</button>
      </div>
    )
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalTasks  = project.phases.reduce((a, ph) => a + ph.tasks.length, 0)
  const doneTasks   = project.phases.reduce((a, ph) => a + ph.tasks.filter(t => t.completed).length, 0)
  const overallPct  = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0
  const activePhase = project.phases[activePhaseIdx] ?? project.phases[0]

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 0 40px 0' }}>
      {/* ── Top Bar ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(6,6,8,0.98)', position: 'sticky', top: 0, zIndex: 100 }}>
        <button style={{ ...s.ghostBtn, flexShrink: 0 }} onClick={onBack}>{Icons.back}<span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, letterSpacing: 1 }}>ALL PROJECTS</span></button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 18, fontWeight: 700, color: '#E8ECF4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project.name}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
            {project.client && (
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{project.client}</span>
            )}
            {project.site && (
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>📍 {project.site}</span>
            )}
          </div>
        </div>

        {/* Overall progress ring */}
        <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
          <svg width="52" height="52" viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <circle cx="26" cy="26" r="22" fill="none" stroke="#E53935" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${(overallPct / 100) * 138.2} 138.2`}
              transform="rotate(-90 26 26)"
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: '#E53935', lineHeight: 1 }}>{overallPct}%</span>
          </div>
        </div>

        {/* Delete project */}
        <button
          style={{ ...s.ghostBtn, flexShrink: 0, color: 'rgba(255,255,255,0.35)', borderColor: 'transparent' }}
          onClick={() => { if (window.confirm(`Delete "${project.name}"? This cannot be undone.`)) deleteMutation.mutate() }}
          disabled={deleteMutation.isPending}
          title="Delete project">
          {Icons.trash}
        </button>

        {/* View mode tab bar */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TABS.map(tab => (
            <button key={tab.id} style={tabBtn(viewMode === tab.id)} onClick={() => setViewMode(tab.id)}>
              {tab.icon}<span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Phase timeline strip ─────────────────────────────────────────── */}
      {(viewMode === 'list' || viewMode === 'kanban') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '10px 24px', background: 'rgba(6,6,8,0.7)', borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 24, right: 24, top: '50%', height: 1, background: 'rgba(255,255,255,0.07)', zIndex: 0 }} />
          <div style={{ position: 'absolute', left: 24, top: '50%', height: 1, width: `calc((100% - 48px) * ${overallPct / 100})`, background: '#E53935', zIndex: 1, transition: 'width 0.6s ease' }} />
          <div style={{ display: 'flex', gap: 0, width: '100%', zIndex: 2, position: 'relative', justifyContent: 'space-between' }}>
            {project.phases.map((phase, pIdx) => {
              const pDone  = phase.tasks.filter(t => t.completed).length
              const pTotal = phase.tasks.length
              const pPct   = pTotal ? Math.round((pDone / pTotal) * 100) : 0
              const isComplete = pPct === 100
              const accent     = isComplete ? '#22C55E' : phase.color
              return (
                <div key={phase.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                  onClick={() => setActivePhaseIdx(pIdx)}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: isComplete ? '#22C55E' : 'rgba(6,6,8,1)', border: `2px solid ${accent}`, boxShadow: activePhaseIdx === pIdx ? `0 0 8px ${accent}88` : 'none' }} />
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: pIdx === activePhaseIdx ? accent : 'rgba(255,255,255,0.3)', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
                    {pIdx + 1}. {phase.title}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Content area ──────────────────────────────────────────────────── */}
      <div style={{ padding: viewMode === 'map' ? 0 : '24px 24px 0 24px' }}>
        {/* LIST view */}
        {viewMode === 'list' && (
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24 }}>
            {/* Phase sidebar */}
            <div>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 10 }}>PHASES</div>
              {project.phases.map((phase, idx) => {
                const done  = phase.tasks.filter(t => t.completed || (t.subtasks.length > 0 && t.subtasks.every(sub => sub.isDone))).length
                const total = phase.tasks.length
                const pct   = total > 0 ? Math.round((done / total) * 100) : 0
                const isActive = idx === activePhaseIdx
                return (
                  <div key={phase.id} onClick={() => setActivePhaseIdx(idx)}
                    style={{ padding: '9px 12px', borderRadius: 7, marginBottom: 4, cursor: 'pointer', background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent', border: isActive ? `1px solid ${phase.color}30` : '1px solid transparent', transition: 'background 0.15s, border 0.15s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: pct === 100 ? '#22c55e' : phase.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: isActive ? '#E8ECF4' : 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {phase.title}
                      </span>
                    </div>
                    <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden' }}>
                      <div style={{ width: pct + '%', height: '100%', background: progressColor(pct), borderRadius: 1 }} />
                    </div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>
                      {done}/{total} tasks
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Active phase panel */}
            <div>
              {activePhase && (
                <PhasePanel
                  phase={activePhase}
                  projectId={projectId}
                  teamMembers={teamMembers}
                  onDataChange={invalidate}
                />
              )}
            </div>
          </div>
        )}

        {/* KANBAN view */}
        {viewMode === 'kanban' && <KanbanView project={project} />}

        {/* PRICING view */}
        {viewMode === 'pricing' && <PricingView project={project} />}

        {/* WEATHER view */}
        {viewMode === 'wx' && <WeatherIntel project={project} onCacheUpdate={updateWeatherCache} />}

        {/* AIRSPACE view */}
        {viewMode === 'airspace' && <AirspaceIntel project={project} onCacheUpdate={updateAirspaceCache} />}

        {/* MAP view — no padding, full width */}
        {viewMode === 'map' && <SiteMapper project={project} onCacheUpdate={updateMapCache} />}

        {/* NETWORK view */}
        {viewMode === 'network' && <ConnectivityView project={project} onCacheUpdate={updateNetworkCache} />}

        {/* STAKEHOLDERS view */}
        {viewMode === 'stakeholders' && <StakeholdersView project={project} onUpdate={invalidate} />}

        {/* SETTINGS view */}
        {viewMode === 'settings' && <ProjectSettingsView project={project} onUpdate={invalidate} />}
      </div>
    </div>
  )
}
