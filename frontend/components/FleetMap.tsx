'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ProjectSummary, HubSpotActiveDeal } from '@/lib/types'
import { geocodeAddress } from '@/lib/geocode'
import { useIsMobile } from '@/lib/useIsMobile'
import { useSettings } from '@/lib/settings'

// ── Leaflet loader (same CDN pin as SiteMapper) ─────────────────────────────
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'

function injectLeaflet(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && (window as typeof window & { L?: unknown }).L) { resolve(); return }
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const lk = document.createElement('link')
      lk.rel = 'stylesheet'; lk.href = LEAFLET_CSS
      document.head.appendChild(lk)
    }
    let sc = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null
    if (!sc) { sc = document.createElement('script'); sc.src = LEAFLET_JS; document.head.appendChild(sc) }
    if ((window as typeof window & { L?: unknown }).L) resolve()
    else sc.addEventListener('load', () => resolve(), { once: true })
  })
}

// ── Geocode cache (localStorage) ─────────────────────────────────────────────
const CACHE_KEY = 'dxd-fleet-geocode-v1'
type Cached = Record<string, { lat: number; lng: number } | null>

function loadCache(): Cached {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}
function saveCache(c: Cached) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch { /* quota */ }
}

// Custom SVG cursor — a red crosshair. Encoded as a data URI so no
// external asset is needed. Renders at the actual browser cursor size.
const CROSSHAIR_CURSOR = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>
     <circle cx='12' cy='12' r='9' stroke='%23D2232A' stroke-width='1.4' fill='none'/>
     <circle cx='12' cy='12' r='1.6' fill='%23D2232A'/>
     <line x1='12' y1='1' x2='12' y2='7' stroke='%23D2232A' stroke-width='1.4' stroke-linecap='round'/>
     <line x1='12' y1='17' x2='12' y2='23' stroke='%23D2232A' stroke-width='1.4' stroke-linecap='round'/>
     <line x1='1' y1='12' x2='7' y2='12' stroke='%23D2232A' stroke-width='1.4' stroke-linecap='round'/>
     <line x1='17' y1='12' x2='23' y2='12' stroke='%23D2232A' stroke-width='1.4' stroke-linecap='round'/>
   </svg>`,
)}") 12 12, crosshair`

// ── Pin state → color ────────────────────────────────────────────────────────
function projectColor(p: ProjectSummary): { color: string; label: string } {
  if (p.steadyState)                  return { color: '#3FB95A', label: 'Steady state' }
  if (p.faaAuthorizationRequired)     return { color: '#f59e0b', label: 'FAA pending' }
  return                                     { color: '#D2232A', label: 'Active' }
}

interface Pin {
  project: ProjectSummary
  lat: number
  lng: number
  color: string
  label: string
  dealName: string
  createdAt: number  // epoch ms — used by the time scrubber
}

interface WeatherPoint { windMph: number; tempF: number }

