'use client'

import React, { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import Dashboard from '@/components/Dashboard'
import ProjectList from '@/components/ProjectList'
import ProjectView from '@/components/ProjectView'
import AdminPanel from '@/components/AdminPanel'
import EquipmentTracker from '@/components/EquipmentTracker'
import CostEstimator from '@/components/CostEstimator'
import DroneTeviApp from '@/components/DroneTeviApp'
import EventPricingApp from '@/components/EventPricingApp'
import JobEstimator from '@/components/JobEstimator'
import CommandPalette from '@/components/CommandPalette'
import FleetMap from '@/components/FleetMap'
import Toaster from '@/components/Toaster'
import BootSequence from '@/components/BootSequence'
import SettingsPopover from '@/components/SettingsPopover'
import ShortcutHelp from '@/components/ShortcutHelp'
import FleetCopilot from '@/components/FleetCopilot'
import { sfx } from '@/lib/sfx'
import { useIsMobile } from '@/lib/useIsMobile'

export type MainTab = 'dashboard' | 'deals' | 'fleet' | 'admin' | 'equipment' | 'cost' | 'product' | 'events' | 'job-est'

interface MenuItem {
  id: MainTab
  label: string
  icon: React.ReactNode
}

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'dashboard', label: 'Dashboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    id: 'deals', label: 'Deals',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="5" width="12" height="9" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6 5V3.5a1 1 0 011-1h2a1 1 0 011 1V5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'fleet', label: 'Fleet Map',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5C5.24 1.5 3 3.74 3 6.5c0 3.9 5 8 5 8s5-4.1 5-8c0-2.76-2.24-5-5-5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <circle cx="8" cy="6.5" r="1.8" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    id: 'admin', label: 'Admin',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'equipment', label: 'Equipment',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 4.5l6-2.5 6 2.5v7L8 14l-6-2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M2 4.5L8 7l6-2.5M8 7v7" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    id: 'cost', label: 'Cost Estimator',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="3" y="2" width="10" height="12" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
        <rect x="5" y="4" width="6" height="2" rx="0.5" fill="currentColor" />
        <circle cx="5.6" cy="9" r="0.7" fill="currentColor" />
        <circle cx="8" cy="9" r="0.7" fill="currentColor" />
        <circle cx="10.4" cy="9" r="0.7" fill="currentColor" />
        <circle cx="5.6" cy="11.5" r="0.7" fill="currentColor" />
        <circle cx="8" cy="11.5" r="0.7" fill="currentColor" />
        <circle cx="10.4" cy="11.5" r="0.7" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'job-est', label: 'Job Estimator',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 2.5h7l3 3v8a1 1 0 01-1 1H3a1 1 0 01-1-1v-10a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M10 2.5v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <line x1="5" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="5" y1="11.5" x2="9" y2="11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'events', label: 'Event Pricing',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 5a1 1 0 011-1h8a1 1 0 011 1v1.5a1.5 1.5 0 100 3V11a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5a1.5 1.5 0 100-3V5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <line x1="7" y1="6.5" x2="7" y2="9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="1.4 1.4" />
      </svg>
    ),
  },
  {
    id: 'product', label: 'Products',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="13" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="3" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="13" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.3" />
        <line x1="4.1" y1="4.1" x2="11.9" y2="11.9" stroke="currentColor" strokeWidth="1.3" />
        <line x1="11.9" y1="4.1" x2="4.1" y2="11.9" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" fill="currentColor" fillOpacity="0.25" />
      </svg>
    ),
  },
]

const C = { bg: 'rgba(10,11,13,0.6)', card: 'rgba(17,19,24,0.75)', sidebarBg: 'rgba(13,15,19,0.85)', border: '#252b38', red: '#D2232A', text: '#e8eaf0', text2: '#9aa3b8', muted: '#5a6380' }

const TOPBAR_HEIGHT = 52
const SIDEBAR_WIDTH = 232

