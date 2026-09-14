'use client'

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ProjectSummary, InstallStatus } from '@/lib/types'
import { resolveSites, type SiteCoord } from '@/lib/siteCoords'
import { fetchAlertsForSites, SEVERITY_COLOR, worstSeverity, type WeatherAlert } from '@/lib/nwsAlerts'
import { useIsMobile } from '@/lib/useIsMobile'
import { showToast } from '@/lib/toast'

// Master install timeline. Every scheduled deal on one horizontal board, with
// NWS severe-weather alerts drawn against the days a crew is actually rolling
// — the point being that "install on the 24th" and "tornado watch on the 24th"
// should never live on two different screens.
//
// Bars drag to reschedule and their right edge drags to change duration. All
// snapping is by whole days; install dates are plain YYYY-MM-DD strings with
// no time component, parsed at local noon so a timezone offset can never shift
// a job onto the wrong day.

interface Props {
  onOpenDeal: (id: string) => void
}

const DAY_W_DEFAULT = 36
const ROW_H = 44
const LABEL_W = 250

const STATUS: Record<InstallStatus, { label: string; color: string }> = {
  unscheduled: { label: 'Unscheduled', color: '#5a6380' },
  scheduled:   { label: 'Scheduled',   color: '#3b82f6' },
  in_progress: { label: 'In Progress', color: '#FFB300' },
  complete:    { label: 'Complete',    color: '#3FB95A' },
  blocked:     { label: 'Blocked',     color: '#D2232A' },
}

const STATUS_ORDER: InstallStatus[] = ['scheduled', 'in_progress', 'blocked', 'complete', 'unscheduled']

// ── Date helpers — all local-noon to stay timezone-proof ────────────────────

