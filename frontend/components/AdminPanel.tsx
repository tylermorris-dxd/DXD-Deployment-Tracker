'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { s } from '@/lib/styles'
import { Icons } from '@/lib/icons'
import type { AdminTask, TeamMember, HubSpotDeal } from '@/lib/types'

const PRIORITY_COLORS: Record<string, string> = {
  low: '#4CAF50', medium: '#FF9800', high: '#e63946', urgent: '#b91c1c',
}
const PRIORITY_LABELS: Record<string, string> = {
  low: 'LOW', medium: 'MEDIUM', high: 'HIGH', urgent: 'URGENT',
}

const card: React.CSSProperties = {
  background: 'rgba(30,30,34,0.9)', border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 8, padding: '14px 16px', marginBottom: 10,
}
const inputSm: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6, padding: '8px 12px', color: '#E8ECF4', fontSize: 13, outline: 'none',
  fontFamily: "'IBM Plex Mono', monospace",
}
const fieldLabel: React.CSSProperties = {
  display: 'block', fontFamily: "'Chakra Petch', sans-serif", fontSize: 9,
  fontWeight: 600, letterSpacing: 1.5, color: 'rgba(255,255,255,0.35)',
  marginBottom: 5, textTransform: 'uppercase',
}

export default function AdminPanel() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'tasks' | 'team' | 'hubspot'>('team')

  // ── Team ────────────────────────────────────────────────────────────────────
  const { data: teamMembers = [] } = useQuery({ queryKey: ['teamMembers'], queryFn: api.team.list })
  const [memberName, setMemberName] = useState('')
  const [memberRole, setMemberRole] = useState('')
  const [memberEmail, setMemberEmail] = useState('')

  const addMemberMut = useMutation({
    mutationFn: () => api.team.create(memberName.trim(), memberRole.trim(), memberEmail.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teamMembers'] })
      setMemberName(''); setMemberRole(''); setMemberEmail('')
    },
  })
  const deleteMemberMut = useMutation({
    mutationFn: (id: string) => api.team.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teamMembers'] }),
  })

  // ── Admin tasks ─────────────────────────────────────────────────────────────
  const { data: adminTasks = [] } = useQuery({ queryKey: ['adminTasks'], queryFn: api.adminTasks.list })
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')

  const createTaskMut = useMutation({
    mutationFn: () => api.adminTasks.create({ title: taskTitle.trim(), description: taskDesc.trim(), assignee: taskAssignee, dueDate: taskDue, priority: taskPriority }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminTasks'] })
      setTaskTitle(''); setTaskDesc(''); setTaskAssignee(''); setTaskDue(''); setTaskPriority('medium'); setShowTaskForm(false)
    },
  })
  const moveTaskMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.adminTasks.update(id, { status } as Partial<AdminTask>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adminTasks'] }),
  })
  const deleteTaskMut = useMutation({
    mutationFn: (id: string) => api.adminTasks.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adminTasks'] }),
  })

  const colMeta = [
    { status: 'todo',       label: 'TO DO',       color: 'rgba(255,255,255,0.4)' },
    { status: 'inprogress', label: 'IN PROGRESS',  color: '#FF9800' },
    { status: 'done',       label: 'DONE',         color: '#4CAF50' },
  ]

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logoRow}>
          <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #e63946, #a62633)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {Icons.user}
          </div>
          <div>
            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: 3, color: '#E8ECF4' }}>ADMIN PANEL</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, marginTop: 2 }}>TASK MANAGEMENT & TEAM</div>
          </div>
        </div>
        {activeTab === 'tasks' && (
          <button style={s.primaryBtn} onClick={() => setShowTaskForm(v => !v)}>
            {Icons.plus}<span>NEW TASK</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 4 }}>
        {([{ id: 'team', label: 'TEAM MEMBERS' }, { id: 'tasks', label: 'TASKS' }, { id: 'hubspot', label: 'HUBSPOT' }] as const).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ flex: 1, padding: '8px 0', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 1, transition: 'all 0.15s', background: activeTab === t.id ? 'rgba(230,57,70,0.85)' : 'transparent', color: activeTab === t.id ? '#fff' : 'rgba(255,255,255,0.45)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TEAM TAB ── */}
      {activeTab === 'team' && (
        <>
          {/* Add member form */}
          <div style={{ ...card, border: '1px solid rgba(230,57,70,0.2)', marginBottom: 24 }}>
            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, color: '#e63946', letterSpacing: 1.5, marginBottom: 14 }}>ADD TEAM MEMBER</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={fieldLabel}>NAME *</label>
                <input style={inputSm} placeholder="e.g. Tyler Morris" value={memberName}
                  onChange={e => setMemberName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && memberName.trim() && addMemberMut.mutate()} />
              </div>
              <div>
                <label style={fieldLabel}>ROLE</label>
                <input style={inputSm} placeholder="e.g. Pilot, Engineer" value={memberRole} onChange={e => setMemberRole(e.target.value)} />
              </div>
              <div>
                <label style={fieldLabel}>EMAIL</label>
                <input style={inputSm} placeholder="e.g. tyler@deusxdefense.com" value={memberEmail} onChange={e => setMemberEmail(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button style={{ ...s.primaryBtn, opacity: memberName.trim() ? 1 : 0.4 }}
                disabled={!memberName.trim() || addMemberMut.isPending}
                onClick={() => addMemberMut.mutate()}>
                {Icons.plus}<span>ADD MEMBER</span>
              </button>
            </div>
          </div>

          {/* Team list */}
          {teamMembers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.25)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: 1, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>No Team Members</div>
              <div>Add team members above so you can assign tasks to them.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {teamMembers.map((m: TeamMember) => (
                <MemberCard key={m.id} member={m}
                  taskCount={adminTasks.filter(t => t.assignee === m.name).length}
                  onDelete={() => deleteMemberMut.mutate(m.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── HUBSPOT TAB ── */}
      {activeTab === 'hubspot' && <HubSpotPanel />}

      {/* ── TASKS TAB ── */}
      {activeTab === 'tasks' && (
        <>
          {/* New task form */}
          {showTaskForm && (
            <div style={{ ...card, border: '1px solid rgba(230,57,70,0.3)', marginBottom: 24, animation: 'fadeSlideIn 0.25s ease' }}>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, color: '#e63946', letterSpacing: 1.5, marginBottom: 14 }}>NEW TASK</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={fieldLabel}>TASK TITLE *</label>
                  <input style={inputSm} placeholder="e.g. Review site survey report" value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && taskTitle.trim() && createTaskMut.mutate()} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={fieldLabel}>DESCRIPTION</label>
                  <textarea style={{ ...inputSm, height: 70, resize: 'vertical' }} placeholder="Additional details..." value={taskDesc} onChange={e => setTaskDesc(e.target.value)} />
                </div>
                <div>
                  <label style={fieldLabel}>ASSIGN TO</label>
                  <select style={{ ...inputSm, color: taskAssignee ? '#f1f1f1' : 'rgba(255,255,255,0.3)' }} value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)}>
                    <option value="">— Unassigned —</option>
                    {teamMembers.map((m: TeamMember) => <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label style={fieldLabel}>DUE DATE</label>
                  <input type="date" style={inputSm} value={taskDue} onChange={e => setTaskDue(e.target.value)} />
                </div>
                <div>
                  <label style={fieldLabel}>PRIORITY</label>
                  <select style={{ ...inputSm, color: PRIORITY_COLORS[taskPriority] }} value={taskPriority} onChange={e => setTaskPriority(e.target.value as 'low' | 'medium' | 'high' | 'urgent')}>
                    {Object.entries(PRIORITY_LABELS).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button style={s.ghostBtn} onClick={() => setShowTaskForm(false)}>CANCEL</button>
                <button style={{ ...s.primaryBtn, opacity: taskTitle.trim() ? 1 : 0.4 }}
                  disabled={!taskTitle.trim() || createTaskMut.isPending}
                  onClick={() => createTaskMut.mutate()}>CREATE TASK</button>
              </div>
            </div>
          )}

          {/* Kanban */}
          {adminTasks.length === 0 && !showTaskForm ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.25)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: 1, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>No Tasks Yet</div>
              <div>Click "NEW TASK" to create and assign a task to a team member.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              {colMeta.map(({ status, label, color }) => {
                const colTasks = adminTasks.filter(t => t.status === status)
                return (
                  <div key={status}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                      <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: 'rgba(255,255,255,0.55)' }}>{label}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }}>{colTasks.length}</span>
                    </div>
                    {colTasks.length === 0 && (
                      <div style={{ border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 8, padding: '20px 0', textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>Empty</div>
                    )}
                    {colTasks.map(task => (
                      <div key={task.id} style={{ ...card, position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 600, letterSpacing: 1, color: PRIORITY_COLORS[task.priority], background: `${PRIORITY_COLORS[task.priority]}18`, border: `1px solid ${PRIORITY_COLORS[task.priority]}40`, borderRadius: 4, padding: '2px 7px' }}>
                            {PRIORITY_LABELS[task.priority] || task.priority}
                          </span>
                          <button onClick={() => deleteTaskMut.mutate(task.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', padding: 2, lineHeight: 1 }} title="Delete">
                            {Icons.close}
                          </button>
                        </div>
                        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#f1f1f1', lineHeight: 1.4 }}>{task.title}</div>
                        {task.description && (
                          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, lineHeight: 1.5 }}>{task.description}</div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8 }}>
                          {task.assignee && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '3px 8px' }}>👤 {task.assignee}</span>}
                          {task.dueDate && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '3px 8px' }}>📅 {task.dueDate}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          {status !== 'todo' && (
                            <button onClick={() => moveTaskMut.mutate({ id: task.id, status: 'todo' })}
                              style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: 'rgba(255,255,255,0.4)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: '4px 0', cursor: 'pointer' }}>
                              ← TO DO
                            </button>
                          )}
                          {status !== 'inprogress' && (
                            <button onClick={() => moveTaskMut.mutate({ id: task.id, status: 'inprogress' })}
                              style={{ flex: 1, background: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.2)', borderRadius: 4, color: '#FF9800', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: '4px 0', cursor: 'pointer' }}>
                              IN PROGRESS
                            </button>
                          )}
                          {status !== 'done' && (
                            <button onClick={() => moveTaskMut.mutate({ id: task.id, status: 'done' })}
                              style={{ flex: 1, background: 'rgba(76,175,80,0.08)', border: '1px solid rgba(76,175,80,0.2)', borderRadius: 4, color: '#4CAF50', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: '4px 0', cursor: 'pointer' }}>
                              DONE ✓
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function HubSpotPanel() {
  const qc = useQueryClient()
  const [tokenInput, setTokenInput] = useState('')
  const [showToken, setShowToken] = useState(false)

  const { data: status } = useQuery({ queryKey: ['hubspotStatus'], queryFn: api.hubspot.getStatus })
  const { data: dealsData, isLoading: dealsLoading } = useQuery({
    queryKey: ['hubspotDeals'],
    queryFn: api.hubspot.getDeals,
    enabled: status?.connected === true,
  })

  const saveMut = useMutation({
    mutationFn: () => api.hubspot.saveToken(tokenInput.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hubspotStatus'] }); setTokenInput('') },
  })
  const disconnectMut = useMutation({
    mutationFn: api.hubspot.deleteToken,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hubspotStatus'] })
      qc.invalidateQueries({ queryKey: ['hubspotDeals'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
  const pinMut = useMutation({
    mutationFn: (dealId: string) => api.hubspot.pinDeal(dealId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hubspotDeals'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
  const unpinMut = useMutation({
    mutationFn: (dealId: string) => api.hubspot.unpinDeal(dealId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hubspotDeals'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  const deals: HubSpotDeal[] = dealsData?.results ?? []

  if (!status?.connected) {
    return (
      <div style={{ ...card, border: '1px solid rgba(255,165,0,0.2)', maxWidth: 480 }}>
        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, color: '#FF9800', letterSpacing: 1.5, marginBottom: 14 }}>CONNECT HUBSPOT</div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 16, lineHeight: 1.6 }}>
          Enter your HubSpot Private App token. You can create one in HubSpot → Settings → Integrations → Private Apps.
        </div>
        <label style={fieldLabel}>PRIVATE APP TOKEN</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type={showToken ? 'text' : 'password'}
            style={{ ...inputSm, flex: 1 }}
            placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
          />
          <button onClick={() => setShowToken(v => !v)}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '0 12px', fontSize: 12 }}>
            {showToken ? 'HIDE' : 'SHOW'}
          </button>
        </div>
        <button
          style={{ ...inputSm, width: 'auto', padding: '9px 20px', background: tokenInput.trim() ? 'rgba(255,152,0,0.85)' : 'rgba(255,255,255,0.06)', color: tokenInput.trim() ? '#fff' : 'rgba(255,255,255,0.3)', border: 'none', cursor: tokenInput.trim() ? 'pointer' : 'default', fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, letterSpacing: 1, borderRadius: 6, fontSize: 12 }}
          disabled={!tokenInput.trim() || saveMut.isPending}
          onClick={() => saveMut.mutate()}>
          {saveMut.isPending ? 'CONNECTING…' : 'CONNECT'}
        </button>
        {saveMut.isError && (
          <div style={{ color: '#ef4444', fontSize: 11, marginTop: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
            {(saveMut.error as Error).message}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Connection status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '10px 16px', background: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.2)', borderRadius: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4CAF50', boxShadow: '0 0 6px #4CAF5088', display: 'inline-block', flexShrink: 0 }} />
        <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 1, color: '#4CAF50' }}>HUBSPOT CONNECTED</span>
        <button
          style={{ marginLeft: 'auto', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: 'rgba(255,255,255,0.35)', cursor: 'pointer', padding: '4px 12px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}
          onClick={() => disconnectMut.mutate()}>
          DISCONNECT
        </button>
      </div>

      {/* Deals list */}
      <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginBottom: 12 }}>
        SELECT DEALS TO TRACK — TOGGLED DEALS APPEAR LIVE IN PROJECTS
      </div>

      {dealsLoading ? (
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: '20px 0' }}>Loading deals from HubSpot…</div>
      ) : deals.length === 0 ? (
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: '20px 0' }}>No deals found in your HubSpot account.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 520, overflowY: 'auto' }}>
          {deals.map((deal: HubSpotDeal) => {
            const stage = deal.properties.dealstage ?? '—'
            const amount = deal.properties.amount ? `$${Number(deal.properties.amount).toLocaleString()}` : null
            const close = deal.properties.closedate ? new Date(deal.properties.closedate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
            const isPending = pinMut.isPending || unpinMut.isPending
            return (
              <div key={deal.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: deal.pinned ? 'rgba(255,152,0,0.06)' : 'rgba(30,30,34,0.9)', border: deal.pinned ? '1px solid rgba(255,152,0,0.3)' : '1px solid rgba(255,255,255,0.07)', borderRadius: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 600, color: '#f1f1f1', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {deal.properties.dealname ?? 'Untitled Deal'}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{stage}</span>
                    {amount && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{amount}</span>}
                    {close && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Close {close}</span>}
                  </div>
                </div>
                <button
                  disabled={isPending}
                  onClick={() => deal.pinned ? unpinMut.mutate(deal.id) : pinMut.mutate(deal.id)}
                  style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 6, cursor: isPending ? 'default' : 'pointer', fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, transition: 'all 0.15s', background: deal.pinned ? 'rgba(76,175,80,0.15)' : 'rgba(255,152,0,0.15)', color: deal.pinned ? '#4CAF50' : '#FF9800', border: deal.pinned ? '1px solid rgba(76,175,80,0.3)' : '1px solid rgba(255,152,0,0.3)' }}>
                  {deal.pinned ? '✓ TRACKING' : 'TRACK'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MemberCard({ member, taskCount, onDelete }: { member: TeamMember; taskCount: number; onDelete: () => void }) {
  const initials = member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg, #e63946, #a62633)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Chakra Petch', sans-serif", fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 600, color: '#f1f1f1' }}>{member.name}</div>
        {member.role && <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{member.role}</div>}
        {member.email && <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{member.email}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
        <button onClick={onDelete}
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '3px 8px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}>
          REMOVE
        </button>
      </div>
    </div>
  )
}
