'use client'

import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { s, progressColor } from '@/lib/styles'
import { Icons } from '@/lib/icons'
import PhasePanel from './PhasePanel'

interface Props {
  projectId: string
  onBack: () => void
}

export default function ProjectView({ projectId, onBack }: Props) {
  const qc = useQueryClient()
  const [activePhaseIdx, setActivePhaseIdx] = useState(0)

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId),
  })

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team'],
    queryFn: api.team.list,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['project', projectId] })

  if (isLoading) {
    return (
      <div style={{ ...s.container, textAlign: 'center', paddingTop: 80 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
          Loading project...
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div style={{ ...s.container, textAlign: 'center', paddingTop: 80 }}>
        <div style={{ color: '#ef4444', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
          Failed to load project.
        </div>
        <button style={{ ...s.ghostBtn, marginTop: 16 }} onClick={onBack}>{Icons.back} Back</button>
      </div>
    )
  }

  const activePhase = project.phases[activePhaseIdx] ?? project.phases[0]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 24 }}>
        <button style={{ ...s.ghostBtn, flexShrink: 0, marginTop: 2 }} onClick={onBack}>
          {Icons.back}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 20, fontWeight: 700, color: '#E8ECF4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project.name}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            {project.client && (
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                {project.client}
              </span>
            )}
            {project.site && (
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                📍 {project.site}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24 }}>
        {/* Phase sidebar */}
        <div>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 10 }}>PHASES</div>
          {project.phases.map((phase, idx) => {
            const done = phase.tasks.filter(t => t.completed || (t.subtasks.length > 0 && t.subtasks.every(s => s.isDone))).length
            const total = phase.tasks.length
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            const isActive = idx === activePhaseIdx
            return (
              <div
                key={phase.id}
                onClick={() => setActivePhaseIdx(idx)}
                style={{
                  padding: '9px 12px', borderRadius: 7, marginBottom: 4, cursor: 'pointer',
                  background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                  border: isActive ? `1px solid ${phase.color}30` : '1px solid transparent',
                  transition: 'background 0.15s, border 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: pct === 100 ? '#22c55e' : phase.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: isActive ? '#E8ECF4' : 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {phase.title}
                  </span>
                </div>
                {/* Mini progress bar */}
                <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden' }}>
                  <div style={{ width: pct + '%', height: '100%', background: progressColor(pct), borderRadius: 1 }} />
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>
                  {done}/{total} tasks
                </div>
              </div>
            )
          })}
        </div>

        {/* Active phase panel */}
        <div>
          {activePhase && (
            <PhasePanel
              phase={activePhase}
              projectId={projectId}
              teamMembers={teamMembers}
              onDataChange={invalidate}
            />
          )}
        </div>
      </div>
    </div>
  )
}
