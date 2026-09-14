'use client'

import React, { useState } from 'react'

// Installation Guides — three field-ready PDFs the operator opens on site
// during install. Cards show what each guide covers; clicking one opens
// the full PDF in a fullscreen viewer (browser's native PDF renderer).
// Download button pulls the raw file if the operator needs it offline.

interface Guide {
  id: string
  title: string
  subtitle: string
  file: string
  desc: string
  accent: string
  icon: React.ReactNode
  meta: string
}

const GUIDES: Guide[] = [
  {
    id: 'dji-dronesense',
    title: 'DJI Dock 3 DroneSense Installation',
    subtitle: 'Field setup — twelve steps, crate to first flight',
    file: '/guides/dji-dock-3-dronesense-installation.pdf',
    desc: 'Site prep, mounting, power + network hookup, DroneSense Remote registration, FAA drone registration, and the first watched test flight.',
    accent: '#D2232A',
    meta: 'Rev A · 07/2026 · 28 pages',
    icon: (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <path d="M13 3l9 5v10l-9 5-9-5V8l9-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="13" cy="13" r="3" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    id: 'dronetag-scout',
    title: 'DroneTag Scout Installation Guide',
    subtitle: 'Remote ID receiver — bench test to live detection',
    file: '/guides/dronetag-scout-installation.pdf',
    desc: 'Indoor bench test, management page login, Dronetag App registration, pole siting, mount + PoE cable seal, and the first live-detection proof-of-life.',
    accent: '#3b82f6',
    meta: 'Rev 01 · 14 pages',
    icon: (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <rect x="6" y="8" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <line x1="9"  y1="4" x2="9"  y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="17" y1="4" x2="17" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="13" y1="18" x2="13" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4 6c1.5 1.5 1.5 4 0 5.5M22 6c-1.5 1.5-1.5 4 0 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      </svg>
    ),
  },
  {
    id: 'site-assessment',
    title: 'Site Assessment Field Guide',
    subtitle: 'Pre-install walk — desk work, siting, red flags',
    file: '/guides/site-assessment-guide.pdf',
    desc: 'Desk assessment before rolling, dock siting clearances, power and network specs, mounting decisions, red flags that force a relocation, and the final go/no-go gate.',
    accent: '#3FB95A',
    meta: 'Field use — Sales / Ops · 10 pages',
    icon: (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <path d="M4 6c0-1 .8-2 2-2h9l5 5v11c0 1-1 2-2 2H6c-1.2 0-2-1-2-2V6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M15 4v5h5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M8 14l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export default function InstallationGuides() {
  const [open, setOpen] = useState<Guide | null>(null)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px 60px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#D2232A', boxShadow: '0 0 8px #D2232A88' }} />
          <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 800, fontSize: 12, letterSpacing: 2.5, color: '#D2232A', textTransform: 'uppercase' }}>
            Installation Guides
          </span>
        </div>
        <h1 style={{ margin: 0, fontFamily: "'Chakra Petch', sans-serif", fontWeight: 800, fontSize: 26, color: '#e8eaf0', letterSpacing: -0.5 }}>
          Field playbooks
        </h1>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#9aa3b8', marginTop: 4, letterSpacing: 0.3 }}>
          The three documents you take on-site. Open in the viewer or download the PDF for offline use.
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {GUIDES.map(g => (
          <div
            key={g.id}
            style={{
              background: 'linear-gradient(160deg, rgba(24,26,32,0.92), rgba(15,17,22,0.98))',
              border: '1px solid rgba(255,255,255,0.08)',
              borderLeft: `3px solid ${g.accent}`,
              borderRadius: 10,
              padding: 20,
              display: 'flex', flexDirection: 'column' as const,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
              ;(e.currentTarget as HTMLDivElement).style.boxShadow = `0 6px 24px rgba(0,0,0,0.5), 0 0 0 1px ${g.accent}33`
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.transform = ''
              ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 8,
                background: `${g.accent}18`, border: `1px solid ${g.accent}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: g.accent, flexShrink: 0,
              }}>
                {g.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 800, fontSize: 15, color: '#e8eaf0', lineHeight: 1.3, letterSpacing: 0.2 }}>
                  {g.title}
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: g.accent, marginTop: 3, letterSpacing: 1, textTransform: 'uppercase' as const }}>
                  {g.subtitle}
                </div>
              </div>
            </div>

            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#9aa3b8', lineHeight: 1.6, marginBottom: 14, flex: 1 }}>
              {g.desc}
            </div>

            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 12 }}>
              {g.meta}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setOpen(g)}
                style={{
                  flex: 1, padding: '9px 14px',
                  background: `linear-gradient(135deg, ${g.accent}, ${g.accent}bb)`,
                  border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer',
                  fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
                  textTransform: 'uppercase' as const,
                }}
              >
                Open Guide
              </button>
              <a
                href={g.file}
                download
                style={{
                  padding: '9px 14px',
                  background: 'transparent', border: `1px solid ${g.accent}55`, borderRadius: 6, color: g.accent,
                  cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: 1,
                  textTransform: 'uppercase' as const, textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                ↓ PDF
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Full-screen PDF viewer */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 800,
            background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(4px)',
            display: 'flex', flexDirection: 'column' as const,
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
            background: '#12141a', borderBottom: `1px solid ${open.accent}44`,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 6,
              background: `${open.accent}18`, border: `1px solid ${open.accent}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: open.accent, flexShrink: 0,
            }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>📄</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 13, color: '#e8eaf0', overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const }}>
                {open.title}
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380', letterSpacing: 1 }}>
                {open.meta}
              </div>
            </div>
            <a
              href={open.file} download
              style={{
                padding: '6px 12px', background: 'transparent', border: `1px solid ${open.accent}55`, borderRadius: 5, color: open.accent,
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, textDecoration: 'none', letterSpacing: 1, textTransform: 'uppercase' as const,
              }}
            >
              ↓ Download
            </a>
            <button
              onClick={() => setOpen(null)}
              style={{
                padding: '6px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5, color: '#e8eaf0',
                cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' as const,
              }}
            >
              Close
            </button>
          </div>
          <iframe
            src={open.file}
            title={open.title}
            style={{ flex: 1, width: '100%', border: 'none', background: '#0a0b0d' }}
          />
        </div>
      )}
    </div>
  )
}
