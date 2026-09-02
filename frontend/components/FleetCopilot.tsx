'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ProjectSummary, HubSpotActiveDeal } from '@/lib/types'
import { useRecentActivity } from '@/lib/activity'
import { sfx } from '@/lib/sfx'

// AI Fleet Copilot — slide-in right sidebar that lets the operator ask
// natural-language questions about their fleet + HubSpot pipeline. It reads
// the fleet state and passes it as a system prompt so the model can
// reference specific deals. Claude's reply is typewriter-animated locally to
// feel like a live stream (the backend proxy is non-streaming today).
//
// Deals in the reply are auto-linkified with a [[DealName]] convention:
// the model is told about the format and rendered replies detect it and
// resolve back to a projectId → click to open.

interface Props {
  open: boolean
  onClose: () => void
  onOpenDeal: (id: string) => void
}

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string        // stored full text
  visible: string        // typewriter-animated portion (assistant only)
  ts: number
}

// ── Prompt scaffolding ───────────────────────────────────────────────────────

const SYSTEM_INSTRUCTIONS = `
You are DXD Fleet Copilot, an assistant for a drone-security-operations tracker used by DXD (Deus X Defense) operators.

Style:
- Be concise. 2-4 sentences by default.
- Prefer bullet lists for 3+ items.
- Never invent deals, dollar amounts, or dates. Only use what appears in the FLEET STATE.
- Assume you are talking to a professional drone-ops operator — technical, no fluff.

Deal linking convention:
- When you mention a specific deal, wrap its name in double square brackets so the UI can make it clickable: [[Austin Airport Complex]].
- Use the deal name exactly as it appears in FLEET STATE.

When suggesting operator actions (e.g. "you could mark X steady"), phrase them as commands the user can run in the command palette: mark <deal> steady, mark <deal> faa, delete <deal>, open <deal>.
`.trim()

function buildSystemPrompt(
  projects: ProjectSummary[],
  activeDeals: HubSpotActiveDeal[],
  activity: string,
): string {
  const dealMap = new Map(activeDeals.map(a => [a.projectId, a.deal]))
  const nowIso = new Date().toISOString()
  const linesByBucket: Record<string, string[]> = { active: [], steady: [], faa: [] }
  for (const p of projects) {
    const hs = dealMap.get(p.id)
    const amountRaw = hs?.properties?.amount ? Number(hs.properties.amount) : null
    const amount = amountRaw && !isNaN(amountRaw) ? ` · $${Math.round(amountRaw).toLocaleString()}` : ''
    const stage  = hs?.properties?.dealstage ? ` · ${hs.properties.dealstage}` : ''
    const modified = hs?.properties?.hs_lastmodifieddate
      ? ` · last-hs-touch ${new Date(hs.properties.hs_lastmodifieddate).toISOString().slice(0, 10)}`
      : ''
    const faaAge = p.faaAuthorizationRequired && p.faaAuthStartedAt
      ? ` · faa-day-${Math.max(0, Math.round((Date.now() - new Date(p.faaAuthStartedAt).getTime()) / 86_400_000))}`
      : ''
    const line = `- [[${p.name}]] · ${p.client || 'no client'} · ${p.site || 'no site'}${stage}${amount}${modified}${faaAge}`
    if (p.steadyState) linesByBucket.steady.push(line)
    else if (p.faaAuthorizationRequired) linesByBucket.faa.push(line)
    else linesByBucket.active.push(line)
  }
  const bucket = (title: string, arr: string[]) => arr.length ? `\n## ${title} (${arr.length})\n${arr.join('\n')}` : ''
  return [
    SYSTEM_INSTRUCTIONS,
    '',
    '# FLEET STATE',
    `As of ${nowIso}. ${projects.length} total deployments tracked.`,
    bucket('Active', linesByBucket.active),
    bucket('Steady state', linesByBucket.steady),
    bucket('FAA tracking', linesByBucket.faa),
    activity ? '\n# RECENT ACTIVITY\n' + activity : '',
  ].join('\n')
}

// ── Message rendering with [[Deal]] linkification ────────────────────────────

