'use client'

import React, { useState, useCallback, useEffect } from 'react'
import type { ProjectFull } from '@/lib/types'
import { geocodeAddress } from '@/lib/geocode'

// ── helpers ──────────────────────────────────────────────────────────────────

const WX_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function calcDaylightHours(latDeg: number, monthIdx: number) {
  const latRad = latDeg * Math.PI / 180
  const doy = [15,46,74,105,135,166,196,227,258,288,319,349][monthIdx]
  const decl = 23.45 * Math.sin((360/365) * (doy - 81) * Math.PI / 180) * Math.PI / 180
  const cosH = -Math.tan(latRad) * Math.tan(decl)
  if (cosH <= -1) return 24
  if (cosH >= 1) return 0
  return Math.round((2 * Math.acos(cosH) * 180 / Math.PI / 15) * 10) / 10
}

interface MonthData {
  month: string; avg_high_f: number; avg_low_f: number; avg_precip_inches: number
  avg_rain_days: number; avg_snow_days: number; avg_fog_days: number; avg_thunderstorm_days: number
  avg_wind_speed_mph: number; avg_wind_gust_mph: number; avg_humidity_pct: number
  avg_visibility_miles: number; avg_daylight_hours: number
}

interface WeatherData {
  location: string; data_period: string; sources: string[]; months: MonthData[]
}

interface FlyData { flyable: number; marginal: number; nofly: number }

