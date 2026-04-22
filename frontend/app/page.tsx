'use client'

import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import Dashboard from '@/components/Dashboard'
import ProjectList from '@/components/ProjectList'
import ProjectView from '@/components/ProjectView'
import AdminPanel from '@/components/AdminPanel'
import PipelineView from '@/components/PipelineView'
import AllDealsTable from '@/components/AllDealsTable'
import EquipmentTracker from '@/components/EquipmentTracker'
import CostEstimator from '@/components/CostEstimator'

export type MainTab = 'dashboard' | 'deals' | 'pipeline' | 'all-deals' | 'admin' | 'equipment' | 'cost'

const MENU_ITEMS: { id: MainTab; label: string; dividerBefore?: boolean }[] = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'deals',      label: 'Deals' },
  { id: 'pipeline',   label: 'Pipeline' },
  { id: 'all-deals',  label: 'All Deals' },
  { id: 'admin',      label: 'Admin',          dividerBefore: true },
  { id: 'equipment',  label: 'Equipment' },
  { id: 'cost',       label: 'Cost Estimator' },
]

const C = { bg: 'rgba(10,11,13,0.6)', card: 'rgba(17,19,24,0.75)', border: '#252b38', red: '#D2232A', text: '#e8eaf0', text2: '#9aa3b8', muted: '#5a6380' }

export default function Home() {
  const [tab, setTab]               = useState<MainTab>('dashboard')
  const [panelId, setPanelId]       = useState<string | null>(null)
  const [newDealOpen, setNewDealOpen] = useState(false)
  const [menuOpen, setMenuOpen]     = useState(false)

  const openDeal  = (id: string) => setPanelId(id)
  const closeDeal = () => setPanelId(null)

  const activeLabel = MENU_ITEMS.find(m => m.id === tab)?.label ?? 'Menu'

  return (
    <div style={{ background: C.bg, minHeight: '100vh' }}>

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, height: 52,
        background: 'rgba(10,11,13,0.75)', borderBottom: `1px solid ${C.border}`,
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', zIndex: 200,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', borderRight: `1px solid ${C.border}`, height: '100%', flexShrink: 0 }}>
          <img src="/images/logo.png" alt="DXD" style={{ height: 32, width: 'auto', flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 13, color: C.text, letterSpacing: 0.5, lineHeight: 1.2 }}>Deus X Defense</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>Ops Tracker</div>
          </div>
        </div>

        {/* Menu dropdown */}
        <div style={{ position: 'relative', padding: '0 16px', height: '100%', display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', background: menuOpen ? 'rgba(210,35,42,0.1)' : 'transparent',
              border: `1px solid ${menuOpen ? C.red + '60' : C.border}`,
              borderRadius: 7, color: menuOpen ? C.red : C.text2,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
              letterSpacing: 0.8, cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            Menu ▾
          </button>
          {menuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={() => setMenuOpen(false)} />
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 300, background: 'rgba(17,19,24,0.97)', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', minWidth: 200, boxShadow: '0 12px 40px rgba(0,0,0,0.7)', backdropFilter: 'blur(16px)' }}>
                {MENU_ITEMS.map(item => (
                  <React.Fragment key={item.id}>
                    {item.dividerBefore && <div style={{ height: 1, background: C.border, margin: '4px 0' }} />}
                    <button
                      onClick={() => { setTab(item.id); setMenuOpen(false) }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        background: tab === item.id ? 'rgba(210,35,42,0.1)' : 'transparent',
                        border: 'none', padding: '11px 16px',
                        color: tab === item.id ? C.red : C.text2,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                        fontWeight: tab === item.id ? 600 : 400,
                        cursor: 'pointer', letterSpacing: 0.5,
                        transition: 'background 0.1s, color 0.1s',
                      }}
                      onMouseEnter={e => { if (tab !== item.id) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                      onMouseLeave={e => { if (tab !== item.id) e.currentTarget.style.background = 'transparent' }}
                    >
                      {item.label}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Current tab indicator */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingLeft: 4 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.muted, letterSpacing: 0.5 }}>
            {activeLabel}
          </span>
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px', borderLeft: `1px solid ${C.border}`, height: '100%', flexShrink: 0 }}>
          <button onClick={() => setNewDealOpen(true)} style={{ padding: '7px 18px', background: C.red, border: 'none', borderRadius: 7, color: '#fff', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: 0.5, cursor: 'pointer' }}>
            New Deal
          </button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {tab === 'dashboard' && <Dashboard onOpenDeal={openDeal} onSwitchTab={setTab} />}
      {tab === 'deals'     && <ProjectList onSelectProject={openDeal} />}
      {tab === 'pipeline'  && <PipelineView onOpenDeal={openDeal} />}
      {tab === 'all-deals' && <AllDealsTable onOpenDeal={openDeal} />}
      {tab === 'admin'     && <AdminPanel />}
      {tab === 'equipment' && <EquipmentTracker />}
      {tab === 'cost'      && <CostEstimator />}

      {/* ── Full-page deal view ──────────────────────────────────────────────── */}
      {panelId && (
        <div style={{
          position: 'fixed', inset: 0,
          background: C.bg,
          zIndex: 300, overflowY: 'auto',
          animation: 'fadeSlideIn 0.2s ease',
        }}>
          <ProjectView projectId={panelId} onBack={closeDeal} />
        </div>
      )}

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

function NewDealModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName]     = useState('')
  const [client, setClient] = useState('')
  const [site, setSite]     = useState('')
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
