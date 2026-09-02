'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ProjectSummary, HubSpotActiveDeal } from '@/lib/types'
import { useIsMobile } from '@/lib/useIsMobile'

// A force-directed constellation of the fleet: every deal is a node,
// clients are their own nodes, and each deal links to its client. Nodes
// attract along edges and repel each other, so the resulting picture
// clusters organically — clients with multiple deals become bright
// nuclei, one-off deals drift into their own orbits.
//
// The whole simulation is hand-rolled in SVG (no d3, no cytoscape) and
// runs a fixed 220-iteration cooling loop once whenever the graph
// changes. That's fast enough for hundreds of nodes and dead simple to
// reason about. Drag a node to reposition it; the physics resettles.

interface Props { onOpenDeal: (id: string) => void }

interface Node {
  id: string
  kind: 'client' | 'deal'
  label: string
  x: number
  y: number
  vx: number
  vy: number
  fixed: boolean         // true when the user is dragging or has pinned it
  color: string
  size: number           // in px radius
  projectId?: string
  clientId?: string
  amount?: number
  dealstage?: string
}

interface Edge { from: string; to: string }

const REPEL   = 6000    // strength of pairwise repulsion
const SPRING  = 0.015   // stiffness of edges
const CENTER  = 0.006   // pull toward origin
const DAMPING = 0.72    // per-tick velocity decay
const ITERATIONS = 220

// One-shot cooling simulation. Runs synchronously on mount + whenever the
// graph structure changes. Small graphs finish in <20ms.
function simulate(nodes: Node[], edges: Edge[]): void {
  const nodesById = new Map(nodes.map(n => [n.id, n]))
  const edgesResolved = edges
    .map(e => ({ a: nodesById.get(e.from), b: nodesById.get(e.to) }))
    .filter((e): e is { a: Node; b: Node } => !!e.a && !!e.b)

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Repulsion — O(N²) is fine at fleet scale.
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const dsq = dx * dx + dy * dy + 30
        const force = REPEL / dsq
        const dist = Math.sqrt(dsq)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        if (!a.fixed) { a.vx += fx; a.vy += fy }
        if (!b.fixed) { b.vx -= fx; b.vy -= fy }
      }
    }
    // Edge springs.
    for (const { a, b } of edgesResolved) {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
      const displacement = dist - 90  // preferred edge length
      const fx = (dx / dist) * displacement * SPRING
      const fy = (dy / dist) * displacement * SPRING
      if (!a.fixed) { a.vx += fx; a.vy += fy }
      if (!b.fixed) { b.vx -= fx; b.vy -= fy }
    }
    // Center gravity.
    for (const n of nodes) {
      if (n.fixed) continue
      n.vx += -n.x * CENTER
      n.vy += -n.y * CENTER
    }
    // Apply + damp.
    for (const n of nodes) {
      if (n.fixed) continue
      n.vx *= DAMPING
      n.vy *= DAMPING
      n.x += n.vx
      n.y += n.vy
    }
  }
}

function buildGraph(projects: ProjectSummary[], dealMap: Map<string, HubSpotActiveDeal>): { nodes: Node[]; edges: Edge[] } {
  const clients = new Map<string, Node>()
  const nodes: Node[] = []
  const edges: Edge[] = []

  // Client nodes — one per distinct client name, "no-client" bucket for the rest.
  for (const p of projects) {
    const clientName = (p.client || '').trim() || '—'
    const clientId = `client:${clientName}`
    if (!clients.has(clientId)) {
      const cn: Node = {
        id: clientId, kind: 'client', label: clientName,
        x: (Math.random() - 0.5) * 200, y: (Math.random() - 0.5) * 200,
        vx: 0, vy: 0, fixed: false,
        color: '#3b82f6', size: 8,
      }
      clients.set(clientId, cn)
      nodes.push(cn)
    }
  }

  for (const p of projects) {
    const clientId = `client:${(p.client || '').trim() || '—'}`
    const hs = dealMap.get(p.id)
    const amt = hs?.deal.properties.amount ? Number(hs.deal.properties.amount) : undefined
    const color = p.steadyState ? '#3FB95A' : p.faaAuthorizationRequired ? '#f59e0b' : '#D2232A'
    // Size deals by amount if we have it, otherwise a default. sqrt-scale so
    // one huge deal doesn't dwarf everyone else visually.
    const size = amt && amt > 0
      ? Math.max(6, Math.min(22, Math.sqrt(amt) / 20))
      : 7
    const n: Node = {
      id: `deal:${p.id}`, kind: 'deal', label: p.name,
      x: (Math.random() - 0.5) * 400, y: (Math.random() - 0.5) * 400,
      vx: 0, vy: 0, fixed: false,
      color, size,
      projectId: p.id, clientId, amount: amt,
      dealstage: hs?.deal.properties.dealstage,
    }
    nodes.push(n)
    edges.push({ from: clientId, to: n.id })
  }

  // Client-client edges when they share the same first token of a domain (as
  // a rough affinity — not always meaningful but adds a bit of graph density
  // so isolated clients don't drift too far).
  const clientList = Array.from(clients.values())
  // Grow client node size by deal count so busy clients read as nuclei.
  const dealCountByClient = new Map<string, number>()
  for (const p of projects) {
    const cid = `client:${(p.client || '').trim() || '—'}`
    dealCountByClient.set(cid, (dealCountByClient.get(cid) || 0) + 1)
  }
  for (const c of clientList) {
    const n = dealCountByClient.get(c.id) || 0
    c.size = 8 + Math.min(14, n * 2.4)
  }

  // Grow center gravity by placing initial positions in a spiral.
  const golden = Math.PI * (3 - Math.sqrt(5))
  nodes.forEach((n, i) => {
    const r = 20 + Math.sqrt(i) * 22
    const t = i * golden
    n.x = r * Math.cos(t)
    n.y = r * Math.sin(t)
  })

  return { nodes, edges }
}

