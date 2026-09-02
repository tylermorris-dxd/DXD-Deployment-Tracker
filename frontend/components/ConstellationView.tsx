'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ProjectSummary, HubSpotActiveDeal } from '@/lib/types'

// Orbital constellation. Every client is a star at the center of its own
// solar system; every deal for that client is a planet orbiting it. Orbital
// radius is determined by pipeline stage (early = wide orbit, late = close
// to the sun). Planet size is scaled by HubSpot deal amount. Angular speed
// varies by orbit so planets don't line up in lockstep.
//
// The whole galaxy also rotates slowly in the background, and each solar
// system is placed on a golden-angle spiral so they don't collide.
//
// Pure SVG + a single 60fps RAF loop for all rotational motion. No libs,
// no WebGL — just math and transforms.

interface Props { onOpenDeal: (id: string) => void }

interface Planet {
  id: string
  projectId: string
  label: string
  color: string
  size: number
  orbitR: number       // px from parent star
  period: number       // seconds for one revolution
  phase: number        // radians, initial angular offset
  dealstage?: string
  amount?: number
  glow: boolean
}

interface Star {
  id: string
  label: string
  cx: number
  cy: number
  size: number
  planets: Planet[]
  systemR: number      // radius of the outermost orbit
}

// Rough pipeline stage → orbital ring index. Larger = further from star
// (younger stage). We use a 5-ring system.
function stageToRing(stage: string | undefined): number {
  const s = (stage || '').toLowerCase()
  if (!s) return 3
  if (s.includes('closedwon') || s.includes('closed won')) return 0
  if (s.includes('contract') || s.includes('signed'))       return 1
  if (s.includes('proposal') || s.includes('demo') || s.includes('presentation')) return 2
  if (s.includes('qualif') || s.includes('discovery'))      return 3
  return 4
}

