'use client'

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { api } from '@/lib/api'
import type {
  ProjectFull, RfSurveyResponse, ScoredEmitter, RfManualEmitter, RiskTier, RfVerdict,
  NearbyStructure,
} from '@/lib/types'
import { resolveSites } from '@/lib/siteCoords'
import { showToast } from '@/lib/toast'

// RF site survey. Scores every licensed emitter near the dock for the chance it
// desenses the control link, and tells a tech which bearings to sweep.
//
// The centrepiece is a PPI scope rather than a map, because the output of this
// tool is a bearing and a range — which is exactly what you set on a
// directional antenna. A map would make you do that conversion in your head.

interface Props {
  project: ProjectFull
  onCacheUpdate: (data: unknown) => void
}

const TIER_COLOR: Record<RiskTier, string> = {
  critical: '#FF2020',
  elevated: '#FFB300',
  low: '#3FB95A',
}

const VERDICT: Record<RfVerdict, { label: string; color: string; blurb: string }> = {
  GO: {
    label: 'GO',
    color: '#3FB95A',
    blurb: 'Nothing flagged in the desktop triage. Run the baseline sweep and the link test to confirm.',
  },
  FIELD_VERIFY: {
    label: 'FIELD-VERIFY',
    color: '#FFB300',
    blurb: 'At least one emitter warrants a sweep before anyone commits to this dock location.',
  },
  LIKELY_BAD: {
    label: 'LIKELY-BAD',
    color: '#FF2020',
    blurb: 'A high-risk emitter is close and in line of sight. Expect link trouble on that bearing.',
  },
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
function compass(deg: number): string {
  return COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8]
}
function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
}