function renderMessage(text: string, nameToId: Map<string, string>, onOpenDeal: (id: string) => void): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const re = /\[\[([^\]]+)\]\]/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={key++}>{text.slice(last, m.index)}</span>)
    const name = m[1]
    const id = nameToId.get(name)
    if (id) {
      parts.push(
        <button
          key={key++}
          onClick={() => onOpenDeal(id)}
          style={{
            background: 'rgba(210,35,42,0.12)', border: '1px solid rgba(210,35,42,0.35)',
            color: '#e8eaf0', borderRadius: 4, padding: '1px 6px',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit',
          }}
        >
          {name}
        </button>,
      )
    } else {
      parts.push(<strong key={key++} style={{ color: '#e8eaf0' }}>{name}</strong>)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>)
  return parts
}

// ── Component ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'dxd-copilot-history-v1'

function loadHistory(): ChatMsg[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveHistory(msgs: ChatMsg[]) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-40))) } catch { /* quota */ }
}

export default function FleetCopilot({ open, onClose, onOpenDeal }: Props) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const activity = useRecentActivity(10)

  useEffect(() => { setMessages(loadHistory()) }, [])
  useEffect(() => { saveHistory(messages) }, [messages])

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => api.projects.list(), staleTime: 30_000, enabled: open })
  const { data: activeDeals = [] } = useQuery({ queryKey: ['hs-active'], queryFn: () => api.hubspot.getActive(), staleTime: 60_000, enabled: open, retry: false })

  // Name → id map for linkifying deals in Claude's replies.
  const nameToId = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of projects) m.set(p.name, p.id)
    return m
  }, [projects])

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 20)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Typewriter animation — reveals the assistant's response one char at a
  // time so a JSON-only backend still feels streamed.
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant' || last.visible === last.content) return
    const remaining = last.content.length - last.visible.length
    // Adaptive speed: reveal in ~1.5 seconds regardless of length, but at
    // least 8 chars per tick so a long answer still finishes quickly.
    const perTick = Math.max(8, Math.ceil(remaining / 45))
    const t = setTimeout(() => {
      setMessages(prev => prev.map((m, i) => i === prev.length - 1
        ? { ...m, visible: m.content.slice(0, m.visible.length + perTick) }
        : m,
      ))
    }, 30)
    return () => clearTimeout(t)
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    sfx.ack()
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: text, visible: text, ts: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setBusy(true)

    const activityText = activity.map(a => `- ${a.subject} · ${new Date(a.ts).toISOString().slice(0, 10)} · ${a.kind}`).join('\n')
    const system = buildSystemPrompt(projects, activeDeals, activityText)
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ]

    try {
      const resp = await api.claude({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        temperature: 0.4,
        system,
        messages: history,
      }) as { content?: Array<{ type: string; text?: string }> }
      const reply = (resp.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('\n').trim()
        || '(no response)'
      const asstMsg: ChatMsg = {
        id: `a-${Date.now()}`, role: 'assistant', content: reply, visible: '', ts: Date.now(),
      }
      setMessages(prev => [...prev, asstMsg])
      sfx.ping()
    } catch (e) {
      setMessages(prev => [...prev, {
        id: `a-err-${Date.now()}`, role: 'assistant',
        content: `_Error:_ ${(e as Error).message}`, visible: `_Error:_ ${(e as Error).message}`, ts: Date.now(),
      }])
      sfx.err()
    } finally {
      setBusy(false)
    }
  }

  function clear() {
    setMessages([])
    sfx.whoosh()
  }

  const isNarrow = typeof window !== 'undefined' && window.innerWidth <= 768
  const width = 420

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: open ? 'rgba(0,0,0,0.35)' : 'transparent',
          transition: 'background 0.2s', zIndex: 550,
          pointerEvents: open ? 'auto' : 'none',
          // backdrop-filter is a heavy op on mobile — skip when narrow.
          backdropFilter: open && !isNarrow ? 'blur(2px)' : 'none',
        }}
      />
      {/* Panel — full-width on narrow screens so the copilot is usable
          without pinching, and pinned to the dvh so iOS Safari's chrome
          doesn't hide the input box. */}
      <aside
        style={{
          position: 'fixed', top: 0, right: 0,
          height: 'var(--dxd-vh, 100vh)',
          width: isNarrow ? '100%' : width,
          maxWidth: '100vw',
          background: 'linear-gradient(160deg, #12141a 0%, #0d1017 100%)',
          borderLeft: '1px solid #2a3040', zIndex: 560,
          transform: open ? 'translateX(0)' : 'translateX(105%)',
          transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-40px 0 80px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #D2232A, #7a1c22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>
            AI
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 13, fontWeight: 700, color: '#e8eaf0' }}>
              Fleet Copilot
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380', letterSpacing: 1, textTransform: 'uppercase' }}>
              {projects.length} deployments in context
            </div>
          </div>
          <button
            onClick={clear}
            title="Clear conversation"
            style={{ padding: '4px 8px', background: 'transparent', border: '1px solid #2a3040', borderRadius: 5, color: '#9aa3b8', cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}
          >
            Clear
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ padding: 4, background: 'transparent', border: 'none', color: '#5a6380', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 16px 14px' }}>
          {messages.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '20px 4px' }}>
              <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, color: '#e8eaf0', fontWeight: 600 }}>
                Ask about your fleet.
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#9aa3b8', lineHeight: 1.6 }}>
                I can see every deal, its HubSpot state, and recent activity.
                Try asking about stuck deals, FAA progress, pipeline totals,
                or what to do next.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {[
                  'Which deals have been idle in HubSpot for over 14 days?',
                  'Summarize FAA authorization progress across the fleet.',
                  'What is my highest-value active deal, and where does it stand?',
                  'Which deals should I mark steady state today?',
                ].map(q => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus() }}
                    style={{
                      textAlign: 'left', padding: '9px 12px',
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 6, color: '#9aa3b8', cursor: 'pointer',
                      fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(210,35,42,0.4)'; e.currentTarget.style.color = '#e8eaf0' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#9aa3b8' }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.map(m => (
                <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: m.role === 'user' ? 'rgba(59,130,246,0.15)' : 'linear-gradient(135deg, #D2232A, #7a1c22)',
                    border: `1px solid ${m.role === 'user' ? 'rgba(59,130,246,0.4)' : 'rgba(210,35,42,0.5)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: '#fff',
                    letterSpacing: 0.5, flexShrink: 0, marginTop: 2,
                  }}>
                    {m.role === 'user' ? 'YOU' : 'AI'}
                  </div>
                  <div style={{
                    flex: 1, minWidth: 0,
                    background: m.role === 'user' ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${m.role === 'user' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 8, padding: '10px 12px',
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, lineHeight: 1.55,
                    color: '#e8eaf0', whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
                  }}>
                    {renderMessage(m.role === 'assistant' ? m.visible : m.content, nameToId, id => { onOpenDeal(id); onClose() })}
                    {m.role === 'assistant' && m.visible !== m.content && (
                      <span style={{ display: 'inline-block', width: 6, height: 12, background: '#D2232A', marginLeft: 2, animation: 'dxd-caret 0.9s steps(1) infinite', verticalAlign: 'text-bottom' }} />
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingLeft: 30, color: '#5a6380', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 1 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D2232A', animation: 'dxd-pulse 0.9s ease-in-out infinite' }} />
                  reading fleet…
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Ask about your fleet…"
              rows={2}
              style={{
                flex: 1, resize: 'none' as const,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, padding: '10px 12px', outline: 'none',
                color: '#e8eaf0', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, lineHeight: 1.5,
              }}
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              style={{
                padding: '10px 14px', border: 'none', borderRadius: 8,
                background: busy || !input.trim() ? 'rgba(210,35,42,0.25)' : 'linear-gradient(135deg, #D2232A, #7a1c22)',
                color: '#fff', cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
              }}
            >
              ↵
            </button>
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380', marginTop: 6, letterSpacing: 0.4 }}>
            ⏎ send · ⇧⏎ newline · ⌘J toggle
          </div>
        </div>

        <style>{`@keyframes dxd-caret { 50% { opacity: 0 } }`}</style>
      </aside>
    </>
  )
}
