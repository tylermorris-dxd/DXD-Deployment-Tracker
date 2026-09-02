'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ProjectSummary } from '@/lib/types'

// Universal @mentions.
//
// Storage format: mentions are written into the text as `@[Deal Name](id)`.
// Plain text before/after is preserved. The MentionText component renders
// that same string as clickable chips.
//
// Autocomplete: typing @ pops a dropdown of matching deals; ↑/↓/⏎ selects.
// Also matches on client / site.

interface Deal { id: string; name: string; client: string; site: string }

// ── Serialization ────────────────────────────────────────────────────────────
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g

export function renderMentionText(
  text: string,
  onOpenDeal: (id: string) => void,
): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  const re = new RegExp(MENTION_RE.source, 'g')
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(<span key={key++}>{text.slice(last, m.index)}</span>)
    const name = m[1]
    const id = m[2]
    out.push(
      <button
        key={key++}
        onClick={() => onOpenDeal(id)}
        style={{
          background: 'rgba(210,35,42,0.12)', border: '1px solid rgba(210,35,42,0.35)',
          color: '#e8eaf0', borderRadius: 4, padding: '0 6px', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 'inherit',
        }}
      >
        @{name}
      </button>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(<span key={key++}>{text.slice(last)}</span>)
  return out
}

export function MentionText({ text, onOpenDeal }: { text: string; onOpenDeal: (id: string) => void }) {
  return <>{renderMentionText(text, onOpenDeal)}</>
}

// ── Input ────────────────────────────────────────────────────────────────────

interface FieldProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minRows?: number
  style?: React.CSSProperties
}

export default function MentionField({ value, onChange, placeholder, minRows = 4, style }: FieldProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [query, setQuery] = useState<string | null>(null)   // null = no popup
  const [triggerAt, setTriggerAt] = useState<number | null>(null)
  const [caret, setCaret] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [selected, setSelected] = useState(0)

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn:  () => api.projects.list(),
    staleTime: 30_000,
    enabled: query !== null,
  })

  const deals: Deal[] = projects.map((p: ProjectSummary) => ({ id: p.id, name: p.name, client: p.client, site: p.site }))

  const matches = useMemo(() => {
    if (query == null) return []
    const q = query.toLowerCase()
    if (!q) return deals.slice(0, 8)
    return deals
      .map(d => {
        const hay = `${d.name} ${d.client} ${d.site}`.toLowerCase()
        const idx = hay.indexOf(q)
        return { d, score: idx < 0 ? -1 : 1000 - idx }
      })
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(x => x.d)
  }, [query, deals])

  useEffect(() => { setSelected(0) }, [query, matches.length])

  function updateCaret() {
    const ta = taRef.current
    if (!ta) return
    // Approximate caret pixel position with a hidden mirror div. Good enough
    // for popup placement; we don't need pixel-perfect.
    const rect = ta.getBoundingClientRect()
    const mirror = document.createElement('div')
    const cs = window.getComputedStyle(ta)
    mirror.style.cssText = cs.cssText
    mirror.style.position = 'absolute'
    mirror.style.visibility = 'hidden'
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.wordWrap = 'break-word'
    mirror.style.width = ta.clientWidth + 'px'
    mirror.style.height = 'auto'
    const before = ta.value.slice(0, ta.selectionStart ?? 0)
    mirror.textContent = before
    const marker = document.createElement('span')
    marker.textContent = '​'
    mirror.appendChild(marker)
    document.body.appendChild(mirror)
    const mRect = marker.getBoundingClientRect()
    const cRect = mirror.getBoundingClientRect()
    document.body.removeChild(mirror)
    setCaret({
      top: rect.top - cRect.top + mRect.top - ta.scrollTop + 22,
      left: rect.left - cRect.left + mRect.left - ta.scrollLeft,
    })
  }

  function onKeyUp() {
    const ta = taRef.current
    if (!ta) return
    const pos = ta.selectionStart ?? 0
    // Look backward for '@' not preceded by a non-space char.
    const upto = ta.value.slice(0, pos)
    const at = upto.lastIndexOf('@')
    if (at < 0) { setQuery(null); return }
    const before = at === 0 ? ' ' : upto[at - 1]
    if (!/\s|[(\[{,;.:!?]/.test(before)) { setQuery(null); return }
    const raw = upto.slice(at + 1)
    if (/\s/.test(raw)) { setQuery(null); return }
    setTriggerAt(at)
    setQuery(raw)
    updateCaret()
  }

  function insertMention(d: Deal) {
    const ta = taRef.current
    if (!ta || triggerAt == null) return
    const pos = ta.selectionStart ?? 0
    const chunk = `@[${d.name}](${d.id}) `
    const next = ta.value.slice(0, triggerAt) + chunk + ta.value.slice(pos)
    onChange(next)
    setQuery(null)
    // Restore caret after React re-render.
    const newPos = triggerAt + chunk.length
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.focus()
        taRef.current.setSelectionRange(newPos, newPos)
      }
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query == null) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(matches.length - 1, s + 1)); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(0, s - 1)); return }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (matches[selected]) { e.preventDefault(); insertMention(matches[selected]) }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setQuery(null); return }
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={taRef}
        value={value}
        rows={minRows}
        onChange={e => onChange(e.target.value)}
        onKeyUp={onKeyUp}
        onKeyDown={onKeyDown}
        onClick={onKeyUp}
        placeholder={placeholder}
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '10px 12px', outline: 'none',
          color: '#e8eaf0', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, lineHeight: 1.5,
          resize: 'vertical' as const,
          ...style,
        }}
      />
      {query != null && matches.length > 0 && (
        <div style={{
          position: 'fixed',
          top: caret.top, left: caret.left, zIndex: 900,
          minWidth: 260, maxWidth: 380,
          background: '#12141a', border: '1px solid #2a3040', borderRadius: 8,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}>
          {matches.map((d, i) => (
            <button
              key={d.id}
              onMouseEnter={() => setSelected(i)}
              onMouseDown={e => { e.preventDefault(); insertMention(d) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px',
                background: i === selected ? 'rgba(210,35,42,0.10)' : 'transparent',
                border: 'none', borderLeft: `2px solid ${i === selected ? '#D2232A' : 'transparent'}`,
                cursor: 'pointer', textAlign: 'left' as const,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D2232A' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 600, color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.name}
                </span>
                <span style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#5a6380', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[d.client, d.site].filter(Boolean).join(' · ') || 'no client'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
