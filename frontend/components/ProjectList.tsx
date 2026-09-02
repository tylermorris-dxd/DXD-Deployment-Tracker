'use client'

import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { s } from '@/lib/styles'
import { Icons } from '@/lib/icons'
import type { ProjectSummary, HubSpotActiveDeal } from '@/lib/types'
import { showUndoableToast, showToast } from '@/lib/toast'
import { logActivity } from '@/lib/activity'
import { pickLoadingPhrase } from '@/lib/loadingPhrases'
import { useSettings } from '@/lib/settings'
import { markZoomOrigin } from '@/lib/transitions'

type SortMode = 'newest' | 'oldest' | 'value' | 'name'
type FilterMode = 'all' | 'hubspot' | 'faa'

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function dealAmount(a?: HubSpotActiveDeal): number {
  const raw = a?.deal.properties.amount
  const n = raw ? parseFloat(raw) : 0
  return isNaN(n) ? 0 : n
}

export default function ProjectList({ onSelectProject }: { onSelectProject: (id: string) => void }) {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newClient, setNewClient] = useState('')
  const [newSite, setNewSite] = useState('')

  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  // Steady state cards are background hum — start collapsed so the working
  // deals dominate the view. Operator can expand with one click.
  const [steadyOpen, setSteadyOpen] = useState(false)

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: api.projects.list,
  })

  const { data: activeDeals = [] } = useQuery({
    queryKey: ['hubspotActive'],
    queryFn: api.hubspot.getActive,
    refetchInterval: 60_000,
  })

  const dealMap = useMemo(
    () => new Map<string, HubSpotActiveDeal>(activeDeals.map(a => [a.projectId, a])),
    [activeDeals],
  )

  const createMutation = useMutation({
    mutationFn: () => api.projects.create({ name: newName.trim(), client: newClient.trim(), site: newSite.trim() }),
    onSuccess: (proj) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setNewName(''); setNewClient(''); setNewSite(''); setShowNew(false)
      onSelectProject(proj.id)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: api.projects.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  const handleCreate = () => {
    if (!newName.trim()) return
    createMutation.mutate()
  }

  // Filter + sort applied consistently to both partitions so the two
  // sections agree on ordering / visibility.
  const [activeProjects, steadyProjects] = useMemo(() => {
    const q = search.trim().toLowerCase()
    const passes = (p: ProjectSummary) => {
      if (q) {
        const hs = dealMap.get(p.id)
        const hay = `${hs?.deal.properties.dealname ?? p.name} ${p.client} ${p.site}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filterMode === 'hubspot' && !p.hubspotDealId) return false
      if (filterMode === 'faa' && !p.faaAuthorizationRequired) return false
      return true
    }
    const cmp = (a: ProjectSummary, b: ProjectSummary) => {
      if (sortMode === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      if (sortMode === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      if (sortMode === 'value')  return dealAmount(dealMap.get(b.id)) - dealAmount(dealMap.get(a.id))
      if (sortMode === 'name')   return (a.name || '').localeCompare(b.name || '')
      return 0
    }
    const all = projects.filter(passes).slice().sort(cmp)
    return [all.filter(p => !p.steadyState), all.filter(p => p.steadyState)]
  }, [projects, dealMap, search, sortMode, filterMode])

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logoRow}>
          <img src="/images/logo.png" alt="DXD" style={s.logoImg} />
          <div>
            <div style={s.logoTitle}>DEUS X DEFENSE</div>
          </div>
        </div>
        <button style={s.primaryBtn} onClick={() => setShowNew(!showNew)}>
          {Icons.plus}<span>NEW PROJECT</span>
        </button>
      </div>

      {/* New Project Form */}
      {showNew && (
        <div style={{ background: 'rgba(40,40,42,0.85)', border: '1px solid rgba(229,57,53,0.2)', borderRadius: 10, padding: 24, marginBottom: 24, backdropFilter: 'blur(12px)', animation: 'fadeSlideIn 0.3s ease' }}>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 10, color: '#e63946', letterSpacing: 1.5, marginBottom: 14 }}>NEW PROJECT</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={s.fieldLabel}>PROJECT NAME *</label>
              <input autoFocus style={s.input} placeholder="e.g. Acme Corp HQ Deployment"
                value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowNew(false) }} />
            </div>
            <div>
              <label style={s.fieldLabel}>CLIENT</label>
              <input style={s.input} placeholder="e.g. Acme Corporation" value={newClient} onChange={e => setNewClient(e.target.value)} />
            </div>
            <div>
              <label style={s.fieldLabel}>SITE LOCATION</label>
              <input style={s.input} placeholder="e.g. Dallas, TX" value={newSite} onChange={e => setNewSite(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={s.ghostBtn} onClick={() => setShowNew(false)}>CANCEL</button>
            <button style={{ ...s.primaryBtn, opacity: newName.trim() ? 1 : 0.4 }}
              disabled={!newName.trim() || createMutation.isPending}
              onClick={handleCreate}>
              {createMutation.isPending ? 'CREATING…' : 'DEPLOY PROJECT'}
            </button>
          </div>
          {createMutation.isError && (
            <div style={{ color: '#ef4444', fontSize: 11, marginTop: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
              {(createMutation.error as Error).message}
            </div>
          )}
        </div>
      )}

      {/* Toolbar: search + sort + filter */}
      {projects.length > 0 && (
        <Toolbar
          search={search}     onSearch={setSearch}
          sortMode={sortMode} onSort={setSortMode}
          filterMode={filterMode} onFilter={setFilterMode}
        />
      )}

      {/* Content */}
      {isLoading ? (
        <div style={{ color: 'rgba(255,255,255,0.55)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, padding: 40, textAlign: 'center', letterSpacing: 2 }}>
          {pickLoadingPhrase()}<span style={{ marginLeft: 6 }}>…</span>
        </div>
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <img src="/images/logo.png" alt="DXD" style={{ width: 64, height: 64, objectFit: 'contain', opacity: 0.2, marginBottom: 16 }} />
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, marginBottom: 8 }}>NO ACTIVE DEPLOYMENTS</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Create your first project to begin tracking a drone deployment.</div>
        </div>
      ) : (
        <>
          {activeProjects.length > 0 && (
            <>
              <SectionHeader
                title="ACTIVE DEPLOYMENTS"
                count={activeProjects.length}
                accent="#E53935"
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 14 }}>
                {activeProjects.map((p, i) => (
                  <ProjectCard key={p.id} proj={p} index={i} activeDeal={dealMap.get(p.id)}
                    onOpen={() => onSelectProject(p.id)}
                    onDelete={() => deleteWithUndo(p, deleteMutation.mutate)} />
                ))}
              </div>
            </>
          )}
          {steadyProjects.length > 0 && (
            <>
              <SectionHeader
                title="STEADY STATE"
                count={steadyProjects.length}
                accent="#3FB95A"
                spacingTop={activeProjects.length > 0 ? 32 : 0}
                collapsible
                open={steadyOpen}
                onToggle={() => setSteadyOpen(v => !v)}
              />
              {steadyOpen && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 14 }}>
                  {steadyProjects.map((p, i) => (
                    <ProjectCard key={p.id} proj={p} index={i} activeDeal={dealMap.get(p.id)} accent="#3FB95A" compact
                      onOpen={() => onSelectProject(p.id)}
                      onDelete={() => deleteWithUndo(p, deleteMutation.mutate)} />
                  ))}
                </div>
              )}
            </>
          )}
          {activeProjects.length === 0 && steadyProjects.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
              No deals match those filters.
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({
  search, onSearch, sortMode, onSort, filterMode, onFilter,
}: {
  search: string; onSearch: (v: string) => void
  sortMode: SortMode; onSort: (m: SortMode) => void
  filterMode: FilterMode; onFilter: (m: FilterMode) => void
}) {
  const btn = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', background: active ? 'rgba(210,35,42,0.15)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${active ? 'rgba(210,35,42,0.5)' : 'rgba(255,255,255,0.08)'}`,
    borderRadius: 6, color: active ? '#E53935' : 'rgba(255,255,255,0.55)',
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 0.8,
    textTransform: 'uppercase' as const, cursor: 'pointer', whiteSpace: 'nowrap' as const,
  })
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, minWidth: 220, flex: '1 1 260px' }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: 'rgba(255,255,255,0.35)' }}>
          <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
          <line x1="7.5" y1="7.5" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <input
          value={search} onChange={e => onSearch(e.target.value)}
          placeholder="Filter deals by name, client, or site…"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#e8eaf0', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
        />
      </div>

      {/* Sort */}
      <div style={{ display: 'flex', gap: 4 }}>
        {(['newest','oldest','value','name'] as SortMode[]).map(m => (
          <button key={m} onClick={() => onSort(m)} style={btn(sortMode === m)}>{m}</button>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 4 }}>
        {([
          ['all', 'All'],
          ['hubspot', 'HubSpot'],
          ['faa', 'FAA'],
        ] as Array<[FilterMode, string]>).map(([m, label]) => (
          <button key={m} onClick={() => onFilter(m)} style={btn(filterMode === m)}>{label}</button>
        ))}
      </div>
    </div>
  )
}

