'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { ProjectFull } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Constants ─────────────────────────────────────────────────────────────────

const FAA_UASFM_URL = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/FAA_UAS_FacilityMap_Data/FeatureServer/0/query'

const CEILING_COLORS: Record<number, { fill: string; label: string; verdict: string }> = {
  0:   { fill: '#e74c3c', label: '0 ft — NO FLY',   verdict: 'NO-FLY'      },
  50:  { fill: '#e67e22', label: '50 ft AGL',         verdict: 'RESTRICTED'  },
  100: { fill: '#f39c12', label: '100 ft AGL',        verdict: 'RESTRICTED'  },
  150: { fill: '#f1c40f', label: '150 ft AGL',        verdict: 'LIMITED'     },
  200: { fill: '#2ecc71', label: '200 ft AGL',        verdict: 'AUTHORIZED'  },
  250: { fill: '#27ae60', label: '250 ft AGL',        verdict: 'AUTHORIZED'  },
  300: { fill: '#1abc9c', label: '300 ft AGL',        verdict: 'AUTHORIZED'  },
  350: { fill: '#17a2b8', label: '350 ft AGL',        verdict: 'AUTHORIZED'  },
  400: { fill: '#3498db', label: '400 ft AGL',        verdict: 'FULL ACCESS' },
}

const AIRSPACE_INFO: Record<string, { name: string; color: string; desc: string; verdict: string }> = {
  G: { name: 'Class G', color: '#2ecc71', verdict: 'GOOD TO GO',           desc: 'Uncontrolled airspace. No ATC authorization required for Part 107 under 400ft AGL.' },
  E: { name: 'Class E', color: '#9b59b6', verdict: 'AUTHORIZATION REQUIRED', desc: 'Controlled airspace (surface area). LAANC or DroneZone authorization required.' },
  D: { name: 'Class D', color: '#3498db', verdict: 'AUTHORIZATION REQUIRED', desc: 'Controlled airspace around towered airports. LAANC or DroneZone authorization required.' },
  C: { name: 'Class C', color: '#e67e22', verdict: 'AUTHORIZATION REQUIRED', desc: 'Controlled airspace around busy airports. LAANC or DroneZone authorization required.' },
  B: { name: 'Class B', color: '#e74c3c', verdict: 'HIGHLY RESTRICTED',     desc: 'Most restrictive controlled airspace (major airports). LAANC or DroneZone authorization required.' },
}

// ── Geocode ───────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 7000): Promise<Response> {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(id) }
}

async function geocodeAddress(input: string): Promise<Coords> {
  const q = input.trim()

  // Accept raw coordinates: "32.7767, -96.7970" or "32.7767 -96.7970"
  const coordMatch = q.match(/^(-?\d{1,3}\.?\d*)[,\s]+(-?\d{1,3}\.?\d*)$/)
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]), lng = parseFloat(coordMatch[2])
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)
      return { lat, lng, display: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, source: 'Direct' }
  }

  // Census (US street addresses) and Nominatim run in parallel — fastest valid result wins
  const censusFetch = async (): Promise<Coords> => {
    const r = await fetchWithTimeout(
      `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&format=json`
    )
    const d = await r.json()
    const m = d?.result?.addressMatches?.[0]
    if (!m) throw new Error('no census match')
    return { lat: m.coordinates.y, lng: m.coordinates.x, display: m.matchedAddress, source: 'Census' }
  }

  const nominatimFetch = async (): Promise<Coords> => {
    const qs = new URLSearchParams({ format: 'json', limit: '1', q, addressdetails: '1', email: 'tyler.morris@deusxdefense.com' })
    const r = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${qs}`, { headers: { 'Accept-Language': 'en' } })
    const data = await r.json()
    if (!Array.isArray(data) || !data.length) throw new Error('no nominatim match')
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name, source: 'Nominatim' }
  }

  const primary = await Promise.any([censusFetch(), nominatimFetch()]).catch(() => null)
  if (primary) return primary

  // Photon last resort
  try {
    const r = await fetchWithTimeout(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en`)
    const d = await r.json()
    if (d?.features?.length) {
      const f = d.features[0]
      const [lng, lat] = f.geometry.coordinates as [number, number]
      const p = f.properties
      return { lat, lng, display: [p.name, p.street, p.city, p.state, p.country].filter(Boolean).join(', '), source: 'Photon' }
    }
  } catch (_) { /* fall through */ }

  throw new Error('Location not found — try a full address with city and state, or paste coordinates (lat, lng)')
}