// ── Weather overlay: parallel Open-Meteo calls, one per pin ────────────────
// Open-Meteo supports batching via comma-separated coordinates, but the
// response shape flips between object (single) and array (multi) and hits a
// URL-length limit once you pass ~30 coordinates. Simpler + more reliable:
// fire one small request per pin with a low concurrency window.
async function fetchFleetWeather(pins: Pin[]): Promise<Record<string, WeatherPoint>> {
  if (pins.length === 0) return {}
  const out: Record<string, WeatherPoint> = {}
  const queue = pins.slice()
  const runOne = async (p: Pin) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(4)}&longitude=${p.lng.toFixed(4)}` +
                `&current=wind_speed_10m,temperature_2m&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=UTC`
    try {
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.json()
      const c = data?.current
      if (typeof c?.wind_speed_10m === 'number' && typeof c?.temperature_2m === 'number') {
        out[p.project.id] = { windMph: c.wind_speed_10m, tempF: c.temperature_2m }
      }
    } catch { /* swallow — a missing point just won't get a weather ring */ }
  }
  // 6 in-flight max — plenty fast for a fleet under 40 pins without hammering.
  const workers = new Array(Math.min(6, queue.length)).fill(0).map(async () => {
    while (queue.length) { const p = queue.shift()!; await runOne(p) }
  })
  await Promise.all(workers)
  return out
}

// ── Props ───────────────────────────────────────────────────────────────────
export interface FleetMapProps {
  onOpenDeal: (projectId: string) => void
  height?: number | string
  compact?: boolean // dashboard mode — hides the legend and status footer
}

export default function FleetMap({ onOpenDeal, height = 'calc(var(--dxd-vh, 100vh) - 120px)', compact = false }: FleetMapProps) {
  const isMobile = useIsMobile()
  const settings = useSettings()
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pinLayerRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const airspaceLayerRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const weatherLayerRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [pins, setPins] = useState<Pin[]>([])
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState(0)

  // ── Overlay toggles ────────────────────────────────────────────────────
  const [showAirspace, setShowAirspace] = useState(false)
  const [showWeather,  setShowWeather]  = useState(false)
  const [weather, setWeather] = useState<Record<string, WeatherPoint>>({})
  const [weatherLoading, setWeatherLoading] = useState(false)


  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects.list(),
    staleTime: 30_000,
  })
  const { data: activeDeals = [] } = useQuery({
    queryKey: ['hs-active'],
    queryFn: () => api.hubspot.getActive(),
    staleTime: 60_000,
    retry: false,
  })
  const dealMap = useMemo(
    () => new Map<string, HubSpotActiveDeal>(activeDeals.map(a => [a.projectId, a])),
    [activeDeals],
  )

  // Load Leaflet + build the map once.
  useEffect(() => { injectLeaflet().then(() => setReady(true)) }, [])
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L
    const map = L.map(containerRef.current, {
      center: [39.5, -98.35], zoom: 4,
      // SVG renderer (Leaflet default without preferCanvas). Vector overlays
      // like L.circle render more reliably here than on canvas at zoom
      // extremes, and we're only drawing a few dozen shapes.
      zoomControl: !compact,
      attributionControl: false,
    })
    // OpenStreetMap tiles (no key, no rate-limit surprise) darkened via CSS
    // filter on the tile pane. Carto's dark_all endpoint started returning
    // "API key required" tiles when the free tier is exceeded — this dodges
    // that entirely.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map)
    const tilePane = map.getPane('tilePane') as HTMLElement | null
    if (tilePane) tilePane.style.filter = 'invert(0.94) hue-rotate(180deg) brightness(0.95) saturate(0.6)'
    // Explicit SVG renderer for overlays so circles always paint.
    const svgRenderer = L.svg()
    airspaceLayerRef.current = L.layerGroup().addTo(map)
    weatherLayerRef.current  = L.layerGroup().addTo(map)
    pinLayerRef.current      = L.layerGroup().addTo(map)
    // Attach renderer to the map so L.circle picks it up automatically.
    svgRenderer.addTo(map)
    mapRef.current = map
  }, [ready, compact])

  // Geocode every project with a site — cached in localStorage.
  useEffect(() => {
    if (!projects.length) { setPins([]); return }
    let cancelled = false
    const cache = loadCache()
    const withSite = projects.filter(p => (p.site || '').trim().length > 0)
    setPending(withSite.length)
    setFailed(0)
    const built: Pin[] = []
    let failures = 0

    const runOne = async (p: ProjectSummary) => {
      const key = (p.site || '').trim()
      let latLng: { lat: number; lng: number } | null = key in cache ? cache[key] : null
      if (!(key in cache)) {
        const r = await geocodeAddress(key)
        latLng = r ? { lat: r.lat, lng: r.lng } : null
        cache[key] = latLng
        saveCache(cache)
      }
      if (cancelled) return
      if (!latLng) { failures++; setFailed(failures); return }
      const { color, label } = projectColor(p)
      const dealName = dealMap.get(p.id)?.deal.properties.dealname ?? p.name
      built.push({
        project: p, lat: latLng.lat, lng: latLng.lng, color, label, dealName,
        createdAt: new Date(p.createdAt).getTime() || Date.now(),
      })
      setPins(built.slice())
    }

    ;(async () => {
      const queue = withSite.slice()
      const workers = new Array(Math.min(4, queue.length)).fill(0).map(async () => {
        while (queue.length && !cancelled) {
          const p = queue.shift()!
          try { await runOne(p) } catch { failures++; setFailed(failures) }
          setPending(queue.length)
        }
      })
      await Promise.all(workers)
      setPending(0)
    })()

    return () => { cancelled = true }
  }, [projects, dealMap])

  // The scrubber was removed — always show every pin (current ops only).
  const visiblePins = pins

  // Render pins whenever the visible set changes.
  useEffect(() => {
    if (!mapRef.current || !pinLayerRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L
    pinLayerRef.current.clearLayers()
    if (visiblePins.length === 0) return

    for (const pin of visiblePins) {
      const iconHtml = `
        <div style="position:relative;width:22px;height:22px">
          <div style="
            position:absolute;inset:2px;border-radius:50%;
            background:${pin.color};
            box-shadow:0 0 0 3px ${pin.color}33, 0 0 10px ${pin.color}66;
            border:2px solid #0a0b0d;
          "></div>
          <div style="
            position:absolute;inset:-4px;border-radius:50%;
            background:${pin.color}22; animation:dxd-pulse 2s ease-in-out infinite;
            pointer-events:none;
          "></div>
        </div>`
      const icon = L.divIcon({ html: iconHtml, className: 'dxd-fleet-marker', iconSize: [22, 22], iconAnchor: [11, 11] })
      const m = L.marker([pin.lat, pin.lng], { icon }).addTo(pinLayerRef.current)
      const client = pin.project.client || ''
      const w = weather[pin.project.id]
      const wLine = showWeather && w
        ? `<div style="font-family:'IBM Plex Mono',monospace;color:#3b82f6;font-size:9px;margin-top:3px">Wind ${w.windMph.toFixed(0)} mph · ${w.tempF.toFixed(0)}°F</div>`
        : ''
      m.bindTooltip(
        `<div style="font-family:'Chakra Petch',sans-serif;font-weight:700;color:#fff;font-size:12px">${escapeHtml(pin.dealName)}</div>` +
        (client ? `<div style="font-family:'IBM Plex Mono',monospace;color:#9aa3b8;font-size:10px;margin-top:2px">${escapeHtml(client)}</div>` : '') +
        `<div style="font-family:'IBM Plex Mono',monospace;color:${pin.color};font-size:9px;letter-spacing:1;margin-top:3px;text-transform:uppercase">${pin.label}</div>` +
        wLine,
        { direction: 'top', offset: [0, -8], className: 'dxd-fleet-tip' },
      )
      m.on('click', () => onOpenDeal(pin.project.id))
    }

    if (visiblePins.length > 0) {
      const bounds = visiblePins.map(p => [p.lat, p.lng]) as [number, number][]
      try { mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 12 }) } catch { /* single-pin edge case */ }
    }
  }, [visiblePins, onOpenDeal, showWeather, weather])

  // Render airspace ops-area rings.
  useEffect(() => {
    if (!mapRef.current || !airspaceLayerRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L
    airspaceLayerRef.current.clearLayers()
    if (!showAirspace) return
    // 5-mile ops-area heuristic — real FAA airspace would need a proper
    // feed. This gives a visual sense of scope per deployment.
    const FIVE_MILES_M = 5 * 1609.344
    for (const pin of visiblePins) {
      L.circle([pin.lat, pin.lng], {
        radius: FIVE_MILES_M,
        color: pin.color, weight: 1, opacity: 0.35,
        fillColor: pin.color, fillOpacity: 0.05,
        interactive: false,
      }).addTo(airspaceLayerRef.current)
    }
  }, [showAirspace, visiblePins])

  // Weather overlay: fetch when toggled on, or when pins list changes.
  useEffect(() => {
    if (!showWeather) { setWeather({}); return }
    if (visiblePins.length === 0) return
    let cancelled = false
    setWeatherLoading(true)
    fetchFleetWeather(visiblePins)
      .then(w => { if (!cancelled) setWeather(w) })
      .catch(() => { /* silent — tooltip just won't show weather */ })
      .finally(() => { if (!cancelled) setWeatherLoading(false) })
    return () => { cancelled = true }
    // Only refetch when the toggle flips or the set of pin ids changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWeather, visiblePins.map(p => p.project.id).join(',')])

  // Render weather rings — colored + sized by wind speed.
  useEffect(() => {
    if (!mapRef.current || !weatherLayerRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L
    weatherLayerRef.current.clearLayers()
    if (!showWeather) return
    for (const pin of visiblePins) {
      const w = weather[pin.project.id]
      if (!w) continue
      // Ring size scales with wind speed. 0mph → 200m, 40mph → 3km.
      const radiusM = 200 + Math.min(40, w.windMph) * 70
      const color = w.windMph > 30 ? '#D2232A' : w.windMph > 20 ? '#f59e0b' : w.windMph > 12 ? '#3b82f6' : '#3FB95A'
      L.circle([pin.lat, pin.lng], {
        radius: radiusM,
        color, weight: 1.4, opacity: 0.6,
        fillColor: color, fillOpacity: 0.08,
        interactive: false,
      }).addTo(weatherLayerRef.current)
    }
  }, [showWeather, weather, visiblePins])

  // Counts by bucket for the overlay legend.
  const counts = useMemo(() => {
    const c = { active: 0, faa: 0, steady: 0 }
    for (const p of visiblePins) {
      if (p.project.steadyState) c.steady++
      else if (p.project.faaAuthorizationRequired) c.faa++
      else c.active++
    }
    return c
  }, [visiblePins])

  return (
    <div style={{
      position: 'relative', height, background: '#0a0b0d',
      border: '1px solid #252b38', borderRadius: 10, overflow: 'hidden',
      cursor: settings.crosshair ? CROSSHAIR_CURSOR : 'auto',
    }}>
      <style>{`
        @keyframes dxd-pulse {
          0%   { transform: scale(1);   opacity: 0.6 }
          50%  { transform: scale(1.6); opacity: 0   }
          100% { transform: scale(1);   opacity: 0.6 }
        }
        .dxd-fleet-tip {
          background: rgba(17,19,24,0.96) !important;
          border: 1px solid #2a3040 !important;
          color: #e8eaf0 !important;
          box-shadow: 0 6px 20px rgba(0,0,0,0.5) !important;
          padding: 8px 10px !important;
        }
        .dxd-fleet-tip::before { display: none !important; }
        .leaflet-container { background: #0a0b0d !important }
      `}</style>

      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Overlay toggle bar — Weather + Airspace */}
      {!compact && (
        <div style={{
          position: 'absolute', top: 14, right: 14, zIndex: 500,
          display: 'flex', gap: 6, background: 'rgba(10,11,13,0.85)',
          border: '1px solid #252b38', borderRadius: 8, padding: 4,
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        }}>
          <OverlayToggle
            active={showWeather} onClick={() => setShowWeather(v => !v)}
            label="Weather" loading={weatherLoading} color="#3b82f6"
          />
          <OverlayToggle
            active={showAirspace} onClick={() => setShowAirspace(v => !v)}
            label="Ops area" color="#f59e0b"
          />
        </div>
      )}

      {/* Legend */}
      {!compact && (
        <div style={{
          position: 'absolute',
          top: isMobile ? 'auto' : 14, bottom: isMobile ? 14 : 'auto', left: 14,
          zIndex: 500,
          background: 'rgba(10,11,13,0.85)', border: '1px solid #252b38', borderRadius: 8,
          padding: isMobile ? '8px 12px' : '10px 14px', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#9aa3b8',
          maxWidth: isMobile ? 200 : 'none',
        }}>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 11, color: '#e8eaf0', letterSpacing: 1.5, marginBottom: 8 }}>FLEET STATUS</div>
          <LegendRow color="#D2232A" label={`Active (${counts.active})`} />
          <LegendRow color="#f59e0b" label={`FAA pending (${counts.faa})`} />
          <LegendRow color="#3FB95A" label={`Steady state (${counts.steady})`} />
          {failed > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #252b38', fontSize: 9, color: '#f59e0b' }}>
              {failed} site{failed === 1 ? '' : 's'} couldn't be geocoded
            </div>
          )}
          {showWeather && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #252b38' }}>
              <div style={{ fontSize: 8, color: '#5a6380', letterSpacing: 1, marginBottom: 4 }}>WIND</div>
              <LegendRow color="#3FB95A" label="Calm (<12)" />
              <LegendRow color="#3b82f6" label="Breezy (12-20)" />
              <LegendRow color="#f59e0b" label="Windy (20-30)" />
              <LegendRow color="#D2232A" label="Rough (>30)" />
            </div>
          )}
        </div>
      )}

      {/* Status footer */}
      {!compact && pending > 0 && (
        <div style={{
          position: 'absolute', bottom: 14, right: 14, zIndex: 500,
          background: 'rgba(10,11,13,0.85)', border: '1px solid #252b38', borderRadius: 8,
          padding: '8px 12px', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#e8eaf0',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3FB95A', animation: 'dxd-pulse 1s ease-in-out infinite' }} />
          Acquiring {pending} target{pending === 1 ? '' : 's'}…
        </div>
      )}

      {/* Empty state */}
      {projects.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', zIndex: 500,
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#5a6380',
        }}>
          No deals to plot. Create a deal with a site address to see it here.
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}88` }} />
      <span>{label}</span>
    </div>
  )
}

function OverlayToggle({ active, onClick, label, color, loading }: {
  active: boolean; onClick: () => void; label: string; color: string; loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', border: '1px solid',
        borderColor: active ? color : 'transparent',
        background: active ? `${color}22` : 'transparent',
        color: active ? color : '#9aa3b8',
        borderRadius: 5, cursor: 'pointer',
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 0.6,
        textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const,
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: active ? color : 'rgba(255,255,255,0.15)',
        boxShadow: active ? `0 0 6px ${color}88` : 'none',
        animation: loading ? 'dxd-pulse 1s ease-in-out infinite' : 'none',
      }} />
      {label}
    </button>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
