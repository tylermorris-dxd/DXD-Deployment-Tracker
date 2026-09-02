'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ProjectSummary, HubSpotActiveDeal } from '@/lib/types'
import type { MainTab } from '@/app/page'

// Cmd/Ctrl+K command palette.
//
// Two kinds of results:
//   • Deals   — every pinned + local project. Enter opens the deal.
//   • Views   — the top-level tabs. Enter switches to that tab.
//
// Fuzzy match is a simple subsequence check (each char of the query must
// appear in the target in order). It's cheap, forgiving of typos, and
// produces the "spotlight feel" without a search library.

interface Props {
  open: boolean
  onClose: () => void
  onOpenDeal: (id: string) => void
  onSwitchTab: (tab: MainTab) => void
}

interface Item {
  key: string
  kind: 'deal' | 'view'
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
  // Reward matches at word boundaries, contiguous matches, and shorter targets
  const startBonus = t.startsWith(q) ? 20 : 0
  return 10 + startBonus + contiguousBonus - t.length * 0.05
}

export default function CommandPalette({ open, onClose, onOpenDeal, onSwitchTab }: Props) {
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

  const items: Item[] = useMemo(() => {
    const dealItems: Array<Item & { score: number }> = projects.map((p: ProjectSummary) => {
      const hs = dealMap.get(p.id)
      const dealName = hs?.deal.properties.dealname ?? p.name
      const hay = [dealName, p.client, p.site].filter(Boolean).join(' · ')
      const score = Math.max(
        subseqScore(query, dealName),
        subseqScore(query, p.client || '') * 0.9,
        subseqScore(query, p.site || '') * 0.8,
      )
      return {
        key:      `deal:${p.id}`,
        kind:     'deal' as const,
        title:    dealName,
        subtitle: [p.client, p.site].filter(Boolean).join(' · ') || 'No client · No site',
        accent:   p.steadyState ? '#3FB95A' : '#E53935',
        onSelect: () => onOpenDeal(p.id),
        score:    score + (query ? 0 : (hay.length > 0 ? 0.1 : 0)),
      }
    })
    const viewItems: Array<Item & { score: number }> = VIEW_ENTRIES.map(v => ({
      key:      `view:${v.tab}`,
      kind:     'view' as const,
      title:    v.title,
      subtitle: v.subtitle,
      accent:   '#9AA2B8',
      onSelect: () => onSwitchTab(v.tab),
      score:    Math.max(subseqScore(query, v.title), subseqScore(query, v.subtitle) * 0.7),
    }))
    const combined = [...dealItems, ...viewItems]
    const filtered = query
      ? combined.filter(i => i.score > 0)
      : combined
    filtered.sort((a, b) => b.score - a.score)
    return filtered.slice(0, 12)
  }, [projects, dealMap, query, onOpenDeal, onSwitchTab])

  // Reset selection whenever the visible list changes so the highlight
  // doesn't fall off the end after typing.
  useEffect(() => { setSelected(0) }, [query, items.length])

  // Focus the input on open and clear stale state when we close.
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
      if (item) { item.onSelect(); onClose() }
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
            placeholder="Search deals, jump to a view…"
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
                onClick={() => { item.onSelect(); onClose() }}
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
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#5a6380', letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0 }}>
                  {item.kind === 'deal' ? 'Deal' : 'View'}
                </span>
              </button>
            )
          })}
        </div>

        {/* Footer legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px', borderTop: '1px solid #1e2432', background: '#0d1017', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5a6380' }}>
          <span><kbd style={kbdSt}>↑</kbd><kbd style={kbdSt}>↓</kbd> to navigate</span>
          <span><kbd style={kbdSt}>↵</kbd> to select</span>
          <span style={{ marginLeft: 'auto' }}><kbd style={kbdSt}>⌘K</kbd> to toggle</span>
        </div>
      </div>
    </div>
  )
}

const kbdSt: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#9aa3b8',
  border: '1px solid #2a3040', borderRadius: 4, padding: '1px 5px', marginRight: 3,
}
