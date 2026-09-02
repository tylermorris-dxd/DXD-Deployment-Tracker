'use client'

import { useEffect, useState } from 'react'
import { makePubSub } from './pubsub'
import { api } from './api'
import type { ProjectSummary, HubSpotActiveDeal } from './types'

// Proactive AI alerts. Once per day (per browser), Claude is asked to
// scan the fleet + HubSpot state and return a small JSON array of
// operator-facing alerts. Those are cached in localStorage until the
// next daily refresh, and rendered by AlertBell in the topbar.
//
// Storage:
//   dxd-alerts-v1 = { generatedAt: number, seenIds: string[], alerts: Alert[] }

export type AlertTone = 'urgent' | 'warn' | 'info' | 'good'

export interface Alert {
  id:          string
  tone:        AlertTone
  title:       string
  body:        string
  projectId?:  string        // deal to jump to on click
  projectName?: string
}

interface Store {
  generatedAt: number
  seenIds:     string[]
  alerts:      Alert[]
}

const STORAGE_KEY = 'dxd-alerts-v1'
const REFRESH_MS  = 24 * 60 * 60 * 1000  // 24h

const bus = makePubSub<Store>()

function load(): Store {
  if (typeof window === 'undefined') return { generatedAt: 0, seenIds: [], alerts: [] }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { generatedAt: 0, seenIds: [], alerts: [] }
    const parsed = JSON.parse(raw) as Store
    return { generatedAt: parsed.generatedAt || 0, seenIds: parsed.seenIds || [], alerts: parsed.alerts || [] }
  } catch { return { generatedAt: 0, seenIds: [], alerts: [] } }
}
function save(store: Store) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); bus.emit(store) } catch { /* quota */ }
}

export function getAlertsStore(): Store { return load() }

export function markAllSeen() {
  const store = load()
  store.seenIds = store.alerts.map(a => a.id)
  save(store)
}

export function dismissAlert(id: string) {
  const store = load()
  store.alerts = store.alerts.filter(a => a.id !== id)
  store.seenIds = store.seenIds.filter(s => s !== id)
  save(store)
}

// Ask Claude to generate today's alerts.
export async function generateAlerts(force = false): Promise<void> {
  const store = load()
  if (!force && store.generatedAt && Date.now() - store.generatedAt < REFRESH_MS) return

  try {
    const [projects, active] = await Promise.all([
      api.projects.list(),
      api.hubspot.getActive().catch(() => [] as HubSpotActiveDeal[]),
    ])
    if (projects.length === 0) {
      save({ generatedAt: Date.now(), seenIds: store.seenIds, alerts: [] })
      return
    }
    const dealMap = new Map(active.map(a => [a.projectId, a.deal]))
    const now = Date.now()
    const fleetSummary = summarizeFleet(projects, dealMap, now)
    const system = `You are DXD Fleet Sentry. Given the FLEET STATE below, return between 0 and 6 operator-facing alerts as JSON.

Focus on what matters TODAY: HubSpot deals idle for weeks, FAA waivers aging past thresholds (30, 60, 90 days), steady-state candidates whose HubSpot has closed-won, or high-value deals with no site address / no client.

Respond with ONLY a JSON array (no prose, no markdown fence). Each element is an object:
{
  "id":         "string, kebab-case, unique per alert",
  "tone":       "urgent" | "warn" | "info" | "good",
  "title":      "short imperative headline, <60 chars",
  "body":      "one sentence, plain text, <200 chars",
  "projectName": "exact name from FLEET STATE, or omit if fleet-wide"
}

Never invent deals or amounts. Only reference names that appear in FLEET STATE.
Do not include markdown or backticks. Return the JSON array directly.

FLEET STATE:
${fleetSummary}`

    const resp = await api.claude({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      temperature: 0.3,
      system,
      messages: [{ role: 'user', content: 'Generate today\'s alerts.' }],
    }) as { content?: Array<{ type: string; text?: string }> }
    const text = (resp.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('\n').trim()

    // Strip any markdown fences the model wraps around JSON despite instructions.
    let jsonText = text
    const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) jsonText = fence[1].trim()
    // Model sometimes prepends a preamble line — grab from the first '['.
    const bracket = jsonText.indexOf('[')
    if (bracket > 0) jsonText = jsonText.slice(bracket)

    let parsed: unknown = null
    try { parsed = JSON.parse(jsonText) } catch { /* handled below */ }
    if (!Array.isArray(parsed)) throw new Error('Model did not return an array')

    const nameToId = new Map(projects.map(p => [p.name, p.id]))
    const alerts: Alert[] = (parsed as Array<Record<string, unknown>>)
      .map((raw, i) => {
        const projName = typeof raw.projectName === 'string' ? raw.projectName : undefined
        return {
          id:          typeof raw.id === 'string' ? raw.id : `a-${Date.now()}-${i}`,
          tone:        (['urgent','warn','info','good'].includes(String(raw.tone)) ? raw.tone : 'info') as AlertTone,
          title:       String(raw.title || '').slice(0, 100),
          body:        String(raw.body  || '').slice(0, 260),
          projectId:   projName ? nameToId.get(projName) : undefined,
          projectName: projName,
        }
      })
      .filter(a => a.title.length > 0)

    save({ generatedAt: Date.now(), seenIds: store.seenIds, alerts })
  } catch (e) {
    // Don't clobber existing alerts on a bad refresh — just record the
    // timestamp so we don't retry every minute.
    save({ generatedAt: Date.now(), seenIds: store.seenIds, alerts: store.alerts })
    // eslint-disable-next-line no-console
    console.warn('generateAlerts failed:', e)
  }
}

interface DealLike { properties: { dealstage?: string; amount?: string; hs_lastmodifieddate?: string } }
function summarizeFleet(projects: ProjectSummary[], dealMap: Map<string, DealLike>, now: number): string {
  const lines: string[] = [`Total: ${projects.length}. Date: ${new Date(now).toISOString().slice(0, 10)}.`]
  for (const p of projects) {
    const hs = dealMap.get(p.id)
    const parts: string[] = [p.name]
    if (p.client)                       parts.push(`client=${p.client}`)
    if (p.site)                         parts.push(`site=${p.site}`); else parts.push('site=MISSING')
    if (p.steadyState)                  parts.push('steady')
    if (p.faaAuthorizationRequired) {
      const startMs = p.faaAuthStartedAt ? new Date(p.faaAuthStartedAt).getTime() : new Date(p.createdAt).getTime()
      const days = Math.max(0, Math.round((now - startMs) / 86_400_000))
      parts.push(`faa-day-${days}`)
    }
    if (hs?.properties?.dealstage) parts.push(`stage=${hs.properties.dealstage}`)
    if (hs?.properties?.amount) parts.push(`amount=${hs.properties.amount}`)
    if (hs?.properties?.hs_lastmodifieddate) {
      const mod = new Date(hs.properties.hs_lastmodifieddate).getTime()
      const idle = Math.max(0, Math.round((now - mod) / 86_400_000))
      parts.push(`hs-idle-${idle}d`)
    }
    lines.push('- ' + parts.join(' · '))
  }
  return lines.join('\n')
}

export function useAlerts(): Store {
  const [store, setStore] = useState<Store>(() => (typeof window === 'undefined' ? { generatedAt: 0, seenIds: [], alerts: [] } : load()))
  useEffect(() => {
    setStore(load())
    return bus.subscribe(setStore)
  }, [])
  return store
}