async function fetchWeatherFromOpenMeteo(location: string, onStatus: (s: string) => void): Promise<WeatherData> {
  onStatus('Geocoding location...')
  const geo = await geocodeAddress(location)
  if (!geo) throw new Error('Could not geocode location — check the site address')
  const { lat, lng } = geo

  onStatus('Fetching weather data from Open-Meteo (2015–2025)...')
  const params = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lng.toFixed(4),
    start_date: '2015-01-01', end_date: '2025-12-31',
    daily: ['temperature_2m_max','temperature_2m_min','precipitation_sum','rain_sum','snowfall_sum','wind_speed_10m_max','wind_gusts_10m_max','relative_humidity_2m_max','relative_humidity_2m_min','weather_code'].join(','),
    timezone: 'UTC', temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch',
  })
  const wxRes = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`)
  if (!wxRes.ok) { const err = await wxRes.json().catch(() => ({})); throw new Error((err as {reason?: string}).reason || `Open-Meteo error (${wxRes.status})`) }
  const wxData = await wxRes.json() as { daily: Record<string, (number | null)[]> }

  onStatus('Calculating monthly averages...')
  const d = wxData.daily
  const dates = d.time as unknown as string[]
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

  const md = Array.from({ length: 12 }, () => ({ highs: [] as number[], lows: [] as number[], windSpeeds: [] as number[], gusts: [] as number[], humidities: [] as number[], rainDays: 0, snowDays: 0, fogDays: 0, thunderDays: 0 }))
  const monthYearPrecip: Record<string, number> = {}

  dates.forEach((dateStr, i) => {
    const mIdx = parseInt(dateStr.slice(5, 7)) - 1
    const year = dateStr.slice(0, 4)
    const m = md[mIdx]
    if (d.temperature_2m_max[i] != null) m.highs.push(d.temperature_2m_max[i]!)
    if (d.temperature_2m_min[i] != null) m.lows.push(d.temperature_2m_min[i]!)
    if (d.wind_speed_10m_max[i] != null) m.windSpeeds.push(d.wind_speed_10m_max[i]!)
    if (d.wind_gusts_10m_max[i] != null) m.gusts.push(d.wind_gusts_10m_max[i]!)
    const hMax = d.relative_humidity_2m_max?.[i]; const hMin = d.relative_humidity_2m_min?.[i]
    if (hMax != null && hMin != null) m.humidities.push((hMax + hMin) / 2)
    const code = d.weather_code?.[i]
    if ((d.rain_sum?.[i] || 0) >= 0.10) m.rainDays++
    if ((d.snowfall_sum?.[i] || 0) >= 0.1) m.snowDays++
    if (code != null && [45, 48].includes(code as number)) m.fogDays++
    if (code != null && [95, 96, 99].includes(code as number)) m.thunderDays++
    const key = `${mIdx}_${year}`
    monthYearPrecip[key] = (monthYearPrecip[key] || 0) + ((d.precipitation_sum?.[i] as number) || 0)
  })

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const months: MonthData[] = md.map((m, i) => {
    const precipByYear = Object.entries(monthYearPrecip).filter(([k]) => k.startsWith(`${i}_`)).map(([, v]) => v)
    const yearsCount = precipByYear.length || 1
    return {
      month: MONTH_NAMES[i],
      avg_high_f: Math.round(avg(m.highs) * 10) / 10,
      avg_low_f: Math.round(avg(m.lows) * 10) / 10,
      avg_precip_inches: Math.round(avg(precipByYear) * 10) / 10,
      avg_rain_days: Math.round((m.rainDays / yearsCount) * 10) / 10,
      avg_snow_days: Math.round((m.snowDays / yearsCount) * 10) / 10,
      avg_fog_days: Math.round((m.fogDays / yearsCount) * 10) / 10,
      avg_thunderstorm_days: Math.round((m.thunderDays / yearsCount) * 10) / 10,
      avg_wind_speed_mph: Math.round(avg(m.windSpeeds) * 10) / 10,
      avg_wind_gust_mph: Math.round(avg(m.gusts) * 10) / 10,
      avg_humidity_pct: Math.round(avg(m.humidities)),
      avg_visibility_miles: 10,
      avg_daylight_hours: calcDaylightHours(lat, i),
    }
  })
  return { location: geo.displayName || location, data_period: '2015–2025 (11-year average)', sources: ['Open-Meteo ERA5 Historical Archive'], months }
}

function classifyMonth(m: MonthData): FlyData {
  const daysInMonth = [31,28,31,30,31,30,31,31,30,31,30,31]
  const idx = WX_MONTHS.indexOf(m.month?.slice(0, 3)) ?? 0
  const totalDays = daysInMonth[idx] || 30
  // Thunderstorm days are excluded from the classifier — Open-Meteo's daily
  // weather_code frequently reports 0 thunder days for lightning-heavy
  // regions, so leaving thunder in the equation just pulled the numbers
  // the wrong direction. Rain days are now used as-is (no thunder subtraction).
  const heavyRainNofly = m.avg_rain_days * 0.20
  const snowNofly = m.avg_snow_days * 0.80
  const windNoflyPct = m.avg_wind_speed_mph > 25 ? 0.40 : m.avg_wind_speed_mph > 22 ? 0.20 : m.avg_wind_speed_mph > 18 ? 0.08 : m.avg_wind_speed_mph > 14 ? 0.02 : m.avg_wind_speed_mph > 10 ? 0.005 : 0.001
  const windNofly = totalDays * windNoflyPct
  const fogNofly = m.avg_fog_days * 0.80
  const coldNofly = m.avg_low_f < 14 ? 6 : m.avg_low_f < 20 ? 3 : 0
  const heatNofly = m.avg_high_f > 113 ? 3 : m.avg_high_f > 104 ? 1 : 0
  const noflyDays = Math.min(Math.round(heavyRainNofly + snowNofly + windNofly + fogNofly + coldNofly + heatNofly), totalDays)
  const lightRainMarginal = m.avg_rain_days * 0.15
  const windMarginalPct = m.avg_wind_speed_mph > 22 ? 0.20 : m.avg_wind_speed_mph > 18 ? 0.10 : m.avg_wind_speed_mph > 14 ? 0.04 : m.avg_wind_speed_mph > 10 ? 0.01 : 0.003
  const windMarginal = totalDays * windMarginalPct
  const coldMarginal = m.avg_low_f >= 14 && m.avg_low_f < 32 ? Math.min(3, Math.round(m.avg_snow_days * 0.5) + 1) : 0
  const fogMarginal = m.avg_fog_days * 0.20
  const marginalDays = Math.min(Math.round(lightRainMarginal + windMarginal + coldMarginal + fogMarginal), totalDays - noflyDays)
  const flyable = Math.max(totalDays - noflyDays - marginalDays, 0)
  return { flyable, marginal: marginalDays, nofly: noflyDays }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WxBarChart({ data, dataKey, label, unit, color = '#e63946' }: { data: MonthData[]; dataKey: keyof MonthData; label: string; unit: string; color?: string }) {
  const values = data.map(d => (d[dataKey] as number) ?? 0)
  const mx = Math.max(...values, 1)
  return (
    <div style={{ background: 'rgba(30,30,34,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px' }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 90 }}>
        {values.map((v, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>{v < 10 ? v.toFixed(1) : Math.round(v)}</span>
            <div style={{ width: '100%', height: `${Math.max((v / mx) * 70, 2)}px`, background: `linear-gradient(180deg, ${color}, ${color}88)`, borderRadius: '3px 3px 0 0', transition: 'height 0.4s ease' }} />
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{WX_MONTHS[i]}</span>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 8, textAlign: 'right' }}>{unit}</div>
    </div>
  )
}

function WxFlyabilityChart({ flyData }: { flyData: FlyData[] }) {
  return (
    <div style={{ background: 'rgba(30,30,34,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px' }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14 }}>Estimated Flyable Days / Month</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 90 }}>
        {WX_MONTHS.map((m, i) => {
          const d = flyData[i] || { flyable: 0, marginal: 0, nofly: 0 }
          const total = d.flyable + d.marginal + d.nofly; const maxH = 70
          const fH = total > 0 ? (d.flyable / total) * maxH : 0
          const mH = total > 0 ? (d.marginal / total) * maxH : 0
          const nH = total > 0 ? (d.nofly / total) * maxH : 0
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>{d.flyable}</span>
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', borderRadius: '3px 3px 0 0', overflow: 'hidden' }}>
                <div style={{ height: nH, background: 'linear-gradient(180deg, #e74c3c, #c0392b88)' }} />
                <div style={{ height: mH, background: 'linear-gradient(180deg, #f39c12, #e67e2288)' }} />
                <div style={{ height: fH, background: 'linear-gradient(180deg, #2ecc71, #27ae6088)' }} />
              </div>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{m}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 10 }}>
        {[['#2ecc71','GO'],['#f39c12','MARGINAL'],['#e74c3c','NO-FLY']].map(([c,l]) => (
          <span key={l} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />{l}
          </span>
        ))}
      </div>
    </div>
  )
}

function WxTempRangeChart({ data }: { data: MonthData[] }) {
  const allTemps = data.flatMap(d => [d.avg_high_f, d.avg_low_f])
  const minT = Math.min(...allTemps) - 5; const maxT = Math.max(...allTemps) + 5; const range = maxT - minT || 1
  return (
    <div style={{ background: 'rgba(30,30,34,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px' }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14 }}>Temperature Range (°F)</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 100, position: 'relative' }}>
        {32 >= minT && 32 <= maxT && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${((32 - minT) / range) * 100}%`, height: 1, borderTop: '1px dashed rgba(52,152,219,0.4)', zIndex: 1 }}>
            <span style={{ position: 'absolute', right: 0, top: -14, fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: 'rgba(52,152,219,0.5)' }}>32°F</span>
          </div>
        )}
        {data.map((d, i) => {
          const bottom = ((d.avg_low_f - minT) / range) * 100; const top = ((d.avg_high_f - minT) / range) * 100; const h = top - bottom
          const avgT = (d.avg_high_f + d.avg_low_f) / 2; const hue = avgT < 32 ? 210 : avgT < 60 ? 50 : avgT < 85 ? 25 : 0
          const col = `hsl(${hue}, 70%, 55%)`
          return (
            <div key={i} style={{ flex: 1, position: 'relative', height: '100%' }}>
              <div style={{ position: 'absolute', bottom: `${bottom}%`, height: `${Math.max(h, 3)}%`, width: '100%', background: `linear-gradient(180deg, ${col}, ${col}66)`, borderRadius: 3 }} />
              <div style={{ position: 'absolute', bottom: -16, width: '100%', textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{WX_MONTHS[i]}</div>
              <div style={{ position: 'absolute', bottom: `${top + 1}%`, width: '100%', textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: 'rgba(255,255,255,0.45)' }}>{Math.round(d.avg_high_f)}°</div>
              <div style={{ position: 'absolute', bottom: `${Math.max(bottom - 8, -2)}%`, width: '100%', textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: 'rgba(255,255,255,0.35)' }}>{Math.round(d.avg_low_f)}°</div>
            </div>
          )
        })}
      </div>
      <div style={{ height: 18 }} />
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  project: ProjectFull
  onCacheUpdate: (data: unknown) => void
}

interface CachedWx {
  weatherData?: WeatherData
  flyData?: FlyData[]
  annualStats?: Record<string, number>
}

export default function WeatherIntel({ project, onCacheUpdate }: Props) {
  const cached: CachedWx = (() => {
    try { return project.weatherCache ? JSON.parse(project.weatherCache) : {} } catch { return {} }
  })()

  const [query, setQuery] = useState(project.site || '')
  const [loading, setLoading] = useState(false)
  const [loadMsg, setLoadMsg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [weatherData, setWeatherData] = useState<WeatherData | null>(cached.weatherData || null)
  const [flyData, setFlyData] = useState<FlyData[] | null>(cached.flyData || null)
  const [annualStats, setAnnualStats] = useState<Record<string, number> | null>(cached.annualStats || null)

  const handleSearch = useCallback(async (locationOverride?: string) => {
    const loc = (locationOverride || query).trim(); if (!loc) return
    setLoading(true); setError(null); setWeatherData(null); setFlyData(null); setAnnualStats(null)
    setLoadMsg('Querying weather data for ' + loc + '...')
    try {
      const result = await fetchWeatherFromOpenMeteo(loc, setLoadMsg)
      if (!result.months || result.months.length !== 12) throw new Error('Invalid data returned — expected 12 months of weather data.')
      setWeatherData(result)
      setLoadMsg('Calculating flyability metrics...')
      const fly = result.months.map(m => classifyMonth(m))
      setFlyData(fly)
      const ms = result.months
      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
      const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0)
      const totalFlyable = sum(fly.map(f => f.flyable)); const totalMarginal = sum(fly.map(f => f.marginal)); const totalNofly = sum(fly.map(f => f.nofly))
      const totalDays = totalFlyable + totalMarginal + totalNofly
      const bestIdx = fly.reduce((best, f, i) => f.flyable > fly[best].flyable ? i : best, 0)
      const stats = {
        avgTemp: Math.round(avg(ms.map(m => (m.avg_high_f + m.avg_low_f) / 2))),
        avgHigh: Math.round(avg(ms.map(m => m.avg_high_f))), avgLow: Math.round(avg(ms.map(m => m.avg_low_f))),
        totalPrecip: parseFloat(sum(ms.map(m => m.avg_precip_inches)).toFixed(1)),
        totalRainDays: Math.round(sum(ms.map(m => m.avg_rain_days))), totalSnowDays: Math.round(sum(ms.map(m => m.avg_snow_days))),
        totalFogDays: Math.round(sum(ms.map(m => m.avg_fog_days))), totalThunderDays: Math.round(sum(ms.map(m => m.avg_thunderstorm_days))),
        avgGust: parseFloat(avg(ms.map(m => m.avg_wind_speed_mph)).toFixed(1)),
        peakGust: Math.max(...ms.map(m => m.avg_wind_speed_mph)),
        avgHumidity: Math.round(avg(ms.map(m => m.avg_humidity_pct))),
        flyableDays: totalFlyable, flyablePct: totalDays > 0 ? (totalFlyable / totalDays * 100) : 0,
        marginalPct: totalDays > 0 ? (totalMarginal / totalDays * 100) : 0, noflyPct: totalDays > 0 ? (totalNofly / totalDays * 100) : 0,
        bestMonth: bestIdx, bestMonthFlyable: fly[bestIdx].flyable,
      }
      setAnnualStats(stats)
      onCacheUpdate({ weatherData: result, flyData: fly, annualStats: stats })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false); setLoadMsg('') }
  }, [query, onCacheUpdate])

  useEffect(() => {
    if (!cached.weatherData && project.site) handleSearch(project.site)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch() }

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #e63946, #a62633)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, letterSpacing: -1, color: '#fff' }}>WX</div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: 1, fontFamily: "'Chakra Petch', sans-serif" }}>DXD WEATHER INTEL</h2>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginTop: 2 }}>BVLOS DRONE OPS — CLIMATE ANALYSIS</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, background: 'rgba(30,30,34,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 6 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKey} placeholder="Enter city or address — e.g. Dallas, TX"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f1f1f1', fontFamily: "'Chakra Petch', sans-serif", fontSize: 15, padding: '10px 14px', letterSpacing: 0.5 }} />
        <button onClick={() => handleSearch()} disabled={loading}
          style={{ background: loading ? 'rgba(230,57,70,0.3)' : 'linear-gradient(135deg, #e63946, #c42d39)', border: 'none', borderRadius: 6, color: '#fff', fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 600, padding: '10px 24px', cursor: loading ? 'wait' : 'pointer', letterSpacing: 1, textTransform: 'uppercase' }}>
          {loading ? 'ANALYZING...' : 'ANALYZE'}
        </button>
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 32, paddingLeft: 4 }}>
        Open-Meteo ERA5 · 10-year historical averages · Flyability based on wind, temp, precip &amp; weather patterns
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ background: 'rgba(230,57,70,0.08)', border: '1px solid rgba(230,57,70,0.2)', borderRadius: 8, padding: '14px 18px', marginBottom: 24, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: '#e63946', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 16, height: 16, border: '2px solid #e63946', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />{loadMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 8, padding: '14px 18px', marginBottom: 24, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: '#e74c3c', wordBreak: 'break-word' }}>
          {error}
        </div>
      )}

      {/* Results */}
      {weatherData && flyData && annualStats && (
        <div style={{ animation: 'fadeSlideIn 0.5s ease' }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#e63946', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>Location Analysis</div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{weatherData.location}</h2>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
              📅 {weatherData.data_period}
            </div>
          </div>

          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Flyable Days/Yr', value: annualStats.flyableDays, unit: 'days', sub: annualStats.flyablePct.toFixed(0) + '% of year', color: '#2ecc71' },
              { label: 'Avg Wind Speed', value: annualStats.avgGust, unit: 'mph', sub: 'Peak month avg: ' + annualStats.peakGust + ' mph', color: '#3498db' },
              { label: 'Annual Precip', value: annualStats.totalPrecip, unit: 'in', sub: annualStats.totalRainDays + ' rain days', color: '#9b59b6' },
              { label: 'Avg Temp', value: annualStats.avgTemp, unit: '°F', sub: 'H: ' + annualStats.avgHigh + '° / L: ' + annualStats.avgLow + '°', color: '#e67e22' },
              { label: 'Thunderstorm Days', value: annualStats.totalThunderDays, unit: '/yr', sub: 'Lightning = auto ground', color: '#e74c3c' },
              { label: 'Fog Days', value: annualStats.totalFogDays, unit: '/yr', sub: 'Visibility risk', color: '#95a5a6' },
              { label: 'Avg Humidity', value: annualStats.avgHumidity, unit: '%', sub: 'Sensor/lens condensation', color: '#16a085' },
              { label: 'Best Month', value: WX_MONTHS[annualStats.bestMonth], unit: '', sub: annualStats.bestMonthFlyable + ' flyable days', color: '#2ecc71' },
            ].map(card => (
              <div key={card.label} style={{ background: 'linear-gradient(135deg, rgba(30,30,34,0.95), rgba(22,22,26,0.98))', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${card.color}, transparent)` }} />
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>{card.label}</div>
                <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 28, fontWeight: 700, color: '#f1f1f1', lineHeight: 1 }}>
                  {card.value}<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', marginLeft: 4 }}>{card.unit}</span>
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>{card.sub}</div>
              </div>
            ))}
          </div>

          {/* Flyability bar */}
          <div style={{ background: 'rgba(30,30,34,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px', marginBottom: 24 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>Annual Flyability Index</div>
            <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', marginBottom: 6 }}>
              <div style={{ width: `${annualStats.flyablePct.toFixed(0)}%`, background: 'linear-gradient(90deg, #2ecc71, #27ae60)', transition: 'width 0.6s' }} />
              <div style={{ width: `${annualStats.marginalPct.toFixed(0)}%`, background: 'linear-gradient(90deg, #f39c12, #e67e22)', transition: 'width 0.6s' }} />
              <div style={{ width: `${annualStats.noflyPct.toFixed(0)}%`, background: 'linear-gradient(90deg, #e74c3c, #c0392b)', transition: 'width 0.6s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
              <span><span style={{ color: '#2ecc71', fontSize: 8 }}>■</span> GO {annualStats.flyablePct.toFixed(0)}%</span>
              <span><span style={{ color: '#f39c12', fontSize: 8 }}>■</span> MARGINAL {annualStats.marginalPct.toFixed(0)}%</span>
              <span><span style={{ color: '#e74c3c', fontSize: 8 }}>■</span> NO-FLY {annualStats.noflyPct.toFixed(0)}%</span>
            </div>
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <WxFlyabilityChart flyData={flyData} />
            <WxTempRangeChart data={weatherData.months} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <WxBarChart data={weatherData.months} dataKey="avg_wind_speed_mph" label="Avg Wind Speed (mph)" unit="mph" color="#3498db" />
            <WxBarChart data={weatherData.months} dataKey="avg_precip_inches" label="Precipitation (in)" unit="inches" color="#9b59b6" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <WxBarChart data={weatherData.months} dataKey="avg_humidity_pct" label="Humidity (%)" unit="%" color="#16a085" />
            <WxBarChart data={weatherData.months} dataKey="avg_daylight_hours" label="Daylight Hours" unit="hrs" color="#f39c12" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            <WxBarChart data={weatherData.months} dataKey="avg_rain_days" label="Rain Days / Month" unit="days" color="#2980b9" />
            <WxBarChart data={weatherData.months} dataKey="avg_thunderstorm_days" label="Thunderstorm Days / Month" unit="days" color="#e74c3c" />
          </div>

          {/* Table */}
          <div style={{ background: 'rgba(30,30,34,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5 }}>Monthly Breakdown</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['Month','High °F','Low °F','Wind mph','Rain Days','Snow','Thunder','Fog','Precip in','Humidity','Daylight','GO','MARG','NO-FLY'].map(h => (
                      <th key={h} style={{ padding: '10px 6px', textAlign: 'right', color: 'rgba(255,255,255,0.35)', fontWeight: 500, fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weatherData.months.map((m, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px 6px', color: '#f1f1f1', fontWeight: 600, textAlign: 'left' }}>{WX_MONTHS[i]}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: m.avg_high_f > 104 ? '#e74c3c' : 'rgba(255,255,255,0.6)' }}>{Math.round(m.avg_high_f)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: m.avg_low_f < 32 ? '#3498db' : 'rgba(255,255,255,0.6)' }}>{Math.round(m.avg_low_f)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: m.avg_wind_speed_mph > 25 ? '#e67e22' : 'rgba(255,255,255,0.6)' }}>{Math.round(m.avg_wind_speed_mph)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>{m.avg_rain_days}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: m.avg_snow_days > 0 ? '#3498db' : 'rgba(255,255,255,0.3)' }}>{m.avg_snow_days}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: m.avg_thunderstorm_days > 2 ? '#e74c3c' : 'rgba(255,255,255,0.6)' }}>{m.avg_thunderstorm_days}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>{m.avg_fog_days}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>{m.avg_precip_inches.toFixed(1)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: m.avg_humidity_pct > 80 ? '#16a085' : 'rgba(255,255,255,0.6)' }}>{m.avg_humidity_pct}%</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>{m.avg_daylight_hours.toFixed(1)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#2ecc71', fontWeight: 600 }}>{flyData[i].flyable}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#f39c12' }}>{flyData[i].marginal}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#e74c3c' }}>{flyData[i].nofly}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div style={{ background: 'rgba(30,30,34,0.5)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8, padding: '16px 18px' }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>Flyability Classification Criteria</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
              <div><div style={{ color: '#2ecc71', fontWeight: 600, marginBottom: 6 }}>GO — FLYABLE</div><div style={{ color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>Gusts &lt; 25 mph<br />Temp 32–104°F<br />No fog/storms</div></div>
              <div><div style={{ color: '#f39c12', fontWeight: 600, marginBottom: 6 }}>MARGINAL</div><div style={{ color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>Gusts 25–35 mph<br />Temp 14–32°F or 104°F+<br />Fog / low vis</div></div>
              <div><div style={{ color: '#e74c3c', fontWeight: 600, marginBottom: 6 }}>NO-FLY</div><div style={{ color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>Gusts &gt; 35 mph<br />Temp &lt; 14°F or &gt; 113°F<br />Heavy snow / fog</div></div>
            </div>
          </div>
        </div>
      )}

      {!weatherData && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'rgba(255,255,255,0.2)' }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>WX</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>AWAITING TARGET LOCATION</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>Enter a deployment city to generate BVLOS weather intelligence</div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  )
}
