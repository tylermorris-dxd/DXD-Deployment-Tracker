'use client'

import React, { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { ProjectFull } from '@/lib/types'
import { showToast } from '@/lib/toast'

// Operator-side live signoff watcher. The operator clicks "Generate live
// signoff link" — the backend creates a session, we get back a URL, we
// display it with a QR code the customer scans or the operator texts. Then
// we poll every 1.5 s for the session status and re-render the customer's
// signature stroke by stroke on our canvas in real time. When the customer
// hits "Sign & Complete" the session flips to accepted and we surface the
// completed signature + name + email.

interface Props { project: ProjectFull }

interface SessionState {
  token: string
  url: string
  completed: boolean
  customerName: string | null
  customerEmail: string | null
  strokes: number[][][]
}

// QR code generator using the free qrcode.js CDN — same pattern as
// jsPDF etc. Loaded on first click, cached after that.
let qrLoading: Promise<void> | null = null
function ensureQR(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).QRCode) return Promise.resolve()
  if (qrLoading) return qrLoading
  qrLoading = new Promise<void>((resolve, reject) => {
    const sc = document.createElement('script')
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
    sc.onload = () => resolve()
    sc.onerror = () => reject(new Error('failed to load qrcode.js'))
    document.head.appendChild(sc)
  })
  return qrLoading
}

