'use client'

import React, { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { s, formatFileSize } from '@/lib/styles'
import { Icons, getFileIcon } from '@/lib/icons'
import type { Phase, Task, TeamMember } from '@/lib/types'

interface Props {
  task: Task
  phase: Phase
  projectId: string
  teamMembers: TeamMember[]
  branchAnswers: Record<string, boolean>
  onDataChange: () => void
}

function isVisible(conditionKey: string, answers: Record<string, boolean>): boolean {
  if (!conditionKey) return true
  const key = conditionKey.startsWith('!') ? conditionKey.slice(1) : conditionKey
  if (!(key in answers)) return true
  if (conditionKey.startsWith('!')) return !answers[key]
  return !!answers[key]
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === 'exit_gate') return (
    <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(234,179,8,0.15)', color: '#EAB308', letterSpacing: 0.5, flexShrink: 0, fontFamily: "'IBM Plex Mono', monospace" }}>EXIT GATE</span>
  )
  if (priority === 'handoff') return (
    <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(59,130,246,0.15)', color: '#60A5FA', letterSpacing: 0.5, flexShrink: 0, fontFamily: "'IBM Plex Mono', monospace" }}>HANDOFF</span>
  )
  if (priority === 'p0') return (
    <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'rgba(239,68,68,0.12)', color: '#ef4444', letterSpacing: 0.5, flexShrink: 0, fontFamily: "'IBM Plex Mono', monospace" }}>P0</span>
  )
  if (priority === 'p1') return (
    <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', letterSpacing: 0.5, flexShrink: 0, fontFamily: "'IBM Plex Mono', monospace" }}>P1</span>
  )
  if (priority === 'p2') return (
    <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)', letterSpacing: 0.5, flexShrink: 0, fontFamily: "'IBM Plex Mono', monospace" }}>P2</span>
  )
  return null
}

