'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { ProjectFull } from '@/lib/types'
import { geocodeAddressOrThrow, reverseGeocode } from '@/lib/geocode'

// ── Types ─────────────────────────────────────────────────────────────────────

// TFR + clear-to-fly panel — sits at the top of the results.
import TfrPanel from './TfrPanel'

interface Props {
  project: ProjectFull
  onCacheUpdate: (data: unknown) => void
}

interface Coords {
  lat: number
  lng: number
  display: string
  source: string
}

interface GeoJSONFeature {
  type: string
  geometry: unknown
  properties: Record<string, unknown>
}

interface GeoJSONData {
  type: string
  features: GeoJSONFeature[]
}

// Result of clicking a point on the map — the "what am I allowed to do
// right here" answer, without having to type an address first.
interface ProbeResult {
  lat: number
  lng: number
  address: string | null
  ceiling: number | null
  airspaceRaw: string
  aptName: string | null
  aptId: string | null
  laanc: boolean
  offsetNm: number | null   // distance from the site pin
  offsetBearing: number | null
  resolved: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FAA_UASFM_URL = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/FAA_UAS_FacilityMap_Data/FeatureServer/0/query'

// Colors match the official FAA UAS Facility Map renderer
// (FeatureServer drawingInfo.uniqueValueInfos, field=CEILING).
// Verified against the FAA web app at
// https://faa.maps.arcgis.com/apps/webappviewer/index.html?id=9c2e4406710048e19806ebf6a06754ad
const CEILING_COLORS: Record<number, { fill: string; label: string; verdict: string }> = {
  0:   { fill: '#B53535', label: '0 ft — NO FLY',  verdict: 'NO-FLY'      },
  50:  { fill: '#BCFCB6', label: '50 ft AGL',      verdict: 'RESTRICTED'  },
  100: { fill: '#E69800', label: '100 ft AGL',     verdict: 'RESTRICTED'  },
  150: { fill: '#FCCFB8', label: '150 ft AGL',     verdict: 'LIMITED'     },
  200: { fill: '#FFFFBE', label: '200 ft AGL',     verdict: 'AUTHORIZED'  },
  250: { fill: '#D4D9A1', label: '250 ft AGL',     verdict: 'AUTHORIZED'  },
  300: { fill: '#A7C7B3', label: '300 ft AGL',     verdict: 'AUTHORIZED'  },
  350: { fill: '#BDD8FC', label: '350 ft AGL',     verdict: 'AUTHORIZED'  },
  400: { fill: '#65A843', label: '400 ft AGL',     verdict: 'FULL ACCESS' },
}
// FAA's default symbol fill for any CEILING value outside the table.
const CEILING_DEFAULT_FILL = '#828282'

const AIRSPACE_INFO: Record<string, { name: string; color: string; desc: string; verdict: string }> = {
  G: { name: 'Class G', color: '#2ecc71', verdict: 'GOOD TO GO',           desc: 'Uncontrolled airspace. No ATC authorization required for Part 107 under 400ft AGL.' },
  E: { name: 'Class E', color: '#9b59b6', verdict: 'AUTHORIZATION REQUIRED', desc: 'Controlled airspace (surface area). LAANC or DroneZone authorization required.' },
  D: { name: 'Class D', color: '#3498db', verdict: 'AUTHORIZATION REQUIRED', desc: 'Controlled airspace around towered airports. LAANC or DroneZone authorization required.' },
  C: { name: 'Class C', color: '#e67e22', verdict: 'AUTHORIZATION REQUIRED', desc: 'Controlled airspace around busy airports. LAANC or DroneZone authorization required.' },
  B: { name: 'Class B', color: '#e74c3c', verdict: 'HIGHLY RESTRICTED',     desc: 'Most restrictive controlled airspace (major airports). LAANC or DroneZone authorization required.' },
}

// ── Nearby airports / heliports (FAA ADHP) ────────────────────────────────────

// Heliports matter as much as airports here: a hospital helipad two miles off
// is the single most common conflict for a DFR program, and it never shows up
// on a facility-map ceiling because it isn't a towered field.
const FAA_ADHP_URL = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/ADHP/FeatureServer/0/query'

interface NearbyAirport {
  ident: string
  name: string
  icao: string
  isHeliport: boolean
  privateUse: boolean
  elevFt: number | null
  lat: number
  lng: number
  distNm: number
  bearing: number
}

const EARTH_RADIUS_NM = 3440.065

function haversineNm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)))
}

function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2))
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1))
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

const COMPASS_16 = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
function compassPoint(deg: number): string {
  return COMPASS_16[Math.round(deg / 22.5) % 16]
}

