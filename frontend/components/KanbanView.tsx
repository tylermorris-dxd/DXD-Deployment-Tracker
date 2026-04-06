'use client'

import React from 'react'
import type { ProjectFull } from '@/lib/types'

interface Props {
  project: ProjectFull
}

const columns = [
  { key: 'not_started', label: 'Not Started', color: 'rgba(255,255,255,0.25)' },
  { key: 'in_progress', label: 'In Progress', color: '#F59E0B' },
  { key: 'complete', label: 'Complete', color: '#22C55E' },
]

export default function KanbanView({ project }: Props) {
  const currentPhaseIdx = project.phases.findIndex(ph =>
    ph.tasks.some(t => !t.completed)
  )

  const allTasks: Array<{
    id: string; title: string; assignee: string; dueDate: string
    phaseTitle: string; phaseColor: string; pIdx: number
    subDone: number; subTotal: number; status: string
  }> = []

  project.phases.forEach((phase, pIdx) => {
    phase.tasks.forEach(task => {
      const subDone = task.subtasks.filter(s => s.isDone).length
      const subTotal = task.subtasks.length
      let status = 'not_started'
      if (task.completed) status = 'complete'
      else if (pIdx === currentPhaseIdx) status = 'in_progress'
      else if (subDone > 0) status = 'in_progress'
      allTasks.push({
        id: task.id, title: task.title, assignee: task.assignee, dueDate: task.dueDate,
        phaseTitle: phase.title, phaseColor: phase.color, pIdx,
        subDone, subTotal, status,
      })
    })
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, paddingTop: 8 }}>
      {columns.map(col => {
        const colTasks = allTasks.filter(t => t.status === col.key)
        return (
          <div key={col.key} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '14px 12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Column Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
              <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: 'rgba(255,255,255,0.55)' }}>
                {col.label}
              </span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }}>
                {colTasks.length}
              </span>
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {colTasks.length === 0 && (
                <div style={{ border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 8, padding: '20px 0', textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>
                  No tasks
                </div>
              )}
              {colTasks.map(task => (
                <div
                  key={task.id}
                  style={{ background: 'rgba(30,30,34,0.9)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: `3px solid ${task.phaseColor}`, borderRadius: 8, padding: '12px 14px' }}
                >
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: task.phaseColor, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>
                    {task.phaseTitle}
                  </div>
                  <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 600, color: '#f1f1f1', lineHeight: 1.4, marginBottom: 10 }}>
                    {task.title}
                  </div>
                  {/* Progress */}
                  {task.subTotal > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${task.subTotal > 0 ? (task.subDone / task.subTotal) * 100 : 0}%`, background: task.phaseColor, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
                        {task.subDone}/{task.subTotal}
                      </span>
                    </div>
                  )}
                  {/* Footer */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {task.assignee && (
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 7px' }}>
                        {task.assignee}
                      </span>
                    )}
                    {task.dueDate && (
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '2px 7px' }}>
                        {task.dueDate}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
