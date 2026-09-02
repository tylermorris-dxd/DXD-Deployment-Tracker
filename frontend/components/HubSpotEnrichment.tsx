'use client'

import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { HubSpotDeal, HubSpotOwner } from '@/lib/types'
import Avatar from './Avatar'

// Rich HubSpot context under the deal header. Renders four rails when
// HubSpot has anything to show:
//   ▸ Owner + Company enrichment (industry, employees, revenue, HQ)
//   ▸ Line items (product breakdown)
//   ▸ Timeline (notes + calls, newest first)
// Anything empty collapses so a lightly-populated HubSpot deal just shows
// what it has.

interface Props { deal: HubSpotDeal }

const C = {
  card: '#12141a',
  border: '#252b38',
  text:  '#e8eaf0',
  text2: '#9aa3b8',
  muted: '#5a6380',
  hs:    '#FF9800',
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

function fmtEmployees(raw?: string): string | null {
  if (!raw) return null
  const n = parseInt(raw, 10)
  if (isNaN(n)) return raw
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function ownerAvatarLabel(o?: HubSpotOwner): string {
  return [o?.firstName, o?.lastName].filter(Boolean).join(' ') || o?.email || 'Unassigned'
}

// Extremely permissive HTML strip — HubSpot notes/calls include <p>, <br>,
// <div> etc. We only need to render as plain text so we squash tags rather
// than build a rich renderer.
function stripHtml(s: string): string {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

function timeAgo(ts: string | null | undefined): string {
  if (!ts) return ''
  const then = Date.parse(ts)
  if (!then || isNaN(then)) return ''
  const diff = Date.now() - then
  const s = Math.floor(diff / 1000)
  if (s < 60)         return 'just now'
  if (s < 3600)       return `${Math.floor(s / 60)}m ago`
  if (s < 86400)      return `${Math.floor(s / 3600)}h ago`
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function HubSpotEnrichment({ deal }: Props) {
  const [tab, setTab] = useState<'timeline' | 'lineitems' | 'company'>('timeline')

  const { data: ownersResp } = useQuery({
    queryKey: ['hubspot-owners'],
    queryFn:  () => api.hubspot.getOwners(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  const ownersById = useMemo(() => {
    const map = new Map<string, HubSpotOwner>()
    ownersResp?.results?.forEach(o => map.set(o.id, o))
    return map
  }, [ownersResp])

  const dealOwner   = deal.properties.hubspot_owner_id ? ownersById.get(deal.properties.hubspot_owner_id) : undefined
  const company     = deal.companyDetails?.[0]
  const notes       = deal.noteDetails ?? []
  const calls       = deal.callDetails ?? []
  const lineItems   = deal.lineItemDetails ?? []

  // Combined timeline sorted newest-first.
  const timeline = useMemo(() => {
    type Row = { kind: 'note' | 'call'; id: string; ts: number; ownerId?: string; title: string; body: string; direction?: string; durationMs?: number }
    const rows: Row[] = []
    for (const n of notes) {
      const ts = n.properties.hs_timestamp ? Date.parse(n.properties.hs_timestamp) : 0
      rows.push({
        kind: 'note', id: n.id, ts, ownerId: n.properties.hubspot_owner_id,
        title: 'Note', body: stripHtml(n.properties.hs_note_body || ''),
      })
    }
    for (const c of calls) {
      const ts = c.properties.hs_timestamp ? Date.parse(c.properties.hs_timestamp) : 0
      rows.push({
        kind: 'call', id: c.id, ts, ownerId: c.properties.hubspot_owner_id,
        title: c.properties.hs_call_title || 'Call',
        body: stripHtml(c.properties.hs_call_body || ''),
        direction: c.properties.hs_call_direction,
        durationMs: c.properties.hs_call_duration ? Number(c.properties.hs_call_duration) : undefined,
      })
    }
    rows.sort((a, b) => b.ts - a.ts)
    return rows
  }, [notes, calls])

  const lineItemTotal = lineItems.reduce((s, li) => s + (Number(li.properties.amount) || 0), 0)

  const showCompany   = !!(company || dealOwner)
  const showLineItems = lineItems.length > 0
  const showTimeline  = timeline.length > 0
  if (!showCompany && !showLineItems && !showTimeline) return null

  // Compact header strip
  return (
    <div style={{
      background: 'rgba(255,152,0,0.03)',
      borderTop: '1px solid rgba(255,152,0,0.15)',
      borderBottom: '1px solid rgba(255,152,0,0.15)',
    }}>
      {/* Rail 1: Owner + Company facts */}
      {showCompany && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 24px', borderBottom: '1px solid rgba(255,152,0,0.1)', flexWrap: 'wrap' }}>
          {dealOwner && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar name={ownerAvatarLabel(dealOwner)} email={dealOwner.email} size={26} ring="rgba(255,152,0,0.6)" />
              <div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase' as const }}>Owner</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.text, fontWeight: 600 }}>{ownerAvatarLabel(dealOwner)}</div>
              </div>
            </div>
          )}
          {company && (
            <>
              {company.properties.industry && <StatChip label="Industry" value={company.properties.industry} />}
              {company.properties.numberofemployees && <StatChip label="Employees" value={fmtEmployees(company.properties.numberofemployees) || ''} />}
              {company.properties.annualrevenue && <StatChip label="Annual revenue" value={fmtMoney(Number(company.properties.annualrevenue))} />}
              {company.properties.domain && (
                <StatChip label="Domain" value={company.properties.domain} href={`https://${company.properties.domain}`} />
              )}
              {(company.properties.city || company.properties.state) && (
                <StatChip label="HQ" value={[company.properties.city, company.properties.state].filter(Boolean).join(', ')} />
              )}
            </>
          )}
          <a href={`https://app.hubspot.com/contacts/deals/${deal.id}`} target="_blank" rel="noreferrer"
             style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.hs, textDecoration: 'none', letterSpacing: 0.5 }}>
            Open in HubSpot ↗
          </a>
        </div>
      )}

      {/* Rail 2: Tab strip */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 24px', alignItems: 'center' }}>
        {showTimeline && (
          <TabBtn active={tab === 'timeline'} onClick={() => setTab('timeline')}>
            Timeline <Badge>{timeline.length}</Badge>
          </TabBtn>
        )}
        {showLineItems && (
          <TabBtn active={tab === 'lineitems'} onClick={() => setTab('lineitems')}>
            Line items <Badge>{lineItems.length}</Badge>
          </TabBtn>
        )}
        {showCompany && (
          <TabBtn active={tab === 'company'} onClick={() => setTab('company')}>
            Company
          </TabBtn>
        )}
        {(tab === 'timeline' && !showTimeline) || (tab === 'lineitems' && !showLineItems) || (tab === 'company' && !showCompany)
          ? null : null}
        {tab === 'lineitems' && lineItems.length > 0 && (
          <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.text, letterSpacing: 0.5 }}>
            Line-item total: <span style={{ color: '#3FB95A', fontWeight: 700 }}>{fmtMoney(lineItemTotal)}</span>
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '4px 24px 14px 24px' }}>
        {tab === 'timeline' && showTimeline && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
            {timeline.map(row => {
              const owner = row.ownerId ? ownersById.get(row.ownerId) : undefined
              const color = row.kind === 'call' ? '#3b82f6' : C.hs
              return (
                <div key={row.id} style={{ display: 'flex', gap: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 7, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 2 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', background: color,
                      boxShadow: `0 0 6px ${color}88`, flexShrink: 0,
                    }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, color: C.text }}>
                        {row.kind === 'call' ? '📞 ' : '📝 '}{row.title}
                      </span>
                      {row.direction && (
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color, letterSpacing: 1, textTransform: 'uppercase' as const }}>
                          {row.direction}
                        </span>
                      )}
                      {row.durationMs != null && row.durationMs > 0 && (
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: C.muted }}>
                          {Math.round(row.durationMs / 1000)}s
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: C.muted }}>
                        {timeAgo(row.ts ? new Date(row.ts).toISOString() : undefined)}
                      </span>
                    </div>
                    {row.body && (
                      <div style={{
                        fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.text2,
                        marginTop: 4, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
                        display: '-webkit-box' as const, WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                        lineHeight: 1.5,
                      }}>
                        {row.body}
                      </div>
                    )}
                    {owner && (
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: C.muted, marginTop: 4 }}>
                        by {ownerAvatarLabel(owner)}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'lineitems' && showLineItems && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, padding: '4px 8px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' as const, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span>Item</span><span style={{ textAlign: 'right' as const }}>Qty</span><span style={{ textAlign: 'right' as const }}>Unit</span><span style={{ textAlign: 'right' as const }}>Total</span>
            </div>
            {lineItems.map(li => {
              const q = Number(li.properties.quantity) || 0
              const price = Number(li.properties.price) || 0
              const amount = Number(li.properties.amount) || (q * price)
              return (
                <div key={li.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, padding: '6px 8px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.text, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{li.properties.name || '(unnamed)'}</div>
                    {li.properties.hs_sku && <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>SKU {li.properties.hs_sku}</div>}
                  </div>
                  <span style={{ textAlign: 'right' as const, color: C.text2 }}>{q}</span>
                  <span style={{ textAlign: 'right' as const, color: C.text2 }}>{fmtMoney(price)}</span>
                  <span style={{ textAlign: 'right' as const, color: '#3FB95A', fontWeight: 700 }}>{fmtMoney(amount)}</span>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'company' && showCompany && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {company?.properties.description && (
              <div style={{ gridColumn: '1/-1', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.text2, lineHeight: 1.55 }}>
                {company.properties.description}
              </div>
            )}
            {[
              ['Name',      company?.properties.name],
              ['Industry',  company?.properties.industry],
              ['Employees', fmtEmployees(company?.properties.numberofemployees)],
              ['Annual rev.', company?.properties.annualrevenue ? fmtMoney(Number(company.properties.annualrevenue)) : null],
              ['Domain',    company?.properties.domain],
              ['HQ',        [company?.properties.city, company?.properties.state, company?.properties.country].filter(Boolean).join(', ') || null],
            ].filter(([, v]) => !!v).map(([k, v]) => (
              <div key={k} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 7, padding: '10px 12px' }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase' as const }}>{k}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.text, marginTop: 4, wordBreak: 'break-word' as const }}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatChip({ label, value, href }: { label: string; value: string; href?: string }) {
  const inner = (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '4px 10px' }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase' as const }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.text, fontWeight: 600 }}>{value}</div>
    </div>
  )
  return href
    ? <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{inner}</a>
    : inner
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: active ? 'rgba(255,152,0,0.14)' : 'transparent',
        border: `1px solid ${active ? 'rgba(255,152,0,0.4)' : 'transparent'}`, borderRadius: 5,
        color: active ? '#FF9800' : C.text2, cursor: 'pointer',
        fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
        textTransform: 'uppercase' as const,
      }}
    >
      {children}
    </button>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, background: 'rgba(255,152,0,0.15)', color: '#FF9800', border: '1px solid rgba(255,152,0,0.35)', borderRadius: 8, padding: '0 5px', marginLeft: 2 }}>
      {children}
    </span>
  )
}
