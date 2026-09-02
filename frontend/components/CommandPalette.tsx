'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ProjectSummary, HubSpotActiveDeal } from '@/lib/types'
import type { MainTab } from '@/app/page'
import { showToast, showUndoableToast } from '@/lib/toast'
import { logActivity } from '@/lib/activity'
import { sfx } from '@/lib/sfx'

// Cmd/Ctrl+K command palette.
//
// Two kinds of results:
//   • Deals    — every pinned + local project. Enter opens the deal.
//   • Views    — the top-level tabs. Enter switches to that tab.
//   • Actions  — verb-prefixed queries generate contextual state-changing
//                actions (mark <deal> steady, delete <deal>, etc.). Actions
//                appear at the top of the list when a verb prefix is
//                recognized so Enter fires the intended mutation.
//
// Fuzzy match is a simple subsequence check for name lookups.

interface Props {
  open: boolean
  onClose: () => void
  onOpenDeal: (id: string) => void
  onSwitchTab: (tab: MainTab) => void
}

type Kind = 'deal' | 'view' | 'action'

interface Item {
  key: string
  kind: Kind
  title: string
  subtitle?: string
  accent: string
  onSelect: () => void
}

const VIEW_ENTRIES: Array<{ tab: MainTab; title: string; subtitle: string }> = [
  { tab: 'dashboard', title: 'Dashboard',       subtitle: 'Ops overview' },
  { tab: 'deals',     title: 'Deals',           subtitle: 'All pinned deals' },
  { tab: 'fleet',     title: 'Fleet Map',       subtitle: 'Every deal on the map' },
  { tab: 'admin',     title: 'Admin',           subtitle: 'Team, HubSpot, catalog' },
  { tab: 'equipment', title: 'Equipment',       subtitle: 'Serialized inventory' },
  { tab: 'cost',      title: 'Cost Estimator',  subtitle: 'Bulk deploy modeling' },
  { tab: 'job-est',   title: 'Job Estimator',   subtitle: 'Per-site quote' },
  { tab: 'events',    title: 'Event Pricing',   subtitle: 'One-off event pricing' },
  { tab: 'product',   title: 'Products',        subtitle: 'Drone TEVI matrix' },
]

// ── Verb parsing ────────────────────────────────────────────────────────────
// A recognized verb rearranges the palette to show state-changing actions
// against the best-matched deal. The verb table doubles as user-facing help.

type Verb =
  | 'mark-steady'
  | 'unmark-steady'
  | 'mark-faa'
  | 'unmark-faa'
  | 'delete'
  | 'open'

interface ParsedQuery {
  verb: Verb | null
  needle: string // remaining text after stripping the verb (used to match a deal)
}

// Case-insensitive prefix matcher. Longest match wins so "unmark" beats "mark".
function parseVerb(q: string): ParsedQuery {
  const raw = q.trim().toLowerCase()
  if (!raw) return { verb: null, needle: '' }
  // Ordered by specificity — longer prefixes first.
  const table: Array<[RegExp, Verb]> = [
    [/^unmark\s+(.+?)\s+steady\b/, 'unmark-steady'],
    [/^unmark\s+(.+?)\s+faa\b/,    'unmark-faa'],
    [/^remove\s+(.+?)\s+steady\b/, 'unmark-steady'],
    [/^remove\s+(.+?)\s+faa\b/,    'unmark-faa'],
    [/^mark\s+(.+?)\s+steady\b/,   'mark-steady'],
    [/^mark\s+(.+?)\s+faa\b/,      'mark-faa'],
    [/^delete\s+(.+)$/,            'delete'],
    [/^open\s+(.+)$/,              'open'],
  ]
  for (const [re, verb] of table) {
    const m = raw.match(re)
    if (m) return { verb, needle: m[1].trim() }
  }
  return { verb: null, needle: raw }
}

// ── Fuzzy score ─────────────────────────────────────────────────────────────

function subseqScore(query: string, target: string): number {
  if (!query) return 1
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  let lastIdx = -1
  let contiguousBonus = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      if (lastIdx === i - 1) contiguousBonus += 2
      lastIdx = i
      qi++
    }
  }
  if (qi < q.length) return 0
  const startBonus = t.startsWith(q) ? 20 : 0
  return 10 + startBonus + contiguousBonus - t.length * 0.05
}

// Best-matching project for a needle, or null if nothing scores.
function bestProject(needle: string, projects: ProjectSummary[]): ProjectSummary | null {
  if (!needle) return null
  let best: { p: ProjectSummary; score: number } | null = null
  for (const p of projects) {
    const s = Math.max(
      subseqScore(needle, p.name),
      subseqScore(needle, p.client) * 0.9,
      subseqScore(needle, p.site)   * 0.8,
    )
    if (s > 0 && (!best || s > best.score)) best = { p, score: s }
  }
  return best?.p ?? null
}

