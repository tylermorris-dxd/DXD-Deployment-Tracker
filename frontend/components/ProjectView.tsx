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
  const [viewMode, setViewMode]             = useState<ViewMode>('stakeholders')
  const [opsMaximized, setOpsMaximized]     = useState(false)
  const [hsOpen, setHsOpen]                 = useState(true)

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
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ['projects'] }) },
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

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalTasks  = project.phases.reduce((a, ph) => a + ph.tasks.filter(t => t.stageNumber !== 11 && t.stageNumber !== 12).length, 0)
  const doneTasks   = project.phases.reduce((a, ph) => a + ph.tasks.filter(t => t.completed && t.stageNumber !== 11 && t.stageNumber !== 12).length, 0)
  const overallPct  = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0

  return (
    <div style={{ maxWidth: opsMaximized ? '100%' : 1200, margin: '0 auto', padding: '0 0 40px 0' }}>
      {/* ── Top Bar ────────────────────────────────────────────────────────── */}
      <div style={{ display: opsMaximized ? 'none' : 'block', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(6,6,8,0.98)', position: 'sticky', top: 0, zIndex: 100 }}>

        {/* Row 1: back + project identity + ring + controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px' }}>
          <button style={{ ...s.ghostBtn, flexShrink: 0 }} onClick={onBack}>{Icons.back}<span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, letterSpacing: 1 }}>ALL PROJECTS</span></button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 17, fontWeight: 700, color: '#E8ECF4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
          <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
            <svg width="44" height="44" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5" />
              <circle cx="22" cy="22" r="18" fill="none" stroke="#E53935" strokeWidth="3.5" strokeLinecap="round"
                strokeDasharray={`${(overallPct / 100) * 113.1} 113.1`}
                transform="rotate(-90 22 22)"
                style={{ transition: 'stroke-dasharray 0.6s ease' }}
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, color: '#E53935', lineHeight: 1 }}>{overallPct}%</span>
            </div>
          </div>

          {/* FAA Authorization toggle */}
          <button
            onClick={() => toggleFaa.mutate(!project.faaAuthorizationRequired)}
            disabled={toggleFaa.isPending}
            title={project.faaAuthorizationRequired ? 'FAA authorization active — click to disable' : 'Enable FAA authorization tracking'}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', flexShrink: 0,
              background: project.faaAuthorizationRequired ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${project.faaAuthorizationRequired ? 'rgba(37,99,235,0.5)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 7, cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1l1.5 3h3l-2.5 2 1 3L6 7.5 3 9l1-3L1.5 4h3L6 1z" stroke={project.faaAuthorizationRequired ? '#3b82f6' : 'rgba(255,255,255,0.35)'} strokeWidth="1.2" strokeLinejoin="round" fill={project.faaAuthorizationRequired ? 'rgba(37,99,235,0.3)' : 'none'}/>
            </svg>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 0.8, color: project.faaAuthorizationRequired ? '#3b82f6' : 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>
              FAA Auth
            </span>
          </button>

          {/* Delete project */}
          <button
            style={{ ...s.ghostBtn, flexShrink: 0, color: 'rgba(255,255,255,0.35)', borderColor: 'transparent' }}
            onClick={() => { if (window.confirm(`Delete "${project.name}"? This cannot be undone.`)) deleteMutation.mutate() }}
            disabled={deleteMutation.isPending}
            title="Delete project">
            {Icons.trash}
          </button>
        </div>

        {/* Row 2: view mode tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '0 24px 10px 24px', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
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

      {/* ── HubSpot deal panel ──────────────────────────────────────────── */}
      {hsDeal && !opsMaximized && (
        <HubSpotDealPanel deal={hsDeal} open={hsOpen} onToggle={() => setHsOpen(v => !v)} />
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
      <div style={{ display: viewMode === 'ops' ? 'none' : 'block', padding: (viewMode === 'map' || viewMode === 'signoff') ? 0 : '24px 24px 0 24px' }}>
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

function HubSpotDealPanel({ deal, open, onToggle }: { deal: HubSpotDeal; open: boolean; onToggle: () => void }) {
  const p = deal.properties
  const amount   = p.amount   ? `$${Number(p.amount).toLocaleString()}` : null
  const close    = p.closedate ? new Date(p.closedate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const modified = p.hs_lastmodifieddate ? new Date(p.hs_lastmodifieddate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const company  = deal.companyDetails?.[0]?.properties?.name

  return (
    <div style={{ borderBottom: '1px solid rgba(255,152,0,0.2)', background: 'rgba(255,152,0,0.04)' }}>
      {/* Toggle bar */}
      <button
        onClick={onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 24px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF9800', boxShadow: '0 0 6px #FF980088', display: 'inline-block', flexShrink: 0 }} />
        <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#FF9800' }}>HUBSPOT</span>
        {p.dealname && (
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.dealname}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/* Expanded content */}
      {open && (
        <div style={{ display: 'flex', gap: 32, padding: '0 24px 14px 24px', flexWrap: 'wrap' }}>
          {p.dealstage && (
            <Stat label="STAGE" value={p.dealstage} accent="#FF9800" />
          )}
          {p.pipeline && (
            <Stat label="PIPELINE" value={p.pipeline} />
          )}
          {amount && (
            <Stat label="AMOUNT" value={amount} accent="#4CAF50" />
          )}
          {close && (
            <Stat label="CLOSE DATE" value={close} />
          )}
          {company && (
            <Stat label="COMPANY" value={company} />
          )}
          {modified && (
            <Stat label="LAST MODIFIED" value={modified} />
          )}
          <a
            href={`https://app.hubspot.com/contacts/deals/${deal.id}`}
            target="_blank"
            rel="noreferrer"
            style={{ alignSelf: 'flex-end', marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,152,0,0.7)', textDecoration: 'none', letterSpacing: 0.5, flexShrink: 0 }}
            onClick={e => e.stopPropagation()}>
            Open in HubSpot ↗
          </a>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 8, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: accent ?? 'rgba(255,255,255,0.7)', fontWeight: accent ? 700 : 400 }}>{value}</div>
    </div>
  )
}