export default function RfSurveyView({ project, onCacheUpdate }: Props) {
  const cached = useMemo(() => {
    try { return project.rfCache ? JSON.parse(project.rfCache) : null } catch { return null }
  }, [project.rfCache])

  const [lat, setLat] = useState<string>(cached?.dock?.lat?.toString() ?? '')
  const [lon, setLon] = useState<string>(cached?.dock?.lon?.toString() ?? '')
  const [antM, setAntM] = useState<string>(cached?.dock?.antennaAglM?.toString() ?? '15')
  const [radiusKm, setRadiusKm] = useState<number>(cached?.radiusKm ?? 5)
  const [useTerrain, setUseTerrain] = useState<boolean>(cached?.useTerrain ?? false)
  const [manual, setManual] = useState<RfManualEmitter[]>(cached?.manual ?? [])
  const [resp, setResp] = useState<RfSurveyResponse | null>(cached?.resp ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [showManual, setShowManual] = useState(false)
  const didGeocode = useRef(false)

  // Seed the dock from the deal's site address so the common case is one click.
  useEffect(() => {
    if (didGeocode.current || lat || lon || !project.site) return
    didGeocode.current = true
    resolveSites([project.site]).then(c => {
      const hit = c[project.site.trim()]
      if (hit) { setLat(hit.lat.toFixed(6)); setLon(hit.lng.toFixed(6)) }
    }).catch(() => { /* operator can type coordinates */ })
  }, [project.site, lat, lon])

  const run = useCallback(async () => {
    const dLat = parseFloat(lat), dLon = parseFloat(lon), dAnt = parseFloat(antM)
    if (!isFinite(dLat) || !isFinite(dLon)) {
      setError('Dock latitude and longitude are required.')
      return
    }
    setLoading(true); setError(null)
    try {
      const r = await api.rfSurvey({
        dock: { lat: dLat, lon: dLon, antennaAglM: isFinite(dAnt) ? dAnt : 15 },
        radiusKm,
        emitters: manual,
        useTerrain,
      })
      setResp(r)
      onCacheUpdate({
        dock: { lat: dLat, lon: dLon, antennaAglM: isFinite(dAnt) ? dAnt : 15 },
        radiusKm, useTerrain, manual, resp: r,
      })
      if (useTerrain && !r.terrainResolved) {
        showToast({
          title: 'Terrain data unavailable',
          detail: 'Line of sight fell back to radio-horizon geometry.',
          tone: 'info', durationMs: 4000,
        })
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [lat, lon, antM, radiusKm, manual, useTerrain, onCacheUpdate])

  const scored = resp?.result.scored ?? []
  const flagged = scored.filter(s => s.score >= 40)
  const v = resp ? VERDICT[resp.result.verdict] : null

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #7c3aed, #4c1d95)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <path d="M12 12L20 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M5.6 5.6a9 9 0 000 12.8M8.5 8.5a5 5 0 000 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <path d="M18.4 5.6a9 9 0 010 12.8M15.5 8.5a5 5 0 010 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: 1, fontFamily: "'Chakra Petch', sans-serif" }}>RF SITE SURVEY</h2>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginTop: 2 }}>
            FCC ULS + ASR · DESENSE RISK TRIAGE · {resp ? `${resp.dbEmitterCount} EMITTERS IN RADIUS` : 'AWAITING RUN'}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ background: 'rgba(30,30,34,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Dock latitude" w={140}>
            <input value={lat} onChange={e => setLat(e.target.value)} placeholder="34.00070" style={inputSt} />
          </Field>
          <Field label="Dock longitude" w={140}>
            <input value={lon} onChange={e => setLon(e.target.value)} placeholder="-81.03480" style={inputSt} />
          </Field>
          <Field label="Antenna AGL (m)" w={110}>
            <input value={antM} onChange={e => setAntM(e.target.value)} placeholder="15" style={inputSt} />
          </Field>
          <Field label={`Radius — ${radiusKm} km`} w={150}>
            <input type="range" min={1} max={25} step={1} value={radiusKm}
              onChange={e => setRadiusKm(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#7c3aed', height: 34 }} />
          </Field>
          <button
            onClick={() => setUseTerrain(t => !t)}
            title="Sample terrain along each path instead of assuming a smooth earth"
            style={{
              padding: '9px 13px', borderRadius: 6, cursor: 'pointer', height: 36,
              border: `1px solid ${useTerrain ? '#7c3aed' : 'rgba(255,255,255,0.14)'}`,
              background: useTerrain ? 'rgba(124,58,237,0.2)' : 'transparent',
              color: useTerrain ? '#a78bfa' : 'rgba(255,255,255,0.45)',
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
            }}
          >
            {useTerrain ? '◈ Terrain LOS' : '◇ Terrain LOS'}
          </button>
          <button
            onClick={run} disabled={loading}
            style={{
              padding: '10px 22px', borderRadius: 6, border: 'none', height: 36,
              background: loading ? 'rgba(124,58,237,0.35)' : 'linear-gradient(135deg, #7c3aed, #4c1d95)',
              color: '#fff', cursor: loading ? 'wait' : 'pointer',
              fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
            }}
          >
            {loading ? 'Scanning…' : 'Run Survey'}
          </button>
          <button
            onClick={() => setShowManual(s => !s)}
            style={{ ...ghostBtn, height: 36 }}
          >
            {showManual ? 'Hide sighted' : `+ Sighted emitter${manual.length ? ` (${manual.length})` : ''}`}
          </button>
        </div>

        {showManual && (
          <ManualEmitters items={manual} onChange={setManual} />
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#e74c3c' }}>
          {error}
        </div>
      )}

      {/* Verdict */}
      {resp && v && (
        <div style={{
          background: `linear-gradient(135deg, ${v.color}18, transparent)`,
          border: `1px solid ${v.color}55`, borderRadius: 8, padding: '16px 18px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Verdict</div>
            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 28, fontWeight: 800, color: v.color, lineHeight: 1.1, letterSpacing: 1 }}>
              {v.label}
            </div>
          </div>
          <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.1)' }} />
          <Stat label="Worst score" value={String(resp.result.worstScore)} color={v.color} />
          <Stat label="Flagged" value={`${resp.result.flaggedCount}`} color={resp.result.flaggedCount ? '#FFB300' : '#3FB95A'} />
          <Stat label="In radius" value={`${resp.dbEmitterCount + resp.manualEmitterCount}`} />
          <Stat label="LOS basis" value={resp.terrainResolved ? 'Terrain DEM' : 'Radio horizon'} />
          <div style={{ flex: 1, minWidth: 220, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
            {v.blurb}
          </div>
        </div>
      )}

      {resp?.emittersTruncated && (
        <div style={{
          background: 'rgba(255,179,0,0.1)', border: '1px solid rgba(255,179,0,0.4)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#FFB300', lineHeight: 1.5,
        }}>
          Emitter limit reached — this survey analysed only part of what is in radius.
          Reduce the radius for a complete picture of the area closest to the dock.
        </div>
      )}

      {/* Scope + table */}
      {resp && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 420px) 1fr', gap: 16, marginBottom: 16, alignItems: 'start' }}>
          <PpiScope
            scored={scored}
            structures={resp.result.structures ?? []}
            radiusKm={resp.result.radiusKm}
            selected={selected}
            onSelect={setSelected}
          />
          <EmitterTable scored={scored} selected={selected} onSelect={setSelected} />
        </div>
      )}

      {/* Registered structures */}
      {resp && (resp.result.structures?.length ?? 0) > 0 && (
        <StructurePanel
          structures={resp.result.structures}
          selected={selected}
          onSelect={setSelected}
        />
      )}

      {/* Checklist */}
      {resp && (
        <Checklist text={resp.checklist} flaggedCount={flagged.length} />
      )}

      {!resp && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '70px 20px', color: 'rgba(255,255,255,0.2)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, marginBottom: 14, opacity: 0.4, fontFamily: "'Chakra Petch', sans-serif" }}>RF SURVEY</div>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 17, fontWeight: 600, marginBottom: 8, color: 'rgba(255,255,255,0.45)' }}>
            NO SURVEY RUN FOR THIS DEAL
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
            Confirm the dock coordinates and antenna height, then run the survey. It scores every
            licensed emitter in radius for the chance it desenses the control link, and gives you the
            bearings to sweep on site.
          </div>
        </div>
      )}
    </div>
  )
}

// ── PPI scope ───────────────────────────────────────────────────────────────

function PpiScope({ scored, structures, radiusKm, selected, onSelect }: {
  scored: ScoredEmitter[]
  structures: NearbyStructure[]
  radiusKm: number
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const SIZE = 400, C = SIZE / 2, MAX_R = 168
  const rings = [0.25, 0.5, 0.75, 1].map(f => ({ f, km: (radiusKm * f) }))
  const maxM = radiusKm * 1000

  return (
    <div style={{ background: 'rgba(10,8,14,0.9)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: 8, padding: 12 }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
        Bearing / range scope
      </div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <radialGradient id="ppiGlow">
            <stop offset="0%" stopColor="rgba(124,58,237,0.20)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={MAX_R} fill="url(#ppiGlow)" />

        {/* Range rings */}
        {rings.map(({ f, km }) => (
          <g key={f}>
            <circle cx={C} cy={C} r={MAX_R * f} fill="none" stroke="rgba(124,58,237,0.28)" strokeWidth="1" />
            <text x={C + 3} y={C - MAX_R * f - 3} fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="'IBM Plex Mono', monospace">
              {km >= 10 ? km.toFixed(0) : km.toFixed(1)} km
            </text>
          </g>
        ))}

        {/* Bearing spokes */}
        {Array.from({ length: 12 }, (_, i) => i * 30).map(deg => {
          const rad = (deg - 90) * Math.PI / 180
          const major = deg % 90 === 0
          return (
            <line key={deg}
              x1={C} y1={C}
              x2={C + Math.cos(rad) * MAX_R} y2={C + Math.sin(rad) * MAX_R}
              stroke={major ? 'rgba(124,58,237,0.4)' : 'rgba(124,58,237,0.16)'}
              strokeWidth={major ? 1 : 0.6}
            />
          )
        })}

        {/* Cardinal labels */}
        {[['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([l, d]) => {
          const rad = ((d as number) - 90) * Math.PI / 180
          return (
            <text key={l as string}
              x={C + Math.cos(rad) * (MAX_R + 14)}
              y={C + Math.sin(rad) * (MAX_R + 14) + 4}
              textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="11"
              fontFamily="'Chakra Petch', sans-serif" fontWeight="700">
              {l as string}
            </text>
          )
        })}

        {/* Registered structures. Hollow squares so they can never be mistaken
            for a scored emitter — nobody knows what transmits from these. */}
        {structures.map(st => {
          const rad = (st.bearingDeg - 90) * Math.PI / 180
          const rr = Math.min(1, st.distanceM / maxM) * MAX_R
          const x = C + Math.cos(rad) * rr
          const y = C + Math.sin(rad) * rr
          const isSel = selected === st.id
          return (
            <g key={st.id} onClick={() => onSelect(isSel ? null : st.id)} style={{ cursor: 'pointer' }}>
              <rect x={x - 4} y={y - 4} width={8} height={8}
                fill="none" stroke={isSel ? '#fff' : 'rgba(255,255,255,0.5)'} strokeWidth={isSel ? 1.8 : 1.1} />
              {isSel && (
                <text x={x} y={y - 9} textAnchor="middle" fill="#fff" fontSize="9"
                  fontFamily="'IBM Plex Mono', monospace" style={{ paintOrder: 'stroke' }} stroke="#000" strokeWidth="3">
                  {st.heightAglM != null ? Math.round(st.heightAglM) + 'm' : 'structure'} · {fmtDist(st.distanceM)}
                </text>
              )}
            </g>
          )
        })}

        {/* Emitters */}
        {scored.map(s => {
          const rad = (s.bearingDeg - 90) * Math.PI / 180
          const rr = Math.min(1, s.distanceM / maxM) * MAX_R
          const x = C + Math.cos(rad) * rr
          const y = C + Math.sin(rad) * rr
          const color = TIER_COLOR[s.tier]
          const isSel = selected === s.emitter.id
          const size = 3 + (s.score / 100) * 6
          return (
            <g key={s.emitter.id} onClick={() => onSelect(isSel ? null : s.emitter.id)} style={{ cursor: 'pointer' }}>
              {s.score >= 40 && (
                <line x1={C} y1={C} x2={x} y2={y} stroke={color} strokeWidth={isSel ? 1.6 : 0.8} opacity={isSel ? 0.9 : 0.35} />
              )}
              <circle cx={x} cy={y} r={isSel ? size + 3 : size} fill={color}
                opacity={isSel ? 1 : 0.85}
                stroke={isSel ? '#fff' : 'none'} strokeWidth={isSel ? 1.5 : 0} />
              {isSel && (
                <text x={x} y={y - size - 7} textAnchor="middle" fill="#fff" fontSize="9"
                  fontFamily="'IBM Plex Mono', monospace" style={{ paintOrder: 'stroke' }} stroke="#000" strokeWidth="3">
                  {Math.round(s.bearingDeg)}° · {fmtDist(s.distanceM)}
                </text>
              )}
            </g>
          )
        })}

        {/* Dock */}
        <circle cx={C} cy={C} r="5" fill="#fff" />
        <circle cx={C} cy={C} r="9" fill="none" stroke="#fff" strokeWidth="1" opacity="0.6" />
      </svg>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 6, flexWrap: 'wrap' }}>
        {(['critical', 'elevated', 'low'] as RiskTier[]).map(t => (
          <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: TIER_COLOR[t] }} />{t}
          </span>
        ))}
        {structures.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>
            <span style={{ width: 8, height: 8, border: '1.2px solid rgba(255,255,255,0.6)' }} />structure
          </span>
        )}
      </div>
    </div>
  )
}

// ── Risk table ──────────────────────────────────────────────────────────────

function EmitterTable({ scored, selected, onSelect }: {
  scored: ScoredEmitter[]
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  if (!scored.length) {
    return (
      <div style={{ background: 'rgba(30,30,34,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '40px 20px', textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
        No licensed emitters in radius.<br />
        <span style={{ fontSize: 10, opacity: 0.7 }}>
          If the FCC tables haven&apos;t been ingested yet, this will be empty even at a busy site.
        </span>
      </div>
    )
  }
  return (
    <div style={{ background: 'rgba(30,30,34,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto', maxHeight: 430, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#15161c', zIndex: 1 }}>
            <tr>
              {['', 'Emitter', 'Freq', 'Band', 'Range', 'Brg', 'ERP', 'LOS', 'Risk'].map((h, i) => (
                <th key={i} style={{ textAlign: i >= 2 ? 'right' : 'left', padding: '9px 10px', fontSize: 9, letterSpacing: 1.2, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scored.map(s => {
              const color = TIER_COLOR[s.tier]
              const isSel = selected === s.emitter.id
              return (
                <tr key={s.emitter.id}
                  onClick={() => onSelect(isSel ? null : s.emitter.id)}
                  style={{
                    cursor: 'pointer',
                    background: isSel ? `${color}1a` : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ display: 'block', width: 7, height: 7, borderRadius: '50%', background: color }} />
                  </td>
                  <td style={{ padding: '8px 10px', color: '#e8eaf0', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.emitter.name}>
                    {s.emitter.name}
                    <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, marginLeft: 6 }}>{s.emitter.source}</span>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>
                    {s.emitter.freqMhz.toFixed(3)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: s.band.cls === 'CLR' ? 'rgba(255,255,255,0.3)' : color, whiteSpace: 'nowrap', fontSize: 10 }}>
                    {s.band.cls}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>
                    {fmtDist(s.distanceM)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>
                    {Math.round(s.bearingDeg)}° {compass(s.bearingDeg)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: 10,
                    color: s.erpKnown ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.32)' }}
                    title={s.erpKnown ? 'From the licence record' : 'Licence carries no power figure — scored as moderate'}>
                    {s.erpKnown && s.emitter.erpDbw != null ? `${Math.round(s.emitter.erpDbw)} dBW` : 'unk'}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: s.los ? '#FFB300' : 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap', fontSize: 10 }}
                    title={s.losSource === 'dem' ? 'Resolved against terrain' : 'Radio-horizon geometry only'}>
                    {s.los ? 'YES' : 'no'}{s.losSource === 'dem' ? '*' : ''}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color }}>
                    {s.score}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Registered structures ───────────────────────────────────────────────────

function StructurePanel({ structures, selected, onSelect }: {
  structures: NearbyStructure[]
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const shown = open ? structures : structures.slice(0, 6)
  return (
    <div style={{ background: 'rgba(30,30,34,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Registered structures · {structures.length} in radius · not scored
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 5, lineHeight: 1.55 }}>
          The FCC structure register records height and position but not what transmits from them, so
          these carry no risk score. Cellular is licensed by market rather than by point, which makes
          this often the only record that a cell site exists at all. Ordered tall-and-close first.
        </div>
      </div>
      <div style={{ display: 'grid', gap: 1, background: 'rgba(255,255,255,0.04)' }}>
        {shown.map(st => {
          const isSel = selected === st.id
          return (
            <button key={st.id} onClick={() => onSelect(isSel ? null : st.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                background: isSel ? 'rgba(255,255,255,0.07)' : 'rgba(30,30,34,0.95)',
                border: 'none', padding: '9px 16px', cursor: 'pointer',
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.72)',
              }}>
              <span style={{ width: 9, height: 9, border: '1.2px solid rgba(255,255,255,0.55)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e8eaf0' }}>
                {st.name}
              </span>
              <span style={{ flexShrink: 0, color: 'rgba(255,255,255,0.5)' }}>
                {st.heightAglM != null ? Math.round(st.heightAglM) + ' m' : 'height —'}
              </span>
              <span style={{ flexShrink: 0, width: 72, textAlign: 'right' }}>{fmtDist(st.distanceM)}</span>
              <span style={{ flexShrink: 0, width: 66, textAlign: 'right', color: 'rgba(255,255,255,0.5)' }}>
                {Math.round(st.bearingDeg)}° {compass(st.bearingDeg)}
              </span>
            </button>
          )
        })}
      </div>
      {structures.length > 6 && (
        <button onClick={() => setOpen(o => !o)} style={{ ...ghostBtn, margin: 10, border: 'none', background: 'transparent' }}>
          {open ? 'Show fewer' : 'Show all ' + structures.length}
        </button>
      )}
    </div>
  )
}

// ── Sighted emitter entry ───────────────────────────────────────────────────

function ManualEmitters({ items, onChange }: {
  items: RfManualEmitter[]
  onChange: (v: RfManualEmitter[]) => void
}) {
  const [draft, setDraft] = useState<RfManualEmitter>({ freqMhz: 0, erpUnit: 'W' })

  const add = () => {
    if (!draft.freqMhz || (!draft.bearingDeg && draft.bearingDeg !== 0) || !draft.distanceM) return
    onChange([...items, draft])
    setDraft({ freqMhz: 0, erpUnit: 'W' })
  }

  const numField = (
    label: string, key: keyof RfManualEmitter, placeholder: string, w = 92,
  ) => (
    <Field label={label} w={w}>
      <input
        value={(draft[key] as number | undefined)?.toString() ?? ''}
        onChange={e => setDraft(d => ({ ...d, [key]: e.target.value === '' ? undefined : Number(e.target.value) }))}
        placeholder={placeholder}
        style={inputSt}
      />
    </Field>
  )

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>
        Sighted emitters
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.28)', marginBottom: 10, lineHeight: 1.5 }}>
        A tower you can see from the dock but that the FCC tables missed. Give a compass bearing and
        a range estimate — no coordinates needed.
      </div>

      {items.length > 0 && (
        <div style={{ display: 'grid', gap: 5, marginBottom: 10 }}>
          {items.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, padding: '7px 10px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>
              <span style={{ flex: 1, minWidth: 0 }}>{m.name || `Sighted ${i + 1}`}</span>
              <span>{m.bearingDeg}° · {m.distanceM} m</span>
              <span>{m.freqMhz} MHz</span>
              <span>{m.erp ?? 0} {m.erpUnit}</span>
              <button onClick={() => onChange(items.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', color: '#ef5350', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Name" w={140}>
          <input value={draft.name ?? ''} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Tower on ridge" style={inputSt} />
        </Field>
        {numField('Bearing °', 'bearingDeg', '300')}
        {numField('Distance m', 'distanceM', '450')}
        {numField('Freq MHz', 'freqMhz', '3700')}
        {numField('ERP', 'erp', '1500', 80)}
        <Field label="Unit" w={72}>
          <select value={draft.erpUnit ?? 'W'} onChange={e => setDraft(d => ({ ...d, erpUnit: e.target.value as 'W' | 'kW' | 'dBW' }))} style={inputSt}>
            <option value="W">W</option><option value="kW">kW</option><option value="dBW">dBW</option>
          </select>
        </Field>
        {numField('Height m', 'heightAglM', '60', 86)}
        <button onClick={add} style={{ ...ghostBtn, height: 34, borderColor: 'rgba(124,58,237,0.6)', color: '#a78bfa' }}>ADD</button>
      </div>
    </div>
  )
}

// ── Checklist ───────────────────────────────────────────────────────────────

function Checklist({ text, flaggedCount }: { text: string; flaggedCount: number }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      showToast({ title: 'Copy failed', detail: 'Select the text and copy manually.', tone: 'error', durationMs: 2500 })
    }
  }
  return (
    <div style={{ background: 'rgba(30,30,34,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase', flex: 1 }}>
          Field sweep checklist {flaggedCount > 0 && `· ${flaggedCount} bearing${flaggedCount === 1 ? '' : 's'} to sweep`}
        </span>
        <button onClick={copy} style={ghostBtn}>{copied ? '✓ Copied' : 'Copy'}</button>
        <button onClick={() => window.print()} style={ghostBtn}>Print</button>
      </div>
      <pre style={{
        margin: 0, padding: 16, overflowX: 'auto', maxHeight: 420,
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, lineHeight: 1.65,
        color: 'rgba(255,255,255,0.72)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {text}
      </pre>
    </div>
  )
}

// ── Small shared bits ───────────────────────────────────────────────────────

function Field({ label, w, children }: { label: string; w: number; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', width: w }}>
      <span style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 1, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </span>
      {children}
    </label>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 1.2, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 16, fontWeight: 700, color: color || '#e8eaf0' }}>{value}</div>
    </div>
  )
}

const inputSt: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 5, padding: '8px 10px', color: '#e8eaf0', outline: 'none',
  fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, height: 34,
}

const ghostBtn: React.CSSProperties = {
  padding: '7px 13px', borderRadius: 5, cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.03)',
  color: 'rgba(255,255,255,0.6)',
  fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
}
