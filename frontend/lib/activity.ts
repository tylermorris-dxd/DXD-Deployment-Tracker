'use client'

import { useEffect, useState } from 'react'
import { makePubSub } from './pubsub'

// Local activity stream. Every state-changing action in the app calls
// logActivity() so operators get a "what just happened" feed on the
// dashboard. Persisted to localStorage so it survives reloads; capped
// at MAX_ENTRIES so the log can't grow unbounded.

const STORAGE_KEY = 'dxd-activity-log-v1'
const MAX_ENTRIES = 40

export type ActivityKind =
  | 'steady-on'   | 'steady-off'
  | 'faa-on'     | 'faa-off'
  | 'deal-created' | 'deal-deleted'
  | 'signoff-saved'
  | 'hubspot-synced'
  | 'custom'

export interface ActivityEntry {
  id: string
  ts: number           // epoch ms
  kind: ActivityKind
  subject: string      // e.g. deal name or "system"
  detail?: string      // free text
  projectId?: string   // for click-to-open
}

const bus = makePubSub<ActivityEntry[]>()

function loadLog(): ActivityEntry[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveLog(log: ActivityEntry[]) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(log)) } catch { /* quota — ignore */ }
}

export function logActivity(entry: Omit<ActivityEntry, 'id' | 'ts'>): void {
  const log = loadLog()
  const next: ActivityEntry[] = [
    { ...entry, id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now() },
    ...log,
  ].slice(0, MAX_ENTRIES)
  saveLog(next)
  bus.emit(next)
}

export function clearActivity(): void {
  saveLog([])
  bus.emit([])
}

export function useRecentActivity(limit = 20): ActivityEntry[] {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  useEffect(() => {
    setEntries(loadLog())
    return bus.subscribe(setEntries)
  }, [])
  return entries.slice(0, limit)
}

// Human-friendly line — used by the activity widget on the dashboard.
export function activityLabel(e: ActivityEntry): string {
  switch (e.kind) {
    case 'steady-on':      return `Marked ${e.subject} steady state`
    case 'steady-off':     return `Returned ${e.subject} to active deployment`
    case 'faa-on':         return `Started FAA tracking on ${e.subject}`
    case 'faa-off':        return `Stopped FAA tracking on ${e.subject}`
    case 'deal-created':   return `Created ${e.subject}`
    case 'deal-deleted':   return `Deleted ${e.subject}`
    case 'signoff-saved':  return `Saved signoff for ${e.subject}`
    case 'hubspot-synced': return `HubSpot synced ${e.subject}`
    case 'custom':         return e.detail ?? e.subject
  }
}

export function activityColor(kind: ActivityKind): string {
  switch (kind) {
    case 'steady-on':      return '#3FB95A'
    case 'faa-on':         return '#3b82f6'
    case 'signoff-saved':  return '#a855f7'
    case 'hubspot-synced': return '#FF9800'
    case 'deal-created':   return '#3FB95A'
    case 'deal-deleted':   return '#D2232A'
    case 'steady-off':
    case 'faa-off':        return '#9aa3b8'
    case 'custom':         return '#9aa3b8'
  }
}

// Short relative-time string. "just now" / "12m ago" / "3h ago" / "Sep 1".
export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 45)            return 'just now'
  if (s < 60 * 60)       return `${Math.round(s / 60)}m ago`
  if (s < 60 * 60 * 24)  return `${Math.round(s / 3600)}h ago`
  if (s < 60 * 60 * 24 * 7) return `${Math.round(s / 86400)}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
