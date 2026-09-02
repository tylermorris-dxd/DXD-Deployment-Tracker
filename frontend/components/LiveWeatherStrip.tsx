'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ProjectSummary } from '@/lib/types'
import { geocodeAddress } from '@/lib/geocode'

// Live weather condition strip — one tile per deployed site, currently at
// each site: temperature, wind, and a condition glyph (☀ / ⛅ / 🌧 / ⚡ / ❄).
// Scrolls left continuously so bad weather visibly "rolls across the fleet".

interface Site { projectId: string; name: string; lat: number; lng: number; steadyState: boolean; faa: boolean }
interface Wx   { temp: number; wind: number; code: number }

const CACHE_KEY = 'dxd-fleet-geocode-v1'
type GeoCache = Record<string, { lat: number; lng: number } | null>
function loadGeoCache(): GeoCache {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}

// Open-Meteo WMO weather codes → condition family. Same interpretation the
// WeatherIntel tab uses — kept intentionally coarse so the strip reads at
// a glance instead of demanding attention.
function condition(code: number): { glyph: string; label: string; color: string } {
  if (code >= 95)           return { glyph: '⚡', label: 'Storms',  color: '#D2232A' }
  if (code >= 71 && code <= 77) return { glyph: '❄', label: 'Snow',   color: '#3b82f6' }
  if (code >= 51 && code <= 67) return { glyph: '🌧', label: 'Rain',   color: '#3b82f6' }
  if (code >= 45 && code <= 48) return { glyph: '🌫', label: 'Fog',    color: '#9aa3b8' }
  if (code >= 2  && code <= 3)  return { glyph: '⛅', label: 'Cloudy', color: '#9aa3b8' }
  return                                { glyph: '☀', label: 'Clear',  color: '#f59e0b' }
}

function stateColor(s: Site) {
  return s.steadyState ? '#3FB95A' : s.faa ? '#f59e0b' : '#D2232A'
}

export default function LiveWeatherStrip() {
  const [sites, setSites] = useState<Site[]>([])
  const [wx, setWx] = useState<Record<string, Wx>>({})
  const [loading, setLoading] = useState(true)

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects.list(),
    staleTime: 30_000,
  })

  // Resolve every project's site to lat/lng via the shared geocode cache.
  useEffect(() => {
    let cancelled = false
    if (projects.length === 0) { setSites([]); setLoading(false); return }
    const cache = loadGeoCache()
    ;(async () => {
      const out: Site[] = []
      for (const p of projects) {
        const site = (p.site || '').trim()
        if (!site) continue
        let ll: { lat: number; lng: number } | null = site in cache ? cache[site] : null
        if (!(site in cache)) {
          const r = await geocodeAddress(site)
          ll = r ? { lat: r.lat, lng: r.lng } : null
          cache[site] = ll
          try { if (typeof window !== 'undefined') localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch { /* quota */ }
        }
        if (cancelled) return
        if (!ll) continue
        out.push({ projectId: p.id, name: p.name, lat: ll.lat, lng: ll.lng, steadyState: p.steadyState, faa: p.faaAuthorizationRequired })
      }
      if (!cancelled) setSites(out)
    })()
    return () => { cancelled = true }
  }, [projects])

  // Batch current weather for every site. Refresh every 15 minutes.
  useEffect(() => {
    if (sites.length === 0) { setWx({}); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    async function pull() {
      const results: Record<string, Wx> = {}
      const q = sites.slice()
      const runOne = async (s: Site) => {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${s.lat.toFixed(4)}&longitude=${s.lng.toFixed(4)}` +
                    `&current=temperature_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC`
        try {
          const r = await fetch(url)
          if (!r.ok) return
          const d = await r.json()
          const c = d?.current
          if (typeof c?.temperature_2m === 'number' && typeof c?.wind_speed_10m === 'number' && typeof c?.weather_code === 'number') {
            results[s.projectId] = { temp: c.temperature_2m, wind: c.wind_speed_10m, code: c.weather_code }
          }
        } catch { /* swallow */ }
      }
      const workers = new Array(Math.min(6, q.length)).fill(0).map(async () => {
        while (q.length && !cancelled) { const s = q.shift()!; await runOne(s) }
      })
      await Promise.all(workers)
      if (!cancelled) { setWx(results); setLoading(false) }
    }
    pull()
    const iv = setInterval(pull, 15 * 60 * 1000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [sites])

  const tiles = useMemo(() => sites.filter(s => wx[s.projectId]), [sites, wx])

  if (sites.length === 0) return null

  // Duplicate the tiles so the marquee loops seamlessly.
  const looped = tiles.length > 0 ? [...tiles, ...tiles] : []

  return (
    <div style={{
      background: 'linear-gradient(90deg, rgba(6,7,10,0.85), rgba(6,7,10,0.6) 30%, rgba(6,7,10,0.6) 70%, rgba(6,7,10,0.85))',
      border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
      padding: '10px 0', marginBottom: 22, overflow: 'hidden', position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: 8, left: 14, zIndex: 3,
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(6,7,10,0.9)', padding: '3px 10px', borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3FB95A', boxShadow: '0 0 8px #3FB95A88', animation: 'pulse 1.6s ease-in-out infinite' }} />
        <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: 2, color: '#e8eaf0' }}>
          LIVE FLEET WEATHER
        </span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380' }}>
          {loading ? 'scanning…' : `${tiles.length} sites`}
        </span>
      </div>
      <style>{`@keyframes dxd-wxmarquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
      {tiles.length === 0 ? (
        <div style={{ padding: '16px 14px 4px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#5a6380' }}>
          {loading ? 'Acquiring current weather at each site…' : 'No conditions available yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, whiteSpace: 'nowrap' as const, width: 'fit-content', paddingTop: 24, animation: `dxd-wxmarquee ${Math.max(30, tiles.length * 6)}s linear infinite` }}>
          {looped.map((s, i) => {
            const w = wx[s.projectId]!
            const cond = condition(w.code)
            const stColor = stateColor(s)
            const gust = w.wind > 25 ? '#D2232A' : w.wind > 15 ? '#f59e0b' : '#3FB95A'
            return (
              <div key={`${s.projectId}-${i}`} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(17,19,24,0.6)', border: `1px solid rgba(255,255,255,0.06)`,
                borderLeft: `3px solid ${stColor}`,
                padding: '8px 14px', borderRadius: 8, flexShrink: 0,
                fontFamily: "'IBM Plex Mono', monospace",
              }}>
                <span style={{ fontSize: 20, lineHeight: 1 }}>{cond.glyph}</span>
                <div style={{ display: 'flex', flexDirection: 'column' as const }}>
                  <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 11, color: '#e8eaf0', letterSpacing: 0.3 }}>
                    {s.name.length > 26 ? s.name.slice(0, 25) + '…' : s.name}
                  </span>
                  <span style={{ fontSize: 10, color: '#9aa3b8', marginTop: 1 }}>
                    <span style={{ color: '#e8eaf0', fontWeight: 700 }}>{Math.round(w.temp)}°F</span>
                    <span style={{ color: '#5a6380' }}> · </span>
                    <span style={{ color: gust }}>{Math.round(w.wind)} mph</span>
                    <span style={{ color: '#5a6380' }}> · </span>
                    <span style={{ color: cond.color }}>{cond.label}</span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
