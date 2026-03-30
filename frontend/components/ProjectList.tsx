'use client'

import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { s, progressColor } from '@/lib/styles'
import { Icons } from '@/lib/icons'
import type { ProjectSummary } from '@/lib/types'

export default function ProjectList({ onSelectProject }: { onSelectProject: (id: string) => void }) {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newClient, setNewClient] = useState('')
  const [newSite, setNewSite] = useState('')

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: api.projects.list,
  })

  const createMutation = useMutation({
    mutationFn: () => api.projects.create({ name: newName.trim(), client: newClient.trim(), site: newSite.trim() }),
    onSuccess: (proj) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setNewName(''); setNewClient(''); setNewSite(''); setShowNew(false)
      onSelectProject(proj.id)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: api.projects.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  const handleCreate = () => {
    if (!newName.trim()) return
    createMutation.mutate()
  }

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logoRow}>
          <img src="/images/logo.png" alt="DXD" style={s.logoImg} />
          <div>
            <div style={s.logoTitle}>DEUS X DEFENSE</div>
            <div style={s.logoSub}>DRONE DEPLOYMENT OPS</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={s.ghostBtn} onClick={() => setShowNew(!showNew)}>
            {Icons.plus}<span>NEW PROJECT</span>
          </button>
        </div>
      </div>

      {/* New Project Form */}
      {showNew && (
        <div style={{ ...s.card, marginBottom: 20, animation: 'fadeSlideIn 0.2s ease' }}>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 10, color: '#e63946', letterSpacing: 1.5, marginBottom: 12 }}>NEW PROJECT</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={s.fieldLabel}>PROJECT NAME *</label>
              <input
                autoFocus
                style={s.input}
                placeholder="e.g. Acme Corp HQ Deployment"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowNew(false) }}
              />
            </div>
            <div>
              <label style={s.fieldLabel}>CLIENT</label>
              <input style={s.input} placeholder="Client or company name" value={newClient} onChange={e => setNewClient(e.target.value)} />
            </div>
            <div>
              <label style={s.fieldLabel}>SITE / LOCATION</label>
              <input style={s.input} placeholder="e.g. Dallas, TX" value={newSite} onChange={e => setNewSite(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={s.primaryBtn} onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Project'}
            </button>
            <button style={s.ghostBtn} onClick={() => setShowNew(false)}>Cancel</button>
          </div>
          {createMutation.isError && (
            <div style={{ color: '#ef4444', fontSize: 11, marginTop: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
              {(createMutation.error as Error).message}
            </div>
          )}
        </div>
      )}

      {/* Project List */}
      {isLoading ? (
        <div style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, padding: 40, textAlign: 'center' }}>
          Loading projects...
        </div>
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🛸</div>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, marginBottom: 8 }}>NO PROJECTS YET</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Create your first drone deployment project above.</div>
        </div>
      ) : (
        <div>
          {projects.map(proj => <ProjectCard key={proj.id} proj={proj} onOpen={onSelectProject} onDelete={id => {
            if (window.confirm(`Delete "${proj.name}"? This cannot be undone.`)) deleteMutation.mutate(id)
          }} />)}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ proj, onOpen, onDelete }: { proj: ProjectSummary; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  const pct = proj.totalTasks > 0 ? Math.round((proj.doneTasks / proj.totalTasks) * 100) : 0
  const color = progressColor(pct)

  return (
    <div style={{ ...s.card, cursor: 'default', display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 15, fontWeight: 600, color: '#E8ECF4', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {proj.name}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          {proj.client && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{proj.client}</span>}
          {proj.site && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>📍 {proj.site}</span>}
        </div>
        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: pct + '%', height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s ease' }} />
          </div>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
            {proj.doneTasks}/{proj.totalTasks}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button style={s.primaryBtn} onClick={() => onOpen(proj.id)}>OPEN</button>
        <button style={{ ...s.iconBtn, padding: '6px 8px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }} onClick={() => onDelete(proj.id)} title="Delete project">
          {Icons.trash}
        </button>
      </div>
    </div>
  )
}