// ── Component ───────────────────────────────────────────────────────────────

export default function CommandPalette({ open, onClose, onOpenDeal, onSwitchTab }: Props) {
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn:  () => api.projects.list(),
    staleTime: 30_000,
    enabled: open,
  })
  const { data: activeDeals = [] } = useQuery({
    queryKey: ['hs-active'],
    queryFn:  () => api.hubspot.getActive(),
    staleTime: 60_000,
    enabled: open,
    retry: false,
  })
  const dealMap = useMemo(
    () => new Map<string, HubSpotActiveDeal>(activeDeals.map(a => [a.projectId, a])),
    [activeDeals],
  )

  // Single mutation that all state-change actions funnel through. Handles
  // invalidation, activity logging, and toasts.
  const toggleMut = useMutation({
    mutationFn: (args: { id: string; patch: { steadyState?: boolean; faaAuthorizationRequired?: boolean }; label: string; subject: string; kind: 'steady-on' | 'steady-off' | 'faa-on' | 'faa-off' }) =>
      api.projects.update(args.id, args.patch),
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', args.id] })
      logActivity({ kind: args.kind, subject: args.subject, projectId: args.id })
      showToast({ title: args.label, detail: args.subject, tone: 'success' })
    },
    onError: (e) => showToast({ title: 'Update failed', detail: (e as Error).message, tone: 'error' }),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  const parsed = useMemo(() => parseVerb(query), [query])

  const items: Item[] = useMemo(() => {
    // ── Action items ────────────────────────────────────────────────────
    // Only surface actions when a verb is recognized. Ranked at the top.
    const actionItems: Array<Item & { score: number }> = []
    if (parsed.verb) {
      const target = bestProject(parsed.needle, projects)
      if (target) {
        const dealName = dealMap.get(target.id)?.deal.properties.dealname ?? target.name
        const shared = { kind: 'action' as const, score: 1000, subtitle: dealName }
        switch (parsed.verb) {
          case 'mark-steady':
            actionItems.push({
              ...shared, key: `act:steady-on:${target.id}`, title: `Mark ${dealName} steady state`,
              accent: '#3FB95A',
              onSelect: () => toggleMut.mutate({ id: target.id, patch: { steadyState: true },  label: 'Marked steady state', subject: dealName, kind: 'steady-on'  }),
            }); break
          case 'unmark-steady':
            actionItems.push({
              ...shared, key: `act:steady-off:${target.id}`, title: `Return ${dealName} to active deployment`,
              accent: '#3FB95A',
              onSelect: () => toggleMut.mutate({ id: target.id, patch: { steadyState: false }, label: 'Returned to active',    subject: dealName, kind: 'steady-off' }),
            }); break
          case 'mark-faa':
            actionItems.push({
              ...shared, key: `act:faa-on:${target.id}`, title: `Enable FAA tracking on ${dealName}`,
              accent: '#3b82f6',
              onSelect: () => toggleMut.mutate({ id: target.id, patch: { faaAuthorizationRequired: true },  label: 'FAA tracking on',  subject: dealName, kind: 'faa-on'  }),
            }); break
          case 'unmark-faa':
            actionItems.push({
              ...shared, key: `act:faa-off:${target.id}`, title: `Disable FAA tracking on ${dealName}`,
              accent: '#3b82f6',
              onSelect: () => toggleMut.mutate({ id: target.id, patch: { faaAuthorizationRequired: false }, label: 'FAA tracking off', subject: dealName, kind: 'faa-off' }),
            }); break
          case 'open':
            actionItems.push({
              ...shared, key: `act:open:${target.id}`, title: `Open ${dealName}`,
              accent: '#e8eaf0',
              onSelect: () => onOpenDeal(target.id),
            }); break
          case 'delete':
            actionItems.push({
              ...shared, key: `act:delete:${target.id}`, title: `Delete ${dealName}`,
              accent: '#D2232A',
              subtitle: 'Undoable for 7 seconds after confirming',
              onSelect: () => showUndoableToast({
                title: `Deleted "${dealName}"`,
                detail: 'Deal removed. Click Undo to keep it.',
                undoLabel: 'Undo', durationMs: 7000,
                onCommit: () => { deleteMut.mutate(target.id); logActivity({ kind: 'deal-deleted', subject: dealName }) },
                onCancel: () => showToast({ title: 'Deletion cancelled', detail: dealName, tone: 'info', durationMs: 2000 }),
              }),
            }); break
        }
      }
    }

    // ── Deal items ─────────────────────────────────────────────────────
    const needleForScore = parsed.verb ? parsed.needle : query
    const dealItems: Array<Item & { score: number }> = projects.map((p: ProjectSummary) => {
      const hs = dealMap.get(p.id)
      const dealName = hs?.deal.properties.dealname ?? p.name
      const score = Math.max(
        subseqScore(needleForScore, dealName),
        subseqScore(needleForScore, p.client || '') * 0.9,
        subseqScore(needleForScore, p.site || '')   * 0.8,
      )
      return {
        key:      `deal:${p.id}`,
        kind:     'deal' as const,
        title:    dealName,
        subtitle: [p.client, p.site].filter(Boolean).join(' · ') || 'No client · No site',
        accent:   p.steadyState ? '#3FB95A' : '#E53935',
        onSelect: () => onOpenDeal(p.id),
        score,
      }
    })

    // ── View items ─────────────────────────────────────────────────────
    const viewItems: Array<Item & { score: number }> = VIEW_ENTRIES.map(v => ({
      key:      `view:${v.tab}`,
      kind:     'view' as const,
      title:    v.title,
      subtitle: v.subtitle,
      accent:   '#9AA2B8',
      onSelect: () => onSwitchTab(v.tab),
      score:    Math.max(subseqScore(query, v.title), subseqScore(query, v.subtitle) * 0.7),
    }))

    const combined = [...actionItems, ...dealItems, ...viewItems]
    const filtered = query
      ? combined.filter(i => i.score > 0)
      : combined
    filtered.sort((a, b) => b.score - a.score)
    return filtered.slice(0, 14)
  }, [projects, dealMap, query, parsed, onOpenDeal, onSwitchTab, toggleMut, deleteMut])

  useEffect(() => { setSelected(0) }, [query, items.length])

  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 20)
      return () => clearTimeout(id)
    } else {
      setQuery('')
      setSelected(0)
    }
  }, [open])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(items.length - 1, s + 1)); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(0, s - 1)); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[selected]
      if (item) { item.onSelect(); sfx.click(); onClose() }
    }
  }

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        zIndex: 600,
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 'min(15vh, 120px)',
        animation: 'fadeSlideIn 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(640px, 92vw)',
          background: '#111318', border: '1px solid #2a3040',
          borderRadius: 14, overflow: 'hidden',
          boxShadow: '0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03) inset',
        }}
      >
        {/* Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid #1e2432' }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, color: '#5a6380' }}>
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.6" />
            <line x1="12" y1="12" x2="15.5" y2="15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search deals, run a command…  e.g. mark austin steady"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#e8eaf0', fontFamily: 'Syne, sans-serif', fontSize: 16, letterSpacing: 0.2,
            }}
          />
          <kbd style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5a6380', border: '1px solid #2a3040', borderRadius: 4, padding: '2px 6px' }}>Esc</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: '52vh', overflowY: 'auto', padding: '6px 0' }}>
          {items.length === 0 ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#5a6380' }}>
              No matches for “{query}”
            </div>
          ) : items.map((item, idx) => {
            const active = idx === selected
            return (
              <button
                key={item.key}
                onMouseEnter={() => setSelected(idx)}
                onClick={() => { item.onSelect(); sfx.click(); onClose() }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 18px', background: active ? 'rgba(210,35,42,0.10)' : 'transparent',
                  border: 'none', borderLeft: `2px solid ${active ? '#D2232A' : 'transparent'}`,
                  cursor: 'pointer', textAlign: 'left' as const, transition: 'background 0.08s',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.accent, boxShadow: `0 0 6px ${item.accent}88`, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: 'Syne, sans-serif', fontSize: 13, fontWeight: 600, color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </span>
                  <span style={{ display: 'block', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5a6380', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.subtitle}
                  </span>
                </span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                  color: item.kind === 'action' ? '#f59e0b' : '#5a6380',
                  letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0,
                  background: item.kind === 'action' ? 'rgba(245,158,11,0.10)' : 'transparent',
                  border: item.kind === 'action' ? '1px solid rgba(245,158,11,0.30)' : 'none',
                  borderRadius: 4, padding: item.kind === 'action' ? '1px 6px' : 0,
                }}>
                  {item.kind === 'deal' ? 'Deal' : item.kind === 'view' ? 'View' : 'Action'}
                </span>
              </button>
            )
          })}
        </div>

        {/* Footer legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px', borderTop: '1px solid #1e2432', background: '#0d1017', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5a6380', flexWrap: 'wrap' }}>
          <span><kbd style={kbdSt}>↑</kbd><kbd style={kbdSt}>↓</kbd> navigate</span>
          <span><kbd style={kbdSt}>↵</kbd> select</span>
          <span style={{ opacity: 0.7 }}>try:</span>
          <span style={{ color: '#9aa3b8' }}>mark ✱ steady</span>
          <span style={{ color: '#9aa3b8' }}>mark ✱ faa</span>
          <span style={{ color: '#9aa3b8' }}>delete ✱</span>
          <span style={{ marginLeft: 'auto' }}><kbd style={kbdSt}>⌘K</kbd></span>
        </div>
      </div>
    </div>
  )
}

const kbdSt: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#9aa3b8',
  border: '1px solid #2a3040', borderRadius: 4, padding: '1px 5px', marginRight: 3,
}
