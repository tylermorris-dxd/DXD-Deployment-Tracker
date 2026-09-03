'use client'

import React, { useEffect, useRef, useState } from 'react'

// AR-lite site preview. Full-screen camera feed with a compass overlay
// showing (a) the direction to the deal's site, (b) live distance, and
// (c) a floating drone-dock icon that shifts across the screen as the
// operator rotates their phone.
//
// True AR would require WebXR + Immersive AR + ARCore/ARKit which iOS
// Safari doesn't expose to the web. This uses getUserMedia + Geolocation
// + DeviceOrientation — the same three primitives every "AR compass" app
// on the App Store uses. Works on every phone with a browser.

interface Props {
  siteLat: number | null
  siteLng: number | null
  siteAddress: string
  onClose: () => void
}

const R_EARTH_NM = 3440.065

// Great-circle distance in nautical miles.
function haversineNm(la1: number, lo1: number, la2: number, lo2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(la2 - la1)
  const dLng = toRad(lo2 - lo1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng / 2) ** 2
  return 2 * R_EARTH_NM * Math.asin(Math.min(1, Math.sqrt(a)))
}

// Bearing (initial course) from point 1 to point 2, in degrees clockwise
// from true north.
function bearingDeg(la1: number, lo1: number, la2: number, lo2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const φ1 = toRad(la1), φ2 = toRad(la2), Δλ = toRad(lo2 - lo1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export default function ARSitePreview({ siteLat, siteLng, siteAddress, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null)
  const [heading, setHeading] = useState<number | null>(null) // degrees clockwise from N
  const [needsPermission, setNeedsPermission] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let watchId: number | null = null

    async function boot() {
      // 1. Camera. Prefer rear-facing.
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => { /* iOS wants a gesture — user already tapped Open */ })
        }
      } catch (e) {
        setError(`Camera access denied — ${(e as Error).message}`)
        return
      }

      // 2. Live GPS.
      if (!('geolocation' in navigator)) {
        setError('Geolocation not supported on this device')
        return
      }
      watchId = navigator.geolocation.watchPosition(
        (pos) => setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => setError(`GPS unavailable — ${err.message}`),
        { enableHighAccuracy: true, maximumAge: 4000, timeout: 15_000 },
      )

      // 3. Compass — iOS 13+ requires a permission prompt, other browsers
      // just fire the event. Wire both paths.
      const onOrient = (ev: DeviceOrientationEvent) => {
        // iOS gives webkitCompassHeading = clockwise-from-north.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const webkitH = (ev as any).webkitCompassHeading
        if (typeof webkitH === 'number' && !isNaN(webkitH)) { setHeading(webkitH); return }
        // Everywhere else: alpha counter-clockwise from north. Invert.
        if (typeof ev.alpha === 'number') setHeading((360 - ev.alpha) % 360)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const iosReq = (DeviceOrientationEvent as any)?.requestPermission
      if (typeof iosReq === 'function') {
        setNeedsPermission(true)
      } else {
        window.addEventListener('deviceorientationabsolute', onOrient as EventListener)
        window.addEventListener('deviceorientation',         onOrient as EventListener)
      }
      // Store the listener on the window so the button handler can also
      // wire it after permission grant.
      ;(window as unknown as { __dxdArOrient?: (e: DeviceOrientationEvent) => void }).__dxdArOrient = onOrient
    }

    boot()

    return () => {
      stream?.getTracks().forEach(t => t.stop())
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
      const w = window as unknown as { __dxdArOrient?: (e: DeviceOrientationEvent) => void }
      if (w.__dxdArOrient) {
        window.removeEventListener('deviceorientationabsolute', w.__dxdArOrient as EventListener)
        window.removeEventListener('deviceorientation',         w.__dxdArOrient as EventListener)
        delete w.__dxdArOrient
      }
    }
  }, [])

  async function grantIosCompass() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const iosReq = (DeviceOrientationEvent as any).requestPermission
      const perm = await iosReq()
      if (perm === 'granted') {
        setNeedsPermission(false)
        const handler = (window as unknown as { __dxdArOrient?: (e: DeviceOrientationEvent) => void }).__dxdArOrient
        if (handler) {
          window.addEventListener('deviceorientationabsolute', handler as EventListener)
          window.addEventListener('deviceorientation',         handler as EventListener)
        }
      }
    } catch { setError('Compass permission denied') }
  }

  const bearing = me && siteLat != null && siteLng != null
    ? bearingDeg(me.lat, me.lng, siteLat, siteLng)
    : null
  const distanceNm = me && siteLat != null && siteLng != null
    ? haversineNm(me.lat, me.lng, siteLat, siteLng)
    : null

  // Delta between where the operator is pointing and where the site is.
  // Positive delta = site is CW (right) of the current view.
  const delta = bearing != null && heading != null
    ? ((bearing - heading + 540) % 360) - 180
    : null

  // Map that delta to a horizontal offset across the screen. Field of view
  // for a phone camera ≈ 65°. If the site is within FOV, arrow sits on
  // screen; outside, arrow pins to the closer edge.
  const FOV = 65
  const clampedDelta = delta == null ? 0 : Math.max(-FOV, Math.min(FOV, delta))
  const arrowPct = 50 + (clampedDelta / FOV) * 40
  const inView = delta != null && Math.abs(delta) < FOV / 2

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 900, background: '#000',
      color: '#e8eaf0', fontFamily: "'IBM Plex Mono', monospace",
    }}>
      <video
        ref={videoRef}
        playsInline muted autoPlay
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' as const }}
      />

      {/* Vignette so overlay reads clearly */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.65) 100%)', pointerEvents: 'none' }} />

      {/* Crosshair — dead center + reticle */}
      <svg style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} width="220" height="220" viewBox="0 0 220 220">
        <circle cx="110" cy="110" r="60" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" fill="none" strokeDasharray="4 6" />
        <circle cx="110" cy="110" r="3" fill="#D2232A" />
        <line x1="110" y1="10"  x2="110" y2="46"  stroke="rgba(255,255,255,0.6)" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="110" y1="174" x2="110" y2="210" stroke="rgba(255,255,255,0.6)" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="10"  y1="110" x2="46"  y2="110" stroke="rgba(255,255,255,0.6)" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="174" y1="110" x2="210" y2="110" stroke="rgba(255,255,255,0.6)" strokeWidth="1.4" strokeLinecap="round" />
      </svg>

      {/* Direction arrow */}
      {distanceNm != null && delta != null && (
        <div style={{
          position: 'absolute', top: '50%', left: `${arrowPct}%`,
          transform: 'translate(-50%, -50%)', pointerEvents: 'none',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 42, height: 42, borderRadius: '50%',
              background: inView ? 'rgba(63,185,90,0.14)' : 'rgba(210,35,42,0.18)',
              border: `2px solid ${inView ? '#3FB95A' : '#D2232A'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transform: `rotate(${delta}deg)`,
              boxShadow: `0 0 14px ${inView ? '#3FB95A66' : '#D2232A66'}`,
            }}>
              <span style={{ fontSize: 22, lineHeight: 1, color: inView ? '#3FB95A' : '#D2232A' }}>▲</span>
            </div>
            <div style={{ fontSize: 10, background: 'rgba(0,0,0,0.7)', padding: '2px 8px', borderRadius: 4, letterSpacing: 1 }}>
              SITE · {distanceNm.toFixed(2)} nm
            </div>
          </div>
        </div>
      )}

      {/* Bottom HUD */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '16px 20px 24px', background: 'linear-gradient(0deg, rgba(0,0,0,0.85), transparent)',
      }}>
        <div style={{ fontSize: 9, letterSpacing: 2, color: '#9aa3b8' }}>TARGET</div>
        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 2, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const }}>
          {siteAddress || 'Site'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 10 }}>
          <HudCell label="Heading" value={heading != null ? `${Math.round(heading)}°` : '—'} />
          <HudCell label="Bearing to site" value={bearing != null ? `${Math.round(bearing)}°` : '—'} accent={inView ? '#3FB95A' : '#D2232A'} />
          <HudCell label="Distance" value={distanceNm != null ? `${distanceNm.toFixed(2)} nm` : '—'} />
        </div>
      </div>

      {/* Top actions */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(180deg, rgba(0,0,0,0.7), transparent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#D2232A', boxShadow: '0 0 8px #D2232A88', animation: 'pulse 1.4s ease-in-out infinite' }} />
          <span style={{ fontSize: 10, letterSpacing: 2, color: '#e8eaf0' }}>DXD · AR SITE PREVIEW</span>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '6px 12px', background: 'rgba(0,0,0,0.55)',
            border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, color: '#e8eaf0',
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 1, cursor: 'pointer',
          }}
        >
          CLOSE
        </button>
      </div>

      {needsPermission && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex',
          flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
          padding: 32, textAlign: 'center' as const, zIndex: 10,
        }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🧭</div>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Enable Compass</div>
          <div style={{ fontSize: 12, color: '#9aa3b8', marginBottom: 20, lineHeight: 1.6 }}>
            iOS needs your permission to read the compass so we can point you toward the site.
          </div>
          <button
            onClick={grantIosCompass}
            style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #D2232A, #7a1c22)', border: 'none', borderRadius: 8, color: '#fff', fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: 1, cursor: 'pointer' }}
          >
            GRANT ACCESS
          </button>
        </div>
      )}

      {error && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex',
          flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
          padding: 32, textAlign: 'center' as const, zIndex: 10,
        }}>
          <div style={{ fontSize: 44, marginBottom: 12, color: '#D2232A' }}>⚠</div>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Cannot start AR</div>
          <div style={{ fontSize: 12, color: '#9aa3b8', marginBottom: 20, lineHeight: 1.6, maxWidth: 280 }}>{error}</div>
          <button
            onClick={onClose}
            style={{ padding: '10px 22px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#e8eaf0', fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: 1, cursor: 'pointer' }}
          >
            CLOSE
          </button>
        </div>
      )}
    </div>
  )
}

function HudCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}>
      <div style={{ fontSize: 8, letterSpacing: 1.5, color: '#9aa3b8', textTransform: 'uppercase' as const, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 14, color: accent || '#fff' }}>{value}</div>
    </div>
  )
}