export default function LiveSignoffPanel({ project }: Props) {
  const [session, setSession] = useState<SessionState | null>(null)
  const [creating, setCreating] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const qrRef     = useRef<HTMLDivElement>(null)

  async function createSession() {
    setCreating(true)
    try {
      const resp = await api.signoffSessions.create(project.id, {
        project_name: project.name || '',
        client_name:  project.client || '',
        site:         project.site || '',
      })
      const url = window.location.origin + resp.url
      setSession({
        token: resp.token, url,
        completed: false, customerName: null, customerEmail: null, strokes: [],
      })
    } catch (e) {
      showToast({ title: 'Could not create session', detail: (e as Error).message, tone: 'error' })
    } finally { setCreating(false) }
  }

  // Poll status while the session is open and not yet completed.
  useEffect(() => {
    if (!session || session.completed) return
    let cancelled = false
    const tick = async () => {
      try {
        const s = await api.signoffSessions.status(project.id, session.token)
        if (cancelled) return
        setSession(prev => prev ? {
          ...prev,
          completed:     s.accepted,
          customerName:  s.customer_name,
          customerEmail: s.customer_email,
          strokes:       s.strokes || [],
        } : prev)
        if (s.accepted) {
          showToast({ title: `Customer signoff completed`, detail: s.customer_name || 'Anonymous', tone: 'success' })
        }
      } catch { /* transient */ }
    }
    tick()
    const iv = setInterval(tick, 1500)
    return () => { cancelled = true; clearInterval(iv) }
  }, [session, project.id])

  // Render strokes onto our canvas whenever they change.
  useEffect(() => {
    const cnv = canvasRef.current
    if (!cnv || !session) return
    const ctx = cnv.getContext('2d')
    if (!ctx) return
    const rect = cnv.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    cnv.width  = Math.round(rect.width  * dpr)
    cnv.height = Math.round(rect.height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.strokeStyle = '#e8eaf0'
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Customer's canvas is 1200×440 ish. Scale to fit our canvas
    // preserving aspect. Compute bounds from strokes to normalize.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const s of session.strokes) {
      for (const [x, y] of s) {
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
      }
    }
    if (!isFinite(minX)) return
    const w = Math.max(60, maxX - minX)
    const h = Math.max(30, maxY - minY)
    const scale = Math.min((rect.width - 20) / w, (rect.height - 20) / h)
    const offX = (rect.width  - w * scale) / 2 - minX * scale
    const offY = (rect.height - h * scale) / 2 - minY * scale
    for (const s of session.strokes) {
      if (s.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(s[0][0] * scale + offX, s[0][1] * scale + offY)
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0] * scale + offX, s[i][1] * scale + offY)
      ctx.stroke()
    }
  }, [session])

  // Generate QR whenever session URL changes.
  useEffect(() => {
    if (!session?.url || !qrRef.current) return
    let cancelled = false
    ensureQR().then(() => {
      if (cancelled || !qrRef.current) return
      qrRef.current.innerHTML = ''
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const QR = (window as any).QRCode
      if (!QR) return
      new QR(qrRef.current, {
        text: session.url,
        width: 148, height: 148,
        colorDark:  '#e8eaf0',
        colorLight: '#0f1116',
        correctLevel: QR.CorrectLevel.M,
      })
    }).catch(() => { /* CDN failed — the URL text still works as a copy target */ })
    return () => { cancelled = true }
  }, [session?.url])

  function copy() {
    if (!session) return
    navigator.clipboard.writeText(session.url).then(
      () => showToast({ title: 'Link copied', tone: 'success', durationMs: 2000 }),
      () => showToast({ title: 'Copy failed', tone: 'error' }),
    )
  }

  return (
    <div style={{
      background: 'rgba(6,7,10,0.75)', border: '1px solid rgba(210,35,42,0.28)',
      borderRadius: 10, padding: '14px 18px', marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: session?.completed ? '#3FB95A' : '#D2232A', boxShadow: `0 0 8px ${session?.completed ? '#3FB95A' : '#D2232A'}88`, animation: session && !session.completed ? 'pulse 1.4s ease-in-out infinite' : 'none' }} />
        <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: 2, color: '#e8eaf0' }}>
          LIVE CUSTOMER SIGNOFF
        </span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380' }}>
          {session?.completed ? 'completed' : session ? 'watching for signature…' : 'not started'}
        </span>
        <div style={{ flex: 1 }} />
        {!session && (
          <button
            onClick={createSession}
            disabled={creating}
            style={{ padding: '6px 12px', background: 'linear-gradient(135deg, #D2232A, #7a1c22)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}
          >
            {creating ? 'Creating…' : 'Generate live signoff link'}
          </button>
        )}
      </div>

      {session && !session.completed && (
        <div style={{ display: 'grid', gridTemplateColumns: '148px 1fr', gap: 14, alignItems: 'start' }}>
          <div ref={qrRef} style={{ padding: 8, background: '#0f1116', border: '1px solid #252b38', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 148 }} />
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#9aa3b8', marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' as const }}>
              Customer link
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input
                readOnly value={session.url}
                onClick={e => (e.target as HTMLInputElement).select()}
                style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid #252b38', borderRadius: 6, padding: '6px 8px', color: '#e8eaf0', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, outline: 'none' }}
              />
              <button onClick={copy} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid #2a3040', borderRadius: 6, color: '#e8eaf0', cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 0.5 }}>Copy</button>
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#5a6380', lineHeight: 1.55 }}>
              Text or scan the QR to the customer. Their signature will appear here live as they sign. No login required on their end.
            </div>
            <div style={{ marginTop: 10, height: 130, background: 'rgba(255,255,255,0.02)', border: '1px solid #252b38', borderRadius: 8, position: 'relative' as const }}>
              <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' as const }} />
              {session.strokes.length === 0 && (
                <div style={{ position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#5a6380', letterSpacing: 1, textTransform: 'uppercase' as const }}>
                  awaiting customer signature
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {session?.completed && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
          <div style={{ flex: 1, background: 'rgba(63,185,90,0.08)', border: '1px solid rgba(63,185,90,0.35)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3FB95A' }} />
              <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 12, color: '#3FB95A', letterSpacing: 1 }}>SIGNED &amp; ACCEPTED</span>
            </div>
            {session.customerName && (
              <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 14, color: '#e8eaf0', fontWeight: 600, marginBottom: 2 }}>
                {session.customerName}
              </div>
            )}
            {session.customerEmail && (
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#9aa3b8' }}>
                {session.customerEmail}
              </div>
            )}
            <div style={{ height: 100, marginTop: 10, background: '#0f1116', border: '1px solid #252b38', borderRadius: 6 }}>
              <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' as const }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
