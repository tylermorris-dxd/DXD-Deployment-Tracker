'use client'

import React from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Phase } from '@/lib/types'

const HANDOFF_CONFIG: Record<number, { sourceStage: number; title: string }> = {
  4:  { sourceStage: 3,  title: 'Capture → Solutions Handoff' },
  7:  { sourceStage: 6,  title: 'Solutions → Delivery Handoff' },
  11: { sourceStage: 10, title: 'Delivery → Operations Handoff' },
}

interface Props {
  stageNumber: number
  phases: Phase[]
  projectId: string
  onUpdate: () => void
}

export default function HandoffCard({ stageNumber, phases, onUpdate }: Props) {
  const config = HANDOFF_CONFIG[stageNumber]
  if (!config) return null

  const handoffSubtasks = phases
    .flatMap(ph => ph.tasks)
    .filter(t => t.stageNumber === config.sourceStage)
    .flatMap(t => t.subtasks)
    .filter(s => s.priority === 'handoff')

  if (handoffSubtasks.length === 0) return null

  const allDone = handoffSubtasks.every(s => s.isDone)
  const doneCnt = handoffSubtasks.filter(s => s.isDone).length

  const confirmMutation = useMutation({
    mutationFn: () =>
      Promise.all(
        handoffSubtasks
          .filter(s => !s.isDone)
          .map(s => api.subtasks.update(s.id, { isDone: true }))
      ),
    onSuccess: onUpdate,
  })

  return (
    <div style={{
      background: 'rgba(37,99,235,0.08)',
      border: '1px solid rgba(37,99,235,0.3)',
      borderRadius: 10,
      padding: '14px 16px',
      marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: '#60A5FA', textTransform: 'uppercase', marginBottom: 3 }}>
            ⬅ INCOMING HANDOFF
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
            {config.title} — {doneCnt}/{handoffSubtasks.length} confirmed
          </div>
        </div>
        {allDone ? (
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 9, fontWeight: 700, color: '#22C55E', letterSpacing: 1 }}>
            ✓ ALL RECEIVED
          </div>
        ) : (
          <button
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending}
            style={{
              background: 'rgba(37,99,235,0.2)',
              border: '1px solid rgba(37,99,235,0.5)',
              borderRadius: 7,
              padding: '7px 12px',
              color: '#60A5FA',
              fontFamily: "'Chakra Petch', sans-serif",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1,
              cursor: confirmMutation.isPending ? 'wait' : 'pointer',
              flexShrink: 0,
            }}>
            {confirmMutation.isPending ? 'CONFIRMING...' : 'CONFIRM ALL RECEIVED'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {handoffSubtasks.map(sub => (
          <div key={sub.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 8px',
            background: 'rgba(255,255,255,0.025)',
            borderRadius: 5,
            opacity: sub.isDone ? 0.5 : 1,
          }}>
            <div style={{
              width: 13, height: 13, borderRadius: '50%',
              background: sub.isDone ? '#22C55E' : 'transparent',
              border: `1.5px solid ${sub.isDone ? '#22C55E' : 'rgba(255,255,255,0.2)'}`,
              flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {sub.isDone && (
                <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                  <path d="M1.5 3.5l1.5 1.5 2.5-2.5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10,
              color: sub.isDone ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.7)',
              textDecoration: sub.isDone ? 'line-through' : 'none',
              flex: 1,
            }}>
              {sub.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
