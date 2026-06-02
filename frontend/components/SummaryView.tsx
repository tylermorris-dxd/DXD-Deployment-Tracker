'use client'

import React, { useState, useEffect } from 'react'
import type { ProjectFull } from '@/lib/types'
import { geocodeAddress } from '@/lib/geocode'
import SiteMapper from './SiteMapper'

interface Props {
  project: ProjectFull
  onAirspaceCache: (data: unknown) => void
  onWeatherCache: (data: unknown) => void
  onNetworkCache: (data: unknown) => void
}

// ─── Shared FAA UASFM ceiling color table (matches AirspaceIntel) ────────
const CEILING_COLORS: Record<number, { fill: string; verdict: string }> = {
  0: { fill: '#B53535', verdict: 'NO-FLY' },
  50: { fill: '#BCFCB6', verdict: 'RESTRICTED' },
  100: { fill: '#E69800', verdict: 'RESTRICTED' },
  150: { fill: '#FCCFB8', verdict: 'LIMITED' },
  200: { fill: '#FFFFBE', verdict: 'AUTHORIZED' },
  250: { fill: '#D4D9A1', verdict: 'AUTHORIZED' },
  300: { fill: '#A7C7B3', verdict: 'AUTHORIZED' },
  350: { fill: '#BDD8FC', verdict: 'AUTHORIZED' },
  400: { fill: '#65A843', verdict: 'FULL ACCESS' },
}

// ─── Data shapes the PDF builder consumes ────────────────────────────────
interface AirspaceData {
  isClassG: boolean
  classLetter: string
  className: string
  ceilingVal: number | null
  verdict: string
  ceilingColor: string
  droneZone: 'NOT REQUIRED' | 'REQUIRED'
}

interface WeatherData {
  flyableDays: number
  flyablePct: number
  goPct: number
  marginalPct: number
  noflyPct: number
  bestMonth: string
  bestMonthDays: number
  avgWind: string
  peakWind: string
  avgTemp: string
  high: string
  low: string
}

interface NetworkData {
  countyName: string
  stateCode: string
  verdict: 'ready' | 'mixed' | 'starlink'
  verdictLabel: string
  verdictSub: string
  broadbandPct: number
  internetPct: number
  satellitePct: number
  noInternetPct: number
}

// ─── Inline lookups (run when cache is missing) ──────────────────────────

