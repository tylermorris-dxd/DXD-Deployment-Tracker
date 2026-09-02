'use client'

import React, { useEffect, useState } from 'react'

// Nearest active TFR + clear-to-fly countdown panel. Sits on top of the
// Airspace tab whenever we have coordinates. Fetches from the backend
// /api/tfr proxy so the FAA feed's missing CORS headers don't block us.
//
// The countdown ticks live and rolls the color of the banner:
//   green      — no TFRs in a 100nm ring, "CLEAR TO FLY"
//   amber      — TFR active nearby, but expires within 24h
//   red        — TFR active nearby, no imminent expiration
//   blue       — TFR is in the future but on our horizon (48h out)

interface Tfr {
  notam_id:        string
  description:     string
  effective_start: string | null
  effective_end:   string | null
  lat:             number | null
  lng:             number | null
  radius_nm:       number | null
  distance_nm:     number | null
  source_url:      string | null
}

interface Props {
  lat: number
  lng: number
}

function parseDate(s: string | null): number | null {
  if (!s) return null
  const t = Date.parse(s)
  return isNaN(t) ? null : t
}

function fmtDuration(ms: number): string {
  if (ms <= 0) return '00:00:00'
  const sec = Math.floor(ms / 1000)
  const days = Math.floor(sec / 86400)
  const hrs  = Math.floor((sec % 86400) / 3600)
  const mins = Math.floor((sec % 3600) / 60)
  const s    = sec % 60
  if (days > 0) return `${days}d ${String(hrs).padStart(2,'0')}h ${String(mins).padStart(2,'0')}m`
  return `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

export default function TfrPanel({ lat, lng }: Props) {
  const [tfrs, setTfrs] = useState<Tfr[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  // Load TFRs when coords change, refresh every 5 minutes.
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setTfrs(null)
    const load = async () => {
      try {
        const res = await fetch(`/api/tfr?lat=${lat}&lng=${lng}&radius_nm=100`)
        if (!res.ok) throw new Error(`TFR proxy ${res.status}`)
        const data: Tfr[] = await res.json()
        if (!cancelled) setTfrs(data)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const iv = setInterval(load, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [lat, lng])

  // Live countdown tick.
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(iv)
  }, [])

  // Classify: nearest currently-active TFR, or nearest imminent one.
  const now = Date.now()
  let verdict: { tone: 'clear' | 'imminent' | 'amber' | 'red'; tfr: Tfr | null; ms: number | null } = {
    tone: 'clear', tfr: null, ms: null,
  }
  if (tfrs && tfrs.length > 0) {
    // Prefer TFRs currently active. Within those, closest expiration wins so
    // the countdown says "back to normal in…". If none are active, take the
    // nearest starting soon.
    const active = tfrs.filter(t => {
      const s = parseDate(t.effective_start), e = parseDate(t.effective_end)
      return (s == null || s <= now) && (e == null || e > now)
    })
    if (active.length > 0) {
      const best = active.reduce((b, t) => {
        const e = parseDate(t.effective_end)
        if (e == null) return b
        const be = b.end == null ? Infinity : b.end
        return e < be ? { t, end: e } : b
      }, { t: active[0], end: parseDate(active[0].effective_end) })
      const remaining = best.end == null ? null : best.end - now
      const tone: 'amber' | 'red' = remaining != null && remaining <= 86_400_000 ? 'amber' : 'red'
      verdict = { tone, tfr: best.t, ms: remaining }
    } else {
      // TFRs on the horizon.
      const upcoming = tfrs
        .map(t => ({ t, s: parseDate(t.effective_start) }))
        .filter(x => x.s != null && x.s > now && x.s - now < 48 * 60 * 60 * 1000)
        .sort((a, b) => (a.s! - b.s!))
      if (upcoming.length > 0) {
        verdict = { tone: 'imminent', tfr: upcoming[0].t, ms: upcoming[0].s! - now }
      }
    }
  }

  const palette = (() => {
    switch (verdict.tone) {
      case 'clear':    return { fg: '#3FB95A', bg: 'rgba(63,185,90,0.10)',  border: 'rgba(63,185,90,0.35)', label: 'CLEAR TO FLY' }
      case 'imminent': return { fg: '#3b82f6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.35)', label: 'TFR IMMINENT' }
      case 'amber':    return { fg: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.40)', label: 'TFR ACTIVE · CLEARS SOON' }
      case 'red':      return { fg: '#D2232A', bg: 'rgba(210,35,42,0.10)',  border: 'rgba(210,35,42,0.40)', label: 'TFR ACTIVE · NO FLY' }
    }
  })()

  return (
    <div style={{
      background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: 8,
      padding: '14px 18px', marginBottom: 20, position: 'relative', overflow: 'hidden',
    }}>
      {/* Pulse bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${palette.fg}, transparent)` }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%', background: palette.fg,
            boxShadow: `0 0 10px ${palette.fg}88`,
            animation: verdict.tone === 'red' ? 'dxd-tfr-blink 1.1s steps(2) infinite' : 'none',
          }} />
          <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: 2, color: palette.fg }}>
            {palette.label}
          </span>
        </div>
        {verdict.ms != null && verdict.ms > 0 && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>
              {verdict.tone === 'imminent' ? 'BEGINS IN' : 'CLEARS IN'}
            </span>
            <span key={tick} style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: 1, color: palette.fg }}>
              {fmtDuration(verdict.ms)}
            </span>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1 }}>
          {loading ? 'SCANNING…' : `${tfrs?.length ?? 0} TFR${tfrs?.length === 1 ? '' : 's'} in 100nm`}
        </span>
      </div>

      {/* Details for the active/upcoming TFR */}
      {verdict.tfr && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${palette.border}`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: palette.fg, fontWeight: 700 }}>NOTAM {verdict.tfr.notam_id}</span>
            {verdict.tfr.distance_nm != null && (
              <span>{verdict.tfr.distance_nm.toFixed(1)} nm away</span>
            )}
            {verdict.tfr.radius_nm != null && (
              <span>radius {verdict.tfr.radius_nm.toFixed(0)} nm</span>
            )}
            {verdict.tfr.effective_end && (
              <span>ends {new Date(verdict.tfr.effective_end).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}Z</span>
            )}
          </div>
          <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
            {verdict.tfr.description}
          </div>
          {verdict.tfr.source_url && (
            <a href={verdict.tfr.source_url} target="_blank" rel="noreferrer"
               style={{ display: 'inline-block', marginTop: 6, fontSize: 10, color: palette.fg, textDecoration: 'none', letterSpacing: 0.5 }}>
              Open FAA record ↗
            </a>
          )}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 8, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#f59e0b' }}>
          Live TFR feed unavailable ({error}). Treat as advisory only.
        </div>
      )}

      <style>{`@keyframes dxd-tfr-blink { 50% { opacity: 0.3 } }`}</style>
    </div>
  )
}
