'use client'

import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { s } from '@/lib/styles'
import { Icons } from '@/lib/icons'
import TaskCard from './TaskCard'
import type { Phase, TeamMember } from '@/lib/types'

interface Props {
  phase: Phase
  projectId: string
  teamMembers: TeamMember[]
  branchAnswers: Record<string, boolean>
  onDataChange: () => void
}

export default function PhasePanel({ phase, projectId, teamMembers, branchAnswers, onDataChange }: Props) {
  const qc = useQueryClient()
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['project', projectId] }); onDataChange() }

  const updatePhase = useMutation({
    mutationFn: (owner: string) => api.phases.update(projectId, phase.id, { owner }),
    onSuccess: invalidate,
  })

  const createTask = useMutation({
    mutationFn: (title: string) => api.tasks.create(projectId, phase.id, title),
    onSuccess: () => { setNewTaskTitle(''); setAddingTask(false); invalidate() },
  })

  const doneTasks = phase.tasks.filter(t => t.completed || t.subtasks.every(s => s.isDone) && t.subtasks.length > 0).length
  const totalTasks = phase.tasks.length

  return (
    <div>
      {/* Phase header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 4, height: 36, borderRadius: 2, background: phase.color, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 9, color: phase.color, letterSpacing: 1.5 }}>
              PHASE {phase.phaseNumber}
            </span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
              {doneTasks}/{totalTasks} complete
            </span>
          </div>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 16, fontWeight: 600, color: '#E8ECF4', lineHeight: 1.2 }}>
            {phase.title}
          </div>
          {phase.description && (
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
              {phase.description}
            </div>
          )}
        </div>
      </div>

      {/* Phase owner */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={s.fieldLabelSm}>PHASE OWNER</label>
        {teamMembers.length > 0 ? (
          <select
            style={{ ...s.fieldInput, flex: 1, maxWidth: 240, color: phase.owner ? '#f1f1f1' : 'rgba(255,255,255,0.3)' }}
            value={phase.owner}
            onChange={e => updatePhase.mutate(e.target.value)}
          >
            <option value="">— Unassigned —</option>
            {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ''}</option>)}
          </select>
        ) : (
          <input
            style={{ ...s.fieldInput, flex: 1, maxWidth: 240 }}
            placeholder="Assigned to..."
            value={phase.owner}
            onChange={e => updatePhase.mutate(e.target.value)}
          />
        )}
      </div>

      {/* Tasks */}
      {phase.tasks.map(task => (
        <TaskCard
          key={task.id}
          task={task}
          phase={phase}
          projectId={projectId}
          teamMembers={teamMembers}
          branchAnswers={branchAnswers}
          onDataChange={onDataChange}
        />
      ))}

      {/* Add custom task */}
      <div style={{ marginTop: 12 }}>
        {addingTask ? (
          <div style={{ background: 'rgba(30,30,34,0.9)', border: `1px solid ${phase.color}44`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 10, color: phase.color, letterSpacing: 1.5, marginBottom: 8 }}>NEW TASK</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                autoFocus
                style={{ ...s.fieldInput, flex: 1 }}
                placeholder="Task title..."
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newTaskTitle.trim()) createTask.mutate(newTaskTitle.trim())
                  if (e.key === 'Escape') { setAddingTask(false); setNewTaskTitle('') }
                }}
              />
              <button style={s.primaryBtn} onClick={() => newTaskTitle.trim() && createTask.mutate(newTaskTitle.trim())}>
                ADD
              </button>
              <button style={s.ghostBtn} onClick={() => { setAddingTask(false); setNewTaskTitle('') }}>✕</button>
            </div>
          </div>
        ) : (
          <button
            style={{ background: 'none', border: `1px dashed rgba(255,255,255,0.1)`, borderRadius: 8, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, padding: '8px 14px', cursor: 'pointer', width: '100%', textAlign: 'left' }}
            onClick={() => setAddingTask(true)}
          >
            {Icons.plus} Add custom task to {phase.title}
          </button>
        )}
      </div>
    </div>
  )
}