async function runAirspace(site: string): Promise<AirspaceData> {
  const geo = await geocodeAddress(site)
  if (!geo) throw new Error('Could not geocode site address')
  // Small probe at the site point to identify controlling airspace + ceiling
  const off = 0.005
  const bbox = `${geo.lng - off},${geo.lat - off},${geo.lng + off},${geo.lat + off}`
  const params = new URLSearchParams({
    where: '1=1',
    geometry: bbox,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'CEILING,AIRSPACE_1',
    returnGeometry: 'false',
    f: 'json',
    resultRecordCount: '5',
  })
  const url = `https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/FAA_UAS_FacilityMap_Data/FeatureServer/0/query?${params}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('FAA grid lookup failed')
  const data = await res.json()
  const feat = (data?.features || [])[0]
  if (!feat) {
    return {
      isClassG: true, classLetter: 'G', className: 'Uncontrolled',
      ceilingVal: 400, verdict: 'GOOD TO GO', ceilingColor: '#2ecc71',
      droneZone: 'NOT REQUIRED',
    }
  }
  const attr = feat.attributes || {}
  const ceiling = typeof attr.CEILING === 'number' ? attr.CEILING : parseInt(attr.CEILING) || 0
  const airspaceRaw = (attr.AIRSPACE_1 || '') as string
  const letter = airspaceRaw.replace(/Class\s*/i, '').trim().charAt(0).toUpperCase() || 'G'
  const classNames: Record<string, string> = { G: 'Uncontrolled', E: 'Class E', D: 'Class D', C: 'Class C', B: 'Class B' }
  const info = CEILING_COLORS[ceiling] || CEILING_COLORS[0]
  return {
    isClassG: false,
    classLetter: letter,
    className: classNames[letter] || `Class ${letter}`,
    ceilingVal: ceiling,
    verdict: info.verdict,
    ceilingColor: info.fill,
    droneZone: 'REQUIRED',
  }
}

async function runWeather(site: string): Promise<WeatherData> {
  const geo = await geocodeAddress(site)
  if (!geo) throw new Error('Could not geocode site address')
  const params = new URLSearchParams({
    latitude: geo.lat.toFixed(4),
    longitude: geo.lng.toFixed(4),
    start_date: '2015-01-01',
    end_date: '2025-12-31',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
    timezone: 'UTC',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
  })
  const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`)
  if (!res.ok) throw new Error('Open-Meteo lookup failed')
  const d = await res.json()
  const dates: string[] = d.daily.time
  const highs: number[] = d.daily.temperature_2m_max.map((v: number | null) => v ?? 0)
  const lows: number[] = d.daily.temperature_2m_min.map((v: number | null) => v ?? 0)
  const precip: number[] = d.daily.precipitation_sum.map((v: number | null) => v ?? 0)
  const winds: number[] = d.daily.wind_speed_10m_max.map((v: number | null) => v ?? 0)

  let go = 0, marginal = 0, nofly = 0
  const monthFlyable = Array(12).fill(0)
  const monthTotal = Array(12).fill(0)
  for (let i = 0; i < dates.length; i++) {
    const w = winds[i], p = precip[i]
    const m = parseInt(dates[i].slice(5, 7)) - 1
    monthTotal[m]++
    if (p > 0.5 || w > 30) nofly++
    else if (p > 0.1 || w > 20) marginal++
    else { go++; monthFlyable[m]++ }
  }
  const total = dates.length
  const flyableYr = Math.round((go / total) * 365)
  const peakWind = Math.max(...winds, 0).toFixed(1)
  const avgWind = (winds.reduce((a, b) => a + b, 0) / total).toFixed(1)
  const meanTemp = highs.reduce((a, b, i) => a + (b + lows[i]) / 2, 0) / total
  const avgHigh = highs.reduce((a, b) => a + b, 0) / total
  const avgLow = lows.reduce((a, b) => a + b, 0) / total

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  let bestIdx = 0, bestRatio = 0
  for (let i = 0; i < 12; i++) {
    if (monthTotal[i] === 0) continue
    const ratio = monthFlyable[i] / monthTotal[i]
    if (ratio > bestRatio) { bestRatio = ratio; bestIdx = i }
  }
  const bestMonthDaysInMonth = monthTotal[bestIdx] > 0
    ? Math.round((monthFlyable[bestIdx] / monthTotal[bestIdx]) * 30)
    : 0

  return {
    flyableDays: flyableYr,
    flyablePct: Math.round((go / total) * 100),
    goPct: Math.round((go / total) * 100),
    marginalPct: Math.round((marginal / total) * 100),
    noflyPct: Math.round((nofly / total) * 100),
    bestMonth: monthNames[bestIdx],
    bestMonthDays: bestMonthDaysInMonth,
    avgWind,
    peakWind,
    avgTemp: meanTemp.toFixed(0),
    high: avgHigh.toFixed(0),
    low: avgLow.toFixed(0),
  }
}