async function queryNearbyAirports(lat: number, lng: number, radiusNm = 12): Promise<NearbyAirport[]> {
  const degLat = radiusNm / 60
  const degLng = radiusNm / (60 * Math.max(0.15, Math.cos((lat * Math.PI) / 180)))
  const bbox = `${lng - degLng},${lat - degLat},${lng + degLng},${lat + degLat}`
  const params = new URLSearchParams({
    where: '1=1',
    geometry: bbox,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'IDENT_TXT,NAME_TXT,ICAO_TXT,TYPE_CODE,ELEV_VAL,PRIVATEUSE_CODE',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: '300',
  })
  const res = await fetch(`${FAA_ADHP_URL}?${params}`)
  if (!res.ok) throw new Error('FAA airport query failed')
  const data = await res.json() as {
    features?: Array<{ geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> }>
  }

  const out: NearbyAirport[] = []
  for (const f of data.features || []) {
    const c = f.geometry?.coordinates
    if (!c || c.length < 2) continue
    const [alng, alat] = c
    const dist = haversineNm(lat, lng, alat, alng)
    if (dist > radiusNm) continue
    const p = f.properties || {}
    out.push({
      ident: String(p.IDENT_TXT ?? '').trim() || '—',
      name: String(p.NAME_TXT ?? '').trim() || 'Unnamed',
      icao: String(p.ICAO_TXT ?? '').trim(),
      isHeliport: String(p.TYPE_CODE ?? '').trim().toUpperCase() === 'HP',
      privateUse: Number(p.PRIVATEUSE_CODE ?? 0) === 1,
      elevFt: typeof p.ELEV_VAL === 'number' ? p.ELEV_VAL : null,
      lat: alat,
      lng: alng,
      distNm: dist,
      bearing: bearingDeg(lat, lng, alat, alng),
    })
  }
  return out.sort((a, b) => a.distNm - b.distNm)
}

// Single-point facility-map probe — used when a dropped pin lands outside the
// grid currently loaded for the site.
async function queryPointCell(lat: number, lng: number): Promise<GeoJSONFeature | null> {
  const off = 0.004
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${lng - off},${lat - off},${lng + off},${lat + off}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: FAA_OUT_FIELDS,
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: '4',
  })
  const res = await fetch(`${FAA_UASFM_URL}?${params}`)
  if (!res.ok) return null
  const data = await res.json() as GeoJSONData
  return data.features?.[0] ?? null
}

// ── Geocode wrapper — uses shared lib/geocode and adapts to local Coords shape ─

async function geocodeAddress(input: string): Promise<Coords> {
  const r = await geocodeAddressOrThrow(input)
  return { lat: r.lat, lng: r.lng, display: r.displayName, source: r.source }
}

// ── Query FAA ─────────────────────────────────────────────────────────────────

const FAA_OUT_FIELDS = 'CEILING,REGION,AIRS_COUNT,AIRSPACE_1,AIRSPACE_2,AIRSPACE_3,APT1_FAAID,APT1_ICAO,APT1_NAME,APT1_LAANC,APT2_FAAID,APT2_NAME,APT2_LAANC,UNIT'

// Two-stage query so we return the FULL facility-map grid for the
// controlling airport(s) — not just a slice around the site.
//   1. Tiny bounding-box probe at (lat,lng) to identify the controlling
//      airport IDs (APT1..APT5_FAAID) of the cell the site sits in.
//   2. Fetch every cell that lists any of those airport IDs in any of its
//      APT slots — this returns the entire grid block for that facility.
// If the site is in Class G / has no controlling airport at all, we fall
// back to a wide-radius query so the user still sees nearby context.
async function queryFAAGrids(lat: number, lng: number): Promise<GeoJSONData> {
  // Stage 1: identify controlling airport(s) at the site point.
  const probeOffset = 0.005 // ~550m — small enough to hit just the cell the site is in
  const probeBox = `${lng - probeOffset},${lat - probeOffset},${lng + probeOffset},${lat + probeOffset}`
  const probeParams = new URLSearchParams({
    where: '1=1',
    geometry: probeBox,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'APT1_FAAID,APT2_FAAID,APT3_FAAID,APT4_FAAID,APT5_FAAID',
    returnGeometry: 'false',
    f: 'json',
    resultRecordCount: '5',
  })
  const probeRes = await fetch(`${FAA_UASFM_URL}?${probeParams}`)
  if (!probeRes.ok) throw new Error('FAA API query failed')
  const probe = await probeRes.json() as { features?: Array<{ attributes?: Record<string, string | null> }> }

  const aptIds = new Set<string>()
  for (const f of probe.features || []) {
    for (const k of ['APT1_FAAID', 'APT2_FAAID', 'APT3_FAAID', 'APT4_FAAID', 'APT5_FAAID']) {
      const v = f.attributes?.[k]
      if (v && typeof v === 'string' && v.trim()) aptIds.add(v.trim())
    }
  }

  // Stage 2: fetch the full grid for those airports — every cell where any
  // APTn_FAAID matches any of the discovered IDs.
  if (aptIds.size > 0) {
    const idList = Array.from(aptIds).map(id => `'${id.replace(/'/g, "''")}'`).join(',')
    const whereParts = [1, 2, 3, 4, 5].map(n => `APT${n}_FAAID IN (${idList})`)
    const params = new URLSearchParams({
      where: whereParts.join(' OR '),
      outFields: FAA_OUT_FIELDS,
      returnGeometry: 'true',
      outSR: '4326',
      f: 'geojson',
      resultRecordCount: '2000',
    })
    const res = await fetch(`${FAA_UASFM_URL}?${params}`)
    if (!res.ok) throw new Error('FAA API query failed')
    return res.json()
  }

  // Fallback: Class G / uncontrolled — wide radius so user sees nearby context.
  const radiusMeters = 16093 // 10 miles
  const degOffset = radiusMeters / 111000
  const bbox = `${lng - degOffset},${lat - degOffset},${lng + degOffset},${lat + degOffset}`
  const params = new URLSearchParams({
    where: '1=1',
    geometry: bbox,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: FAA_OUT_FIELDS,
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: '2000',
  })
  const res = await fetch(`${FAA_UASFM_URL}?${params}`)
  if (!res.ok) throw new Error('FAA API query failed')
  return res.json()
}