// ── Section header (now collapsible for steady state) ────────────────────────

function SectionHeader({ title, count, accent, spacingTop = 0, collapsible, open, onToggle }: {
  title: string
  count: number
  accent: string
  spacingTop?: number
  collapsible?: boolean
  open?: boolean
  onToggle?: () => void
}) {
  const clickable = collapsible && !!onToggle
  return (
    <div
      onClick={clickable ? onToggle : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: spacingTop, marginBottom: 14, cursor: clickable ? 'pointer' : 'default', userSelect: 'none' as const }}
    >
      {collapsible && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: accent, transition: 'transform 0.2s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, boxShadow: `0 0 8px ${accent}88`, flexShrink: 0 }} />
      <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 2.4, color: accent }}>
        {title}
      </span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: `${accent}aa`, background: `${accent}18`, border: `1px solid ${accent}35`, borderRadius: 10, padding: '1px 8px' }}>
        {count}
      </span>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${accent}55, transparent)` }} />
      {collapsible && (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: `${accent}88`, letterSpacing: 1 }}>
          {open ? 'HIDE' : 'SHOW'}
        </span>
      )}
    </div>
  )
}

// ── Activity spark ──────────────────────────────────────────────────────────
// 30-tick sparkline showing the last 30 days. Ticks are dimmed by default and
// lit at the deal's created-day and the HubSpot last-modified day, colored by
// how fresh the last activity is. Small, information-dense visual pulse-check
// that fits inside a card footer without owning it.

function ActivitySpark({ proj, activeDeal }: { proj: ProjectSummary; activeDeal?: HubSpotActiveDeal }) {
  const now = Date.now()
  const created = new Date(proj.createdAt).getTime()
  const modified = activeDeal?.deal.properties.hs_lastmodifieddate
    ? new Date(activeDeal.deal.properties.hs_lastmodifieddate).getTime()
    : null
  const daysAgoCreated  = Math.max(0, Math.round((now - created)  / 86_400_000))
  const daysAgoModified = modified != null ? Math.max(0, Math.round((now - modified) / 86_400_000)) : null

  const ticks: Array<{ h: number; c: string }> = []
  const freshness = daysAgoModified == null ? 30 : daysAgoModified
  const stalenessColor = freshness < 3 ? '#3FB95A' : freshness < 14 ? '#3b82f6' : freshness < 30 ? '#f59e0b' : '#D2232A'
  for (let i = 29; i >= 0; i--) {
    // i = days ago (29 → 0 = 30 days ago → today)
    let h = 2
    let c = 'rgba(255,255,255,0.10)'
    if (daysAgoCreated === i)                       { h = 8; c = '#9aa3b8' }
    if (daysAgoModified != null && daysAgoModified === i) { h = 10; c = stalenessColor }
    // Highlight the "today" bar slightly whether or not there was activity
    if (i === 0)                                     { h = Math.max(h, 5); c = c === 'rgba(255,255,255,0.10)' ? 'rgba(255,255,255,0.25)' : c }
    ticks.push({ h, c })
  }

  const label = daysAgoModified == null
    ? 'no HubSpot activity'
    : daysAgoModified === 0 ? 'active today'
    : daysAgoModified < 7   ? `active ${daysAgoModified}d ago`
    : daysAgoModified < 30  ? `${daysAgoModified}d idle`
    :                         `${daysAgoModified}d idle`

  return (
    <div title={label} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 12, flexShrink: 0 }}>
        {ticks.map((t, i) => (
          <span key={i} style={{ width: 2, height: t.h, background: t.c, borderRadius: 1 }} />
        ))}
      </div>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: stalenessColor, letterSpacing: 0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  )
}

// ── Chip ────────────────────────────────────────────────────────────────────

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 0.8,
      color, background: `${color}18`, border: `1px solid ${color}38`,
      borderRadius: 10, padding: '1px 8px', whiteSpace: 'nowrap' as const,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  )
}

// ── Project card ─────────────────────────────────────────────────────────────

// Delete with an undo toast instead of a confirm dialog. The mutation
// only actually fires when the toast expires (7s window). If the user
// hits Undo, the deal stays.
function deleteWithUndo(p: ProjectSummary, mutate: (id: string) => void) {
  showUndoableToast({
    title: `Deleted "${p.name}"`,
    detail: 'Deal removed. Click Undo to keep it.',
    undoLabel: 'Undo',
    durationMs: 7000,
    onCommit: () => {
      mutate(p.id)
      logActivity({ kind: 'deal-deleted', subject: p.name })
    },
    onCancel: () => {
      showToast({ title: 'Deletion cancelled', detail: p.name, tone: 'info', durationMs: 2000 })
    },
  })
}

function ProjectCard({ proj, index, activeDeal, accent, compact, onOpen, onDelete }: {
  proj: ProjectSummary
  index: number
  activeDeal?: HubSpotActiveDeal
  accent?: string
  compact?: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const accentColor = accent ?? '#E53935'
  const hsStage = activeDeal?.deal.properties.dealstage
  const amountN  = dealAmount(activeDeal)
  const { physics } = useSettings()
  // Spring easing on card hover when physics is on; plain linear otherwise.
  const cardTransition = physics
    ? 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s'
    : 'all 0.2s'

  // Derive small at-a-glance chips
  const chips: Array<{ label: string; color: string }> = []
  if (amountN > 0)                  chips.push({ label: fmtMoney(amountN),                       color: '#3FB95A' })
  if (proj.faaAuthorizationRequired) {
    const startMs = proj.faaAuthStartedAt ? new Date(proj.faaAuthStartedAt).getTime() : new Date(proj.createdAt).getTime()
    const days = Math.max(0, Math.round((Date.now() - startMs) / 86_400_000))
    chips.push({ label: `FAA · Day ${days}`, color: days > 60 ? '#D2232A' : days > 30 ? '#f59e0b' : '#3b82f6' })
  }

  return (
    <div
      onClick={e => { markZoomOrigin(e); onOpen() }}
      style={{
        background: compact
          ? 'linear-gradient(160deg, rgba(28,28,32,0.85), rgba(20,20,24,0.9))'
          : 'linear-gradient(160deg, rgba(32,32,36,0.97), rgba(22,22,26,0.99))',
        border: '1px solid rgba(255,255,255,0.09)',
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 10,
        padding: compact ? '12px 16px' : '18px 20px',
        cursor: 'pointer',
        transition: cardTransition,
        backdropFilter: 'blur(16px)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.35)',
        animationDelay: `${index * 0.06}s`,
        animation: 'fadeSlideIn 0.4s ease both',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = physics ? 'translateY(-3px) scale(1.008)' : 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 6px 24px rgba(0,0,0,0.5), 0 0 0 1px ${accentColor}33` }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 16px rgba(0,0,0,0.35)' }}
    >
      {/* Top row: HS badge + HubSpot stage + delete */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: compact ? 8 : 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {activeDeal && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, letterSpacing: 1, fontWeight: 700, background: 'rgba(255,152,0,0.12)', border: '1px solid rgba(255,152,0,0.35)', borderRadius: 4, padding: '3px 7px', color: '#FF9800', fontFamily: "'Chakra Petch', sans-serif" }}>
              HS
            </span>
          )}
          {hsStage && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 10, letterSpacing: 1.5, fontWeight: 700, textTransform: 'uppercase',
              background: `${accentColor}18`, border: `1px solid ${accentColor}44`,
              borderRadius: 4, padding: '3px 9px', color: accentColor,
              fontFamily: "'Chakra Petch', sans-serif",
            }}>
              {hsStage}
            </span>
          )}
        </div>
        <button
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: 4, borderRadius: 4, lineHeight: 0 }}
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="Delete project">
          {Icons.trash}
        </button>
      </div>

      {/* Name */}
      <div style={{ fontSize: compact ? 15 : 18, fontWeight: 700, marginBottom: 5, lineHeight: 1.25, color: '#FFFFFF', fontFamily: "'Chakra Petch', sans-serif" }}>
        {proj.name}
      </div>

      {/* Client */}
      {proj.client && (
        <div style={{ fontSize: compact ? 11 : 13, color: 'rgba(255,255,255,0.65)', marginBottom: 3, fontWeight: 500, fontFamily: "'IBM Plex Mono', monospace" }}>
          {proj.client}
        </div>
      )}

      {/* Site */}
      {proj.site && (
        <div style={{ display: 'flex', alignItems: 'center', fontSize: compact ? 10 : 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'IBM Plex Mono', monospace" }}>
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{ marginRight: 4, opacity: 0.5 }}>
            <circle cx="7" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M7 1C4.24 1 2 3.24 2 6c0 3.5 5 7 5 7s5-3.5 5-7c0-2.76-2.24-5-5-5z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
          </svg>
          {proj.site}
        </div>
      )}

      {/* Chip row */}
      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: compact ? 8 : 12 }}>
          {chips.map((c, i) => <Chip key={i} label={c.label} color={c.color} />)}
        </div>
      )}

      {/* Footer: sparkline + created date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: compact ? 8 : 14, paddingTop: compact ? 8 : 12, borderTop: '1px solid rgba(255,255,255,0.05)', gap: 12 }}>
        <ActivitySpark proj={proj} activeDeal={activeDeal} />
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>
          {new Date(proj.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>
    </div>
  )
}
