'use client'

import type { SiteCoord } from './siteCoords'

// NWS severe-weather alerts (CAP feed via api.weather.gov).
//
// This is the real watch/warning product — tornado warnings, severe
// thunderstorm watches, high wind, winter storm — not a forecast. A forecast
// says it might be windy; an alert is the National Weather Service telling you
// not to fly. The API is CORS-enabled and needs no key, so it is called
// straight from the browser.
//
// NWS asks for an identifying User-Agent. Browsers forbid setting that header,
// so identification rides along in the URL, which the NWS docs accept.

const NWS_BASE = 'https://api.weather.gov/alerts/active'
const CONTACT = 'tyler.morris@deusxdefense.com'

export type AlertSeverity = 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown'

export interface WeatherAlert {
  id: string
  event: string            // "Severe Thunderstorm Warning"
  headline: string | null
  severity: AlertSeverity
  urgency: string
  certainty: string
  onset: string | null     // ISO
  ends: string | null      // ISO
  areaDesc: string
  senderName: string
}

// Severity drives colour and sort order everywhere alerts are shown.
export const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  Extreme: '#D2232A',
  Severe: '#FF6B00',
  Moderate: '#FFB300',
  Minor: '#3b82f6',
  Unknown: '#9aa3b8',
}

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4,
}

export function worstSeverity(alerts: WeatherAlert[]): AlertSeverity | null {
  if (!alerts.length) return null
  return alerts.reduce<AlertSeverity>(
    (worst, a) => (SEVERITY_RANK[a.severity] < SEVERITY_RANK[worst] ? a.severity : worst),
    'Unknown',
  )
}

const KNOWN_SEVERITIES: readonly string[] = ['Extreme', 'Severe', 'Moderate', 'Minor']

function normalizeSeverity(v: unknown): AlertSeverity {
  const s = String(v ?? '')
  return KNOWN_SEVERITIES.includes(s) ? (s as AlertSeverity) : 'Unknown'
}

export async function fetchAlertsForPoint(c: SiteCoord): Promise<WeatherAlert[]> {
  const url = `${NWS_BASE}?point=${c.lat.toFixed(4)},${c.lng.toFixed(4)}&email=${encodeURIComponent(CONTACT)}`
  const res = await fetch(url, { headers: { Accept: 'application/geo+json' } })
  if (!res.ok) throw new Error(`NWS ${res.status}`)
  const data = await res.json() as { features?: Array<{ id?: string; properties?: Record<string, unknown> }> }

  const out: WeatherAlert[] = []
  for (const f of data.features || []) {
    const p = f.properties || {}
    out.push({
      id: String(f.id ?? p.id ?? Math.random()),
      event: String(p.event ?? 'Weather Alert'),
      headline: p.headline ? String(p.headline) : null,
      severity: normalizeSeverity(p.severity),
      urgency: String(p.urgency ?? 'Unknown'),
      certainty: String(p.certainty ?? 'Unknown'),
      onset: p.onset ? String(p.onset) : (p.effective ? String(p.effective) : null),
      ends: p.ends ? String(p.ends) : (p.expires ? String(p.expires) : null),
      areaDesc: String(p.areaDesc ?? ''),
      senderName: String(p.senderName ?? 'NWS'),
    })
  }
  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

// Fetch alerts for many sites, keyed by the same site string used as the
// coordinate cache key. Failures are swallowed per-site: one bad point
// shouldn't blank the whole board.
export async function fetchAlertsForSites(
  coords: Record<string, SiteCoord>,
): Promise<Record<string, WeatherAlert[]>> {
  const keys = Object.keys(coords)
  if (!keys.length) return {}
  const out: Record<string, WeatherAlert[]> = {}
  const queue = keys.slice()

  const worker = async () => {
    while (queue.length) {
      const k = queue.shift()!
      try {
        const alerts = await fetchAlertsForPoint(coords[k])
        if (alerts.length) out[k] = alerts
      } catch { /* leave this site with no alerts */ }
    }
  }
  await Promise.all(new Array(Math.min(5, queue.length)).fill(0).map(worker))
  return out
}