function atNoon(y: number, m: number, d: number): Date { return new Date(y, m, d, 12, 0, 0, 0) }
function todayNoon(): Date { const n = new Date(); return atNoon(n.getFullYear(), n.getMonth(), n.getDate()) }
function addDays(d: Date, n: number): Date { return atNoon(d.getFullYear(), d.getMonth(), d.getDate() + n) }
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseISODate(s: string | null): Date | null {
  if (!s) return null
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return atNoon(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}
function isWeekend(d: Date): boolean { const w = d.getDay(); return w === 0 || w === 6 }

export default function MasterTimeline({ onOpenDeal }: Props) {
  const qc = useQueryClient()
  const isMobile = useIsMobile()
  const scrollRef = useRef<HTMLDivElement>(null)

  const [weeks, setWeeks] = useState(8)
  const [dayW, setDayW] = useState(DAY_W_DEFAULT)
  const [anchor, setAnchor] = useState<Date>(() => addDays(todayNoon(), -7))
  const [editing, setEditing] = useState<ProjectSummary | null>(null)
  const [coords, setCoords] = useState<Record<string, SiteCoord>>({})
  const [alerts, setAlerts] = useState<Record<string, WeatherAlert[]>>({})

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects.list(),
  })

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.projects.update>[1] }) =>
      api.projects.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
    onError: () => showToast({ title: 'Could not save schedule', tone: 'error', durationMs: 3000 }),
  })

  // Geocode sites, then pull NWS alerts for them. Both run behind the
  // already-rendered board so neither blocks first paint.
  useEffect(() => {
    let cancelled = false
    const sites = Array.from(new Set(projects.map(p => p.site).filter(Boolean)))
    if (!sites.length) return
    ;(async () => {
      const c = await resolveSites(sites)
      if (cancelled) return
      setCoords(c)
      const a = await fetchAlertsForSites(c)
      if (!cancelled) setAlerts(a)
    })()
    return () => { cancelled = true }
  }, [projects])

  const days = useMemo(() => {
    const n = weeks * 7
    return Array.from({ length: n }, (_, i) => addDays(anchor, i))
  }, [anchor, weeks])

  const today = todayNoon()
  const todayIdx = diffDays(anchor, today)

  const { scheduled, unscheduled } = useMemo(() => {
    const s: ProjectSummary[] = []
    const u: ProjectSummary[] = []
    for (const p of projects) (p.installDate ? s : u).push(p)
    s.sort((a, b) => (a.installDate! < b.installDate! ? -1 : a.installDate! > b.installDate! ? 1 : 0))
    u.sort((a, b) => a.name.localeCompare(b.name))
    return { scheduled: s, unscheduled: u }
  }, [projects])

  // Alerts that land on a day some crew is actually scheduled to work.
  const conflicts = useMemo(() => {
    const out: Array<{ project: ProjectSummary; alerts: WeatherAlert[] }> = []
    for (const p of scheduled) {
      const a = alerts[p.site?.trim() || '']
      if (!a?.length) continue
      if (p.installStatus === 'complete') continue
      out.push({ project: p, alerts: a })
    }
    return out
  }, [scheduled, alerts])

  const setSchedule = useCallback((p: ProjectSummary, startISO: string, endISO: string | null) => {
    update.mutate({
      id: p.id,
      body: {
        installDate: startISO,
        installEndDate: endISO,
        // Putting a job on the board implicitly schedules it.
        ...(p.installStatus === 'unscheduled' ? { installStatus: 'scheduled' as InstallStatus } : {}),
      },
    })
  }, [update])

  if (isMobile) {
    return (
      <MobileAgenda
        scheduled={scheduled}
        unscheduled={unscheduled}
        alerts={alerts}
        onOpenDeal={onOpenDeal}
        onEdit={setEditing}
        editing={editing}
        onClose={() => setEditing(null)}
        onSave={(id, body) => { update.mutate({ id, body }); setEditing(null) }}
      />
    )
  }

  return (
    <div style={{ padding: '20px 20px 60px' }}>
      {/* Header + controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #D2232A, #8b1419)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
            <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <rect x="6" y="13" width="6" height="2.6" rx="1" fill="currentColor" />
            <rect x="13" y="17" width="5" height="2.6" rx="1" fill="currentColor" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: 1, fontFamily: "'Chakra Petch', sans-serif" }}>INSTALL TIMELINE</h2>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginTop: 2 }}>
            {scheduled.length} SCHEDULED · {unscheduled.length} UNSCHEDULED · DRAG A BAR TO RESCHEDULE
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setAnchor(a => addDays(a, -7))} style={navBtn}>‹ WEEK</button>
          <button onClick={() => setAnchor(addDays(todayNoon(), -7))} style={{ ...navBtn, borderColor: 'rgba(210,35,42,0.5)', color: '#D2232A' }}>TODAY</button>
          <button onClick={() => setAnchor(a => addDays(a, 7))} style={navBtn}>WEEK ›</button>
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
          {[4, 8, 12].map(w => (
            <button key={w} onClick={() => setWeeks(w)} style={{ ...navBtn, ...(weeks === w ? activeBtn : {}) }}>{w}W</button>
          ))}
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
          <button onClick={() => setDayW(w => Math.max(18, w - 6))} style={navBtn}>−</button>
          <button onClick={() => setDayW(w => Math.min(64, w + 6))} style={navBtn}>+</button>
        </div>
      </div>

      {/* Weather conflict banner */}
      {conflicts.length > 0 && (
        <div style={{
          background: 'rgba(210,35,42,0.10)', border: '1px solid rgba(210,35,42,0.35)',
          borderRadius: 8, padding: '12px 16px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 15 }}>⚠</span>
            <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 700, color: '#ff6b6b', letterSpacing: 1, textTransform: 'uppercase' }}>
              Active NWS alerts on {conflicts.length} scheduled site{conflicts.length === 1 ? '' : 's'}
            </span>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {conflicts.slice(0, 4).map(({ project, alerts: al }) => {
              const worst = worstSeverity(al)!
              return (
                <button
                  key={project.id}
                  onClick={() => onOpenDeal(project.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.75)',
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: SEVERITY_COLOR[worst], flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, color: '#e8eaf0', minWidth: 140 }}>{project.name}</span>
                  <span style={{ color: SEVERITY_COLOR[worst] }}>{al[0].event}</span>
                  <span style={{ opacity: 0.5 }}>· install {project.installDate}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {isLoading ? (
        <div style={{ padding: 60, textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
          Loading schedule…
        </div>
      ) : (
        <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden', background: 'rgba(18,20,26,0.6)' }}>
          <div ref={scrollRef} style={{ display: 'flex', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {/* Fixed label column */}
            <div style={{ width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 3, background: '#12141a', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ height: 46, borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', padding: '0 14px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5 }}>
                DEAL
              </div>
              {scheduled.map(p => (
                <RowLabel key={p.id} p={p} alerts={alerts[p.site?.trim() || '']} onOpen={() => onOpenDeal(p.id)} />
              ))}
            </div>

            {/* Scrolling grid */}
            <div style={{ position: 'relative', minWidth: days.length * dayW }}>
              <DayHeader days={days} dayW={dayW} todayIdx={todayIdx} />
              <div style={{ position: 'relative' }}>
                {/* Column shading */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', pointerEvents: 'none' }}>
                  {days.map((d, i) => (
                    <div key={i} style={{
                      width: dayW, flexShrink: 0, height: '100%',
                      background: isWeekend(d) ? 'rgba(255,255,255,0.028)' : 'transparent',
                      borderRight: '1px solid rgba(255,255,255,0.04)',
                    }} />
                  ))}
                </div>
                {/* Today line */}
                {todayIdx >= 0 && todayIdx < days.length && (
                  <div style={{
                    position: 'absolute', left: todayIdx * dayW + dayW / 2, top: 0, bottom: 0,
                    width: 2, background: '#D2232A', boxShadow: '0 0 8px rgba(210,35,42,0.8)',
                    pointerEvents: 'none', zIndex: 2,
                  }} />
                )}

                {scheduled.map(p => (
                  <TimelineRow
                    key={p.id}
                    p={p}
                    anchor={anchor}
                    days={days.length}
                    dayW={dayW}
                    alerts={alerts[p.site?.trim() || '']}
                    onReschedule={(s, e) => setSchedule(p, s, e)}
                    onEdit={() => setEditing(p)}
                  />
                ))}

                {scheduled.length === 0 && (
                  <div style={{ height: ROW_H * 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
                    Nothing scheduled yet — set an install date below.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unscheduled backlog */}
      {unscheduled.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
            Unscheduled — {unscheduled.length} deal{unscheduled.length === 1 ? '' : 's'} with no install date
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
            {unscheduled.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 6, padding: '10px 12px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button onClick={() => onOpenDeal(p.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', display: 'block', width: '100%' }}>
                    <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 600, color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.client || '—'}
                    </div>
                  </button>
                </div>
                <button onClick={() => setEditing(p)} style={{ ...navBtn, padding: '5px 10px', flexShrink: 0 }}>SCHEDULE</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <ScheduleEditor
          project={editing}
          alerts={alerts[editing.site?.trim() || '']}
          onClose={() => setEditing(null)}
          onSave={body => { update.mutate({ id: editing.id, body }); setEditing(null) }}
        />
      )}
    </div>
  )
}

// ── Header row of days, grouped by month ────────────────────────────────────

function DayHeader({ days, dayW, todayIdx }: { days: Date[]; dayW: number; todayIdx: number }) {
  const months = useMemo(() => {
    const out: Array<{ label: string; span: number }> = []
    for (const d of days) {
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      const last = out[out.length - 1]
      if (last && last.label === label) last.span++
      else out.push({ label, span: 1 })
    }
    return out
  }, [days])

  return (
    <div style={{ height: 46, borderBottom: '1px solid rgba(255,255,255,0.1)', position: 'sticky', top: 0, zIndex: 2, background: '#12141a' }}>
      <div style={{ display: 'flex', height: 20 }}>
        {months.map((m, i) => (
          <div key={i} style={{
            width: m.span * dayW, flexShrink: 0,
            borderRight: '1px solid rgba(255,255,255,0.08)',
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 1.5,
            color: 'rgba(255,255,255,0.4)', padding: '4px 8px', textTransform: 'uppercase',
            overflow: 'hidden', whiteSpace: 'nowrap',
          }}>
            {m.label}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', height: 26 }}>
        {days.map((d, i) => {
          const isToday = i === todayIdx
          return (
            <div key={i} style={{
              width: dayW, flexShrink: 0, textAlign: 'center',
              borderRight: '1px solid rgba(255,255,255,0.04)',
              background: isToday ? 'rgba(210,35,42,0.18)' : isWeekend(d) ? 'rgba(255,255,255,0.03)' : 'transparent',
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 9,
              color: isToday ? '#ff6b6b' : isWeekend(d) ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.5)',
              paddingTop: 3, lineHeight: 1.25,
            }}>
              <div style={{ fontSize: 8, opacity: 0.65 }}>{d.toLocaleDateString('en-US', { weekday: 'narrow' })}</div>
              <div style={{ fontWeight: isToday ? 700 : 400 }}>{d.getDate()}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Left-hand label for one row ─────────────────────────────────────────────

function RowLabel({ p, alerts, onOpen }: { p: ProjectSummary; alerts?: WeatherAlert[]; onOpen: () => void }) {
  const worst = alerts?.length ? worstSeverity(alerts) : null
  return (
    <button
      onClick={onOpen}
      title={p.site || p.name}
      style={{
        height: ROW_H, width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px', background: 'transparent', border: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', textAlign: 'left',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: STATUS[p.installStatus]?.color || '#5a6380' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 600, color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.name}
        </span>
        <span style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.assignedTech || p.client || '—'}
        </span>
      </span>
      {worst && (
        <span title={alerts!.map(a => a.event).join(', ')} style={{ color: SEVERITY_COLOR[worst], fontSize: 12, flexShrink: 0 }}>⚠</span>
      )}
    </button>
  )
}

// ── One draggable bar ───────────────────────────────────────────────────────

function TimelineRow({ p, anchor, days, dayW, alerts, onReschedule, onEdit }: {
  p: ProjectSummary
  anchor: Date
  days: number
  dayW: number
  alerts?: WeatherAlert[]
  onReschedule: (startISO: string, endISO: string | null) => void
  onEdit: () => void
}) {
  const start = parseISODate(p.installDate)
  const end = parseISODate(p.installEndDate)
  const [drag, setDrag] = useState<{ mode: 'move' | 'resize'; dx: number } | null>(null)

  const startIdx = start ? diffDays(anchor, start) : 0
  const spanDays = start && end ? Math.max(1, diffDays(start, end) + 1) : 1

  // Live offset while dragging, snapped to whole days.
  const snap = drag ? Math.round(drag.dx / dayW) : 0
  const shownIdx = startIdx + (drag?.mode === 'move' ? snap : 0)
  const shownSpan = Math.max(1, spanDays + (drag?.mode === 'resize' ? snap : 0))

  const onPointerDown = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const originX = e.clientX
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    setDrag({ mode, dx: 0 })

    const move = (ev: PointerEvent) => setDrag({ mode, dx: ev.clientX - originX })
    const up = (ev: PointerEvent) => {
      el.releasePointerCapture(ev.pointerId)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const delta = Math.round((ev.clientX - originX) / dayW)
      setDrag(null)
      if (delta === 0 || !start) return
      if (mode === 'move') {
        const ns = addDays(start, delta)
        onReschedule(toISODate(ns), end ? toISODate(addDays(end, delta)) : null)
      } else {
        const newSpan = Math.max(1, spanDays + delta)
        onReschedule(toISODate(start), newSpan > 1 ? toISODate(addDays(start, newSpan - 1)) : null)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const color = STATUS[p.installStatus]?.color || '#5a6380'
  const worst = alerts?.length ? worstSeverity(alerts) : null
  const offscreen = shownIdx + shownSpan < 0 || shownIdx > days

  return (
    <div style={{ height: ROW_H, position: 'relative', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      {!offscreen && (
        <div
          onPointerDown={onPointerDown('move')}
          onDoubleClick={onEdit}
          title={`${p.name} — ${STATUS[p.installStatus]?.label}. Drag to move, drag the right edge to change length, double-click to edit.`}
          style={{
            position: 'absolute', zIndex: 1,
            left: shownIdx * dayW + 3,
            width: Math.max(dayW - 6, shownSpan * dayW - 6),
            top: 8, height: ROW_H - 16,
            background: `linear-gradient(135deg, ${color}dd, ${color}99)`,
            border: `1px solid ${color}`,
            borderRadius: 5,
            cursor: drag?.mode === 'move' ? 'grabbing' : 'grab',
            boxShadow: drag ? `0 0 14px ${color}88` : `0 2px 6px rgba(0,0,0,0.4)`,
            display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px',
            userSelect: 'none', touchAction: 'none',
            transition: drag ? 'none' : 'box-shadow 0.15s',
          }}
        >
          {worst && <span style={{ fontSize: 11, flexShrink: 0, filter: 'drop-shadow(0 0 2px #000)' }}>⚠</span>}
          <span style={{
            flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, color: '#fff',
            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
          }}>
            {shownSpan > 1 ? `${shownSpan}d` : ''} {p.assignedTech || p.name}
          </span>
          {/* Resize grip */}
          <span
            onPointerDown={onPointerDown('resize')}
            title="Drag to change duration"
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 9,
              cursor: 'ew-resize', borderRadius: '0 4px 4px 0',
              background: 'rgba(255,255,255,0.22)',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Schedule editor ─────────────────────────────────────────────────────────

function ScheduleEditor({ project, alerts, onClose, onSave }: {
  project: ProjectSummary
  alerts?: WeatherAlert[]
  onClose: () => void
  onSave: (body: Parameters<typeof api.projects.update>[1]) => void
}) {
  const [date, setDate] = useState(project.installDate || '')
  const [end, setEnd] = useState(project.installEndDate || '')
  const [status, setStatus] = useState<InstallStatus>(project.installStatus || 'unscheduled')
  const [tech, setTech] = useState(project.assignedTech || '')
  const [notes, setNotes] = useState(project.scheduleNotes || '')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const field: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6, padding: '9px 11px', color: '#e8eaf0', outline: 'none',
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
  }
  const label: React.CSSProperties = {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 5, display: 'block',
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(460px, 100%)', background: '#12141a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, boxShadow: '0 24px 70px rgba(0,0,0,0.7)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 15, fontWeight: 700, color: '#e8eaf0' }}>{project.name}</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
            {project.site || project.client || '—'}
          </div>
        </div>

        {alerts?.length ? (
          <div style={{ margin: '12px 18px 0', padding: '9px 11px', background: `${SEVERITY_COLOR[worstSeverity(alerts)!]}18`, border: `1px solid ${SEVERITY_COLOR[worstSeverity(alerts)!]}55`, borderRadius: 6 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: SEVERITY_COLOR[worstSeverity(alerts)!], fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>
              ⚠ {alerts[0].event}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.6)', lineHeight: 1.45 }}>
              {alerts[0].headline || alerts[0].areaDesc}
            </div>
          </div>
        ) : null}

        <div style={{ padding: 18, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <span style={label}>Install date</span>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={field} />
            </div>
            <div>
              <span style={label}>End date (optional)</span>
              <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={field} />
            </div>
          </div>

          <div>
            <span style={label}>Status</span>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {STATUS_ORDER.map(s => (
                <button key={s} onClick={() => setStatus(s)} style={{
                  padding: '6px 11px', borderRadius: 5, cursor: 'pointer',
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 1, textTransform: 'uppercase',
                  border: `1px solid ${status === s ? STATUS[s].color : 'rgba(255,255,255,0.12)'}`,
                  background: status === s ? `${STATUS[s].color}22` : 'transparent',
                  color: status === s ? STATUS[s].color : 'rgba(255,255,255,0.45)',
                }}>
                  {STATUS[s].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span style={label}>Assigned tech</span>
            <input value={tech} onChange={e => setTech(e.target.value)} placeholder="Who's rolling on this?" style={field} />
          </div>

          <div>
            <span style={label}>Schedule notes</span>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Gate code, escort required, crane booked…" style={{ ...field, resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '0 18px 18px' }}>
          <button onClick={onClose} style={{ ...navBtn, flex: 1, padding: '10px 0' }}>CANCEL</button>
          <button
            onClick={() => onSave({
              installDate: date || null,
              installEndDate: end || null,
              installStatus: date ? (status === 'unscheduled' ? 'scheduled' : status) : 'unscheduled',
              assignedTech: tech || null,
              scheduleNotes: notes || null,
            })}
            style={{
              flex: 2, padding: '10px 0', borderRadius: 5, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #D2232A, #8b1419)', color: '#fff',
              fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
            }}
          >
            Save schedule
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Mobile: a vertical agenda beats a Gantt on a phone ──────────────────────

function MobileAgenda({ scheduled, unscheduled, alerts, onOpenDeal, onEdit, editing, onClose, onSave }: {
  scheduled: ProjectSummary[]
  unscheduled: ProjectSummary[]
  alerts: Record<string, WeatherAlert[]>
  onOpenDeal: (id: string) => void
  onEdit: (p: ProjectSummary) => void
  editing: ProjectSummary | null
  onClose: () => void
  onSave: (id: string, body: Parameters<typeof api.projects.update>[1]) => void
}) {
  const row = (p: ProjectSummary) => {
    const al = alerts[p.site?.trim() || '']
    const worst = al?.length ? worstSeverity(al) : null
    const color = STATUS[p.installStatus]?.color || '#5a6380'
    return (
      <div key={p.id} style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px',
        background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
        borderLeft: `3px solid ${color}`, borderRadius: 6,
      }}>
        <button onClick={() => onOpenDeal(p.id)} style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 600, color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {worst ? '⚠ ' : ''}{p.name}
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
            {p.installDate || 'No date'}{p.assignedTech ? ` · ${p.assignedTech}` : ''}
          </div>
        </button>
        <button onClick={() => onEdit(p)} style={{ ...navBtn, padding: '6px 10px', flexShrink: 0 }}>EDIT</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 14px 50px' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, letterSpacing: 1, fontFamily: "'Chakra Petch', sans-serif" }}>INSTALL TIMELINE</h2>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.2, marginBottom: 16 }}>
        {scheduled.length} SCHEDULED · {unscheduled.length} UNSCHEDULED
      </div>
      <div style={{ display: 'grid', gap: 7, marginBottom: 22 }}>{scheduled.map(row)}</div>
      {unscheduled.length > 0 && (
        <>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
            Unscheduled
          </div>
          <div style={{ display: 'grid', gap: 7 }}>{unscheduled.map(row)}</div>
        </>
      )}
      {editing && (
        <ScheduleEditor
          project={editing}
          alerts={alerts[editing.site?.trim() || '']}
          onClose={onClose}
          onSave={body => onSave(editing.id, body)}
        />
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  padding: '6px 11px', borderRadius: 5, cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.03)',
  color: 'rgba(255,255,255,0.6)',
  fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
}

const activeBtn: React.CSSProperties = {
  border: '1px solid #D2232A', background: 'rgba(210,35,42,0.18)', color: '#D2232A',
}