function buildGalaxy(projects: ProjectSummary[], dealMap: Map<string, HubSpotActiveDeal>): Star[] {
  const clients = new Map<string, ProjectSummary[]>()
  for (const p of projects) {
    const name = (p.client || '').trim() || '—'
    if (!clients.has(name)) clients.set(name, [])
    clients.get(name)!.push(p)
  }

  const stars: Star[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  const list = Array.from(clients.entries())

  list.forEach(([name, deals], i) => {
    // Golden-angle spiral for star placement — packs many systems without
    // collision. Scale by deal count so a busy client claims more room.
    const spread = 220
    const r = Math.sqrt(i + 1) * spread
    const t = i * golden
    const cx = r * Math.cos(t)
    const cy = r * Math.sin(t)

    const planets: Planet[] = deals.map(p => {
      const hs = dealMap.get(p.id)
      const amt = hs?.deal.properties.amount ? Number(hs.deal.properties.amount) : undefined
      const size = amt && amt > 0
        ? Math.max(5, Math.min(14, Math.sqrt(amt) / 32))
        : 5.5
      const color = p.steadyState ? '#3FB95A' : p.faaAuthorizationRequired ? '#f59e0b' : '#D2232A'
      const ring = stageToRing(hs?.deal.properties.dealstage)
      const orbitR = 50 + ring * 22 + Math.random() * 6
      // Period lengths spaced by orbit — closer = faster, feels planetary.
      const period = 32 + orbitR * 0.55 + Math.random() * 8
      // Fixed initial phase per project (hash id → stable) so refreshes
      // don't scramble the arrangement.
      const seed = [...p.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 2166136261)
      const phase = (seed % 6283) / 1000
      return {
        id: `pl:${p.id}`,
        projectId: p.id,
        label: p.name,
        color, size,
        orbitR, period, phase,
        dealstage: hs?.deal.properties.dealstage,
        amount: amt,
        glow: !!p.steadyState || p.faaAuthorizationRequired,
      }
    })

    const systemR = planets.reduce((m, pl) => Math.max(m, pl.orbitR), 60) + 12
    const starSize = 10 + Math.min(18, deals.length * 2.2)

    stars.push({
      id: `st:${name}`,
      label: name,
      cx, cy, size: starSize,
      planets, systemR,
    })
  })

  return stars
}

// Precise orbital position for a planet at a given time.
function planetPos(star: Star, planet: Planet, t: number, speed: number): { x: number; y: number } {
  const angle = planet.phase + (t * speed * 2 * Math.PI) / (planet.period * 1000)
  return {
    x: star.cx + Math.cos(angle) * planet.orbitR,
    y: star.cy + Math.sin(angle) * planet.orbitR,
  }
}

export default function ConstellationView({ onOpenDeal }: Props) {
  const rafRef = useRef<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(0.85)
  const [speed, setSpeed] = useState(1)
  const [nowMs, setNowMs] = useState(0)
  const [hover, setHover] = useState<Planet | null>(null)
  const startTimeRef = useRef(Date.now())
  const panRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => api.projects.list(), staleTime: 30_000 })
  const { data: activeDeals = [] } = useQuery({ queryKey: ['hs-active'], queryFn: () => api.hubspot.getActive(), staleTime: 60_000, retry: false })
  const dealMap = useMemo(
    () => new Map<string, HubSpotActiveDeal>(activeDeals.map(a => [a.projectId, a])),
    [activeDeals],
  )
  const stars = useMemo(() => buildGalaxy(projects, dealMap), [projects, dealMap])

  // Fit the whole galaxy on first paint.
  useEffect(() => {
    if (stars.length === 0) return
    const maxR = Math.max(...stars.map(s => Math.sqrt(s.cx * s.cx + s.cy * s.cy) + s.systemR))
    const target = 380 / (maxR + 80)
    setZoom(Math.max(0.3, Math.min(1.4, target)))
    setPan({ x: 0, y: 0 })
    startTimeRef.current = Date.now()
  }, [stars])

  // The animation loop — updates a single `nowMs` value that everything
  // else reads from. Cheap because we're not touching React for each
  // planet — just once per frame.
  useEffect(() => {
    const step = () => {
      setNowMs(Date.now() - startTimeRef.current)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  const startPan = (e: React.MouseEvent) => {
    if ((e.target as Element).tagName === 'BUTTON' || (e.target as Element).tagName === 'INPUT') return
    panRef.current = { startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y }
  }
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!panRef.current) return
      setPan({ x: panRef.current.startPanX + (e.clientX - panRef.current.startX), y: panRef.current.startPanY + (e.clientY - panRef.current.startY) })
    }
    const onUp = () => { panRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = -Math.sign(e.deltaY) * 0.12
    setZoom(z => Math.max(0.25, Math.min(3, z + delta)))
  }

  // Galaxy-wide slow rotation for cinematic effect.
  const galaxyAngle = (nowMs * speed) / 60000 // one revolution / minute at 1×

  return (
    <div style={{ position: 'relative', height: 'calc(var(--dxd-vh, 100vh) - 100px)', background: 'radial-gradient(ellipse at center, #0a0e1a 0%, #050608 100%)', border: '1px solid #252b38', borderRadius: 10, overflow: 'hidden' }}>
      <style>{`
        @keyframes dxd-twinkle { 0%,100% { opacity: 0.15 } 50% { opacity: 0.65 } }
        @keyframes dxd-solar   { 0%,100% { transform: scale(1); opacity: 0.5 } 50% { transform: scale(1.15); opacity: 0.9 } }
      `}</style>

      <StarField />

      <svg
        ref={svgRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: panRef.current ? 'grabbing' : 'grab', touchAction: 'none' }}
        viewBox="-600 -400 1200 800"
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={startPan}
        onWheel={onWheel}
      >
        {/* Galaxy transform — pan + zoom + slow rotation */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom}) rotate(${galaxyAngle * 6})`}>
          {stars.map(star => (
            <g key={star.id}>
              {/* Orbital rings (one per unique orbit for this system) */}
              {Array.from(new Set(star.planets.map(p => Math.round(p.orbitR)))).map((r, i) => (
                <circle
                  key={i}
                  cx={star.cx} cy={star.cy} r={r}
                  fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={0.6}
                  strokeDasharray="2 4"
                />
              ))}
              {/* Star (client) — halo + core */}
              <circle
                cx={star.cx} cy={star.cy} r={star.size * 2.4}
                fill="url(#dxd-star-glow)"
                style={{ animation: 'dxd-solar 4s ease-in-out infinite' }}
              />
              <circle cx={star.cx} cy={star.cy} r={star.size} fill="#f8d94a" stroke="rgba(255,255,255,0.4)" strokeWidth={1.2}
                style={{ filter: 'drop-shadow(0 0 8px rgba(248,217,74,0.6))' }} />
              {/* Star label */}
              <text
                x={star.cx} y={star.cy - star.size - 8} textAnchor="middle"
                fill="rgba(255,255,255,0.75)"
                fontFamily="'Chakra Petch', sans-serif" fontWeight={700} fontSize={11} letterSpacing={0.8}
                style={{ pointerEvents: 'none' }}
              >
                {star.label.length > 26 ? star.label.slice(0, 25) + '…' : star.label}
              </text>
              {/* Planets */}
              {star.planets.map(p => {
                const { x, y } = planetPos(star, p, nowMs, speed)
                return (
                  <g
                    key={p.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onOpenDeal(p.projectId)}
                    onMouseEnter={() => setHover(p)}
                    onMouseLeave={() => setHover(cur => cur?.id === p.id ? null : cur)}
                  >
                    {/* Trail — short arc trailing the planet */}
                    <circle cx={x} cy={y} r={p.size * 2.5} fill={p.color} opacity="0.10" style={{ pointerEvents: 'none' }} />
                    <circle cx={x} cy={y} r={p.size} fill={p.color}
                      stroke={p.glow ? `${p.color}` : 'rgba(255,255,255,0.35)'}
                      strokeWidth={1.4}
                      style={{ filter: `drop-shadow(0 0 5px ${p.color}88)` }}
                    />
                  </g>
                )
              })}
            </g>
          ))}
        </g>

        <defs>
          <radialGradient id="dxd-star-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(248,217,74,0.55)" />
            <stop offset="60%" stopColor="rgba(248,217,74,0.10)" />
            <stop offset="100%" stopColor="rgba(248,217,74,0)" />
          </radialGradient>
        </defs>
      </svg>

      {/* Header + legend */}
      <div style={{
        position: 'absolute', top: 14, left: 14, zIndex: 3,
        background: 'rgba(10,11,13,0.85)', border: '1px solid #252b38', borderRadius: 8,
        padding: '10px 14px', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      }}>
        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 11, color: '#e8eaf0', letterSpacing: 2, marginBottom: 8 }}>
          FLEET SOLAR SYSTEMS
        </div>
        <Legend color="#f8d94a" label="Client (star)" />
        <Legend color="#D2232A" label="Active deal (planet)" />
        <Legend color="#f59e0b" label="FAA pending" />
        <Legend color="#3FB95A" label="Steady state" />
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #252b38', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380', lineHeight: 1.5 }}>
          orbit radius = pipeline stage<br/>
          planet size = HubSpot amount<br/>
          drag to pan · scroll to zoom
        </div>
      </div>

      {/* Zoom + speed controls */}
      <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 3, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} style={ctrlBtnSt}>＋</button>
          <button onClick={() => setZoom(z => Math.max(0.25, z - 0.2))} style={ctrlBtnSt}>−</button>
          <button onClick={() => { setZoom(0.85); setPan({ x: 0, y: 0 }) }} style={ctrlBtnSt}>⌾</button>
        </div>
        <div style={{ background: 'rgba(10,11,13,0.85)', border: '1px solid #252b38', borderRadius: 6, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#9aa3b8', letterSpacing: 1 }}>SPEED</span>
          <input
            type="range" min={0} max={5} step={0.25} value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            style={{ width: 100, accentColor: '#D2232A' }}
          />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#e8eaf0', minWidth: 32, textAlign: 'right' as const }}>
            {speed.toFixed(2)}×
          </span>
        </div>
      </div>

      {/* Hover card */}
      {hover && (
        <div style={{
          position: 'absolute', bottom: 14, left: 14, zIndex: 3,
          background: 'rgba(10,11,13,0.9)', border: `1px solid ${hover.color}44`, borderRadius: 8,
          padding: '10px 14px', maxWidth: 320,
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        }}>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 13, color: '#e8eaf0' }}>
            {hover.label}
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#9aa3b8', marginTop: 3 }}>
            {hover.dealstage ? `stage: ${hover.dealstage}` : '—'}
          </div>
          {hover.amount != null && (
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: hover.color, marginTop: 2 }}>
              ${Math.round(hover.amount).toLocaleString()}
            </div>
          )}
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380', marginTop: 4 }}>
            click to open deal
          </div>
        </div>
      )}

      {projects.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#5a6380',
        }}>
          Empty universe. Create a deal to spawn the first star.
        </div>
      )}
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#9aa3b8' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}88` }} />
      <span>{label}</span>
    </div>
  )
}

const ctrlBtnSt: React.CSSProperties = {
  width: 32, height: 32, background: 'rgba(10,11,13,0.85)',
  border: '1px solid #252b38', borderRadius: 6, color: '#9aa3b8', cursor: 'pointer',
  fontSize: 14, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  backdropFilter: 'blur(10px)',
}

function StarField() {
  const stars = useMemo(() => {
    const arr: Array<{ x: number; y: number; s: number; d: number }> = []
    for (let i = 0; i < 90; i++) {
      arr.push({ x: Math.random() * 100, y: Math.random() * 100, s: 0.6 + Math.random() * 1.4, d: Math.random() * 4 })
    }
    return arr
  }, [])
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      {stars.map((s, i) => (
        <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.s} fill="#e8eaf0"
          style={{ animation: `dxd-twinkle ${2 + s.d}s ease-in-out infinite`, animationDelay: `${s.d}s`, opacity: 0.4 }} />
      ))}
    </svg>
  )
}