// ── Map sub-component — raw Leaflet via refs (no react-leaflet) ───────────────

interface MapViewProps {
  center: [number, number]
  zoom: number
  flyTo: [number, number] | null
  gridData: GeoJSONData | null
  markerPos: [number, number] | null
  markerLat: number
  markerLng: number
  probePos: [number, number] | null
  airports: NearbyAirport[]
  showAirports: boolean
  onMapClick: (lat: number, lng: number) => void
}

function MapViewInner({
  center, zoom, flyTo, gridData, markerPos, markerLat, markerLng,
  probePos, airports, showAirports, onMapClick,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef    = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gridRef   = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const probeRef  = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aptLayerRef = useRef<any>(null)
  // Click handler lives in a ref so the map's listener never needs rebinding.
  const clickRef  = useRef(onMapClick)
  useEffect(() => { clickRef.current = onMapClick }, [onMapClick])
  // Snapshot center/zoom at first mount so re-renders don't reset the map
  const initCenterRef = useRef(center)
  const initZoomRef   = useRef(zoom)
  const [leafletReady, setLeafletReady] = useState(false)
  const [mapReady,     setMapReady]     = useState(false)

  // Load Leaflet JS (CSS already in layout.tsx)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).L) { setLeafletReady(true); return }
    const JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    let sc = document.querySelector(`script[src="${JS}"]`) as HTMLScriptElement | null
    if (!sc) { sc = document.createElement('script'); sc.src = JS; document.head.appendChild(sc) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).L) setLeafletReady(true)
    else sc.addEventListener('load', () => setLeafletReady(true), { once: true })
  }, [])

  // Init map once Leaflet is ready
  useEffect(() => {
    if (!leafletReady || !containerRef.current || mapRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L
    const map = L.map(containerRef.current, {
      center: initCenterRef.current,
      zoom: initZoomRef.current,
      zoomControl: true,
    })
    map.zoomControl.setPosition('topright')
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Esri',
    }).addTo(map)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, opacity: 0.65,
    }).addTo(map)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on('click', (e: any) => clickRef.current(e.latlng.lat, e.latlng.lng))
    mapRef.current = map
    setMapReady(true)
    // Fix the classic "tiles missing / blank map" issue when container size
    // wasn't finalized at L.map() call time
    requestAnimationFrame(() => map.invalidateSize(true))
    const t1 = setTimeout(() => map.invalidateSize(true), 250)
    const t2 = setTimeout(() => map.invalidateSize(true), 750)
    return () => {
      clearTimeout(t1); clearTimeout(t2)
      map.remove()
      mapRef.current = null
      gridRef.current = null
      markerRef.current = null
      probeRef.current = null
      aptLayerRef.current = null
      setMapReady(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady])

  // Fly to searched location — only when there's no grid yet. Once
  // gridData arrives, the grid effect will fitBounds to the full extent
  // and we don't want a flyTo competing with it mid-animation.
  useEffect(() => {
    if (!mapRef.current || !mapReady || !flyTo) return
    if (gridData?.features?.length) return
    mapRef.current.flyTo(flyTo, 12, { duration: 1.2 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo, mapReady])

  // Redraw FAA grid whenever data changes (or when map first becomes ready)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L
    if (!mapRef.current || !mapReady || !L) return
    if (gridRef.current) { mapRef.current.removeLayer(gridRef.current); gridRef.current = null }
    if (!gridData?.features?.length) return
    gridRef.current = L.geoJSON(gridData, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      style: (feature: any) => {
        const c = feature?.properties?.CEILING as number
        const fill = CEILING_COLORS[c]?.fill || CEILING_DEFAULT_FILL
        // Mirror the FAA renderer: solid fill at ~50% opacity so satellite
        // imagery shows through, thin same-color borders.
        return { color: fill, weight: 0.6, opacity: 0.9, fillColor: fill, fillOpacity: 0.55 }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onEachFeature: (feature: any, layer: any) => {
        const p = feature.properties
        const info = CEILING_COLORS[p.CEILING as number] || { label: `${p.CEILING} ft`, verdict: 'UNKNOWN', fill: CEILING_DEFAULT_FILL }
        const apts = ([1, 2] as const).flatMap(n =>
          p[`APT${n}_NAME`]
            ? [`${p[`APT${n}_NAME`]} (${p[`APT${n}_ICAO`] || p[`APT${n}_FAAID`]})${p[`APT${n}_LAANC`] ? ' ✓ LAANC' : ''}`]
            : []
        )
        const airs = [p.AIRSPACE_1, p.AIRSPACE_2, p.AIRSPACE_3].filter(Boolean).join(', ')
        layer.bindPopup(`
          <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;min-width:200px">
            <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:${info.fill}">${info.label}</div>
            <div style="margin-bottom:4px"><b>Status:</b> ${info.verdict}</div>
            ${airs ? `<div style="margin-bottom:4px"><b>Airspace:</b> ${airs}</div>` : ''}
            ${apts.length ? `<div style="margin-bottom:4px"><b>Airport(s):</b><br/>${apts.join('<br/>')}</div>` : ''}
            ${p.REGION ? `<div><b>Region:</b> ${p.REGION}</div>` : ''}
          </div>`)
      },
    }).addTo(mapRef.current)
    // Zoom the map to fit the full grid extent so the user can see where
    // the facility map starts and ends. Padded slightly so the edge cells
    // aren't clipped by the map frame.
    try {
      const b = gridRef.current.getBounds()
      if (b && b.isValid && b.isValid()) {
        mapRef.current.fitBounds(b, { padding: [24, 24], maxZoom: 13 })
      }
    } catch { /* ignore — keep current view */ }
  }, [gridData, mapReady])

  // Update target pin (also fires once map becomes ready)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L
    if (!mapRef.current || !mapReady || !L || !markerPos) return
    if (markerRef.current) { mapRef.current.removeLayer(markerRef.current); markerRef.current = null }
    const icon = L.divIcon({
      html: `<div style="width:14px;height:14px;background:#e74c3c;border:2px solid #fff;border-radius:50%;box-shadow:0 0 10px rgba(231,76,60,0.9)"></div>`,
      className: '', iconSize: [14, 14], iconAnchor: [7, 7],
    })
    markerRef.current = L.marker(markerPos, { icon }).addTo(mapRef.current)
      .bindPopup(`<div style="font-family:'IBM Plex Mono',monospace;font-size:12px"><b>Target</b><br/>${markerLat.toFixed(5)}, ${markerLng.toFixed(5)}</div>`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerPos, mapReady])

  // Probe pin — wherever the operator last clicked.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L
    if (!mapRef.current || !mapReady || !L) return
    if (probeRef.current) { mapRef.current.removeLayer(probeRef.current); probeRef.current = null }
    if (!probePos) return
    const icon = L.divIcon({
      html: `<div style="position:relative;width:26px;height:26px">
        <div style="position:absolute;inset:0;border:2px solid #FFD700;border-radius:50%;box-shadow:0 0 10px rgba(255,215,0,0.8)"></div>
        <div style="position:absolute;left:12px;top:2px;width:2px;height:22px;background:#FFD700"></div>
        <div style="position:absolute;top:12px;left:2px;height:2px;width:22px;background:#FFD700"></div>
      </div>`,
      className: '', iconSize: [26, 26], iconAnchor: [13, 13],
    })
    probeRef.current = L.marker(probePos, { icon, interactive: false }).addTo(mapRef.current)
  }, [probePos, mapReady])

  // Nearby airports + heliports.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L
    if (!mapRef.current || !mapReady || !L) return
    if (!aptLayerRef.current) aptLayerRef.current = L.layerGroup().addTo(mapRef.current)
    aptLayerRef.current.clearLayers()
    if (!showAirports) return
    for (const a of airports) {
      const color = a.isHeliport ? '#e91e8c' : '#00BFFF'
      const glyph = a.isHeliport ? 'H' : '✈'
      const icon = L.divIcon({
        html: `<div style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,0.75);border:1.5px solid ${color};color:${color};font:700 11px 'Courier New',monospace;text-shadow:0 0 4px ${color}">${glyph}</div>`,
        className: '', iconSize: [20, 20], iconAnchor: [10, 10],
      })
      L.marker([a.lat, a.lng], { icon }).addTo(aptLayerRef.current).bindPopup(
        `<div style="font-family:'IBM Plex Mono',monospace;font-size:12px;min-width:180px">
           <div style="font-weight:700;color:${color};margin-bottom:4px">${glyph} ${a.name}</div>
           <div><b>ID:</b> ${a.ident}${a.icao ? ` / ${a.icao}` : ''}</div>
           <div><b>Type:</b> ${a.isHeliport ? 'Heliport' : 'Airport'}${a.privateUse ? ' (private use)' : ''}</div>
           <div><b>Distance:</b> ${a.distNm.toFixed(1)} nm ${compassPoint(a.bearing)}</div>
           ${a.elevFt != null ? `<div><b>Elevation:</b> ${Math.round(a.elevFt)} ft</div>` : ''}
         </div>`,
      )
    }
  }, [airports, showAirports, mapReady])

  return <div ref={containerRef} style={{ height: '100%', width: '100%', cursor: 'crosshair' }} />
}