export default function TaskCard({ task, phase, projectId, teamMembers, branchAnswers, onDataChange }: Props) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitleVal, setEditTitleVal] = useState(task.title)
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [newSubtaskText, setNewSubtaskText] = useState('')
  const [openSubtaskNote, setOpenSubtaskNote] = useState<number | null>(null)
  const [editingSubtask, setEditingSubtask] = useState<number | null>(null)
  const [editSubtaskVal, setEditSubtaskVal] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['project', projectId] }); onDataChange() }

  const toggleSubtask = useMutation({
    mutationFn: ({ id, isDone }: { id: number; isDone: boolean }) =>
      api.subtasks.update(id, { isDone }),
    onMutate: async ({ id, isDone }) => {
      await qc.cancelQueries({ queryKey: ['project', projectId] })
      const prev = qc.getQueryData(['project', projectId])
      qc.setQueryData(['project', projectId], (old: any) => {
        if (!old) return old
        return {
          ...old,
          phases: old.phases.map((ph: any) => ({
            ...ph,
            tasks: ph.tasks.map((t: any) => ({
              ...t,
              subtasks: t.subtasks.map((sub: any) => sub.id === id ? { ...sub, isDone } : sub),
            })),
          })),
        }
      })
      return { prev }
    },
    onError: (_e, _p, ctx: any) => { if (ctx?.prev) qc.setQueryData(['project', projectId], ctx.prev) },
    onSettled: invalidate,
  })

  const updateSubtaskNote = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      api.subtasks.update(id, { note }),
    onSuccess: invalidate,
  })

  const commitSubtaskText = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) =>
      api.subtasks.update(id, { text }),
    onSuccess: () => { setEditingSubtask(null); invalidate() },
  })

  const addSubtask = useMutation({
    mutationFn: (text: string) => api.subtasks.create(task.id, text),
    onSuccess: () => { setNewSubtaskText(''); setAddingSubtask(false); invalidate() },
  })

  const updateTask = useMutation({
    mutationFn: (patch: Parameters<typeof api.tasks.update>[1]) => api.tasks.update(task.id, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ['project', projectId] })
      const prev = qc.getQueryData(['project', projectId])
      qc.setQueryData(['project', projectId], (old: any) => {
        if (!old) return old
        return {
          ...old,
          phases: old.phases.map((ph: any) => ({
            ...ph,
            tasks: ph.tasks.map((t: any) => t.id === task.id ? { ...t, ...patch } : t),
          })),
        }
      })
      return { prev }
    },
    onError: (_e, _p, ctx: any) => { if (ctx?.prev) qc.setQueryData(['project', projectId], ctx.prev) },
    onSettled: invalidate,
  })

  const deleteTask = useMutation({
    mutationFn: () => api.tasks.delete(task.id),
    onSuccess: invalidate,
  })

  const updateOrderTracking = useMutation({
    mutationFn: ({ id, field, value }: { id: number; field: string; value: string }) =>
      api.subtasks.update(id, { [field]: value } as Parameters<typeof api.subtasks.update>[1]),
    onSuccess: invalidate,
  })

  const updateContact = useMutation({
    mutationFn: ({ slot, field, value }: { slot: number; field: string; value: string }) =>
      api.contacts.update(task.id, slot, { [field]: value }),
    onSuccess: invalidate,
  })

  const uploadAttachment = useMutation({
    mutationFn: (file: File) => api.attachments.upload(task.id, file),
    onSuccess: invalidate,
  })

  const deleteAttachment = useMutation({
    mutationFn: (id: string) => api.attachments.delete(id),
    onSuccess: invalidate,
  })

  const visibleSubtasks = task.subtasks.filter(sub => isVisible(sub.conditionKey, branchAnswers))
  const doneSubs = visibleSubtasks.filter(s => s.isDone).length
  const totalSubs = visibleSubtasks.length

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    Array.from(e.dataTransfer.files).forEach(f => uploadAttachment.mutate(f))
  }

  const commitTitle = () => {
    if (editTitleVal.trim() && editTitleVal.trim() !== task.title) {
      updateTask.mutate({ title: editTitleVal.trim() })
    }
    setEditingTitle(false)
  }

  return (
    <div style={{ ...s.taskCard, borderLeft: `3px solid ${phase.color}20` }}>
      {/* Header */}
      <div
        style={s.taskHeader}
        onClick={() => !editingTitle && setExpanded(e => !e)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <input
            type="checkbox"
            checked={task.completed}
            onChange={e => { e.stopPropagation(); updateTask.mutate({ completed: e.target.checked }) }}
            onClick={e => e.stopPropagation()}
            style={{ width: 15, height: 15, flexShrink: 0, cursor: 'pointer', accentColor: '#e63946' }}
          />
          {editingTitle ? (
            <input
              autoFocus
              style={{ ...s.fieldInput, flex: 1, fontSize: 13 }}
              value={editTitleVal}
              onChange={e => setEditTitleVal(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setEditTitleVal(task.title); setEditingTitle(false) } }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: task.completed ? 'rgba(255,255,255,0.4)' : '#E8ECF4', textDecoration: task.completed ? 'line-through' : 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {task.isGate && <span style={{ color: phase.color, marginRight: 5, fontSize: 10 }}>⬡ GATE</span>}
              {task.title}
            </span>
          )}
          {!editingTitle && (
            <button style={s.iconBtn} onClick={e => { e.stopPropagation(); setEditTitleVal(task.title); setEditingTitle(true) }} title="Edit title">
              {Icons.edit}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {task.roleTag && (
            <span style={{ ...s.badge, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.35)', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {task.roleTag}
            </span>
          )}
          {totalSubs > 0 && (
            <span style={{ ...s.badge, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>
              {doneSubs}/{totalSubs}
            </span>
          )}
          {task.assignee && (
            <span style={{ ...s.badge, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>
              {task.assignee}
            </span>
          )}
          {task.dueDate && (
            <span style={{ ...s.badge, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>
              {Icons.calendar} {task.dueDate}
            </span>
          )}
          {task.attachments.length > 0 && (
            <span style={{ ...s.badge, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>
              {Icons.paperclip} {task.attachments.length}
            </span>
          )}
          <div style={{ ...{ width: 14, height: 14, color: 'rgba(255,255,255,0.3)', transition: 'transform 0.2s' }, transform: expanded ? 'rotate(90deg)' : 'rotate(0)' }}>
            {Icons.chevron}
          </div>
          {task.isCustom && (
            <button
              style={{ ...s.iconBtn, padding: '3px 5px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, fontSize: 10 }}
              onClick={e => { e.stopPropagation(); if (window.confirm('Delete this task?')) deleteTask.mutate() }}
              title="Delete custom task"
            >
              {Icons.close}
            </button>
          )}
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div style={s.taskExpanded}>
          {/* Subtasks */}
          <div style={{ marginTop: 10, marginBottom: 8 }}>
              {visibleSubtasks.map(sub => (
                <React.Fragment key={sub.id}>
                  <div style={s.subtaskRow}>
                    <input
                      type="checkbox"
                      style={{ ...s.checkbox, accentColor: phase.color }}
                      checked={sub.isDone}
                      onChange={e => toggleSubtask.mutate({ id: sub.id, isDone: e.target.checked })}
                    />
                    {editingSubtask === sub.id ? (
                      <input
                        autoFocus
                        style={{ ...s.fieldInput, flex: 1, fontSize: 12 }}
                        value={editSubtaskVal}
                        onChange={e => setEditSubtaskVal(e.target.value)}
                        onBlur={() => commitSubtaskText.mutate({ id: sub.id, text: editSubtaskVal })}
                        onKeyDown={e => { if (e.key === 'Enter') commitSubtaskText.mutate({ id: sub.id, text: editSubtaskVal }); if (e.key === 'Escape') setEditingSubtask(null) }}
                      />
                    ) : (
                      <span style={{ ...s.subtaskText, flex: 1, textDecoration: sub.isDone ? 'line-through' : 'none', opacity: sub.isDone ? 0.4 : 1 }}>
                        {sub.text}
                      </span>
                    )}
                    <PriorityBadge priority={sub.priority} />
                    {editingSubtask !== sub.id && (
                      <button style={s.iconBtn} onClick={() => { setEditingSubtask(sub.id); setEditSubtaskVal(sub.text) }} title="Edit">
                        {Icons.edit}
                      </button>
                    )}
                    <button
                      style={{ ...s.iconBtn, color: sub.note ? phase.color : 'rgba(255,255,255,0.18)' }}
                      onClick={() => setOpenSubtaskNote(openSubtaskNote === sub.id ? null : sub.id)}
                      title="Add note"
                    >
                      {Icons.note}
                    </button>
                  </div>

                  {/* Subtask note */}
                  {openSubtaskNote === sub.id && (
                    <div style={{ marginLeft: 22, marginBottom: 6, marginTop: 2 }}>
                      <textarea
                        autoFocus
                        placeholder="Add a note for this subtask..."
                        value={sub.note}
                        onChange={e => updateSubtaskNote.mutate({ id: sub.id, note: e.target.value })}
                        style={{ ...s.fieldInput, width: '100%', minHeight: 52, resize: 'vertical', fontSize: 11, boxSizing: 'border-box' }}
                      />
                    </div>
                  )}

                  {/* Order tracking */}
                  {task.trackDates && sub.isDone && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginLeft: 22, marginBottom: 8, marginTop: 2 }}>
                      {(['otOrdered', 'otShipped', 'otEta', 'otDelivered'] as const).map(f => (
                        <div key={f}>
                          <label style={s.fieldLabelSm}>{f === 'otEta' ? 'ETA' : f.replace('ot', '').replace(/([A-Z])/g, ' $1').trim()}</label>
                          <input
                            style={s.fieldInput}
                            type="date"
                            value={sub[f]}
                            onChange={e => updateOrderTracking.mutate({ id: sub.id, field: f, value: e.target.value })}
                          />
                        </div>
                      ))}
                      <div>
                        <label style={s.fieldLabelSm}>Received By</label>
                        <input
                          style={s.fieldInput}
                          type="text"
                          placeholder="Name"
                          value={sub.otReceivedBy}
                          onChange={e => updateOrderTracking.mutate({ id: sub.id, field: 'otReceivedBy', value: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))}

              {/* Add subtask */}
              {addingSubtask ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 0' }}>
                  <input
                    autoFocus
                    style={{ ...s.fieldInput, flex: 1 }}
                    placeholder="New subtask..."
                    value={newSubtaskText}
                    onChange={e => setNewSubtaskText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newSubtaskText.trim()) addSubtask.mutate(newSubtaskText.trim())
                      if (e.key === 'Escape') { setAddingSubtask(false); setNewSubtaskText('') }
                    }}
                  />
                  <button style={s.primaryBtn} onClick={() => newSubtaskText.trim() && addSubtask.mutate(newSubtaskText.trim())}>ADD</button>
                  <button style={s.ghostBtn} onClick={() => { setAddingSubtask(false); setNewSubtaskText('') }}>✕</button>
                </div>
              ) : (
                <button
                  style={{ background: 'none', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, padding: '5px 12px', cursor: 'pointer', width: '100%', textAlign: 'left', marginTop: 4 }}
                  onClick={() => setAddingSubtask(true)}
                >
                  + Add subtask
                </button>
              )}
            </div>

          {/* Task fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <div>
              <label style={s.fieldLabelSm}>ASSIGNEE</label>
              {teamMembers.length > 0 ? (
                <select
                  style={{ ...s.fieldInput, color: task.assignee ? '#f1f1f1' : 'rgba(255,255,255,0.3)' }}
                  value={task.assignee}
                  onChange={e => updateTask.mutate({ assignee: e.target.value })}
                >
                  <option value="">— Unassigned —</option>
                  {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ''}</option>)}
                </select>
              ) : (
                <input
                  style={s.fieldInput}
                  placeholder="Who is responsible?"
                  value={task.assignee}
                  onChange={e => updateTask.mutate({ assignee: e.target.value })}
                />
              )}
            </div>
            <div>
              <label style={s.fieldLabelSm}>DUE DATE</label>
              <input
                style={s.fieldInput}
                type="date"
                value={task.dueDate}
                onChange={e => updateTask.mutate({ dueDate: e.target.value })}
              />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={s.fieldLabelSm}>NOTES</label>
              <textarea
                style={{ ...s.fieldInput, minHeight: 60, resize: 'vertical' }}
                placeholder="Add notes..."
                value={task.notes}
                onChange={e => updateTask.mutate({ notes: e.target.value })}
              />
            </div>
          </div>

          {/* Attachments */}
          <div style={s.attachSection}>
            <div style={s.attachHeader}>
              <label style={s.fieldLabelSm}>ATTACHMENTS</label>
              <button style={s.attachBtn} onClick={() => fileInputRef.current?.click()}>
                {Icons.paperclip}<span>Attach File</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                multiple
                onChange={e => { Array.from(e.target.files || []).forEach(f => uploadAttachment.mutate(f)); e.target.value = '' }}
              />
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                border: '2px dashed ' + (dragOver ? phase.color : 'rgba(255,255,255,0.08)'),
                borderRadius: 6, padding: '8px 10px', minHeight: 36,
                transition: 'border-color 0.15s',
                background: dragOver ? phase.color + '10' : 'transparent',
              }}
            >
              {task.attachments.length === 0 ? (
                <div style={{ ...s.attachEmpty, textAlign: 'center', padding: '6px 0' }}>
                  Drop files here or click Attach File
                </div>
              ) : (
                <div>
                  {task.attachments.map(att => (
                    <div key={att.id} style={s.attachItem}>
                      <span style={{ fontSize: 16 }}>{getFileIcon(att.mimeType)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.attachName}>{att.name}</div>
                        <div style={s.attachMeta}>{formatFileSize(att.sizeBytes)}</div>
                      </div>
                      <button
                        style={s.iconBtn}
                        onClick={() => window.open(api.attachments.downloadUrl(att.id))}
                        title="Download"
                      >
                        {Icons.download}
                      </button>
                      <button
                        style={{ ...s.iconBtn, color: 'rgba(255,255,255,0.25)' }}
                        onClick={() => deleteAttachment.mutate(att.id)}
                        title="Remove"
                      >
                        {Icons.close}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {uploadAttachment.isPending && (
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                Uploading...
              </div>
            )}
          </div>

          {/* Stakeholder contacts */}
          {task.hasStakeholders && (
            <div style={{ marginTop: 12 }}>
              <label style={{ ...s.fieldLabelSm, marginBottom: 8, display: 'block' }}>STAKEHOLDER CONTACTS</label>
              {[0, 1, 2, 3, 4].map(slot => {
                const contact = task.stakeholderContacts.find(c => c.slotIndex === slot)
                return (
                  <div key={slot} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
                    <input style={s.fieldInput} placeholder={`Name ${slot + 1}`} value={contact?.name ?? ''} onChange={e => updateContact.mutate({ slot, field: 'name', value: e.target.value })} />
                    <input style={s.fieldInput} placeholder="Email" value={contact?.email ?? ''} onChange={e => updateContact.mutate({ slot, field: 'email', value: e.target.value })} />
                    <input style={s.fieldInput} placeholder="Phone" value={contact?.phone ?? ''} onChange={e => updateContact.mutate({ slot, field: 'phone', value: e.target.value })} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
