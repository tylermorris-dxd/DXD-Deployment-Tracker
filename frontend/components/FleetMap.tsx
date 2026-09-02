'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ProjectSummary, HubSpotActiveDeal } from '@/lib/types'
import { geocodeAddress } from '@/lib/geocode'
import { useIsMobile } from '@/lib/useIsMobile'

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
// Fleet-scale geocoding hammers Census / ArcGIS / Nominatim, so we memoize
// every result by address into localStorage. Results survive reloads and
// only re-resolve when the address text changes.
const CACHE_KEY = 'dxd-fleet-geocode-v1'
type Cached = Record<string, { lat: number; lng: number } | null>

function loadCache(): Cached {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}
function saveCache(c: Cached) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch { /* quota — ignore */ }
}

// ── Markers ─────────────────────────────────────────────────────────────────
// A pin state — how each project's dot is colored on the map. Order matters:
// the first true wins. Steady state deals get their own color even when FAA
// is on, so ongoing-ops sites don't blend into the "in progress" pool.
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
}

// ── Props ───────────────────────────────────────────────────────────────────
export interface FleetMapProps {
  onOpenDeal: (projectId: string) => void
  height?: number | string
  compact?: boolean // dashboard mode — hides the legend and status footer
}

export default function FleetMap({ onOpenDeal, height = 'calc(100vh - 120px)', compact = false }: FleetMapProps) {
  const isMobile = useIsMobile()
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [pins, setPins] = useState<Pin[]>([])
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState(0)

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
      preferCanvas: true,
      zoomControl: !compact,
      attributionControl: false,
    })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
  }, [ready, compact])

  // Geocode every project with a site — cached in localStorage so we don't
  // re-hit the geocoders on every mount / navigation.
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
      built.push({ project: p, lat: latLng.lat, lng: latLng.lng, color, label, dealName })
      setPins(built.slice())
    }

    // Run geocodes with a small concurrency window so we don't hammer
    // the geocoders. 4 at a time is friendly to Census/ArcGIS/Nominatim.
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

  // Re-render markers whenever the pin set changes.
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L
    layerRef.current.clearLayers()
    if (pins.length === 0) return

    for (const pin of pins) {
      const iconHtml = `
        <div style="
          position:relative;width:22px;height:22px;
        ">
          <div style="
            position:absolute;inset:2px;border-radius:50%;
            background:${pin.color};
            box-shadow:0 0 0 3px ${pin.color}33, 0 0 10px ${pin.color}66;
            border:2px solid #0a0b0d;
          "></div>
          <div style="
            position:absolute;inset:-4px;border-radius:50%;
            background:${pin.color}22; animation:pulse 2s ease-in-out infinite;
            pointer-events:none;
          "></div>
        </div>`
      const icon = L.divIcon({
        html: iconHtml,
        className: 'dxd-fleet-marker',
        iconSize: [22, 22], iconAnchor: [11, 11],
      })
      const m = L.marker([pin.lat, pin.lng], { icon }).addTo(layerRef.current)
      const client = pin.project.client ? pin.project.client : ''
      m.bindTooltip(
        `<div style="font-family:'Chakra Petch',sans-serif;font-weight:700;color:#fff;font-size:12px">${escapeHtml(pin.dealName)}</div>` +
        (client ? `<div style="font-family:'IBM Plex Mono',monospace;color:#9aa3b8;font-size:10px;margin-top:2px">${escapeHtml(client)}</div>` : '') +
        `<div style="font-family:'IBM Plex Mono',monospace;color:${pin.color};font-size:9px;letter-spacing:1;margin-top:3px;text-transform:uppercase">${pin.label}</div>`,
        { direction: 'top', offset: [0, -8], className: 'dxd-fleet-tip' },
      )
      m.on('click', () => onOpenDeal(pin.project.id))
    }

    // Auto-fit bounds so all pins are visible with padding.
    const bounds = pins.map(p => [p.lat, p.lng]) as [number, number][]
    try { mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 12 }) } catch { /* single-pin edge cases */ }
  }, [pins, onOpenDeal])

  // Counts by bucket for the overlay legend.
  const counts = useMemo(() => {
    const c = { active: 0, faa: 0, steady: 0 }
    for (const p of projects) {
      if (p.steadyState) c.steady++
      else if (p.faaAuthorizationRequired) c.faa++
      else c.active++
    }
    return c
  }, [projects])

  return (
    <div style={{ position: 'relative', height, background: '#0a0b0d', border: '1px solid #252b38', borderRadius: 10, overflow: 'hidden' }}>
      <style>{`
        @keyframes pulse {
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

      {/* Legend — moved to bottom-left on mobile so it doesn't cover the
          zoom controls or crowd the map on small screens. */}
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
        </div>
      )}

      {/* Status footer (loading indicator) */}
      {!compact && pending > 0 && (
        <div style={{
          position: 'absolute', bottom: 14, right: 14, zIndex: 500,
          background: 'rgba(10,11,13,0.85)', border: '1px solid #252b38', borderRadius: 8,
          padding: '8px 12px', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#e8eaf0',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3FB95A', animation: 'pulse 1s ease-in-out infinite' }} />
          Geocoding {pending} site{pending === 1 ? '' : 's'}…
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

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}88` }} />
      <span>{label}</span>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