async function runNetwork(site: string): Promise<NetworkData> {
  const geo = await geocodeAddress(site)
  if (!geo) throw new Error('Could not geocode site address')
  const params = new URLSearchParams({
    lat: String(geo.lat),
    lng: String(geo.lng),
    displayName: geo.displayName,
  })
  const res = await fetch(`/api/network-lookup?${params}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Network lookup failed')
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = await res.json()
  const verdictMap = {
    ready:    { label: 'BVLOS CONNECTIVITY LIKELY', sub: `${r.broadbandPct}% wired broadband in ${r.countyName} County — sufficient for BVLOS ops` },
    mixed:    { label: 'MIXED CONNECTIVITY',         sub: `${r.broadbandPct}% wired broadband — verify carrier & ISP coverage on-site before deploying` },
    starlink: { label: 'STARLINK RECOMMENDED',       sub: `${r.broadbandPct}% wired broadband — Starlink Enterprise required for reliable BVLOS link` },
  }
  const v = verdictMap[r.verdict as keyof typeof verdictMap] || verdictMap.starlink
  return {
    countyName: r.countyName,
    stateCode: r.stateCode,
    verdict: r.verdict,
    verdictLabel: v.label,
    verdictSub: v.sub,
    broadbandPct: r.broadbandPct,
    internetPct: r.internetPct,
    satellitePct: r.satellitePct,
    noInternetPct: r.noInternetPct,
  }
}

// ─── PDF builder ─────────────────────────────────────────────────────────

interface PdfOpts {
  project: ProjectFull
  airspace: AirspaceData
  weather: WeatherData
  network: NetworkData
  mapDataUrl: string
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const sc = document.createElement('script')
    sc.src = src
    sc.onload = () => resolve()
    sc.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(sc)
  })
}

async function buildPDF(opts: PdfOpts) {
  await Promise.all([
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { jsPDF } = (window as any).jspdf
  const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const M = 32 // margin
  const colW = (W - M * 2 - 12) / 2

  // ─ Header ─
  pdf.setFillColor(229, 57, 53)
  pdf.rect(0, 0, W, 6, 'F')
  pdf.setTextColor(20)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16)
  pdf.text('SITE DEPLOYMENT SUMMARY', M, M)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(110)
  pdf.text(`Generated ${new Date().toLocaleString()}`, M, M + 13)
  pdf.setTextColor(20); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
  pdf.text(`Project: ${opts.project.name || '—'}`, M, M + 28)
  pdf.text(`Client: ${opts.project.client || '—'}`, M + colW + 12, M + 28)
  const siteText = pdf.splitTextToSize(`Site: ${opts.project.site || '—'}`, W - M * 2) as string[]
  pdf.text(siteText, M, M + 42)

  let y = M + 42 + 14 * Math.max(1, siteText.length) + 8

  // ─ Section helper ─
  const drawSection = (title: string, color: [number, number, number], cards: Array<{ label: string; value: string; valueColor?: [number, number, number]; sub?: string }>) => {
    pdf.setFillColor(...color)
    pdf.rect(M, y, 4, 14, 'F')
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(...color)
    pdf.text(title.toUpperCase(), M + 10, y + 10)
    y += 18

    const cardH = 44
    const cardW = (W - M * 2 - 8) / 2
    cards.forEach((c, i) => {
      const col = i % 2, row = Math.floor(i / 2)
      const x = M + col * (cardW + 8)
      const cy = y + row * (cardH + 6)
      pdf.setFillColor(245, 246, 248)
      pdf.roundedRect(x, cy, cardW, cardH, 4, 4, 'F')
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(110)
      pdf.text(c.label.toUpperCase(), x + 8, cy + 11)
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15)
      pdf.setTextColor(...(c.valueColor || [20, 20, 20] as [number, number, number]))
      pdf.text(c.value, x + 8, cy + 27)
      if (c.sub) {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(110)
        const wrapped = pdf.splitTextToSize(c.sub, cardW - 16) as string[]
        pdf.text(wrapped, x + 8, cy + 37)
      }
    })
    const rows = Math.ceil(cards.length / 2)
    y += rows * (cardH + 6) + 6
  }

  // ─ AIRSPACE ─
  const a = opts.airspace
  drawSection('Airspace', [229, 57, 53], [
    { label: 'Deployment Verdict', value: a.verdict, valueColor: a.isClassG ? [34, 197, 94] : [196, 30, 58], sub: a.isClassG ? 'Class G — No auth needed under 400ft' : `Controlled airspace — Max ${a.ceilingVal} ft AGL` },
    { label: 'Airspace Class', value: a.classLetter, sub: a.className },
    { label: 'Max Altitude', value: `${a.ceilingVal ?? 400} ft AGL`, sub: a.isClassG ? 'Standard Part 107 ceiling' : 'Per FAA UASFM' },
    { label: 'FAA DroneZone', value: a.droneZone, valueColor: a.droneZone === 'REQUIRED' ? [230, 152, 0] : [34, 197, 94], sub: a.droneZone === 'REQUIRED' ? 'Submit via LAANC / DroneZone' : 'No airspace auth required' },
  ])

  // ─ WEATHER ─
  const w = opts.weather
  drawSection('Weather', [229, 57, 53], [
    { label: 'Flyable Days / Year', value: String(w.flyableDays), sub: `${w.flyablePct}% of year — Go ${w.goPct}% · Marginal ${w.marginalPct}% · No-Fly ${w.noflyPct}%` },
    { label: 'Best Month', value: w.bestMonth, sub: `~${w.bestMonthDays} flyable days` },
    { label: 'Avg Wind Speed', value: `${w.avgWind} mph`, sub: `Peak day: ${w.peakWind} mph` },
    { label: 'Avg Temperature', value: `${w.avgTemp}°F`, sub: `H: ${w.high}°F · L: ${w.low}°F` },
  ])

  // ─ CONNECTIVITY ─
  const n = opts.network
  const vColor: [number, number, number] = n.verdict === 'ready' ? [34, 197, 94] : n.verdict === 'mixed' ? [245, 158, 11] : [239, 68, 68]
  // Banner verdict spans full width
  pdf.setFillColor(...color255(vColor, 0.10))
  pdf.roundedRect(M, y, W - M * 2, 36, 4, 4, 'F')
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(...vColor)
  pdf.text('CONNECTIVITY', M + 10, y + 13)
  pdf.setFontSize(12); pdf.text(n.verdictLabel, M + 110, y + 13)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(80)
  pdf.text(n.verdictSub, M + 10, y + 28)
  y += 42
  drawSection('', [229, 57, 53], [
    { label: 'Any Internet', value: `${n.internetPct}%`, valueColor: [34, 197, 94], sub: 'of households' },
    { label: 'Wired Broadband', value: `${n.broadbandPct}%`, valueColor: n.broadbandPct >= 60 ? [34, 197, 94] : n.broadbandPct >= 35 ? [245, 158, 11] : [239, 68, 68], sub: 'cable · fiber · DSL' },
    { label: 'Satellite Only', value: `${n.satellitePct}%`, valueColor: [196, 30, 58], sub: 'satellite dependent' },
    { label: 'No Access', value: `${n.noInternetPct}%`, valueColor: [196, 30, 58], sub: 'underserved' },
  ])

  // ─ MAP ─
  if (opts.mapDataUrl) {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(229, 57, 53)
    pdf.text('SITE MAP', M, y + 10)
    y += 16
    const mapW = W - M * 2
    const remaining = H - y - 30
    const mapH = Math.min(remaining, 220)
    pdf.addImage(opts.mapDataUrl, 'JPEG', M, y, mapW, mapH)
    y += mapH + 4
  }

  // ─ Footer ─
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7); pdf.setTextColor(140)
  pdf.text('Sources: FAA UAS Facility Map · Open-Meteo · FCC Broadband · US Census ACS · OpenStreetMap · Generated by DXD Ops Tracker', M, H - 16)

  const safe = (opts.project.name || 'site').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const stamp = new Date().toISOString().slice(0, 10)
  pdf.save(`summary-${safe}-${stamp}.pdf`)
}

function color255(c: [number, number, number], alpha: number): [number, number, number] {
  // Blend toward white to get a light tint version for backgrounds
  const blend = (v: number) => Math.round(v * alpha + 255 * (1 - alpha))
  return [blend(c[0]), blend(c[1]), blend(c[2])]
}

// ─── Component ────────────────────────────────────────────────────────────

export default function SummaryView({
  project,
  onAirspaceCache,
  onWeatherCache,
  onNetworkCache,
}: Props) {
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [showHiddenMap, setShowHiddenMap] = useState(false)
  const [error, setError] = useState<string>('')

  // Read currently-cached data to show preview status
  const hasAirspace = !!project.airspaceCache
  const hasWeather  = !!project.weatherCache
  const hasNetwork  = !!project.networkCache
  const hasMap      = !!project.mapCache

  async function captureMap(): Promise<string> {
    setStatus('Rendering map for snapshot…')
    setShowHiddenMap(true)
    // Wait for Leaflet to mount + tiles to load. The hidden SiteMapper
    // restores from mapCache so docks/boundaries/sites appear too.
    await new Promise(r => setTimeout(r, 4500))
    setStatus('Capturing map image…')
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html2canvas = (window as any).html2canvas
    const mapEl = document.querySelector('[data-summary-hidden-map] [data-sitemap-mapwrap="1"]') as HTMLElement | null
    if (!mapEl) {
      setShowHiddenMap(false)
      throw new Error('Map render failed — try visiting the Map tab first to seed it')
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const canvas: HTMLCanvasElement = await html2canvas(mapEl, {
      useCORS: true, scale: 2, backgroundColor: '#0a0404',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ignoreElements: (el: any) => {
        const cls = el.className
        if (typeof cls !== 'string') return false
        return cls.includes('leaflet-popup') || cls.includes('leaflet-control-attribution') || cls.includes('leaflet-control-zoom')
      },
    })
    const data = canvas.toDataURL('image/jpeg', 0.85)
    setShowHiddenMap(false)
    return data
  }

  async function handleGenerate() {
    if (generating) return
    setError('')
    setGenerating(true)
    try {
      // Airspace
      setStatus('Loading airspace data…')
      const airspace = await runAirspace(project.site)
      onAirspaceCache({ summarySnapshot: airspace, ts: new Date().toISOString() })

      // Weather
      setStatus('Loading weather data… (this takes ~10 seconds)')
      const weather = await runWeather(project.site)
      onWeatherCache({ summarySnapshot: weather, ts: new Date().toISOString() })

      // Network
      setStatus('Loading connectivity data…')
      const network = await runNetwork(project.site)
      onNetworkCache({ summarySnapshot: network, ts: new Date().toISOString() })

      // Map
      const mapDataUrl = await captureMap()

      // Build PDF
      setStatus('Building PDF…')
      await buildPDF({ project, airspace, weather, network, mapDataUrl })
      setStatus('Done')
      setTimeout(() => setStatus(''), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('')
      setShowHiddenMap(false)
    } finally {
      setGenerating(false)
    }
  }

  // Auto-cleanup of stuck hidden map on unmount
  useEffect(() => {
    return () => setShowHiddenMap(false)
  }, [])

  const cardSt: React.CSSProperties = {
    background: 'rgba(30,30,34,0.7)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 8, padding: '14px 16px',
  }
  const lblSt: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 4 }

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #E53935, #C62828)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="2" width="16" height="20" rx="2" stroke="#fff" strokeWidth="1.5"/>
            <path d="M8 7h8M8 11h8M8 15h5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: 1, fontFamily: "'Chakra Petch', sans-serif", color: '#fff' }}>1-PAGE SITE SUMMARY</h2>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginTop: 2 }}>
            AIRSPACE · WEATHER · CONNECTIVITY · MAP — DOWNLOADABLE PDF
          </div>
        </div>
      </div>

      {/* Status indicator panel — shows what's currently cached */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Airspace', has: hasAirspace },
          { label: 'Weather',  has: hasWeather },
          { label: 'Network',  has: hasNetwork },
          { label: 'Map',      has: hasMap },
        ].map(s => (
          <div key={s.label} style={{ ...cardSt, padding: '10px 14px' }}>
            <div style={lblSt}>{s.label}</div>
            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 13, color: s.has ? '#22C55E' : '#9aa3b8' }}>
              {s.has ? '✓ Cached' : 'Will run when generating'}
            </div>
          </div>
        ))}
      </div>

      {/* Generate panel */}
      <div style={{ background: 'rgba(229,57,53,0.06)', border: '1px solid rgba(229,57,53,0.2)', borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Generate PDF</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
              Runs airspace, weather, and connectivity lookups on the project&apos;s site address, snapshots the map, and<br/>builds a single-page PDF with the verdict cards from each tool plus the map image.
            </div>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: '12px 26px',
              background: generating ? 'rgba(229,57,53,0.3)' : 'linear-gradient(135deg, #E53935, #C62828)',
              color: '#fff', border: 'none', borderRadius: 7,
              fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
              cursor: generating ? 'wait' : 'pointer',
              opacity: generating ? 0.6 : 1,
              textTransform: 'uppercase' as const,
              whiteSpace: 'nowrap',
            }}
          >
            {generating ? 'WORKING…' : '↓ GENERATE 1-PAGE PDF'}
          </button>
        </div>
        {status && (
          <div style={{ marginTop: 12, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#22C55E', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', animation: 'pulse 1.2s infinite' }} />
            {status}
          </div>
        )}
        {error && (
          <div style={{ marginTop: 12, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#ef4444', wordBreak: 'break-word' }}>
            ✕ {error}
          </div>
        )}
      </div>

      {/* What's on the PDF */}
      <div style={cardSt}>
        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 12, color: '#fff', marginBottom: 12, letterSpacing: 1 }}>
          PDF CONTENTS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
          <div>
            <strong style={{ color: '#E53935' }}>AIRSPACE</strong><br/>
            Deployment Verdict · Airspace Class · Max Altitude · FAA DroneZone
          </div>
          <div>
            <strong style={{ color: '#E53935' }}>WEATHER</strong><br/>
            Flyable Days / Year · Best Month · Avg Wind · Avg Temperature
          </div>
          <div>
            <strong style={{ color: '#E53935' }}>CONNECTIVITY</strong><br/>
            BVLOS Verdict · Any Internet · Wired Broadband · Satellite Only · No Access
          </div>
          <div>
            <strong style={{ color: '#E53935' }}>MAP</strong><br/>
            Satellite snapshot with any docks, boundary, and pins you&apos;ve placed on the Map tab.
          </div>
        </div>
      </div>

      {/* Hidden off-screen SiteMapper for capturing the map snapshot.
          Positioned off-screen but rendered at fixed size so Leaflet
          actually loads tiles. Removed after capture. */}
      {showHiddenMap && (
        <div
          data-summary-hidden-map
          style={{ position: 'fixed', left: -12000, top: 0, width: 1100, height: 700, pointerEvents: 'none', opacity: 1 }}
        >
          <SiteMapper project={project} onCacheUpdate={() => {/* read-only render */}} />
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
    </div>
  )
}
