'use client'

import { geocodeAddress } from './geocode'

// Shared site-coordinate resolver. Deliberately reads and writes the same
// localStorage key the fleet map already uses, so a site geocoded on the map
// is instantly available to the timeline (and vice versa) instead of every
// screen paying for its own round of geocoding.

const CACHE_KEY = 'dxd-fleet-geocode-v1'

export interface SiteCoord { lat: number; lng: number }

type Cache = Record<string, SiteCoord | null>

function load(): Cache {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}

function save(c: Cache): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch { /* quota */ }
}

// Cached lookup only — no network. Use when you want coordinates if they're
// already known but don't want to pay for a geocode.
export function cachedCoord(site: string): SiteCoord | null {
  const key = (site || '').trim()
  if (!key) return null
  return load()[key] ?? null
}

// Resolve many sites at once, geocoding only the misses. A null entry in the
// cache is a remembered failure and is not retried — a bad address won't
// re-geocode on every page load.
export async function resolveSites(sites: string[]): Promise<Record<string, SiteCoord>> {
  const cache = load()
  const out: Record<string, SiteCoord> = {}
  const misses: string[] = []

  for (const raw of sites) {
    const key = (raw || '').trim()
    if (!key) continue
    if (key in cache) {
      if (cache[key]) out[key] = cache[key]!
    } else if (!misses.includes(key)) {
      misses.push(key)
    }
  }
  if (misses.length === 0) return out

  // Small concurrency window — geocoders rate-limit, and this runs in the
  // background behind an already-rendered UI.
  const queue = misses.slice()
  const worker = async () => {
    while (queue.length) {
      const key = queue.shift()!
      try {
        const r = await geocodeAddress(key)
        if (r) { cache[key] = { lat: r.lat, lng: r.lng }; out[key] = cache[key]! }
        else cache[key] = null
      } catch {
        cache[key] = null
      }
    }
  }
  await Promise.all(new Array(Math.min(4, queue.length)).fill(0).map(worker))
  save(cache)
  return out
}
