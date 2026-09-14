'use client'

import React, { useState } from 'react'

// Installation Guides — three field-ready PDFs the operator opens on site
// during install. Sub-tabs at the top switch between them; the selected
// PDF is embedded directly in the page and scrolls with the normal
// document scroll (no modal, no popup).

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

export default function InstallationGuides() {
  const [activeId, setActiveId] = useState<string>(GUIDES[0].id)
  const active = GUIDES.find(g => g.id === activeId) ?? GUIDES[0]

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
          {active.meta}
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' as const,
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
        <div style={{ flex: 1 }} />
        <a
          href={active.file} download
          style={{
            padding: '9px 14px',
            background: 'transparent', border: `1px solid ${active.accent}55`, borderRadius: 6, color: active.accent,
            cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase' as const, textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          ↓ Download PDF
        </a>
      </div>

      {/* Embedded PDF viewer — scrolls with the page */}
      <div style={{
        border: `1px solid ${active.accent}33`,
        borderRadius: 8,
        overflow: 'hidden' as const,
        background: '#0a0b0d',
        boxShadow: `0 6px 30px rgba(0,0,0,0.4), 0 0 0 1px ${active.accent}18`,
      }}>
        <iframe
          key={active.id}
          src={active.file}
          title={active.title}
          style={{
            width: '100%',
            height: 'calc(100vh - 220px)',
            minHeight: 600,
            border: 'none',
            display: 'block',
          }}
        />
      </div>

      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#5a6380', textAlign: 'center' as const, marginTop: 10, letterSpacing: 0.5 }}>
        Use the toolbar in the viewer to zoom, print, or jump to a page.
      </div>
    </div>
  )
}