// ── Query FAA ─────────────────────────────────────────────────────────────────

async function queryFAAGrids(lat: number, lng: number, radiusMeters = 3219): Promise<GeoJSONData> {
  const degOffset = radiusMeters / 111000
  const bbox = `${lng - degOffset},${lat - degOffset},${lng + degOffset},${lat + degOffset}`
  const params = new URLSearchParams({
    where: '1=1',
    geometry: bbox,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'CEILING,REGION,AIRS_COUNT,AIRSPACE_1,AIRSPACE_2,AIRSPACE_3,APT1_FAAID,APT1_ICAO,APT1_NAME,APT1_LAANC,APT2_FAAID,APT2_NAME,APT2_LAANC,UNIT',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: '500',
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
  onGridDataForPoint: (geojson: GeoJSONData) => void
}

function MapViewInner({ center, zoom, flyTo, gridData, markerPos, markerLat, markerLng }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef    = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gridRef   = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null)
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
      setMapReady(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady])

  // Fly to searched location — also fires once map becomes ready
  useEffect(() => {
    if (!mapRef.current || !mapReady || !flyTo) return
    mapRef.current.flyTo(flyTo, 13, { duration: 1.2 })
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
        const info = CEILING_COLORS[feature?.properties?.CEILING as number] || CEILING_COLORS[0]
        return { color: info.fill, weight: 1.5, opacity: 0.9, fillColor: info.fill, fillOpacity: 0.3 }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onEachFeature: (feature: any, layer: any) => {
        const p = feature.properties
        const info = CEILING_COLORS[p.CEILING as number] || { label: `${p.CEILING} ft`, verdict: 'UNKNOWN', fill: '#aaa' }
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

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}

const MapView = dynamic(() => Promise.resolve({ default: MapViewInner }), { ssr: false })

// ── Main Component ────────────────────────────────────────────────────────────

export default function AirspaceIntel({ project, onCacheUpdate }: Props) {
  const cachedData = (() => {
    try { return project.airspaceCache ? JSON.parse(project.airspaceCache) : null }
    catch { return null }
  })()

  const defaultLocation = project.site || ''

  const [query, setQuery]           = useState<string>(defaultLocation)
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
      setMapCenter([geo.lat, geo.lng])
      setFlyTo([geo.lat, geo.lng])

      const grids = await queryFAAGrids(geo.lat, geo.lng)
      setGridData(grids)

      const exact = findPointGridSimple(grids, geo.lat, geo.lng)
      setPointGrid(exact)

      onCacheUpdate({ coords: geo, displayName: geo.display, gridData: grids, pointGrid: exact })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, onCacheUpdate])

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

  return (
    <div style={{ marginBottom: 24 }}>
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, background: 'rgba(30,30,34,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 6 }}>
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
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 20, paddingLeft: 4 }}>
        FAA UAS Facility Map · LAANC grid data · accepts address, venue name, or lat/lng coordinates
      </div>

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
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 22, fontWeight: 700, color: isClassG ? '#2ecc71' : (ceilingInfo?.fill || '#e74c3c'), lineHeight: 1.2 }}>
                {isClassG ? 'GOOD TO GO' : (ceilingInfo?.verdict || 'CHECK REQUIRED')}
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
                {isClassG ? 'Class G — No authorization needed under 400ft' : `Controlled airspace — Max ${ceilingVal}ft AGL`}
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
            <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                SATELLITE VIEW · FAA UASFM GRID OVERLAY
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </div>
            </div>
            <div style={{ height: 560 }}>
              <MapView
                center={mapCenter}
                zoom={mapZoom}
                flyTo={flyTo}
                gridData={gridData}
                markerPos={[coords.lat, coords.lng]}
                markerLat={coords.lat}
                markerLng={coords.lng}
                onGridDataForPoint={() => {}}
              />
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
