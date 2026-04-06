'use client'

import React, { useState } from 'react'
import type { ProjectFull } from '@/lib/types'

interface Props {
  project: ProjectFull
  onCacheUpdate: (data: unknown) => void
}

// ── Shared inline style fragments ────────────────────────────────────────────

const columnHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  marginBottom: 16, paddingBottom: 12,
  borderBottom: '1px solid rgba(255,255,255,0.09)',
}
const columnDot: React.CSSProperties = {
  width: 9, height: 9, borderRadius: '50%',
  background: '#E53935', flexShrink: 0,
  boxShadow: '0 0 6px #E5393588',
}
const columnTitle: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 12, fontWeight: 700, letterSpacing: 3,
  color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase',
}
const monoNum: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371, dL = (lat2 - lat1) * Math.PI / 180, dO = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dL / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dO / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function geocodeAddressConn(address: string): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const GKEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''
  if (GKEY) {
    try {
      const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GKEY}`)
      const d = await r.json()
      if (d.status === 'OK' && d.results.length > 0) {
        const loc = d.results[0].geometry.location
        return { lat: loc.lat, lng: loc.lng, displayName: d.results[0].formatted_address }
      }
    } catch (_) { /* fall through */ }
  }
  const HDR = { 'Accept-Language': 'en', 'User-Agent': 'DXD-Deployment-Tracker/1.0' }
  // Nominatim free-text fallback
  try {
    const qs = new URLSearchParams({ format: 'json', limit: '1', q: address })
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, { headers: HDR })
    const res = await r.json()
    if (res.length > 0) return { lat: parseFloat(res[0].lat), lng: parseFloat(res[0].lon), displayName: res[0].display_name }
  } catch (_) { /* fall through */ }
  return null
}

interface PowerData {
  substationCount: number
  operators: string[]
  nearestSubDist: number | null
  nearestSub: { name: string; operator: string | null; voltage: string | null; type: string } | null
  voltages: number[]
  plantCount: number
}

interface ConnResult {
  lat: number
  lon: number
  display_name: string
  countyName: string
  stateName: string
  stateCode: string
  totalHH: number
  internetPct: number
  broadbandPct: number
  satellitePct: number
  noInternetPct: number
  towerCount: number
  towerTypes: Record<string, number>
  verdict: 'ready' | 'mixed' | 'starlink'
  power: PowerData
}

async function fetchConnectivity(
  address: string,
  setLoadMsg: (msg: string) => void
): Promise<ConnResult> {
  setLoadMsg('Geocoding address...')
  const geoResult = await geocodeAddressConn(address)
  if (!geoResult) throw new Error('Address not found — verify site address in project settings')
  const { lat, lng: lon, displayName: display_name } = geoResult

  setLoadMsg('Looking up FCC coverage area...')
  const fccRes = await fetch(`https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&format=json`)
  const fccData = await fccRes.json()
  if (fccData.status !== 'OK') throw new Error('Could not determine coverage area')
  const countyFIPS: string = fccData.County.FIPS
  const countyName: string = fccData.County.name
  const stateCode: string  = fccData.State.code
  const stateName: string  = fccData.State.name
  const stateFIPS: string  = fccData.State.FIPS
  const countyCode = countyFIPS.slice(2)

  setLoadMsg('Fetching Census broadband data...')
  const censusRes = await fetch(
    `https://api.census.gov/data/2022/acs/acs5?get=NAME,B28002_001E,B28002_004E,B28002_007E,B28002_013E&for=county:${countyCode}&in=state:${stateFIPS}`
  )
  const censusJson = await censusRes.json()
  const [headers, values] = censusJson as [string[], string[]]
  const census: Record<string, number> = {}
  headers.forEach((h, i) => { census[h] = parseInt(values[i]) || 0 })
  const totalHH     = census.B28002_001E || 1
  const hasInternet = census.B28002_004E || 0
  const internetPct   = Math.round(hasInternet / totalHH * 100)
  const broadbandPct  = Math.round(census.B28002_007E / totalHH * 100)
  const satellitePct  = Math.round(census.B28002_013E / totalHH * 100)
  const noInternetPct = Math.round((totalHH - hasInternet) / totalHH * 100)

  setLoadMsg('Scanning cell tower infrastructure...')
  let towerCount = 0
  let towerTypes: Record<string, number> = {}
  try {
    const ovQuery = `[out:json][timeout:15];node["communication:mobile_phone"="yes"](around:16000,${lat},${lon});out tags;`
    const ovRes = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: `data=${encodeURIComponent(ovQuery)}`
    })
    const ovJson = await ovRes.json()
    towerCount = ovJson.elements?.length || 0
    for (const el of (ovJson.elements || [])) {
      const c: string = el.tags?.['tower:construction'] || 'lattice'
      towerTypes[c] = (towerTypes[c] || 0) + 1
    }
  } catch (_) { /* non-fatal */ }

  setLoadMsg('Scanning power infrastructure...')
  const power: PowerData = { substationCount: 0, operators: [], nearestSubDist: null, nearestSub: null, voltages: [], plantCount: 0 }
  try {
    const pwrQ = `[out:json][timeout:20];(node["power"="substation"](around:40000,${lat},${lon});way["power"="substation"](around:40000,${lat},${lon});way["power"="line"]["voltage"](around:20000,${lat},${lon});node["power"="plant"](around:60000,${lat},${lon});way["power"="plant"](around:60000,${lat},${lon}););out tags center;`
    const pwrRes = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: `data=${encodeURIComponent(pwrQ)}` })
    const pwrJson = await pwrRes.json()
    const opSet = new Set<string>(), voltSet = new Set<number>()
    let nearDist: number | null = null
    let nearSub: PowerData['nearestSub'] = null
    for (const el of (pwrJson.elements || [])) {
      const t = el.tags || {}
      if (t.power === 'substation') {
        const elLat: number = el.lat ?? el.center?.lat
        const elLon: number = el.lon ?? el.center?.lon
        if (t.operator) opSet.add(t.operator as string)
        power.substationCount++
        if (elLat && elLon) {
          const d = haversineKm(lat, lon, elLat, elLon)
          if (nearDist === null || d < nearDist) {
            nearDist = d
            nearSub = { name: t.name || 'Substation', operator: t.operator || null, voltage: t.voltage || null, type: t.substation || 'distribution' }
          }
        }
      } else if (t.power === 'line' && t.voltage) {
        const v = parseInt(t.voltage as string)
        if (v > 0) voltSet.add(v)
        if (t.operator) opSet.add(t.operator as string)
      } else if (t.power === 'plant' || t.power === 'generator') {
        power.plantCount++
        if (t.operator) opSet.add(t.operator as string)
        if (t.name) opSet.add(t.name as string)
      }
    }
    power.operators      = [...opSet].slice(0, 6)
    power.voltages       = [...voltSet].sort((a, b) => b - a).slice(0, 6)
    power.nearestSubDist = nearDist !== null ? Math.round(nearDist * 10) / 10 : null
    power.nearestSub     = nearSub
  } catch (_) { /* non-fatal */ }

  let verdict: ConnResult['verdict']
  if (broadbandPct >= 60) verdict = 'ready'
  else if (broadbandPct >= 35) verdict = 'mixed'
  else verdict = 'starlink'

  return {
    lat, lon, display_name, countyName, stateName, stateCode,
    totalHH, internetPct, broadbandPct, satellitePct, noInternetPct,
    towerCount, towerTypes, verdict, power,
  }
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ConnectivityView({ project, onCacheUpdate }: Props) {
  const cachedData = (() => {
    try { return project.networkCache ? JSON.parse(project.networkCache) : null }
    catch { return null }
  })()

  const [loading, setLoading] = useState(false)
  const [loadMsg, setLoadMsg] = useState('')
  const [data, setData]       = useState<ConnResult | null>(cachedData?.result || null)
  const [error, setError]     = useState<string | null>(null)

  const handleAnalyze = async () => {
    const address = project.site || ''
    if (!address.trim()) { setError('No site address set — add a site location in project settings first'); return }
    setLoading(true); setError(null); setData(null)
    try {
      const result = await fetchConnectivity(address, setLoadMsg)
      setData(result)
      onCacheUpdate({ result, timestamp: new Date().toISOString(), address })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false); setLoadMsg('')
    }
  }

  const carriers = [
    { key: 'att',     label: 'AT&T',     color: '#00A8E0', url: 'https://www.att.com/maps/wireless-coverage-map.html' },
    { key: 'tmobile', label: 'T-Mobile', color: '#E20074', url: 'https://www.t-mobile.com/coverage/coverage-map' },
    { key: 'verizon', label: 'Verizon',  color: '#CD040B', url: 'https://www.verizon.com/coverage-map/' },
  ]

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #e63946, #a62633)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="6.5" r="2" stroke="#fff" strokeWidth="1.3"/>
            <path d="M6.5 1v1.5M6.5 10.5V12M1 6.5h1.5M10.5 6.5H12" stroke="#fff" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M2.9 2.9l1.1 1.1M9 9l1.1 1.1M9 4L7.9 5.1M4 9L2.9 10.1" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: 1, fontFamily: "'Chakra Petch', sans-serif" }}>POWER &amp; NETWORK</h2>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginTop: 2 }}>
            FCC CENSUS · BROADBAND &amp; CELLULAR INFRASTRUCTURE ANALYSIS
          </div>
        </div>
      </div>

      {/* Site Address + Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20, background: 'rgba(30,30,34,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '12px 18px' }}>
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 2, marginBottom: 4 }}>SITE ADDRESS</div>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 15, color: project.site ? '#E8ECF4' : 'rgba(255,255,255,0.25)' }}>
            {project.site || 'No site address set'}
          </div>
          {cachedData?.timestamp && (
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
              Last analyzed: {new Date(cachedData.timestamp).toLocaleString()}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {cachedData?.result && !loading && (
            <button onClick={handleAnalyze} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(255,255,255,0.6)', fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 600, padding: '8px 16px', cursor: 'pointer', letterSpacing: 0.8 }}>
              RE-ANALYZE
            </button>
          )}
          <button onClick={handleAnalyze} disabled={loading || !project.site}
            style={{ background: loading ? 'rgba(230,57,70,0.3)' : 'linear-gradient(135deg, #e63946, #c42d39)', border: 'none', borderRadius: 6, color: '#fff', fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 600, padding: '8px 20px', cursor: loading || !project.site ? 'not-allowed' : 'pointer', letterSpacing: 1, opacity: !project.site ? 0.4 : 1 }}>
            {loading ? 'ANALYZING...' : 'ANALYZE CONNECTIVITY'}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ background: 'rgba(230,57,70,0.08)', border: '1px solid rgba(230,57,70,0.2)', borderRadius: 8, padding: '14px 18px', marginBottom: 24, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: '#e63946', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 16, height: 16, border: '2px solid #e63946', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          {loadMsg}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '14px 18px', marginBottom: 24, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: '#EF4444', wordBreak: 'break-word' }}>
          {error}
        </div>
      )}

      {/* Results */}
      {data && !loading && (() => {
        const verdictConfig = {
          ready:    { color: '#22C55E', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.35)',  icon: '✓', label: 'BVLOS CONNECTIVITY LIKELY',    sub: `${data.broadbandPct}% of ${data.countyName} households have wired broadband — site likely has sufficient connectivity` },
          mixed:    { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.35)', icon: '⚡', label: 'MIXED CONNECTIVITY',            sub: `${data.broadbandPct}% wired broadband — verify specific carrier and ISP coverage at site before deployment` },
          starlink: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.35)',  icon: '↑', label: 'STARLINK RECOMMENDED',          sub: `Only ${data.broadbandPct}% wired broadband in area — Starlink Enterprise required for reliable BVLOS C2 link` },
        }
        const v = verdictConfig[data.verdict]
        return (
          <div>
            {/* BVLOS Verdict Banner */}
            <div style={{ background: v.bg, border: `1px solid ${v.border}`, borderRadius: 12, padding: '20px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 22, fontWeight: 700, color: v.color, letterSpacing: 1, marginBottom: 6 }}>{v.icon} {v.label}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{v.sub}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ ...monoNum, fontSize: 32, color: v.color }}>{data.broadbandPct}<span style={{ fontSize: 14, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>%</span></div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>WIRED BROADBAND</div>
              </div>
            </div>

            {/* County Broadband Stats */}
            <div style={{ marginBottom: 28 }}>
              <div style={columnHeader}><span style={columnDot} /><span style={columnTitle}>COUNTY INTERNET INFRASTRUCTURE — {data.countyName.toUpperCase()}, {data.stateCode}</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
                {([
                  { label: 'ANY INTERNET',    pct: data.internetPct,   color: '#60A5FA', sub: 'of households' },
                  { label: 'WIRED BROADBAND', pct: data.broadbandPct,  color: '#22C55E', sub: 'cable · fiber · DSL' },
                  { label: 'SATELLITE ONLY',  pct: data.satellitePct,  color: '#F59E0B', sub: 'satellite dependent' },
                  { label: 'NO ACCESS',       pct: data.noInternetPct, color: '#EF4444', sub: 'underserved' },
                ] as Array<{ label: string; pct: number; color: string; sub: string }>).map(({ label, pct, color, sub }) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '16px 18px' }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 8 }}>{label}</div>
                    <div style={{ ...monoNum, fontSize: 28, color }}>{pct}<span style={{ fontSize: 14, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>%</span></div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{sub}</div>
                    <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginTop: 8 }}>
                      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cellular Carriers */}
            <div style={{ marginBottom: 28 }}>
              <div style={columnHeader}><span style={columnDot} /><span style={columnTitle}>CELLULAR CARRIERS — VERIFY SITE COVERAGE</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                {carriers.map(({ key, label, color, url }) => (
                  <div key={key} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 15, fontWeight: 700, color, letterSpacing: 0.5 }}>{label}</div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
                      Verify LTE &amp; 5G coverage at {data.countyName} on the carrier&apos;s official coverage map.
                    </div>
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'block', textAlign: 'center', padding: '8px 14px', background: `${color}22`, border: `1px solid ${color}55`, borderRadius: 6, color, fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textDecoration: 'none' }}>
                      CHECK {label.toUpperCase()} COVERAGE →
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Cell Tower Infrastructure */}
            <div style={{ marginBottom: 28 }}>
              <div style={columnHeader}><span style={columnDot} /><span style={columnTitle}>CELL TOWER INFRASTRUCTURE — 16km RADIUS</span></div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 6 }}>TOWERS DETECTED</div>
                  <div style={{ ...monoNum, fontSize: 36, color: data.towerCount > 5 ? '#22C55E' : data.towerCount > 1 ? '#F59E0B' : '#EF4444' }}>
                    {data.towerCount}
                  </div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>
                    {data.towerCount > 5 ? 'Good infrastructure density' : data.towerCount > 1 ? 'Limited — verify with carriers' : 'Minimal tower presence'}
                  </div>
                </div>
                {Object.keys(data.towerTypes).length > 0 && (
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    {Object.entries(data.towerTypes).map(([type, count]) => (
                      <div key={type} style={{ textAlign: 'center' }}>
                        <div style={{ ...monoNum, fontSize: 22, color: 'rgba(255,255,255,0.7)' }}>{count}</div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'capitalize' }}>{type.replace(/_/g, ' ')}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginLeft: 'auto' }}>
                  <a href="https://broadbandmap.fcc.gov/home" target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-block', padding: '8px 16px', background: 'rgba(230,57,70,0.12)', border: '1px solid rgba(230,57,70,0.3)', borderRadius: 6, color: '#e63946', fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textDecoration: 'none' }}>
                    FCC BROADBAND MAP →
                  </a>
                </div>
              </div>
            </div>

            {/* Power Infrastructure */}
            <div style={{ marginBottom: 28 }}>
              <div style={columnHeader}><span style={columnDot} /><span style={columnTitle}>POWER INFRASTRUCTURE</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* Electric Utility Providers */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '18px 20px' }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 10 }}>ELECTRIC UTILITY PROVIDERS DETECTED</div>
                  {data.power?.operators?.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {data.power.operators.map((op, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FBBF24', flexShrink: 0 }} />
                          <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, color: '#E8ECF4', fontWeight: 600 }}>{op}</span>
                        </div>
                      ))}
                      <a href={`https://atlas.eia.gov/datasets/f4cd55044b924fed9bc8b64022966097_0/explore?location=${data.lat},${data.lon},12`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-block', marginTop: 8, padding: '6px 14px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 6, color: '#FBBF24', fontFamily: "'Chakra Petch', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textDecoration: 'none' }}>
                        EIA ELECTRICITY ATLAS →
                      </a>
                    </div>
                  ) : (
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                      No tagged utility operators found in OSM data.
                      <a href={`https://atlas.eia.gov/datasets/f4cd55044b924fed9bc8b64022966097_0/explore?location=${data.lat},${data.lon},12`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ display: 'block', marginTop: 10, padding: '6px 14px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 6, color: '#FBBF24', fontFamily: "'Chakra Petch', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textDecoration: 'none', textAlign: 'center' }}>
                        LOOK UP ON EIA ELECTRICITY ATLAS →
                      </a>
                    </div>
                  )}
                </div>

                {/* Grid Infrastructure Stats */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 2 }}>GRID INFRASTRUCTURE</div>
                  {/* Nearest Substation */}
                  <div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: 1, marginBottom: 4 }}>NEAREST SUBSTATION</div>
                    {data.power?.nearestSub ? (
                      <div>
                        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 14, color: '#60A5FA', fontWeight: 700 }}>
                          {data.power.nearestSubDist !== null ? `${data.power.nearestSubDist} km away` : 'Detected'}
                        </div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                          {data.power.nearestSub.name}{data.power.nearestSub.type ? ` · ${data.power.nearestSub.type}` : ''}
                          {data.power.nearestSub.voltage ? ` · ${Math.round(parseInt(data.power.nearestSub.voltage) / 1000)}kV` : ''}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>Not found within 40km</div>
                    )}
                  </div>
                  {/* Substations + Plants */}
                  <div style={{ display: 'flex', gap: 24 }}>
                    <div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: 1, marginBottom: 4 }}>SUBSTATIONS (40km)</div>
                      <div style={{ ...monoNum, fontSize: 26, color: (data.power?.substationCount ?? 0) > 3 ? '#22C55E' : (data.power?.substationCount ?? 0) > 0 ? '#F59E0B' : '#EF4444' }}>
                        {data.power?.substationCount ?? 0}
                      </div>
                    </div>
                    {(data.power?.plantCount ?? 0) > 0 && (
                      <div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: 1, marginBottom: 4 }}>POWER PLANTS (60km)</div>
                        <div style={{ ...monoNum, fontSize: 26, color: '#A78BFA' }}>{data.power.plantCount}</div>
                      </div>
                    )}
                  </div>
                  {/* Voltage Levels */}
                  {(data.power?.voltages?.length ?? 0) > 0 && (
                    <div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: 1, marginBottom: 6 }}>TRANSMISSION VOLTAGES DETECTED</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {data.power.voltages.map(v => {
                          const kv = Math.round(v / 1000)
                          const color = kv >= 200 ? '#EF4444' : kv >= 100 ? '#F59E0B' : kv >= 30 ? '#60A5FA' : '#6B7280'
                          return (
                            <span key={v} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 4, padding: '2px 8px' }}>
                              {kv}kV
                            </span>
                          )
                        })}
                      </div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>
                        {data.power.voltages[0] >= 100000 ? 'Transmission grid access' : data.power.voltages[0] >= 30000 ? 'Sub-transmission distribution' : 'Distribution level'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Data Note */}
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.2)', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              Broadband data: US Census Bureau ACS 5-Year Estimates (2022) · Cell tower &amp; power data: OpenStreetMap · County: {data.countyName}, {data.stateName}
            </div>
          </div>
        )
      })()}

      {/* Empty State */}
      {!data && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.2)' }}>
          <svg width="48" height="48" viewBox="0 0 13 13" fill="none" style={{ opacity: 0.3, marginBottom: 16 }}>
            <circle cx="6.5" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M6.5 1v1.5M6.5 10.5V12M1 6.5h1.5M10.5 6.5H12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M2.9 2.9l1.1 1.1M9 9l1.1 1.1M9 4L7.9 5.1M4 9L2.9 10.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
            Analyze site connectivity to view broadband and cellular coverage
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
