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
import AdminTasksPanel from '@/components/AdminPanel'

export type MainTab = 'dashboard' | 'deals' | 'pipeline' | 'all-deals' | 'hubspot'

const NAV: { id: MainTab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'deals',     label: 'Deals' },
  { id: 'pipeline',  label: 'Pipeline' },
  { id: 'all-deals', label: 'All Deals' },
  { id: 'hubspot',   label: 'HubSpot' },
]

const C = { bg: '#0a0b0d', card: '#111318', border: '#252b38', red: '#D2232A', text: '#e8eaf0', text2: '#9aa3b8', muted: '#5a6380' }

export default function Home() {
  const [tab, setTab]               = useState<MainTab>('dashboard')
  const [panelId, setPanelId]       = useState<string | null>(null)
  const [newDealOpen, setNewDealOpen] = useState(false)
  const [toolsOpen, setToolsOpen]   = useState(false)

  const openDeal  = (id: string) => setPanelId(id)
  const closeDeal = () => setPanelId(null)

  return (
    <div style={{ background: C.bg, minHeight: '100vh' }}>

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, height: 52,
        background: C.bg, borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', zIndex: 200,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', borderRight: `1px solid ${C.border}`, height: '100%', flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, background: C.red, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 11, color: '#fff' }}>DX</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 13, color: C.text, letterSpacing: 2 }}>DXD</span>
            <span style={{ color: C.muted, fontSize: 16, lineHeight: 1, marginTop: -1 }}>/</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>Ops Tracker</span>
          </div>
        </div>

        {/* Nav tabs */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', overflowX: 'auto', height: '100%', scrollbarWidth: 'none' }}>
          {NAV.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              height: '100%', padding: '0 16px', background: 'transparent', border: 'none',
              borderBottom: tab === t.id ? `2px solid ${C.red}` : '2px solid transparent',
              color: tab === t.id ? C.red : C.muted,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
              letterSpacing: 0.8, textTransform: 'uppercase',
              cursor: 'pointer', flexShrink: 0, transition: 'color 0.15s, border-color 0.15s',
              marginTop: 2,
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px', borderLeft: `1px solid ${C.border}`, height: '100%', flexShrink: 0 }}>
          {/* Tools dropdown */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setToolsOpen(o => !o)} style={{ padding: '6px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7, color: C.muted, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, cursor: 'pointer', letterSpacing: 0.5 }}>
              Tools ▾
            </button>
            {toolsOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={() => setToolsOpen(false)} />
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', minWidth: 160, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                  {[
                    { label: 'Equipment', tab: 'equipment' as const },
                    { label: 'Admin', tab: 'admin' as const },
                    { label: 'Cost Estimator', tab: 'cost' as const },
                  ].map(item => (
                    <ToolsMenuItem key={item.label} label={item.label} onClick={() => { setTab(item.tab as MainTab); setToolsOpen(false) }} />
                  ))}
                </div>
              </>
            )}
          </div>
          <button style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7, color: C.text2, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, cursor: 'pointer', letterSpacing: 0.5 }}>
            Sync
          </button>
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
      {tab === 'hubspot'   && <AdminPanel />}
      {(tab as string) === 'equipment' && <EquipmentTracker />}
      {(tab as string) === 'admin'     && <AdminTasksPanel />}
      {(tab as string) === 'cost'      && <CostEstimator />}

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

function ToolsMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: `1px solid ${C.border}`, color: C.text2, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, padding: '10px 14px', cursor: 'pointer' }}>
      {label}
    </button>
  )
}


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