export default function ConstellationView({ onOpenDeal }: Props) {
  const isMobile = useIsMobile()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<Node | null>(null)
  const [tick, setTick] = useState(0) // force a rerender after simulate
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const dragRef = useRef<{ id: string; startX: number; startY: number; nodeStartX: number; nodeStartY: number } | null>(null)
  const panRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => api.projects.list(), staleTime: 30_000 })
  const { data: activeDeals = [] } = useQuery({ queryKey: ['hs-active'], queryFn: () => api.hubspot.getActive(), staleTime: 60_000, retry: false })

  const dealMap = useMemo(
    () => new Map<string, HubSpotActiveDeal>(activeDeals.map(a => [a.projectId, a])),
    [activeDeals],
  )

  // Build + simulate once when the graph shape changes.
  const graph = useMemo(() => {
    const g = buildGraph(projects, dealMap)
    simulate(g.nodes, g.edges)
    return g
  }, [projects, dealMap])

  const nodesRef = useRef(graph.nodes)
  nodesRef.current = graph.nodes

  // Live drag physics — nudge the dragged node and let the rest resettle
  // over a short RAF loop.
  useEffect(() => {
    let raf = 0
    let running = false
    const step = () => {
      if (!running) return
      // A short number of iterations per frame so drag stays smooth.
      simulate(nodesRef.current, graph.edges)
      setTick(t => t + 1)
      raf = requestAnimationFrame(step)
    }
    const onMove = (e: MouseEvent | TouchEvent) => {
      const point = 'touches' in e ? e.touches[0] : e
      if (!point) return
      const drag = dragRef.current
      if (drag) {
        const node = nodesRef.current.find(n => n.id === drag.id)
        if (node) {
          node.x = drag.nodeStartX + (point.clientX - drag.startX) / zoom
          node.y = drag.nodeStartY + (point.clientY - drag.startY) / zoom
          node.fixed = true
          if (!running) { running = true; raf = requestAnimationFrame(step) }
        }
        return
      }
      const panning = panRef.current
      if (panning) {
        setPan({
          x: panning.startPanX + (point.clientX - panning.startX),
          y: panning.startPanY + (point.clientY - panning.startY),
        })
      }
    }
    const onUp = () => {
      if (dragRef.current) {
        const node = nodesRef.current.find(n => n.id === dragRef.current!.id)
        if (node) node.fixed = false
      }
      dragRef.current = null
      panRef.current = null
      running = false
      if (raf) cancelAnimationFrame(raf)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [graph.edges, zoom])

  const startDrag = (e: React.MouseEvent | React.TouchEvent, node: Node) => {
    const point = 'touches' in e ? e.touches[0] : e
    dragRef.current = {
      id: node.id,
      startX: point.clientX, startY: point.clientY,
      nodeStartX: node.x, nodeStartY: node.y,
    }
  }
  const startPan = (e: React.MouseEvent) => {
    if ((e.target as Element).tagName !== 'svg' && (e.target as Element).tagName !== 'rect') return
    panRef.current = {
      startX: e.clientX, startY: e.clientY,
      startPanX: pan.x, startPanY: pan.y,
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = -Math.sign(e.deltaY) * 0.12
    setZoom(z => Math.max(0.3, Math.min(3, z + delta)))
  }

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - 100px)', background: '#0a0b0d', border: '1px solid #252b38', borderRadius: 10, overflow: 'hidden' }}>
      <style>{`
        @keyframes dxd-star  { 0%, 100% { opacity: 0.3 } 50% { opacity: 0.8 } }
        @keyframes dxd-orbit { to { transform: rotate(360deg) } }
      `}</style>
      {/* Ambient stars behind the graph */}
      <StarField />

      <svg
        ref={svgRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: dragRef.current ? 'grabbing' : 'default' }}
        viewBox={`${-500} ${-350} ${1000} ${700}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={startPan}
        onWheel={onWheel}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {graph.edges.map((e, i) => {
            const a = graph.nodes.find(n => n.id === e.from)
            const b = graph.nodes.find(n => n.id === e.to)
            if (!a || !b) return null
            return (
              <line
                key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={b.color} strokeOpacity="0.28" strokeWidth={0.9}
              />
            )
          })}
          {/* Nodes */}
          {graph.nodes.map(n => (
            <g
              key={n.id + tick}
              transform={`translate(${n.x}, ${n.y})`}
              style={{ cursor: n.kind === 'deal' ? 'pointer' : 'grab' }}
              onMouseDown={e => { e.stopPropagation(); startDrag(e, n) }}
              onTouchStart={e => { e.stopPropagation(); startDrag(e, n) }}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(null)}
              onClick={() => { if (n.kind === 'deal' && n.projectId) onOpenDeal(n.projectId) }}
            >
              {n.kind === 'deal' && (
                <circle
                  r={n.size * 2.4}
                  fill={n.color}
                  opacity="0.10"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              <circle
                r={n.size}
                fill={n.color}
                stroke={n.kind === 'client' ? 'rgba(255,255,255,0.5)' : `${n.color}`}
                strokeWidth={n.kind === 'client' ? 1.4 : 1.8}
                style={{ filter: `drop-shadow(0 0 6px ${n.color}66)` }}
              />
              {(hover?.id === n.id || n.kind === 'client') && (
                <text
                  y={-n.size - 6} textAnchor="middle"
                  fill={n.kind === 'client' ? '#e8eaf0' : n.color}
                  fontFamily="'Chakra Petch', sans-serif" fontWeight={700}
                  fontSize={n.kind === 'client' ? 11 : 10}
                  letterSpacing={0.5}
                  style={{ pointerEvents: 'none' }}
                >
                  {n.label.length > 28 ? n.label.slice(0, 27) + '…' : n.label}
                </text>
              )}
            </g>
          ))}
        </g>
      </svg>

      {/* Header + legend */}
      <div style={{
        position: 'absolute', top: 14, left: 14, zIndex: 3,
        background: 'rgba(10,11,13,0.85)', border: '1px solid #252b38', borderRadius: 8,
        padding: '10px 14px', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      }}>
        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 11, color: '#e8eaf0', letterSpacing: 2, marginBottom: 8 }}>
          FLEET CONSTELLATION
        </div>
        <Legend color="#3b82f6" label="Client" />
        <Legend color="#D2232A" label="Active deal" />
        <Legend color="#f59e0b" label="FAA pending" />
        <Legend color="#3FB95A" label="Steady state" />
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #252b38', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380' }}>
          drag nodes · scroll to zoom
        </div>
      </div>

      {/* Zoom controls */}
      {!isMobile && (
        <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 3, display: 'flex', gap: 6 }}>
          <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} style={zoomBtnSt}>＋</button>
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} style={zoomBtnSt}>−</button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} style={zoomBtnSt}>⌾</button>
        </div>
      )}

      {/* Hover card */}
      {hover && hover.kind === 'deal' && (
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
          No deals yet. Create one to see it appear in the constellation.
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

const zoomBtnSt: React.CSSProperties = {
  width: 32, height: 32, background: 'rgba(10,11,13,0.85)',
  border: '1px solid #252b38', borderRadius: 6, color: '#9aa3b8', cursor: 'pointer',
  fontSize: 14, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  backdropFilter: 'blur(10px)',
}

// Purely decorative twinkling stars.
function StarField() {
  const stars = useMemo(() => {
    const arr: Array<{ x: number; y: number; s: number; d: number }> = []
    for (let i = 0; i < 60; i++) {
      arr.push({
        x: Math.random() * 100, y: Math.random() * 100,
        s: 0.8 + Math.random() * 1.2, d: Math.random() * 3,
      })
    }
    return arr
  }, [])
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      {stars.map((s, i) => (
        <circle
          key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.s}
          fill="#9aa3b8"
          style={{ animation: `dxd-star ${2 + s.d}s ease-in-out infinite`, animationDelay: `${s.d}s`, opacity: 0.4 }}
        />
      ))}
    </svg>
  )
}
