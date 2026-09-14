'use client'

import React, { useEffect, useRef, useState } from 'react'

// Installation Guides — three field-ready PDFs the operator opens on site
// during install. Sub-tabs switch between them; the selected PDF is
// rendered inline as a stack of canvas pages using PDF.js so it works
// everywhere (including iOS Safari, which refuses to render PDFs in
// iframes and forces a download instead).

interface Guide {
  id: string
  title: string
  short: string
  file: string
  accent: string
  meta: string
}

const GUIDES: Guide[] = [
  {
    id: 'dji-dronesense',
    title: 'DJI Dock 3 DroneSense Installation',
    short: 'DJI Dock 3',
    file: '/guides/dji-dock-3-dronesense-installation.pdf',
    accent: '#D2232A',
    meta: 'Rev A · 07/2026 · 28 pages',
  },
  {
    id: 'dronetag-scout',
    title: 'DroneTag Scout Installation Guide',
    short: 'DroneTag Scout',
    file: '/guides/dronetag-scout-installation.pdf',
    accent: '#3b82f6',
    meta: 'Rev 01 · 14 pages',
  },
  {
    id: 'site-assessment',
    title: 'Site Assessment Field Guide',
    short: 'Site Assessment',
    file: '/guides/site-assessment-guide.pdf',
    accent: '#3FB95A',
    meta: 'Field use — Sales / Ops · 10 pages',
  },
]

// PDF.js loader — pinned to a UMD build so it works from a plain <script>.
// Loaded once per page life; subsequent tab switches reuse the same globals.
const PDFJS_VERSION = '3.11.174'
const PDFJS_SCRIPT = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`

declare global {
  interface Window { pdfjsLib?: any }
}

let pdfjsPromise: Promise<any> | null = null
function loadPdfJs(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('ssr'))
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
  if (pdfjsPromise) return pdfjsPromise
  pdfjsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = PDFJS_SCRIPT
    s.async = true
    s.onload = () => {
      if (!window.pdfjsLib) return reject(new Error('pdfjsLib missing after load'))
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
      resolve(window.pdfjsLib)
    }
    s.onerror = () => reject(new Error('pdf.js failed to load'))
    document.head.appendChild(s)
  })
  return pdfjsPromise
}

export default function InstallationGuides() {
  const [activeId, setActiveId] = useState<string>(GUIDES[0].id)
  const active = GUIDES.find(g => g.id === activeId) ?? GUIDES[0]
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState<string>('')
  const [numPages, setNumPages] = useState<number>(0)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Render the active PDF into containerRef. Cancels cleanly if the tab
  // changes mid-render (a stale render task shouldn't paint into a fresh
  // container).
  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    if (!container) return
    // Clear the previous document's pages before rendering the new one.
    container.innerHTML = ''
    setStatus('loading')
    setNumPages(0)
    setErrMsg('')

    ;(async () => {
      try {
        const pdfjs = await loadPdfJs()
        if (cancelled) return
        const loadingTask = pdfjs.getDocument({ url: active.file })
        const pdf = await loadingTask.promise
        if (cancelled) return
        setNumPages(pdf.numPages)

        // Target rendered width — bounded by container width so it fits
        // the panel on mobile without horizontal scroll.
        const targetWidth = Math.min(container.clientWidth || 900, 1100)

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return
          const page = await pdf.getPage(i)
          const baseViewport = page.getViewport({ scale: 1 })
          const scale = targetWidth / baseViewport.width
          const viewport = page.getViewport({ scale })

          const dpr = Math.min(window.devicePixelRatio || 1, 2)
          const canvas = document.createElement('canvas')
          canvas.width  = Math.floor(viewport.width  * dpr)
          canvas.height = Math.floor(viewport.height * dpr)
          canvas.style.width  = `${Math.floor(viewport.width)}px`
          canvas.style.height = `${Math.floor(viewport.height)}px`
          canvas.style.display = 'block'
          canvas.style.margin = '0 auto 12px'
          canvas.style.background = '#fff'
          canvas.style.boxShadow = '0 3px 12px rgba(0,0,0,0.35)'
          canvas.style.borderRadius = '3px'
          canvas.style.maxWidth = '100%'
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          ctx.scale(dpr, dpr)

          container.appendChild(canvas)
          await page.render({ canvasContext: ctx, viewport }).promise
          if (cancelled) return
        }
        if (!cancelled) setStatus('ready')
      } catch (e: any) {
        if (cancelled) return
        setStatus('error')
        setErrMsg(e?.message || 'Failed to load PDF')
      }
    })()

    return () => { cancelled = true }
  }, [active.file])

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 20px 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: active.accent, boxShadow: `0 0 8px ${active.accent}88`, transition: 'all 0.2s' }} />
          <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 800, fontSize: 12, letterSpacing: 2.5, color: active.accent, textTransform: 'uppercase', transition: 'color 0.2s' }}>
            Installation Guides
          </span>
        </div>
        <h1 style={{ margin: 0, fontFamily: "'Chakra Petch', sans-serif", fontWeight: 800, fontSize: 24, color: '#e8eaf0', letterSpacing: -0.5 }}>
          {active.title}
        </h1>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#5a6380', marginTop: 4, letterSpacing: 1, textTransform: 'uppercase' }}>
          {active.meta}{numPages > 0 && status === 'ready' ? ` · ${numPages} pages rendered` : ''}
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' as const,
        borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12,
      }}>
        {GUIDES.map(g => {
          const isActive = g.id === activeId
          return (
            <button
              key={g.id}
              onClick={() => setActiveId(g.id)}
              style={{
                padding: '9px 16px',
                background: isActive ? `linear-gradient(135deg, ${g.accent}, ${g.accent}bb)` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isActive ? g.accent : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 6,
                color: isActive ? '#fff' : '#9aa3b8',
                cursor: 'pointer',
                fontFamily: "'Chakra Petch', sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' as const,
                transition: 'all 0.15s',
              }}
            >
              {g.short}
            </button>
          )
        })}
      </div>

      {/* Inline PDF pages */}
      <div style={{
        border: `1px solid ${active.accent}33`,
        borderRadius: 8,
        background: 'linear-gradient(180deg, #1a1c22, #0f1116)',
        padding: 16,
        boxShadow: `0 6px 30px rgba(0,0,0,0.4), 0 0 0 1px ${active.accent}18`,
        minHeight: 300,
      }}>
        {status === 'loading' && (
          <div style={{
            display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
            padding: '60px 20px', color: '#9aa3b8', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 1,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              border: `2px solid ${active.accent}33`,
              borderTopColor: active.accent,
              animation: 'guide-spin 0.8s linear infinite',
              marginBottom: 14,
            }} />
            LOADING {active.short.toUpperCase()}…
            <style>{`@keyframes guide-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
        {status === 'error' && (
          <div style={{
            padding: '40px 20px', textAlign: 'center' as const, color: '#ff6b6b',
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
          }}>
            Failed to load PDF: {errMsg}
          </div>
        )}
        <div ref={containerRef} />
      </div>
    </div>
  )
}
