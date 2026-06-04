'use client'

import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { s } from '@/lib/styles'
import { Icons } from '@/lib/icons'
import type { ProjectSummary, HubSpotActiveDeal } from '@/lib/types'

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

  const { data: activeDeals = [] } = useQuery({
    queryKey: ['hubspotActive'],
    queryFn: api.hubspot.getActive,
    refetchInterval: 60_000,
  })

  const dealMap = new Map<string, HubSpotActiveDeal>(
    activeDeals.map((a: HubSpotActiveDeal) => [a.projectId, a])
  )

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
          </div>
        </div>
        <button style={s.primaryBtn} onClick={() => setShowNew(!showNew)}>
          {Icons.plus}<span>NEW PROJECT</span>
        </button>
      </div>

      {/* New Project Form */}
      {showNew && (
        <div style={{ background: 'rgba(40,40,42,0.85)', border: '1px solid rgba(229,57,53,0.2)', borderRadius: 10, padding: 24, marginBottom: 24, backdropFilter: 'blur(12px)', animation: 'fadeSlideIn 0.3s ease' }}>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 10, color: '#e63946', letterSpacing: 1.5, marginBottom: 14 }}>NEW PROJECT</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={s.fieldLabel}>PROJECT NAME *</label>
              <input autoFocus style={s.input} placeholder="e.g. Acme Corp HQ Deployment"
                value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowNew(false) }} />
            </div>
            <div>
              <label style={s.fieldLabel}>CLIENT</label>
              <input style={s.input} placeholder="e.g. Acme Corporation" value={newClient} onChange={e => setNewClient(e.target.value)} />
            </div>
            <div>
              <label style={s.fieldLabel}>SITE LOCATION</label>
              <input style={s.input} placeholder="e.g. Dallas, TX" value={newSite} onChange={e => setNewSite(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={s.ghostBtn} onClick={() => setShowNew(false)}>CANCEL</button>
            <button style={{ ...s.primaryBtn, opacity: newName.trim() ? 1 : 0.4 }}
              disabled={!newName.trim() || createMutation.isPending}
              onClick={handleCreate}>
              {createMutation.isPending ? 'CREATING…' : 'DEPLOY PROJECT'}
            </button>
          </div>
          {createMutation.isError && (
            <div style={{ color: '#ef4444', fontSize: 11, marginTop: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
              {(createMutation.error as Error).message}
            </div>
          )}
        </div>
      )}

      {/* Project Grid (single section — no more Active/Steady State partition
          since we removed the task tracker) */}
      {isLoading ? (
        <div style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, padding: 40, textAlign: 'center' }}>
          Loading projects...
        </div>
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <img src="/images/logo.png" alt="DXD" style={{ width: 64, height: 64, objectFit: 'contain', opacity: 0.2, marginBottom: 16 }} />
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, marginBottom: 8 }}>NO ACTIVE DEPLOYMENTS</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Create your first project to begin tracking a drone deployment.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 14 }}>
          {projects.map((p, i) => (
            <ProjectCard key={p.id} proj={p} index={i} activeDeal={dealMap.get(p.id)}
              onOpen={() => onSelectProject(p.id)}
              onDelete={() => { if (window.confirm(`Delete "${p.name}"? This cannot be undone.`)) deleteMutation.mutate(p.id) }} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ proj, index, activeDeal, onOpen, onDelete }: {
  proj: ProjectSummary
  index: number
  activeDeal?: HubSpotActiveDeal
  onOpen: () => void
  onDelete: () => void
}) {
  const accentColor = '#E53935' // brand red — no more progress-based color
  const hsStage = activeDeal?.deal.properties.dealstage

  return (
    <div
      onClick={onOpen}
      style={{
        background: 'linear-gradient(160deg, rgba(32,32,36,0.97), rgba(22,22,26,0.99))',
        border: '1px solid rgba(255,255,255,0.09)',
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 10,
        padding: '18px 20px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.35)',
        animationDelay: `${index * 0.06}s`,
        animation: 'fadeSlideIn 0.4s ease both',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 6px 24px rgba(0,0,0,0.5), 0 0 0 1px ${accentColor}33` }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 16px rgba(0,0,0,0.35)' }}
    >
      {/* Top row: HS badge + HubSpot stage + delete */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {activeDeal && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, letterSpacing: 1, fontWeight: 700, background: 'rgba(255,152,0,0.12)', border: '1px solid rgba(255,152,0,0.35)', borderRadius: 4, padding: '3px 7px', color: '#FF9800', fontFamily: "'Chakra Petch', sans-serif" }}>
              HS
            </span>
          )}
          {hsStage && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 10, letterSpacing: 1.5, fontWeight: 700, textTransform: 'uppercase',
              background: `${accentColor}18`, border: `1px solid ${accentColor}44`,
              borderRadius: 4, padding: '3px 9px', color: accentColor,
              fontFamily: "'Chakra Petch', sans-serif",
            }}>
              {hsStage}
            </span>
          )}
        </div>
        <button
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: 4, borderRadius: 4, lineHeight: 0 }}
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="Delete project">
          {Icons.trash}
        </button>
      </div>

      {/* Name */}
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 5, lineHeight: 1.25, color: '#FFFFFF', fontFamily: "'Chakra Petch', sans-serif" }}>
        {proj.name}
      </div>

      {/* Client */}
      {proj.client && (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 3, fontWeight: 500, fontFamily: "'IBM Plex Mono', monospace" }}>
          {proj.client}
        </div>
      )}

      {/* Site */}
      {proj.site && (
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'IBM Plex Mono', monospace" }}>
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{ marginRight: 4, opacity: 0.5 }}>
            <circle cx="7" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M7 1C4.24 1 2 3.24 2 6c0 3.5 5 7 5 7s5-3.5 5-7c0-2.76-2.24-5-5-5z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
          </svg>
          {proj.site}
        </div>
      )}

      {/* Footer: created date */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace" }}>
          {new Date(proj.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>
    </div>
  )
}