const MapView = dynamic(() => Promise.resolve({ default: MapViewInner }), { ssr: false })

// ── Main Component ────────────────────────────────────────────────────────────

export default function AirspaceIntel({ project, onCacheUpdate }: Props) {
  const cachedData = (() => {
    try { return project.airspaceCache ? JSON.parse(project.airspaceCache) : null }
    catch { return null }
  })()

  const defaultLocation = project.site || ''
  // Prefer the resolved address from the last successful search over the
  // raw project.site value, so the input shows the geocoder-verified form
  // (e.g. "9200 BLOCKER LN, AUSTIN, TX, 78719") instead of whatever was
  // originally typed.
  const initialQuery = (cachedData?.displayName as string | undefined) || defaultLocation

  const [query, setQuery]           = useState<string>(initialQuery)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [coords, setCoords]         = useState<Coords | null>(cachedData?.coords || null)
  const [displayName, setDisplayName] = useState<string | null>(cachedData?.displayName || null)
  const [gridData, setGridData]     = useState<GeoJSONData | null>(cachedData?.gridData || null)
  const [pointGrid, setPointGrid]   = useState<GeoJSONFeature | null>(cachedData?.pointGrid || null)
  const [mapCenter, setMapCenter]   = useState<[number, number]>(
    cachedData?.coords ? [cachedData.coords.lat, cachedData.coords.lng] : [39.5, -98.35]
  )
  const [mapZoom]                   = useState<number>(cachedData?.coords ? 12 : 5)
  const [flyTo, setFlyTo]           = useState<[number, number] | null>(null)
  const [airports, setAirports]     = useState<NearbyAirport[]>(cachedData?.airports || [])
  const [showAirports, setShowAirports] = useState(true)
  const [probe, setProbe]           = useState<ProbeResult | null>(null)

  // findPointGrid using bounding box check (same logic as original, but without L in outer scope)
  function findPointGridSimple(geojson: GeoJSONData, lat: number, lng: number): GeoJSONFeature | null {
    if (!geojson?.features) return null
    for (const feature of geojson.features) {
      if (!feature.geometry) continue
      try {
        const geom = feature.geometry as { type: string; coordinates: number[][][] | number[][][][] }
        // For each outer ring, do a bounding-box check (UASFM grids are rectangles so this is exact)
        const outerRings: number[][][] = []
        if (geom.type === 'Polygon') {
          const outer = (geom.coordinates as number[][][])[0]
          if (outer) outerRings.push(outer)
        } else if (geom.type === 'MultiPolygon') {
          for (const poly of geom.coordinates as number[][][][]) {
            if (poly[0]) outerRings.push(poly[0])
          }
        }
        for (const ring of outerRings) {
          const lngs = ring.map(c => c[0])
          const lats = ring.map(c => c[1])
          const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
          const minLat = Math.min(...lats), maxLat = Math.max(...lats)
          if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) return feature
        }
      } catch { /* skip invalid geometry */ }
    }
    return null
  }

  const handleSearch = useCallback(async (locationOverride?: string) => {
    const loc = (locationOverride || query).trim()
    if (!loc) return
    setLoading(true)
    setError(null)
    setGridData(null)
    setPointGrid(null)
    setCoords(null)
    setDisplayName(null)
    try {
      const geo = await geocodeAddress(loc)
      setCoords(geo)
      setDisplayName(geo.display)
      setQuery(geo.display)              // sync input to the resolved address
      setMapCenter([geo.lat, geo.lng])
      setFlyTo([geo.lat, geo.lng])

      const grids = await queryFAAGrids(geo.lat, geo.lng)
      setGridData(grids)

      const exact = findPointGridSimple(grids, geo.lat, geo.lng)
      setPointGrid(exact)
      setProbe(null)

      // Nearby fields are a separate, non-blocking concern — a failure here
      // shouldn't take down the whole airspace scan.
      let apts: NearbyAirport[] = []
      try { apts = await queryNearbyAirports(geo.lat, geo.lng) } catch { /* non-fatal */ }
      setAirports(apts)

      onCacheUpdate({ coords: geo, displayName: geo.display, gridData: grids, pointGrid: exact, airports: apts })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, onCacheUpdate])

  // Click anywhere on the map to probe that exact point. The already-loaded
  // facility grid answers most clicks with no network call at all; only a
  // click outside the loaded grid costs a round trip.
  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setProbe({
      lat, lng, address: null, ceiling: null, airspaceRaw: '',
      aptName: null, aptId: null, laanc: false,
      offsetNm:      coords ? haversineNm(coords.lat, coords.lng, lat, lng) : null,
      offsetBearing: coords ? bearingDeg(coords.lat, coords.lng, lat, lng) : null,
      resolved: false,
    })

    let cell = gridData ? findPointGridSimple(gridData, lat, lng) : null
    if (!cell) { try { cell = await queryPointCell(lat, lng) } catch { cell = null } }
    const address = await reverseGeocode(lat, lng).catch(() => null)

    const p = cell?.properties ?? {}
    setProbe(prev => (prev && prev.lat === lat && prev.lng === lng ? {
      ...prev,
      address,
      ceiling: typeof p.CEILING === 'number' ? p.CEILING : null,
      airspaceRaw: String(p.AIRSPACE_1 ?? ''),
      aptName: (p.APT1_NAME as string | undefined) ?? null,
      aptId:   ((p.APT1_ICAO || p.APT1_FAAID) as string | undefined) ?? null,
      laanc:   p.APT1_LAANC === 1,
      resolved: true,
    } : prev))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridData, coords])

  useEffect(() => {
    if (!cachedData && defaultLocation) handleSearch(defaultLocation)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ceilingVal  = pointGrid?.properties?.CEILING as number | undefined
  const ceilingInfo = ceilingVal !== undefined && ceilingVal !== null ? CEILING_COLORS[ceilingVal] : null
  const rawAirspace = (pointGrid?.properties?.AIRSPACE_1 as string | undefined) || ''
  const airspaceType = rawAirspace.replace(/Class\s*/i, '').trim().charAt(0).toUpperCase()
  const airspaceInfo = airspaceType ? AIRSPACE_INFO[airspaceType] : null
  const isClassG = !pointGrid || (!!coords && !gridData?.features?.length)

  // ── Export / Print ───────────────────────────────────────────────────────────
  function handleExport() {
    const style = document.createElement('style')
    style.id = '__print_airspace'
    style.innerHTML = `
      @media print {
        @page { size: portrait; margin: 0.4in; }
        body * { visibility: hidden !important; }
        [data-airspace], [data-airspace] * { visibility: visible !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        [data-airspace] { position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important; background: #fff !important; color: #111 !important; }
        [data-airspace-noprint] { display: none !important; }
        .leaflet-control-zoom, .leaflet-control-attribution { display: none !important; }
      }
    `
    document.head.appendChild(style)
    setTimeout(() => {
      window.print()
      setTimeout(() => { const s = document.getElementById('__print_airspace'); if (s) s.remove() }, 3000)
    }, 300)
  }

  return (
    <div style={{ marginBottom: 24 }} data-airspace="1">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #3498db, #2471a3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 2l8 6v10H4V8l8-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
            <path d="M2 22h20M8 14h8M10 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: 1, fontFamily: "'Chakra Petch', sans-serif" }}>AIRSPACE ANALYSIS</h2>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginTop: 2 }}>
            FAA UAS FACILITY MAP · LAANC GRID DATA · LIVE QUERY
          </div>
        </div>
      </div>

      {/* Search */}
      <div data-airspace-noprint="1" style={{ display: 'flex', gap: 8, marginBottom: 12, background: 'rgba(30,30,34,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 6 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
          placeholder="Address, venue name, or coordinates (lat, lng)"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f1f1f1', fontFamily: "'Chakra Petch', sans-serif", fontSize: 15, padding: '10px 14px', letterSpacing: 0.5 }}
        />
        <button
          onClick={() => handleSearch()}
          disabled={loading}
          style={{ background: loading ? 'rgba(52,152,219,0.3)' : 'linear-gradient(135deg, #3498db, #2471a3)', border: 'none', borderRadius: 6, color: '#fff', fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 600, padding: '10px 24px', cursor: loading ? 'wait' : 'pointer', letterSpacing: 1, textTransform: 'uppercase' }}
        >
          {loading ? 'SCANNING...' : 'SCAN AIRSPACE'}
        </button>
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 12, paddingLeft: 4 }}>
        FAA UAS Facility Map · LAANC grid data · accepts address, venue name, or lat/lng coordinates
      </div>

      {/* TFR + clear-to-fly countdown */}
      {coords && !loading && <TfrPanel lat={coords.lat} lng={coords.lng} />}

      {/* Resolved address — visible immediately so user can verify */}
      {coords && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(46,204,113,0.06)', border: '1px solid rgba(46,204,113,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#2ecc71', letterSpacing: 1.5, textTransform: 'uppercase' }}>Resolved → {coords.source}</span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#f1f1f1', flex: 1, minWidth: 200 }}>
            {displayName || coords.display}
          </span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
          </span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.4)', width: '100%', marginTop: 2 }}>
            Wrong location? Paste coordinates as &quot;lat, lng&quot; in the search box (e.g. {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}).
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ background: 'rgba(52,152,219,0.08)', border: '1px solid rgba(52,152,219,0.2)', borderRadius: 8, padding: '14px 18px', marginBottom: 20, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: '#3498db', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 16, height: 16, border: '2px solid #3498db', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Querying FAA airspace data...
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 8, padding: '14px 18px', marginBottom: 20, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: '#e74c3c', wordBreak: 'break-word' }}>
          {error}
        </div>
      )}

      {/* Results */}
      {coords && !loading && (
        <div>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
            {/* Verdict */}
            <div style={{ background: 'linear-gradient(135deg, rgba(30,30,34,0.95), rgba(22,22,26,0.98))', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${isClassG ? '#2ecc71' : (ceilingInfo?.fill || '#e74c3c')}, transparent)` }} />
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>DEPLOYMENT VERDICT</div>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 20, fontWeight: 700, color: isClassG ? '#2ecc71' : (ceilingInfo?.fill || '#e74c3c'), lineHeight: 1.15 }}>
                {isClassG ? 'UNCONTROLLED AIRSPACE' : 'CONTROLLED AIRSPACE'}
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700, color: isClassG ? '#2ecc71' : (ceilingInfo?.fill || '#e74c3c'), letterSpacing: 0.5, marginTop: 6 }}>
                {isClassG ? 'GOOD TO GO' : (ceilingInfo?.verdict || 'CHECK REQUIRED')}
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                {isClassG ? 'Class G — No authorization needed under 400ft' : `Max ${ceilingVal}ft AGL`}
              </div>
            </div>

            {/* Airspace Class */}
            <div style={{ background: 'linear-gradient(135deg, rgba(30,30,34,0.95), rgba(22,22,26,0.98))', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${isClassG ? '#2ecc71' : (airspaceInfo?.color || '#95a5a6')}, transparent)` }} />
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>AIRSPACE CLASS</div>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 28, fontWeight: 700, color: '#f1f1f1' }}>
                {isClassG ? 'G' : (airspaceType || '?')}
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
                {isClassG ? 'Uncontrolled' : (airspaceInfo?.name || 'Unknown')}
              </div>
            </div>

            {/* Max Altitude */}
            <div style={{ background: 'linear-gradient(135deg, rgba(30,30,34,0.95), rgba(22,22,26,0.98))', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${isClassG ? '#3498db' : (ceilingInfo?.fill || '#e74c3c')}, transparent)` }} />
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>MAX ALTITUDE</div>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 28, fontWeight: 700, color: '#f1f1f1' }}>
                {isClassG ? '400' : (ceilingVal ?? '?')}
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', marginLeft: 4 }}>ft AGL</span>
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
                {isClassG ? 'Standard Part 107 ceiling' : 'Per FAA UAS Facility Map'}
              </div>
            </div>

            {/* DroneZone */}
            <div style={{ background: 'linear-gradient(135deg, rgba(30,30,34,0.95), rgba(22,22,26,0.98))', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${isClassG ? '#2ecc71' : '#e67e22'}, transparent)` }} />
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>FAA DRONEZONE</div>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 22, fontWeight: 700, color: isClassG ? '#2ecc71' : '#e67e22' }}>
                {isClassG ? 'NOT REQUIRED' : 'REQUIRED'}
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
                {isClassG ? 'Class G — no airspace authorization needed' : 'Controlled airspace — submit via FAA DroneZone or LAANC'}
              </div>
            </div>
          </div>

          {/* Airport Info */}
          {(pointGrid?.properties?.APT1_NAME as string) && (
            <div style={{ background: 'rgba(30,30,34,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px', marginBottom: 20 }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
                CONTROLLING AIRPORT(S)
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {[1, 2].map(n => {
                  const aptName = pointGrid!.properties[`APT${n}_NAME`] as string | undefined
                  if (!aptName) return null
                  const icao = (pointGrid!.properties[`APT${n}_ICAO`] || pointGrid!.properties[`APT${n}_FAAID`] || '') as string
                  const laanc = pointGrid!.properties[`APT${n}_LAANC`] === 1
                  return (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, background: 'rgba(52,152,219,0.15)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="rgba(52,152,219,0.8)"/>
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 14, fontWeight: 600, color: '#f1f1f1' }}>{aptName}</div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', gap: 8 }}>
                          <span>{icao}</span>
                          <span style={{ color: laanc ? '#2ecc71' : '#e67e22' }}>{laanc ? 'LAANC Enabled' : 'No LAANC'}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Nearby airports + heliports — the conflicts a ceiling value
              alone never shows you. A hospital helipad two miles out is the
              most common DFR conflict and it isn't a towered field. */}
          {airports.length > 0 && (
            <div style={{ background: 'rgba(30,30,34,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5, flex: 1 }}>
                  Nearby Fields — within 12 nm
                </div>
                <button
                  data-airspace-noprint="1"
                  onClick={() => setShowAirports(v => !v)}
                  style={{
                    padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 1, textTransform: 'uppercase',
                    border: `1px solid ${showAirports ? 'rgba(0,191,255,0.6)' : 'rgba(255,255,255,0.15)'}`,
                    background: showAirports ? 'rgba(0,191,255,0.15)' : 'transparent',
                    color: showAirports ? '#00BFFF' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {showAirports ? 'On map ✓' : 'Show on map'}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                {airports.slice(0, 8).map(a => {
                  const color = a.isHeliport ? '#e91e8c' : '#00BFFF'
                  const close = a.distNm < 5
                  return (
                    <div key={`${a.ident}-${a.lat}-${a.lng}`} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: close ? `${color}12` : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${close ? `${color}44` : 'rgba(255,255,255,0.05)'}`,
                      borderRadius: 6, padding: '9px 11px',
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: `${color}1e`, border: `1px solid ${color}66`, color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700,
                      }}>
                        {a.isHeliport ? 'H' : '✈'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 600, color: '#f1f1f1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.name}
                        </div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                          {a.ident}{a.icao ? ` · ${a.icao}` : ''}{a.privateUse ? ' · private' : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 700, color }}>
                          {a.distNm.toFixed(1)}<span style={{ fontSize: 9, opacity: 0.6 }}> nm</span>
                        </div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
                          {compassPoint(a.bearing)} {Math.round(a.bearing)}°
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {airports.length > 8 && (
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 10 }}>
                  + {airports.length - 8} more within 12 nm — all plotted on the map above.
                </div>
              )}
            </div>
          )}

          {/* Airspace Class Description */}
          {!isClassG && airspaceInfo && (
            <div style={{
              background: `rgba(${airspaceType === 'B' ? '231,76,60' : airspaceType === 'C' ? '230,126,34' : '52,152,219'},0.08)`,
              border: `1px solid rgba(${airspaceType === 'B' ? '231,76,60' : airspaceType === 'C' ? '230,126,34' : '52,152,219'},0.2)`,
              borderRadius: 8, padding: '14px 18px', marginBottom: 20,
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6
            }}>
              <strong style={{ color: airspaceInfo.color }}>{airspaceInfo.name} Airspace:</strong> {airspaceInfo.desc}
            </div>
          )}

          {/* Map */}
          <div style={{ background: 'rgba(30,30,34,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                SATELLITE VIEW · FAA UASFM GRID OVERLAY
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </div>
                <button
                  data-airspace-noprint="1"
                  onClick={handleExport}
                  title="Print or save as PDF (browser print dialog)"
                  style={{
                    background: 'linear-gradient(135deg, #e63946, #c1121f)',
                    border: 'none', borderRadius: 5, color: '#fff',
                    fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 1,
                    padding: '7px 14px', cursor: 'pointer', textTransform: 'uppercase',
                  }}
                >
                  EXPORT / PRINT
                </button>
              </div>
            </div>
            <div data-airspace-map="1" style={{ height: 560 }}>
              <MapView
                center={mapCenter}
                zoom={mapZoom}
                flyTo={flyTo}
                gridData={gridData}
                markerPos={[coords.lat, coords.lng]}
                markerLat={coords.lat}
                markerLng={coords.lng}
                probePos={probe ? [probe.lat, probe.lng] : null}
                airports={airports}
                showAirports={showAirports}
                onMapClick={handleMapClick}
              />
            </div>

            {/* Pin-drop probe readout — what the rules are at the exact
                point the operator just clicked. */}
            <div data-airspace-noprint="1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 18px' }}>
              {!probe ? (
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#FFD700', fontSize: 13 }}>✛</span>
                  Click anywhere on the map to check the ceiling, class, and controlling field at that exact point.
                </div>
              ) : (
                <ProbeReadout probe={probe} onClear={() => setProbe(null)} />
              )}
            </div>
          </div>

          {/* Legend */}
          <div style={{ background: 'rgba(30,30,34,0.5)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
              UASFM Altitude Ceiling Legend
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(CEILING_COLORS).map(([val, info]) => (
                <div key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, background: info.fill, opacity: 0.7 }} />
                  {info.label}
                </div>
              ))}
            </div>
          </div>

          {/* Resolved location */}
          {displayName && (
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '8px 0' }}>
              Resolved via {coords.source}: {displayName}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!coords && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'rgba(255,255,255,0.2)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, marginBottom: 16, opacity: 0.3, fontFamily: "'Chakra Petch', sans-serif" }}>AIRSPACE</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>AWAITING TARGET LOCATION</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
            Enter a deployment address to scan FAA airspace and LAANC grid data
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// Readout for a clicked point. Deliberately compact — this is a glance
// answer, not a report; the cards above stay authoritative for the site.
function ProbeReadout({ probe, onClear }: { probe: ProbeResult; onClear: () => void }) {
  const info = probe.ceiling != null ? CEILING_COLORS[probe.ceiling] : null
  const color = probe.ceiling === null
    ? '#2ecc71'
    : (info?.fill || CEILING_DEFAULT_FILL)
  const headline = !probe.resolved
    ? 'CHECKING…'
    : probe.ceiling === null
      ? 'CLASS G — 400 FT'
      : `${probe.ceiling} FT AGL`
  const verdict = !probe.resolved
    ? ''
    : probe.ceiling === null
      ? 'No authorization required'
      : (info?.verdict || 'Check required')

  const cell = (label: string, value: string) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.72)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0,
        background: `${color}14`, border: `1px solid ${color}55`, borderRadius: 6, padding: '7px 12px',
      }}>
        <span style={{ color: '#FFD700', fontSize: 14 }}>✛</span>
        <div>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 14, fontWeight: 700, color, lineHeight: 1.15 }}>
            {headline}
          </div>
          {verdict && (
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5 }}>
              {verdict}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, flex: 1, minWidth: 200 }}>
        {cell('Coordinates', `${probe.lat.toFixed(5)}, ${probe.lng.toFixed(5)}`)}
        {probe.offsetNm != null && probe.offsetBearing != null &&
          cell('From site', `${probe.offsetNm.toFixed(2)} nm ${compassPoint(probe.offsetBearing)}`)}
        {probe.resolved && cell('Controlling', probe.aptName ? `${probe.aptName}${probe.laanc ? ' ✓LAANC' : ''}` : 'None (uncontrolled)')}
        {cell('Address', probe.address || (probe.resolved ? '—' : 'resolving…'))}
      </div>

      <button
        onClick={onClear}
        style={{
          flexShrink: 0, padding: '5px 11px', borderRadius: 4, cursor: 'pointer',
          border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
          color: 'rgba(255,255,255,0.45)',
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 1, textTransform: 'uppercase',
        }}
      >
        Clear pin
      </button>
    </div>
  )
}
