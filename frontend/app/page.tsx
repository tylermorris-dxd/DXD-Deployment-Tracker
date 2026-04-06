'use client'

import { useState } from 'react'
import ProjectList from '@/components/ProjectList'
import ProjectView from '@/components/ProjectView'
import EquipmentTracker from '@/components/EquipmentTracker'
import AdminPanel from '@/components/AdminPanel'
import { s } from '@/lib/styles'

type Tab = 'projects' | 'equipment' | 'admin'

export default function Home() {
  const [tab, setTab] = useState<Tab>('projects')
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  if (activeProjectId) {
    return <ProjectView projectId={activeProjectId} onBack={() => setActiveProjectId(null)} />
  }

  return (
    <>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 20px 0' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['projects', 'equipment', 'admin'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              ...s.ghostBtn,
              ...(tab === t ? { borderColor: '#e63946', color: '#E8ECF4' } : {}),
            }}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {tab === 'projects'  && <ProjectList onSelectProject={setActiveProjectId} />}
      {tab === 'equipment' && <EquipmentTracker />}
      {tab === 'admin'     && <AdminPanel />}
    </>
  )
}
