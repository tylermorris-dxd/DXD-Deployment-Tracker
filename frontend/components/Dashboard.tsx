'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { HubSpotDeal, HubSpotOwner } from '@/lib/types'
import {
  ResponsiveContainer,
  BarChart, Bar,
  AreaChart, Area,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts'

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function parseAmt(s?: string) {
  return parseFloat(s || '0') || 0
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const mono: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" }
const chakra: React.CSSProperties = { fontFamily: "'Chakra Petch', sans-serif" }

const card: React.CSSProperties = {
  background: 'rgba(28,28,30,0.85)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 10,
  padding: '18px 20px',
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ ...card, flex: 1 }}>
      <div style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginBottom: 6, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ ...chakra, fontSize: 26, fontWeight: 700, color: '#e63946', letterSpacing: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  )
}

const TOOLTIP_STYLE = {
  background: 'rgba(18,18,20,0.97)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 11,
  color: '#E8ECF4',
}

const AXIS_TICK = { fill: 'rgba(255,255,255,0.35)', fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }

export default function Dashboard() {
  const { data: activeData, isLoading, error } = useQuery({
    queryKey: ['hs-active-dash'],
    queryFn: () => api.hubspot.getActive(),
    staleTime: 60_000,
    retry: false,
  })

  const { data: ownersData } = useQuery({
    queryKey: ['hs-owners'],
    queryFn: () => api.hubspot.getOwners(),
    staleTime: 300_000,
    retry: false,
  })

  const deals: HubSpotDeal[] = (activeData ?? [])
    .map(a => a.deal)
    .filter(d => d.properties.dealstage !== 'closedlost')
  const owners: HubSpotOwner[] = ownersData?.results ?? []

  const ownerMap = new Map<string, string>(
    owners.map(o => [
      o.id,
      [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email || `Owner ${o.id.slice(-4)}`,
    ])
  )

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const totalValue = deals.reduce((s, d) => s + parseAmt(d.properties.amount), 0)
  const avgDeal = deals.length ? totalValue / deals.length : 0
  const now = Date.now()
  const closingSoon = deals.filter(d => {
    const ms = new Date(d.properties.closedate || '').getTime()
    return ms > now && ms - now <= 30 * 86_400_000
  }).length

  // ── Deals by stage ──────────────────────────────────────────────────────────
  const stageCount = new Map<string, number>()
  const stageValue = new Map<string, number>()
  for (const d of deals) {
    const stage = d.properties.dealstage || 'Unknown'
    stageCount.set(stage, (stageCount.get(stage) ?? 0) + 1)
    stageValue.set(stage, (stageValue.get(stage) ?? 0) + parseAmt(d.properties.amount))
  }
  const byStageCount = Array.from(stageCount.entries())
    .map(([stage, count]) => ({ stage: stage.length > 18 ? stage.slice(0, 16) + '…' : stage, count }))
    .sort((a, b) => b.count - a.count)
  const byStageValue = Array.from(stageValue.entries())
    .map(([stage, value]) => ({ stage: stage.length > 18 ? stage.slice(0, 16) + '…' : stage, value }))
    .sort((a, b) => b.value - a.value)

  // ── Deals by owner ──────────────────────────────────────────────────────────
  const ownerCount = new Map<string, number>()
  for (const d of deals) {
    const oid = d.properties.hubspot_owner_id
    const name = oid ? (ownerMap.get(oid) ?? `Owner …${oid.slice(-4)}`) : 'Unassigned'
    ownerCount.set(name, (ownerCount.get(name) ?? 0) + 1)
  }
  const byOwner = Array.from(ownerCount.entries())
    .map(([owner, count]) => ({ owner: owner.length > 18 ? owner.slice(0, 16) + '…' : owner, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // ── Value over time (by close month) ────────────────────────────────────────
  const monthMap = new Map<string, number>()
  for (const d of deals) {
    const cd = d.properties.closedate
    if (!cd) continue
    const month = cd.slice(0, 7)
    monthMap.set(month, (monthMap.get(month) ?? 0) + parseAmt(d.properties.amount))
  }
  const overTime = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, value]) => ({ month, value }))

  // ── Timeline ────────────────────────────────────────────────────────────────
  const timeline = deals
    .filter(d => d.properties.closedate)
    .map(d => ({ ...d, closeDateMs: new Date(d.properties.closedate!).getTime() }))
    .sort((a, b) => a.closeDateMs - b.closeDateMs)
    .slice(0, 15)

  // ── States ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ maxWidth: 960, margin: '32px auto', padding: '0 20px', textAlign: 'center' }}>
        <p style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>
          LOADING PIPELINE DATA...
        </p>
      </div>
    )
  }

  if (error || deals.length === 0) {
    return (
      <div style={{ maxWidth: 960, margin: '32px auto', padding: '0 20px' }}>
        <div style={{ ...card, textAlign: 'center', padding: 40 }}>
          <p style={{ ...chakra, fontSize: 13, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, marginBottom: 8 }}>
            NO ACTIVE DEALS
          </p>
          <p style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
            Pin deals in Admin → HubSpot to see them here. Closed-lost deals are excluded.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px 40px' }}>

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total Deals" value={String(deals.length)} />
        <KpiCard label="Pipeline Value" value={fmtMoney(totalValue)} />
        <KpiCard label="Avg Deal Size" value={fmtMoney(avgDeal)} />
        <KpiCard label="Closing ≤ 30 days" value={String(closingSoon)} sub="deals near close" />
      </div>

      {/* Chart row — stage count + stage value */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ ...card, flex: 1 }}>
          <div style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginBottom: 14, textTransform: 'uppercase' }}>
            Deals by Stage
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byStageCount} margin={{ top: 4, right: 4, left: -16, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="stage" tick={AXIS_TICK} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={AXIS_TICK} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="count" fill="#e63946" radius={[3, 3, 0, 0]} name="Deals" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ ...card, flex: 1 }}>
          <div style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginBottom: 14, textTransform: 'uppercase' }}>
            Total Value by Stage
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byStageValue} margin={{ top: 4, right: 4, left: 8, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="stage" tick={AXIS_TICK} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={AXIS_TICK} tickFormatter={v => fmtMoney(v as number)} width={52} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v: unknown) => [fmtMoney(v as number), 'Value']} />
              <Bar dataKey="value" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Value" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Deals by owner */}
      {byOwner.length > 0 && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginBottom: 14, textTransform: 'uppercase' }}>
            Deals by Owner
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={byOwner} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} allowDecimals={false} />
              <YAxis type="category" dataKey="owner" tick={AXIS_TICK} width={120} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="count" fill="#f59e0b" radius={[0, 3, 3, 0]} name="Deals" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Value over time */}
      {overTime.length > 1 && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginBottom: 14, textTransform: 'uppercase' }}>
            Deal Value Over Time (by Close Date)
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={overTime} margin={{ top: 4, right: 4, left: 8, bottom: 4 }}>
              <defs>
                <linearGradient id="valueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e63946" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#e63946" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} tickFormatter={v => fmtMoney(v as number)} width={52} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown) => [fmtMoney(v as number), 'Value']} />
              <Area type="monotone" dataKey="value" stroke="#e63946" strokeWidth={2} fill="url(#valueGrad)" name="Value" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Timeline */}
      <div style={card}>
        <div style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginBottom: 14, textTransform: 'uppercase' }}>
          Deal Timeline — Sorted by Close Date
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 140px 120px', gap: '0 16px', marginBottom: 8 }}>
          {['DEAL', 'STAGE', 'OWNER', 'CLOSE DATE'].map(h => (
            <div key={h} style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: 1 }}>{h}</div>
          ))}
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 8 }} />
        {timeline.map(d => {
          const urgent = d.closeDateMs - now <= 30 * 86_400_000 && d.closeDateMs > now
          const oid = d.properties.hubspot_owner_id
          const ownerName = oid ? (ownerMap.get(oid) ?? `…${oid.slice(-4)}`) : '—'
          return (
            <div
              key={d.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 160px 140px 120px',
                gap: '0 16px',
                padding: '7px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: urgent ? 'rgba(230,57,70,0.05)' : 'transparent',
              }}
            >
              <div style={{ ...mono, fontSize: 11, color: urgent ? '#e63946' : '#E8ECF4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {urgent && <span style={{ color: '#e63946', marginRight: 6 }}>●</span>}
                {d.properties.dealname || d.id}
              </div>
              <div style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.properties.dealstage || '—'}
              </div>
              <div style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ownerName}
              </div>
              <div style={{ ...mono, fontSize: 10, color: urgent ? '#f59e0b' : 'rgba(255,255,255,0.45)' }}>
                {fmtDate(d.properties.closedate)}
              </div>
            </div>
          )
        })}
        {timeline.length === 0 && (
          <p style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>No close dates set.</p>
        )}
      </div>
    </div>
  )
}
