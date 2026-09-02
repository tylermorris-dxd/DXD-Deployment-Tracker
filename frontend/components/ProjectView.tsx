'use client'

import React, { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { s } from '@/lib/styles'
import { Icons } from '@/lib/icons'
import type { HubSpotDeal } from '@/lib/types'
import WeatherIntel from './WeatherIntel'
import AirspaceIntel from './AirspaceIntel'
import ConnectivityView from './ConnectivityView'
import SiteMapper from './SiteMapper'
import StakeholdersView from './StakeholdersView'
import ProjectSettingsView from './ProjectSettingsView'
import OpsPlanner from './OpsPlanner'
import PricingView from './PricingView'
import SummaryView from './SummaryView'
import CustomerSignoff from './CustomerSignoff'
import HubSpotEnrichment from './HubSpotEnrichment'
import { useIsMobile } from '@/lib/useIsMobile'
import { showUndoableToast, showToast } from '@/lib/toast'
import { logActivity } from '@/lib/activity'

interface Props {
  projectId: string
  onBack: () => void
}

type ViewMode = 'pricing' | 'wx' | 'airspace' | 'map' | 'network' | 'summary' | 'signoff' | 'stakeholders' | 'settings' | 'ops'

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
    id: 'summary', label: 'Summary',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="1" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 4.5h5M4.5 7h5M4.5 9.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  },
  {
    id: 'signoff', label: 'Signoff',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h6M2 6h6M2 8.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M8.5 10l2 2 2.5-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><rect x="1" y="1.5" width="10" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.2"/></svg>,
  },
  {
    id: 'stakeholders', label: 'Contacts',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1 12c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="11" cy="4.5" r="1.8" stroke="currentColor" strokeWidth="1.1"/><path d="M11 8.5c1.8 0 3 1 3 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>,
  },
  {
    id: 'settings', label: 'Settings',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.9 2.9l1.1 1.1M10 10l1.1 1.1M10 4L8.9 5.1M4 10L2.9 11.1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>,
  },
  {
    id: 'ops', label: 'Ops Planner',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>,
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectView({ projectId, onBack }: Props) {
  const qc = useQueryClient()
  const isMobile = useIsMobile()
  const [viewMode, setViewMode]             = useState<ViewMode>('airspace')
  const [opsMaximized, setOpsMaximized]     = useState(false)

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId),
  })

  const { data: hsDeal } = useQuery({
    queryKey: ['hubspotDeal', project?.hubspotDealId],
    queryFn: () => api.hubspot.getDeal(project!.hubspotDealId!),
    enabled: !!project?.hubspotDealId,
    refetchInterval: 60_000,
  })

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: ['project', projectId] }), [qc, projectId])

  const deleteMutation = useMutation({
    mutationFn: () => api.projects.delete(projectId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); onBack() },
  })

  const toggleFaa = useMutation({
    mutationFn: (val: boolean) => api.projects.update(projectId, { faaAuthorizationRequired: val }),
    onSuccess: (_data, val) => {
      invalidate(); qc.invalidateQueries({ queryKey: ['projects'] })
      logActivity({ kind: val ? 'faa-on' : 'faa-off', subject: project?.name || 'deal', projectId })
      showToast({ title: val ? 'FAA tracking on' : 'FAA tracking off', detail: project?.name, tone: val ? 'info' : 'success', durationMs: 2500 })
    },
  })

  const toggleSteady = useMutation({
    mutationFn: (val: boolean) => api.projects.update(projectId, { steadyState: val }),
    onSuccess: (_data, val) => {
      invalidate(); qc.invalidateQueries({ queryKey: ['projects'] })
      logActivity({ kind: val ? 'steady-on' : 'steady-off', subject: project?.name || 'deal', projectId })
      showToast({ title: val ? 'Marked steady state' : 'Returned to active deployment', detail: project?.name, tone: 'success', durationMs: 2500 })
    },
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

  const updatePricingCache = useCallback(async (data: unknown) => {
    try {
      await api.projects.update(projectId, { pricingCache: data ? JSON.stringify(data) : null })
      // No invalidate — the pricing tool owns its own state during the
      // session; re-fetching the project would reset inputs mid-keystroke.
    } catch (_) { /* non-fatal */ }
  }, [projectId])

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

  return (
    <div style={{ maxWidth: opsMaximized ? '100%' : 1200, margin: '0 auto', padding: '0 0 40px 0' }}>
      {/* ── Top Bar ────────────────────────────────────────────────────────── */}
      <div style={{ display: opsMaximized ? 'none' : 'block', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(6,6,8,0.98)', position: 'sticky', top: 0, zIndex: 100 }}>

        {/* Row 1: back + project identity + ring + controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, padding: isMobile ? '10px 14px' : '10px 24px' }}>
          <button style={{ ...s.ghostBtn, flexShrink: 0, padding: isMobile ? '6px 10px' : undefined }} onClick={onBack}>
            {Icons.back}
            {!isMobile && <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, letterSpacing: 1 }}>ALL PROJECTS</span>}
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 17, fontWeight: 700, color: '#E8ECF4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {project.name}
              </div>
              {/* Status pills — show only when there's signal */}
              {project.steadyState && (
                <span title="Deal is in steady state" style={pillSt('#3FB95A')}>STEADY</span>
              )}
              {project.faaAuthorizationRequired && (
                <span title="FAA authorization tracking active" style={pillSt('#3b82f6')}>FAA</span>
              )}
              {hsDeal?.properties?.dealstage && (
                <span title="HubSpot deal stage" style={pillSt('#FF9800')}>
                  {String(hsDeal.properties.dealstage).toUpperCase()}
                </span>
              )}
              {hsDeal?.properties?.amount && parseFloat(hsDeal.properties.amount) > 0 && (
                <span title="HubSpot deal amount" style={pillSt('#3FB95A')}>
                  {fmtMoneyShort(parseFloat(hsDeal.properties.amount))}
                </span>
              )}
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

          {/* Overflow menu — FAA / Steady State toggles + Delete */}
          <OverflowMenu
            faaOn={project.faaAuthorizationRequired}
            steadyOn={project.steadyState}
            onToggleFaa={() => toggleFaa.mutate(!project.faaAuthorizationRequired)}
            onToggleSteady={() => toggleSteady.mutate(!project.steadyState)}
            onDelete={() => {
              // No confirm dialog — a 7s undo toast is safer AND smoother.
              // The deal disappears immediately from the UI (we bounce back
              // to the list), and if the user hits Undo we don't fire the
              // DELETE. If they don't, the DELETE runs when the toast expires.
              const name = project.name
              onBack()
              showUndoableToast({
                title: `Deleted "${name}"`,
                detail: 'Deal removed. Click Undo to keep it.',
                undoLabel: 'Undo',
                durationMs: 7000,
                onCommit: () => {
                  deleteMutation.mutate(undefined, {
                    onSuccess: () => logActivity({ kind: 'deal-deleted', subject: name }),
                  })
                },
                onCancel: () => {
                  // Bring the user back to the deal they thought they deleted.
                  showToast({ title: 'Deletion cancelled', detail: name, tone: 'info', durationMs: 2000 })
                },
              })
            }}
          />
        </div>

        {/* Row 2: view mode tabs — horizontally scrollable on mobile so the
            10-tab row doesn't wrap into three lines and eat all the header
            real estate. */}
        <div style={{
          display: 'flex', gap: 4,
          padding: isMobile ? '0 14px 8px 14px' : '0 24px 10px 24px',
          flexWrap: isMobile ? 'nowrap' : 'wrap',
          overflowX: isMobile ? 'auto' : 'visible',
          WebkitOverflowScrolling: 'touch',
          alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)',
        }}>
          {TABS.map(tab => (
            <button key={tab.id} style={tabBtn(viewMode === tab.id)} onClick={() => setViewMode(tab.id)}>
              {tab.icon}<span>{tab.label}</span>
            </button>
          ))}
          {viewMode === 'ops' && (
            <button
              onClick={() => setOpsMaximized(true)}
              title="Maximize ops planner"
              style={{ marginLeft: 4, padding: '6px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>
              ⛶
            </button>
          )}
        </div>

      </div>

      {/* ── HubSpot enrichment — owner, company, timeline, line items ─── */}
      {hsDeal && !opsMaximized && (
        <HubSpotEnrichment deal={hsDeal} />
      )}

      {/* ── OPS PLANNER — always mounted so iframe state survives tab switches ── */}
      <div style={{ display: viewMode === 'ops' ? 'block' : 'none', position: 'relative' }}>
        {opsMaximized && (
          <button
            onClick={() => setOpsMaximized(false)}
            title="Restore"
            style={{ position: 'absolute', top: 10, right: 10, zIndex: 9999, padding: '5px 12px', background: 'rgba(6,6,8,0.9)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 11, fontFamily: "'Chakra Petch', sans-serif", fontWeight: 600, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 10L10 2M10 2H6M10 2V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 2L10 10M10 10H6M10 10V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            RESTORE
          </button>
        )}
        <OpsPlanner site={project.site} name={project.name} projectId={project.id} maximized={opsMaximized} />
      </div>

      {/* ── Content area ──────────────────────────────────────────────────── */}
      <div style={{ display: viewMode === 'ops' ? 'none' : 'block', padding: (viewMode === 'map' || viewMode === 'signoff' || viewMode === 'pricing') ? 0 : '24px 24px 0 24px' }}>
        {/* PRICING view */}
        {viewMode === 'pricing' && <PricingView project={project} onCacheUpdate={updatePricingCache} />}

        {/* WEATHER view */}
        {viewMode === 'wx' && <WeatherIntel project={project} onCacheUpdate={updateWeatherCache} />}

        {/* AIRSPACE view */}
        {viewMode === 'airspace' && <AirspaceIntel project={project} onCacheUpdate={updateAirspaceCache} />}

        {/* MAP view — no padding, full width */}
        {viewMode === 'map' && <SiteMapper project={project} onCacheUpdate={updateMapCache} />}

        {/* NETWORK view */}
        {viewMode === 'network' && <ConnectivityView project={project} onCacheUpdate={updateNetworkCache} />}

        {/* SUMMARY view — one-page PDF combining airspace + wx + network + map */}
        {viewMode === 'summary' && (
          <SummaryView
            project={project}
            onAirspaceCache={updateAirspaceCache}
            onWeatherCache={updateWeatherCache}
            onNetworkCache={updateNetworkCache}
          />
        )}

        {/* SIGNOFF view — customer acceptance form, PDF archived on the
            deal + emailed via Resend when the operator clicks Save. */}
        {viewMode === 'signoff' && <CustomerSignoff project={project} />}

        {/* STAKEHOLDERS view */}
        {viewMode === 'stakeholders' && <StakeholdersView project={project} onUpdate={invalidate} hubspotDeal={hsDeal} />}

        {/* SETTINGS view */}
        {viewMode === 'settings' && <ProjectSettingsView project={project} onUpdate={invalidate} />}

      </div>

    </div>
  )
}

// Small status pill next to the deal name — one style, colored by state.
function pillSt(color: string): React.CSSProperties {
  return {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: 1,
    color, background: `${color}18`, border: `1px solid ${color}44`,
    borderRadius: 4, padding: '2px 7px', textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const, flexShrink: 0,
  }
}

function fmtMoneyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

// Overflow menu — FAA / Steady State / Delete. Closes on outside click
// and on Escape. Uses a small popover anchored under the ⋯ button.
function OverflowMenu({
  faaOn, steadyOn, onToggleFaa, onToggleSteady, onDelete,
}: {
  faaOn: boolean
  steadyOn: boolean
  onToggleFaa: () => void
  onToggleSteady: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const wrapRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
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

  const row = (
    label: string, color: string, active: boolean, onClick: () => void, desc: string,
  ) => (
    <button
      onClick={() => { onClick(); setOpen(false) }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '10px 14px', background: 'transparent', border: 'none',
        color: '#E8ECF4', cursor: 'pointer', textAlign: 'left' as const,
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? color : 'rgba(255,255,255,0.15)', boxShadow: active ? `0 0 6px ${color}88` : 'none', flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 600, color: '#E8ECF4' }}>
          {active ? `Disable ${label}` : `Enable ${label}`}
        </span>
        <span style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
          {desc}
        </span>
      </span>
    </button>
  )

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Deal options"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 32, background: open ? 'rgba(255,255,255,0.08)' : 'transparent',
          border: `1px solid ${open ? 'rgba(255,255,255,0.15)' : 'transparent'}`,
          borderRadius: 7, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 0,
        }}
      >
        <svg width="16" height="4" viewBox="0 0 16 4" fill="none">
          <circle cx="2"  cy="2" r="1.6" fill="currentColor" />
          <circle cx="8"  cy="2" r="1.6" fill="currentColor" />
          <circle cx="14" cy="2" r="1.6" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 260,
          background: '#12141a', border: '1px solid #2a3040', borderRadius: 10,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)', overflow: 'hidden', zIndex: 150,
        }}>
          {row('FAA Auth', '#3b82f6', faaOn, onToggleFaa, faaOn ? 'Stop tracking waiver clock' : 'Track FAA waiver progress')}
          {row('Steady State', '#3FB95A', steadyOn, onToggleSteady, steadyOn ? 'Return deal to active deployment' : 'Mark deal as deployed + running')}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
          <button
            onClick={() => { setOpen(false); onDelete() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '10px 14px', background: 'transparent', border: 'none',
              color: '#E53935', cursor: 'pointer', textAlign: 'left' as const,
              fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 600,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(229,57,53,0.10)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 3.5h7M4.5 3.5V2.5a1 1 0 011-1h1a1 1 0 011 1v1M3.5 3.5v6a1 1 0 001 1h3a1 1 0 001-1v-6" stroke="#E53935" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ flex: 1 }}>Delete deal</span>
          </button>
        </div>
      )}
    </div>
  )
}