export default function Home() {
  const [tab, setTab] = useState<MainTab>('dashboard')
  const [panelId, setPanelId] = useState<string | null>(null)
  const [newDealOpen, setNewDealOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const isMobile = useIsMobile()

  const openDeal = (id: string) => setPanelId(id)
  const closeDeal = () => setPanelId(null)

  // Close the drawer whenever we switch tabs so tapping a sidebar entry
  // takes the user straight to the content (rather than leaving the
  // drawer covering the page). Also close it whenever we transition off
  // mobile (rotate the phone or resize the browser).
  useEffect(() => { if (!isMobile) setMobileMenuOpen(false) }, [isMobile])

  // Cmd/Ctrl+K opens the command palette from anywhere in the app.
  // "?" opens the shortcut cheatsheet — but only when the user isn't
  // typing into an input, textarea, or contenteditable element.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(v => !v)
        sfx.ping()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setCopilotOpen(v => !v)
        sfx.ping()
        return
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        const t = e.target as HTMLElement | null
        const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
        if (typing) return
        e.preventDefault()
        setHelpOpen(v => !v)
        sfx.click()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const activeLabel = MENU_ITEMS.find(m => m.id === tab)?.label ?? 'Menu'

  return (
    <div style={{ background: C.bg, minHeight: '100vh' }}>

      <BootSequence />
      <Toaster />


      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, height: TOPBAR_HEIGHT,
        background: 'rgba(10,11,13,0.85)', borderBottom: `1px solid ${C.border}`,
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', zIndex: 200,
      }}>
        {isMobile ? (
          /* Mobile: compact brand + hamburger. The full menu lives in the
             slide-out drawer below. */
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: '100%', flexShrink: 0 }}>
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              aria-label="Open menu"
              style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 4, width: 38, height: 38, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginRight: 4 }}
            >
              <span style={{ width: 20, height: 2, background: C.text, borderRadius: 1, transform: mobileMenuOpen ? 'translateY(6px) rotate(45deg)' : 'none', transition: 'transform 0.2s' }} />
              <span style={{ width: 20, height: 2, background: C.text, borderRadius: 1, opacity: mobileMenuOpen ? 0 : 1, transition: 'opacity 0.2s' }} />
              <span style={{ width: 20, height: 2, background: C.text, borderRadius: 1, transform: mobileMenuOpen ? 'translateY(-6px) rotate(-45deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
            <img src="/images/logo.png" alt="DXD" style={{ height: 26, width: 'auto', flexShrink: 0 }} />
          </div>
        ) : (
          /* Desktop brand block, sized to align with the sidebar. */
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', width: SIDEBAR_WIDTH, borderRight: `1px solid ${C.border}`, height: '100%', flexShrink: 0, boxSizing: 'border-box' }}>
            <img src="/images/logo.png" alt="DXD" style={{ height: 32, width: 'auto', flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 13, color: C.text, letterSpacing: 0.5, lineHeight: 1.2 }}>Deus X Defense</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>Ops Tracker</div>
            </div>
          </div>
        )}

        {/* Current page label */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: isMobile ? '0 12px' : '0 22px', minWidth: 0 }}>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: isMobile ? 13 : 14, color: C.text, letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeLabel}
          </span>
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px', borderLeft: `1px solid ${C.border}`, height: '100%', flexShrink: 0 }}>
          {!isMobile && (
            <button
              onClick={() => setPaletteOpen(true)}
              title="Quick search (⌘K)"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px 6px 12px',
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
                borderRadius: 7, color: C.text2, fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, cursor: 'pointer', letterSpacing: 0.3,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: C.muted }}>
                <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
                <line x1="7.5" y1="7.5" x2="10" y2="10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              Search
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.muted, background: '#0d1017', border: `1px solid ${C.border}`, borderRadius: 3, padding: '1px 5px', marginLeft: 4 }}>⌘K</span>
            </button>
          )}
          {!isMobile && (
            <button
              onClick={() => { setCopilotOpen(v => !v); sfx.ping() }}
              title="Ask Fleet Copilot (⌘J)"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px 6px 8px',
                background: copilotOpen ? 'rgba(210,35,42,0.15)' : 'linear-gradient(135deg, rgba(210,35,42,0.10), rgba(210,35,42,0.02))',
                border: `1px solid ${copilotOpen ? 'rgba(210,35,42,0.5)' : 'rgba(210,35,42,0.28)'}`,
                borderRadius: 7, color: '#e8eaf0', cursor: 'pointer',
                fontFamily: 'Syne, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: 0.4,
              }}
            >
              <span style={{
                width: 16, height: 16, borderRadius: 4,
                background: 'linear-gradient(135deg, #D2232A, #7a1c22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontWeight: 800,
              }}>AI</span>
              Copilot
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.muted, background: '#0d1017', border: `1px solid ${C.border}`, borderRadius: 3, padding: '1px 5px', marginLeft: 2 }}>⌘J</span>
            </button>
          )}
          <SettingsPopover />
          <button onClick={() => { setNewDealOpen(true); sfx.ack() }} style={{ padding: '7px 18px', background: C.red, border: 'none', borderRadius: 7, color: '#fff', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: 0.5, cursor: 'pointer' }}>
            New Deal
          </button>
        </div>
      </div>

      {/* ── Mobile backdrop: dims the page + closes the drawer on tap ─────── */}
      {isMobile && mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed', top: TOPBAR_HEIGHT, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 199,
            backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* ── Layout: sidebar + main ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {/* Sidebar
            Desktop: sticky column beside main content.
            Mobile:  fixed slide-out drawer overlaid on the content, closed
                     by default, opened via the hamburger. */}
        <aside
          style={{
            width: isMobile ? Math.min(300, SIDEBAR_WIDTH + 20) : SIDEBAR_WIDTH,
            flexShrink: 0,
            position: isMobile ? 'fixed' : 'sticky',
            top: TOPBAR_HEIGHT,
            left: 0,
            height: `calc(100vh - ${TOPBAR_HEIGHT}px)`,
            overflowY: 'auto',
            background: isMobile ? 'rgba(10,11,13,0.98)' : C.sidebarBg,
            borderRight: `1px solid ${C.border}`,
            padding: '16px 14px 24px',
            boxSizing: 'border-box',
            zIndex: isMobile ? 210 : 'auto',
            transform: isMobile && !mobileMenuOpen ? 'translateX(-110%)' : 'translateX(0)',
            transition: isMobile ? 'transform 0.24s ease' : 'none',
            boxShadow: isMobile && mobileMenuOpen ? '0 0 24px rgba(0,0,0,0.6)' : 'none',
          }}
        >
          {MENU_ITEMS.map(item => (
            <SidebarCard
              key={item.id}
              active={tab === item.id}
              onClick={() => { if (tab !== item.id) sfx.whoosh(); setTab(item.id); setMobileMenuOpen(false) }}
              icon={item.icon}
              label={item.label}
            />
          ))}
        </aside>

        {/* Main content — full width on mobile, flexible column on desktop */}
        <main style={{ flex: 1, minWidth: 0, width: isMobile ? '100%' : undefined }}>
          {tab === 'dashboard'    && <Dashboard onOpenDeal={openDeal} onSwitchTab={setTab} />}
          {tab === 'deals'        && <ProjectList onSelectProject={openDeal} />}
          {tab === 'fleet'        && (
            <div style={{ padding: isMobile ? 12 : 20 }}>
              <FleetMap onOpenDeal={openDeal} />
            </div>
          )}
          {tab === 'admin'        && <AdminPanel />}
          {tab === 'equipment'    && <EquipmentTracker />}
          {tab === 'cost'         && <CostEstimator />}
          {tab === 'product'      && <DroneTeviApp />}
          {tab === 'job-est' && <JobEstimator />}
          {tab === 'events'       && <EventPricingApp />}
        </main>
      </div>

      {/* ── Full-page deal view ──────────────────────────────────────────────── */}
      {panelId && (
        <div style={{
          position: 'fixed', inset: 0,
          background: '#0a0b0d',
          zIndex: 300, overflowY: 'auto',
          animation: 'fadeSlideIn 0.2s ease',
        }}>
          <ProjectView projectId={panelId} onBack={closeDeal} />
        </div>
      )}

      {/* ── ? shortcut cheatsheet ─────────────────────────────────────────── */}
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* ── AI Fleet Copilot ──────────────────────────────────────────────── */}
      <FleetCopilot
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        onOpenDeal={id => openDeal(id)}
      />

      {/* ── Cmd/Ctrl+K command palette ──────────────────────────────────────── */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenDeal={id => { setPaletteOpen(false); openDeal(id) }}
        onSwitchTab={t => { setPaletteOpen(false); setTab(t); setPanelId(null) }}
      />

      {/* ── New Deal modal ───────────────────────────────────────────────────── */}
      {newDealOpen && (
        <NewDealModal
          onClose={() => setNewDealOpen(false)}
          onCreated={id => { setNewDealOpen(false); openDeal(id) }}
        />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SidebarCard({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  const [hover, setHover] = useState(false)
  const bg = active
    ? 'rgba(210,35,42,0.13)'
    : hover ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)'
  const borderColor = active
    ? 'rgba(210,35,42,0.5)'
    : hover ? 'rgba(255,255,255,0.12)' : C.border
  const color = active ? C.red : hover ? C.text : C.text2
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 11,
        width: '100%', padding: '11px 12px', marginBottom: 6,
        background: bg, border: `1px solid ${borderColor}`,
        borderRadius: 8, color, cursor: 'pointer',
        fontFamily: 'Syne, sans-serif', fontWeight: active ? 700 : 600,
        fontSize: 12.5, letterSpacing: 0.4, textAlign: 'left' as const,
        transition: 'background 0.12s, border-color 0.12s, color 0.12s',
        boxShadow: active ? '0 0 0 1px rgba(210,35,42,0.18) inset' : 'none',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {active && (
        <span style={{ width: 4, height: 16, background: C.red, borderRadius: 2, flexShrink: 0 }} />
      )}
    </button>
  )
}

function NewDealModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [site, setSite] = useState('')
  const [loading, setLoading] = useState(false)
  const qc = useQueryClient()

  async function create() {
    if (!name.trim()) return
    setLoading(true)
    try {
      const proj = await api.projects.create({ name: name.trim(), client: client.trim() || undefined, site: site.trim() || undefined })
      qc.invalidateQueries({ queryKey: ['projects'] })
      onCreated(proj.id)
    } catch {
      setLoading(false)
    }
  }

  const inp: React.CSSProperties = { width: '100%', background: '#181c23', border: `1px solid ${C.border}`, borderRadius: 7, padding: '10px 12px', color: C.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '28px 32px', width: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 18, color: C.text, marginBottom: 24 }}>New Deal</div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Deal Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Southside Industrial Complex" style={inp} onKeyDown={e => e.key === 'Enter' && create()} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Client</label>
          <input value={client} onChange={e => setClient(e.target.value)} placeholder="e.g. Acme Security Corp" style={inp} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={lbl}>Site Address</label>
          <input value={site} onChange={e => setSite(e.target.value)} placeholder="e.g. 5623 Two Notch Rd, Columbia SC" style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={create} disabled={!name.trim() || loading}
            style={{ flex: 1, padding: '11px 0', background: name.trim() && !loading ? C.red : '#3a1010', border: 'none', borderRadius: 8, color: '#fff', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 12, cursor: name.trim() && !loading ? 'pointer' : 'not-allowed', opacity: name.trim() && !loading ? 1 : 0.6 }}>
            {loading ? 'Creating...' : 'Create Deal'}
          </button>
          <button onClick={onClose}
            style={{ flex: 1, padding: '11px 0', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text2, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
