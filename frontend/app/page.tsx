'use client'

import { useState, useRef, useEffect } from 'react'
import ProjectList from '@/components/ProjectList'
import ProjectView from '@/components/ProjectView'
import EquipmentTracker from '@/components/EquipmentTracker'
import AdminPanel from '@/components/AdminPanel'
import CostEstimator from '@/components/CostEstimator'
import DroneTeviApp from '@/components/DroneTeviApp'
import EventPricingApp from '@/components/EventPricingApp'
import Dashboard from '@/components/Dashboard'
import { s } from '@/lib/styles'

type Tab = 'dashboard' | 'projects' | 'equipment' | 'admin' | 'cost' | 'product' | 'pricing'

const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'DASHBOARD',
  projects: 'PROJECTS',
  equipment: 'EQUIPMENT',
  admin: 'ADMIN',
  cost: 'COST ESTIMATOR',
  product: 'PRODUCT',
  pricing: 'EVENT PRICING',
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [dropOpen, setDropOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  if (activeProjectId) {
    return <ProjectView projectId={activeProjectId} onBack={() => setActiveProjectId(null)} />
  }

  return (
    <>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 20px 0' }}>
        <div ref={dropRef} style={{ position: 'relative', display: 'inline-block' }}>
          <button
            onClick={() => setDropOpen(o => !o)}
            style={{
              ...s.ghostBtn,
              borderColor: 'rgba(255,255,255,0.2)',
              color: '#E8ECF4',
              minWidth: 180,
              justifyContent: 'space-between',
            }}
          >
            <span>{TAB_LABELS[tab]}</span>
            <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 8 }}>▼</span>
          </button>
          {dropOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
              background: 'rgba(18,18,20,0.98)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, overflow: 'hidden', minWidth: 180,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}>
              {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setDropOpen(false) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: t === tab ? 'rgba(230,57,70,0.12)' : 'transparent',
                    border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)',
                    color: t === tab ? '#e63946' : 'rgba(255,255,255,0.65)',
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11, letterSpacing: 1,
                    padding: '10px 14px', cursor: 'pointer',
                  }}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'projects'  && <ProjectList onSelectProject={setActiveProjectId} />}
      {tab === 'equipment' && <EquipmentTracker />}
      {tab === 'admin'     && <AdminPanel />}
      {tab === 'cost'      && <CostEstimator />}
      {tab === 'product'   && <DroneTeviApp />}
      {tab === 'pricing'   && <EventPricingApp />}
    </>
  )
}
