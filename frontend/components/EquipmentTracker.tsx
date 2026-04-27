'use client'

import React, { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { s } from '@/lib/styles'
import { Icons } from '@/lib/icons'
import type { EquipmentItem, CreateEquipment, UpdateEquipment, EquipmentSection } from '@/lib/types'

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ordered:        '#F59E0B',
  'in-transit':   '#3B82F6',
  received:       '#8B5CF6',
  deployed:       '#22C55E',
  maintenance:    '#F97316',
  decommissioned: '#6B7280',
}
const STATUS_LABELS: Record<string, string> = {
  ordered:        'ORDERED',
  'in-transit':   'SHIPPED',
  received:       'DELIVERED',
  deployed:       'OPERATIONAL',
  maintenance:    'MAINTENANCE',
  decommissioned: 'DECOMMISSIONED',
}
const STATUS_OPTIONS = Object.keys(STATUS_LABELS)

type EquipForm = {
  name: string; serialNumber: string; faaRegNumber: string
  assignedOperator: string; groupName: string; dateOrdered: string
  dateReceived: string; status: string; notes: string; qty: number
}

const EMPTY_FORM: EquipForm = {
  name: '', serialNumber: '', faaRegNumber: '', assignedOperator: '',
  groupName: '', dateOrdered: '', dateReceived: '', status: 'ordered', notes: '', qty: 1,
}

// ── CSV Import ─────────────────────────────────────────────────────────────────

type ColMap = {
  name: string; serialNumber: string; faaRegNumber: string; operator: string
  groupName: string; dateOrdered: string; dateReceived: string; status: string
  notes: string; qty: string
}

const EMPTY_COL_MAP: ColMap = {
  name: '', serialNumber: '', faaRegNumber: '', operator: '',
  groupName: '', dateOrdered: '', dateReceived: '', status: '', notes: '', qty: '',
}

// ── Bulk Edit ──────────────────────────────────────────────────────────────────

type BulkEditForm = {
  status: string; operator: string; groupName: string
  notes: string; dateOrdered: string; dateReceived: string
  reassignTargetType: 'project' | 'section' | ''; reassignTargetId: string
}
const EMPTY_BULK_FORM: BulkEditForm = {
  status: '', operator: '', groupName: '', notes: '',
  dateOrdered: '', dateReceived: '', reassignTargetType: '', reassignTargetId: '',
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const parse = (line: string): string[] => {
    const fields: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQ = false
        else cur += ch
      } else {
        if (ch === '"') inQ = true
        else if (ch === ',') { fields.push(cur.trim()); cur = '' }
        else cur += ch
      }
    }
    fields.push(cur.trim())
    return fields
  }
  const nonEmpty = lines.filter(l => l.trim())
  if (nonEmpty.length < 2) return { headers: [], rows: [] }
  const headers = parse(nonEmpty[0]).map(h => h.replace(/^"|"$/g, ''))
  const rows = nonEmpty.slice(1).map(parse)
  return { headers, rows }
}

function guessColMap(headers: string[]): ColMap {
  const find = (...patterns: RegExp[]) => headers.find(h => patterns.some(p => p.test(h.toLowerCase()))) ?? ''
  return {
    name:          find(/^name$/, /^item$/, /^asset/, /^equipment/, /^description$/),
    serialNumber:  find(/serial/, /^sn$/, /^s\/n$/),
    faaRegNumber:  find(/faa/, /reg.*num/, /registration/),
    operator:      find(/operator/, /assigned/, /owner/, /person/, /pilot/),
    groupName:     find(/^group$/, /^category$/, /^type$/, /^class$/),
    status:        find(/^status$/, /^state$/),
    notes:         find(/^notes?$/, /^comments?$/, /^info$/, /^remarks?/),
    qty:           find(/^qty$/, /^quantity$/, /^count$/, /^num/),
    dateOrdered:   find(/order.*date/, /date.*order/, /^ordered$/),
    dateReceived:  find(/receiv.*date/, /date.*receiv/, /deliver.*date/, /^received$/),
  }
}

function normalizeStatus(raw: string): string {
  const v = raw.toLowerCase().trim()
  if (/deploy|operational|active|done|complete/.test(v)) return 'deployed'
  if (/transit|ship|in.?progress|working|en.?route/.test(v)) return 'in-transit'
  if (/receiv|deliver/.test(v)) return 'received'
  if (/order|pending|purchase/.test(v)) return 'ordered'
  if (/mainten|repair|service|hold/.test(v)) return 'maintenance'
  if (/decommission|retire|archive|stuck|cancel/.test(v)) return 'decommissioned'
  return 'ordered'
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || '#6B7280'
  return (
    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color, background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' }}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ color, opacity: 0.8 }}>{icon}</div>
      <div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{label}</div>
      </div>
    </div>
  )
}

// ── Equipment Card ─────────────────────────────────────────────────────────────

function EquipCard({
  item, onEdit, onDelete, onStatusChange, onNoteChange, isSelected, onToggleSelect,
}: {
  item: EquipmentItem
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (status: string) => void
  onNoteChange: (notes: string) => void
  isSelected: boolean
  onToggleSelect: () => void
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteVal, setNoteVal] = useState(item.notes)
  const [statusOpen, setStatusOpen] = useState(false)

  const accentColor = STATUS_COLORS[item.status] || '#6B7280'

  return (
    <div style={{
      background: isSelected ? 'rgba(239,68,68,0.07)' : 'rgba(18,18,22,0.95)',
      border: isSelected ? '1px solid rgba(239,68,68,0.4)' : `1px solid rgba(255,255,255,0.07)`,
      borderTop: `2px solid ${isSelected ? '#ef4444' : accentColor}55`,
      borderRadius: 10,
      overflow: 'hidden',
      transition: 'border-color 0.15s, background 0.15s',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Card body */}
      <div style={{ padding: '14px 16px', flex: 1 }}>
        {/* Name row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          {/* Checkbox */}
          <div
            onClick={e => { e.stopPropagation(); onToggleSelect() }}
            style={{ flexShrink: 0, width: 16, height: 16, marginTop: 2, borderRadius: 3, border: `1.5px solid ${isSelected ? '#ef4444' : 'rgba(255,255,255,0.2)'}`, background: isSelected ? '#ef4444' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
            {isSelected && <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 700, color: '#E8ECF4', letterSpacing: 0.3, lineHeight: 1.3 }}>
              {item.name}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
              {item.qty > 1 && (
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700, color: '#60A5FA', background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 3, padding: '1px 6px' }}>×{item.qty}</span>
              )}
              {item.isVirtual && (
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, fontWeight: 700, color: '#F59E0B', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 3, padding: '1px 5px' }}>AUTO</span>
              )}
              {item.groupName && (
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, padding: '1px 6px' }}>{item.groupName}</span>
              )}
            </div>
          </div>
          {/* Status badge — click to cycle */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div onClick={() => setStatusOpen(v => !v)} style={{ cursor: 'pointer' }}>
              <StatusBadge status={item.status} />
            </div>
            {statusOpen && (
              <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 50, background: '#1a1a1e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, overflow: 'hidden', minWidth: 150, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
                {STATUS_OPTIONS.map(opt => (
                  <div key={opt} onClick={() => { onStatusChange(opt); setStatusOpen(false) }}
                    style={{ padding: '8px 14px', cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: STATUS_COLORS[opt], background: item.status === opt ? `${STATUS_COLORS[opt]}15` : 'transparent', transition: 'background 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = `${STATUS_COLORS[opt]}20`)}
                    onMouseLeave={e => (e.currentTarget.style.background = item.status === opt ? `${STATUS_COLORS[opt]}15` : 'transparent')}>
                    {STATUS_LABELS[opt]}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
          {item.serialNumber && (
            <div>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 8, fontWeight: 600, letterSpacing: 1.2, color: 'rgba(255,255,255,0.25)', marginBottom: 2 }}>SERIAL #</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{item.serialNumber}</div>
            </div>
          )}
          {item.faaRegNumber && (
            <div>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 8, fontWeight: 600, letterSpacing: 1.2, color: 'rgba(255,255,255,0.25)', marginBottom: 2 }}>FAA REG #</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{item.faaRegNumber}</div>
            </div>
          )}
          {item.operator && (
            <div>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 8, fontWeight: 600, letterSpacing: 1.2, color: 'rgba(255,255,255,0.25)', marginBottom: 2 }}>OPERATOR</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{item.operator}</div>
            </div>
          )}
          {(item.dateOrdered || item.dateReceived) && (
            <div>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 8, fontWeight: 600, letterSpacing: 1.2, color: 'rgba(255,255,255,0.25)', marginBottom: 2 }}>DATES</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                {item.dateOrdered && <span>Ord: {item.dateOrdered}</span>}
                {item.dateOrdered && item.dateReceived && <br />}
                {item.dateReceived && <span>Rcv: {item.dateReceived}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Notes preview */}
        {item.notes && !noteOpen && (
          <div style={{ marginTop: 8, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', lineHeight: 1.4, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8 }}>
            {item.notes.length > 80 ? item.notes.slice(0, 80) + '…' : item.notes}
          </div>
        )}

        {/* Notes editor */}
        {noteOpen && (
          <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
            <textarea
              autoFocus
              value={noteVal}
              onChange={e => setNoteVal(e.target.value)}
              onBlur={() => { onNoteChange(noteVal); setNoteOpen(false) }}
              placeholder="Add notes..."
              style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 6, padding: '7px 10px', color: '#E8ECF4', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", resize: 'vertical', minHeight: 60, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        )}
      </div>

      {/* Action bar */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '7px 12px', display: 'flex', gap: 4, justifyContent: 'flex-end', background: 'rgba(0,0,0,0.15)' }}>
        <button
          onClick={() => { setNoteOpen(v => !v); if (!noteOpen) setNoteVal(item.notes) }}
          title={item.notes ? 'Edit note' : 'Add note'}
          style={{ background: 'none', border: `1px solid ${item.notes ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 4, cursor: 'pointer', color: item.notes ? '#60A5FA' : 'rgba(255,255,255,0.3)', padding: '4px 9px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 2h8v7H7l-2 2V9H2V2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
          NOTE
        </button>
        <button onClick={onEdit}
          title="Edit"
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: '4px 9px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          EDIT
        </button>
        {!item.isVirtual && (
          <button onClick={onDelete}
            title="Delete"
            style={{ background: 'none', border: '1px solid rgba(255,100,100,0.15)', borderRadius: 4, cursor: 'pointer', color: 'rgba(255,100,100,0.45)', padding: '4px 8px', display: 'flex', alignItems: 'center' }}>
            {Icons.trash}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Section group ──────────────────────────────────────────────────────────────

function SectionGroup({
  section, items, isCollapsed, onToggleCollapse, onAddEquip, onDelete,
  inputSm, labelSm, onEdit, onDeleteItem, onStatusChange, onNoteChange,
  selectedIds, onToggleSelect,
}: {
  section: EquipmentSection
  items: EquipmentItem[]
  isCollapsed: boolean
  onToggleCollapse: () => void
  onAddEquip: () => void
  onDelete: () => void
  inputSm: React.CSSProperties
  labelSm: React.CSSProperties
  onEdit: (item: EquipmentItem) => void
  onDeleteItem: (item: EquipmentItem) => void
  onStatusChange: (item: EquipmentItem, status: string) => void
  onNoteChange: (item: EquipmentItem, notes: string) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
}) {
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(section.name)
  const qc = useQueryClient()

  const renameMut = useMutation({
    mutationFn: (name: string) => api.equipment.sections.rename(section.id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipment-sections'] }),
  })

  const saveRename = () => {
    if (nameVal.trim() && nameVal.trim() !== section.name) renameMut.mutate(nameVal.trim())
    setEditingName(false)
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Header */}
      <div
        onClick={() => !editingName && onToggleCollapse()}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: 'rgba(99,102,241,0.05)', borderBottom: isCollapsed ? 'none' : '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', userSelect: 'none', transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.09)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.05)')}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', color: 'rgba(255,255,255,0.35)' }}>
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ width: 9, height: 9, borderRadius: 2, background: '#6366F1', boxShadow: '0 0 7px #6366F188', flexShrink: 0, display: 'inline-block' }} />

        {editingName ? (
          <input
            autoFocus
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={saveRename}
            onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') { setNameVal(section.name); setEditingName(false) } }}
            onClick={e => e.stopPropagation()}
            style={{ ...inputSm, flex: 1, padding: '4px 8px', fontSize: 13, fontFamily: "'Chakra Petch', sans-serif" }}
          />
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 14, fontWeight: 700, color: '#E8ECF4', letterSpacing: 0.3 }}>{section.name}</div>
          </div>
        )}

        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)', padding: '2px 10px', borderRadius: 10, flexShrink: 0 }}>
          {items.length} ITEM{items.length !== 1 ? 'S' : ''}
        </span>

        {/* Rename */}
        <button
          onClick={e => { e.stopPropagation(); setEditingName(true); setNameVal(section.name) }}
          title="Rename section"
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: '4px 8px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>

        {/* Add item */}
        <button
          onClick={e => { e.stopPropagation(); onAddEquip() }}
          style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, cursor: 'pointer', color: '#818CF8', padding: '4px 10px', fontSize: 11, fontFamily: "'Chakra Petch', sans-serif", letterSpacing: 0.5, flexShrink: 0 }}>
          + Add
        </button>

        {/* Delete section */}
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="Delete section"
          style={{ background: 'none', border: '1px solid rgba(255,100,100,0.15)', borderRadius: 5, cursor: 'pointer', color: 'rgba(255,100,100,0.4)', padding: '4px 8px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {Icons.trash}
        </button>
      </div>

      {!isCollapsed && (
        <div style={{ padding: '16px 18px' }}>
          {items.length === 0 ? (
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '20px 0' }}>
              No items — click "+ Add" to add equipment to this section.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {items.map(item => (
                <EquipCard
                  key={item.id}
                  item={item}
                  onEdit={() => onEdit(item)}
                  onDelete={() => onDeleteItem(item)}
                  onStatusChange={status => onStatusChange(item, status)}
                  onNoteChange={notes => onNoteChange(item, notes)}
                  isSelected={selectedIds.has(item.id)}
                  onToggleSelect={() => onToggleSelect(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function EquipmentTracker() {
  const qc = useQueryClient()

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list })
  const { data: teamMembers = [] } = useQuery({ queryKey: ['teamMembers'], queryFn: api.team.list })
  const { data: sections = [] } = useQuery({ queryKey: ['equipment-sections'], queryFn: api.equipment.sections.list })

  // All items across all projects
  const projectIds = projects.map(p => p.id)
  const equipQueries = useQuery({
    queryKey: ['equipment-all', projectIds.join(',')],
    queryFn: async () => {
      const results = await Promise.all(projectIds.map(id => api.equipment.list(id)))
      return results.flat()
    },
    enabled: projectIds.length > 0,
  })

  // All items across all sections
  const sectionIds = sections.map(s => s.id)
  const sectionEquipQuery = useQuery({
    queryKey: ['equipment-sections-items', sectionIds.join(',')],
    queryFn: async () => {
      if (!sectionIds.length) return []
      const results = await Promise.all(sectionIds.map(id => api.equipment.sections.listEquipment(id)))
      return results.flat()
    },
  })
  const sectionItems: EquipmentItem[] = sectionEquipQuery.data ?? []

  const allItems: EquipmentItem[] = [...(equipQueries.data ?? []), ...sectionItems]

  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [formTargetType, setFormTargetType] = useState<'project' | 'section'>('project')
  const [formTargetId, setFormTargetId] = useState<string>('')
  const [form, setForm] = useState<EquipForm>(EMPTY_FORM)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Sections UI state
  const [showNewSection, setShowNewSection] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')

  // Bulk select / delete / edit
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) { next.delete(id) } else { next.add(id) }
    return next
  })
  const clearSelection = () => setSelectedIds(new Set())
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [bulkEditForm, setBulkEditForm] = useState<BulkEditForm>(EMPTY_BULK_FORM)

  // CSV import state
  const csvInputRef = useRef<HTMLInputElement>(null)
  const [showImport, setShowImport] = useState(false)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [colMap, setColMap] = useState<ColMap>(EMPTY_COL_MAP)
  const [importTargetType, setImportTargetType] = useState<'project' | 'section'>('project')
  const [importTargetId, setImportTargetId] = useState<string>('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ ok: number; skip: number } | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['equipment-all'] })
    qc.invalidateQueries({ queryKey: ['equipment-sections-items'] })
  }

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateEquipment }) => api.equipment.update(id, body),
    onSuccess: invalidate,
  })
  const createMut = useMutation({
    mutationFn: ({ projectId, body }: { projectId: string; body: CreateEquipment }) =>
      api.equipment.create(projectId, body),
    onSuccess: () => { invalidate(); setShowForm(false); setEditId(null); setForm(EMPTY_FORM) },
  })
  const createSectionEquipMut = useMutation({
    mutationFn: ({ sectionId, body }: { sectionId: string; body: CreateEquipment }) =>
      api.equipment.sections.createEquipment(sectionId, body),
    onSuccess: () => { invalidate(); setShowForm(false); setEditId(null); setForm(EMPTY_FORM) },
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.equipment.delete(id),
    onSuccess: invalidate,
  })
  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(id => api.equipment.delete(id))),
    onSuccess: () => { invalidate(); clearSelection() },
  })
  const bulkEditMut = useMutation({
    mutationFn: ({ ids, body }: { ids: string[]; body: UpdateEquipment }) =>
      Promise.all(ids.map(id => api.equipment.update(id, body))),
    onSuccess: () => { invalidate(); clearSelection(); setShowBulkEdit(false); setBulkEditForm(EMPTY_BULK_FORM) },
  })
  const createSectionMut = useMutation({
    mutationFn: (name: string) => api.equipment.sections.create({ name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment-sections'] })
      setShowNewSection(false); setNewSectionName('')
    },
  })
  const deleteSectionMut = useMutation({
    mutationFn: (id: string) => api.equipment.sections.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment-sections'] })
      qc.invalidateQueries({ queryKey: ['equipment-sections-items'] })
    },
  })

  const toggleCollapse = (id: string) => setCollapsed(p => ({ ...p, [id]: !p[id] }))

  const openAdd = (targetType: 'project' | 'section' = 'project', targetId?: string) => {
    setFormTargetType(targetType)
    setFormTargetId(targetId || (targetType === 'project' ? projects[0]?.id : sections[0]?.id) || '')
    setForm(EMPTY_FORM)
    setEditId(null)
    setShowForm(true)
  }

  const openEdit = (item: EquipmentItem) => {
    setForm({
      name: item.name, serialNumber: item.serialNumber, faaRegNumber: item.faaRegNumber,
      assignedOperator: item.operator, groupName: item.groupName,
      dateOrdered: item.dateOrdered, dateReceived: item.dateReceived,
      status: item.status, notes: item.notes, qty: item.qty,
    })
    if (item.sectionId) {
      setFormTargetType('section')
      setFormTargetId(item.sectionId)
    } else {
      setFormTargetType('project')
      setFormTargetId(item.projectId ?? projects[0]?.id ?? '')
    }
    setEditId(item.id)
    setShowForm(true)
  }

  const saveForm = () => {
    if (!form.name.trim()) return
    const body: CreateEquipment = {
      name: form.name.trim(),
      serialNumber: form.serialNumber,
      faaRegNumber: form.faaRegNumber,
      status: form.status,
      operator: form.assignedOperator,
      qty: form.qty,
      notes: form.notes,
      dateOrdered: form.dateOrdered,
      dateReceived: form.dateReceived,
      groupName: form.groupName,
    }
    if (editId) {
      const reassign = formTargetType === 'project'
        ? { reassignProjectId: formTargetId }
        : { reassignSectionId: formTargetId }
      updateMut.mutate({ id: editId, body: { ...body, ...reassign } })
      setShowForm(false); setEditId(null); setForm(EMPTY_FORM)
    } else if (formTargetType === 'section') {
      if (!formTargetId) return
      createSectionEquipMut.mutate({ sectionId: formTargetId, body })
    } else {
      const projectId = formTargetId || projects[0]?.id
      if (!projectId) return
      createMut.mutate({ projectId, body })
    }
  }

  const saveBulkEdit = () => {
    const body: UpdateEquipment = {}
    if (bulkEditForm.status) body.status = bulkEditForm.status
    if (bulkEditForm.operator) body.operator = bulkEditForm.operator
    if (bulkEditForm.groupName) body.groupName = bulkEditForm.groupName
    if (bulkEditForm.notes) body.notes = bulkEditForm.notes
    if (bulkEditForm.dateOrdered) body.dateOrdered = bulkEditForm.dateOrdered
    if (bulkEditForm.dateReceived) body.dateReceived = bulkEditForm.dateReceived
    if (bulkEditForm.reassignTargetType === 'project' && bulkEditForm.reassignTargetId) {
      body.reassignProjectId = bulkEditForm.reassignTargetId
    } else if (bulkEditForm.reassignTargetType === 'section' && bulkEditForm.reassignTargetId) {
      body.reassignSectionId = bulkEditForm.reassignTargetId
    }
    if (Object.keys(body).length === 0) return
    bulkEditMut.mutate({ ids: Array.from(selectedIds), body })
  }

  const handleNoteChange = (item: EquipmentItem, notes: string) => {
    updateMut.mutate({ id: item.id, body: { notes } })
  }

  const handleDelete = (item: EquipmentItem) => {
    if (window.confirm(`Delete "${item.name}"?`)) deleteMut.mutate(item.id)
  }

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const { headers, rows } = parseCSV(text)
      if (!headers.length) return
      setCsvHeaders(headers)
      setCsvRows(rows)
      setColMap(guessColMap(headers))
      setImportTargetType('project')
      setImportTargetId(projects[0]?.id ?? sections[0]?.id ?? '')
      setImportResult(null)
      setShowImport(true)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleImport = async () => {
    if (!importTargetId || !colMap.name) return
    setImporting(true)
    let ok = 0, skip = 0
    for (const row of csvRows) {
      const val = (col: string) => (col ? (row[csvHeaders.indexOf(col)] ?? '').trim() : '')
      const name = val(colMap.name)
      if (!name) { skip++; continue }
      const rawStatus = val(colMap.status)
      try {
        const body: CreateEquipment = {
          name,
          serialNumber: val(colMap.serialNumber),
          faaRegNumber: val(colMap.faaRegNumber),
          operator: val(colMap.operator),
          groupName: val(colMap.groupName),
          status: rawStatus ? normalizeStatus(rawStatus) : 'ordered',
          notes: val(colMap.notes),
          qty: parseInt(val(colMap.qty)) || 1,
          dateOrdered: val(colMap.dateOrdered),
          dateReceived: val(colMap.dateReceived),
        }
        if (importTargetType === 'section') {
          await api.equipment.sections.createEquipment(importTargetId, body)
        } else {
          await api.equipment.create(importTargetId, body)
        }
        ok++
      } catch { skip++ }
    }
    setImporting(false)
    setImportResult({ ok, skip })
    invalidate()
  }

  // Filter
  const filtered = allItems.filter(e => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      e.name.toLowerCase().includes(q) ||
      e.serialNumber.toLowerCase().includes(q) ||
      e.faaRegNumber.toLowerCase().includes(q) ||
      e.operator.toLowerCase().includes(q)
    )
  })

  // Stats
  const deployed    = allItems.filter(e => e.status === 'deployed').length
  const inTransit   = allItems.filter(e => e.status === 'in-transit').length
  const maintenance = allItems.filter(e => e.status === 'maintenance').length

  const inputSm: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 12px', color: '#E8ECF4', fontSize: 12, outline: 'none', fontFamily: "'IBM Plex Mono', monospace" }
  const labelSm: React.CSSProperties = { display: 'block', fontFamily: "'Chakra Petch', sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: 'rgba(255,255,255,0.35)', marginBottom: 5, textTransform: 'uppercase' }

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logoRow}>
          <div style={{ color: '#e63946' }}>{Icons.equipment}</div>
          <div>
            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: 3, color: '#E8ECF4' }}>EQUIPMENT TRACKER</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, marginTop: 2 }}>DEUS X DEFENSE</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {selectedIds.size > 0 && (
            <>
              <button
                style={{ background: showBulkEdit ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.12)', border: `1px solid ${showBulkEdit ? 'rgba(99,102,241,0.6)' : 'rgba(99,102,241,0.35)'}`, borderRadius: 7, padding: '8px 14px', color: '#818CF8', cursor: 'pointer', fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => { setShowBulkEdit(v => !v); setBulkEditForm(EMPTY_BULK_FORM) }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                EDIT ({selectedIds.size})
              </button>
              <button
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 7, padding: '8px 14px', color: '#ef4444', cursor: 'pointer', fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => { if (window.confirm(`Delete ${selectedIds.size} selected item${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`)) bulkDeleteMut.mutate(Array.from(selectedIds)) }}>
                {Icons.trash}
                DELETE ({selectedIds.size})
              </button>
            </>
          )}
          <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCsvFile} />
          <button style={s.ghostBtn} onClick={() => csvInputRef.current?.click()}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ marginRight: 5 }}><path d="M2 9.5V11h9V9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M6.5 1v7M4 5.5l2.5 2.5L9 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            IMPORT CSV
          </button>
          <button style={s.primaryBtn} onClick={() => openAdd()}>
            {Icons.plus}<span>ADD EQUIPMENT</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatCard label="TOTAL ITEMS" value={allItems.length} color="#E8ECF4"
          icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="4" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M6 4V3a3 3 0 016 0v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M2 9h14" stroke="currentColor" strokeWidth="1.4"/></svg>} />
        <StatCard label="DEPLOYED" value={deployed} color="#22C55E"
          icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2l2 5h5l-4 3 1.5 5L9 12l-4.5 3L6 10 2 7h5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>} />
        <StatCard label="IN TRANSIT" value={inTransit} color="#3B82F6"
          icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="7" width="13" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M14 10l2-1.5V13h-2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><circle cx="5" cy="15" r="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="12" cy="15" r="1.5" stroke="currentColor" strokeWidth="1.2"/></svg>} />
        <StatCard label="MAINTENANCE" value={maintenance} color="#F97316"
          icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M15 3l-4 4-2-1-1 2 1 2 2-1 4-4a4 4 0 01-4 8 4 4 0 01-4-4 4 4 0 018-6z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>} />
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        </div>
        <input style={{ ...inputSm, paddingLeft: 32 }} placeholder="Search equipment, serial #, FAA reg, operator..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Bulk Edit Panel */}
      {showBulkEdit && selectedIds.size > 0 && (
        <div style={{ background: 'rgba(18,18,30,0.98)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 14, padding: '20px 24px', marginBottom: 24, animation: 'fadeSlideIn 0.25s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, color: '#818CF8', letterSpacing: 1.5 }}>
              BULK EDIT — {selectedIds.size} ITEM{selectedIds.size !== 1 ? 'S' : ''} SELECTED
            </div>
            <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 4 }} onClick={() => { setShowBulkEdit(false); setBulkEditForm(EMPTY_BULK_FORM) }}>✕</button>
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 18 }}>
            Only filled fields are applied — leave blank to keep each item's existing value.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelSm}>Status</label>
              <select style={{ ...inputSm, color: bulkEditForm.status ? (STATUS_COLORS[bulkEditForm.status] || '#E8ECF4') : 'rgba(255,255,255,0.3)' }} value={bulkEditForm.status} onChange={e => setBulkEditForm(f => ({ ...f, status: e.target.value }))}>
                <option value="">— keep existing —</option>
                {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{STATUS_LABELS[opt]}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSm}>Operator</label>
              {teamMembers.length > 0 ? (
                <select style={inputSm} value={bulkEditForm.operator} onChange={e => setBulkEditForm(f => ({ ...f, operator: e.target.value }))}>
                  <option value="">— keep existing —</option>
                  {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ''}</option>)}
                </select>
              ) : (
                <input style={inputSm} placeholder="— keep existing —" value={bulkEditForm.operator} onChange={e => setBulkEditForm(f => ({ ...f, operator: e.target.value }))} />
              )}
            </div>
            <div>
              <label style={labelSm}>Group / Category</label>
              <input style={inputSm} placeholder="— keep existing —" value={bulkEditForm.groupName} onChange={e => setBulkEditForm(f => ({ ...f, groupName: e.target.value }))} />
            </div>
            <div>
              <label style={labelSm}>Date Ordered</label>
              <input type="date" style={inputSm} value={bulkEditForm.dateOrdered} onChange={e => setBulkEditForm(f => ({ ...f, dateOrdered: e.target.value }))} />
            </div>
            <div>
              <label style={labelSm}>Date Received</label>
              <input type="date" style={inputSm} value={bulkEditForm.dateReceived} onChange={e => setBulkEditForm(f => ({ ...f, dateReceived: e.target.value }))} />
            </div>
            <div>
              <label style={labelSm}>Reassign To</label>
              <select style={inputSm} value={bulkEditForm.reassignTargetType && bulkEditForm.reassignTargetId ? `${bulkEditForm.reassignTargetType}:${bulkEditForm.reassignTargetId}` : ''} onChange={e => {
                if (!e.target.value) {
                  setBulkEditForm(f => ({ ...f, reassignTargetType: '', reassignTargetId: '' }))
                } else {
                  const [type, ...rest] = e.target.value.split(':')
                  setBulkEditForm(f => ({ ...f, reassignTargetType: type as 'project' | 'section', reassignTargetId: rest.join(':') }))
                }
              }}>
                <option value="">— keep existing —</option>
                {projects.length > 0 && <optgroup label="DEALS">{projects.map(p => <option key={p.id} value={`project:${p.id}`}>{p.name}{p.client ? ` — ${p.client}` : ''}</option>)}</optgroup>}
                {sections.length > 0 && <optgroup label="SECTIONS">{sections.map(sec => <option key={sec.id} value={`section:${sec.id}`}>{sec.name}</option>)}</optgroup>}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelSm}>Notes</label>
              <textarea style={{ ...inputSm, height: 60, resize: 'vertical' }} placeholder="— keep existing —" value={bulkEditForm.notes} onChange={e => setBulkEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={s.ghostBtn} onClick={() => { setShowBulkEdit(false); setBulkEditForm(EMPTY_BULK_FORM) }}>CANCEL</button>
            <button
              style={{ ...s.primaryBtn, background: '#6366F1' }}
              disabled={bulkEditMut.isPending}
              onClick={saveBulkEdit}>
              {bulkEditMut.isPending ? 'APPLYING…' : `APPLY TO ${selectedIds.size} ITEM${selectedIds.size !== 1 ? 'S' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImport && (
        <div style={{ background: 'rgba(18,18,24,0.98)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 14, padding: '20px 24px', marginBottom: 24, animation: 'fadeSlideIn 0.25s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, color: '#3B82F6', letterSpacing: 1.5 }}>
              IMPORT FROM CSV — {csvRows.length} ROW{csvRows.length !== 1 ? 'S' : ''} DETECTED
            </div>
            <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 4 }} onClick={() => { setShowImport(false); setImportResult(null) }}>✕</button>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelSm}>ASSIGN TO</label>
            <select style={inputSm} value={`${importTargetType}:${importTargetId}`} onChange={e => {
              const [type, ...rest] = e.target.value.split(':')
              setImportTargetType(type as 'project' | 'section')
              setImportTargetId(rest.join(':'))
            }}>
              {projects.length > 0 && <optgroup label="DEALS">{projects.map(p => <option key={p.id} value={`project:${p.id}`}>{p.name}{p.client ? ` — ${p.client}` : ''}</option>)}</optgroup>}
              {sections.length > 0 && <optgroup label="SECTIONS">{sections.map(s => <option key={s.id} value={`section:${s.id}`}>{s.name}</option>)}</optgroup>}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>MAP COLUMNS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {([
                ['name', 'Equipment Name *'],
                ['serialNumber', 'Serial Number'],
                ['faaRegNumber', 'FAA Reg #'],
                ['operator', 'Operator'],
                ['groupName', 'Group / Category'],
                ['status', 'Status'],
                ['qty', 'Qty'],
                ['notes', 'Notes'],
                ['dateOrdered', 'Date Ordered'],
                ['dateReceived', 'Date Received'],
              ] as [keyof ColMap, string][]).map(([field, label]) => (
                <div key={field}>
                  <label style={labelSm}>{label}</label>
                  <select style={inputSm} value={colMap[field]} onChange={e => setColMap(m => ({ ...m, [field]: e.target.value }))}>
                    <option value="">— skip —</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {csvRows.length > 0 && colMap.name && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>PREVIEW (first 3 rows)</div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {(['name', 'serialNumber', 'status', 'groupName', 'operator'] as (keyof ColMap)[]).filter(f => colMap[f]).map(f => (
                        <th key={f} style={{ padding: '7px 12px', textAlign: 'left', color: 'rgba(255,255,255,0.35)', fontWeight: 600, whiteSpace: 'nowrap' }}>{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 3).map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {(['name', 'serialNumber', 'status', 'groupName', 'operator'] as (keyof ColMap)[]).filter(f => colMap[f]).map(f => (
                          <td key={f} style={{ padding: '6px 12px', color: 'rgba(255,255,255,0.6)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {colMap[f] ? (row[csvHeaders.indexOf(colMap[f])] ?? '') : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importResult && (
            <div style={{ marginBottom: 12, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: importResult.skip > 0 ? '#F59E0B' : '#22C55E' }}>
              ✓ {importResult.ok} imported{importResult.skip > 0 ? `, ${importResult.skip} skipped (missing name)` : ''}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={s.ghostBtn} onClick={() => { setShowImport(false); setImportResult(null) }}>
              {importResult ? 'CLOSE' : 'CANCEL'}
            </button>
            {!importResult && (
              <button
                style={{ ...s.primaryBtn, background: '#3B82F6', opacity: colMap.name && importTargetId ? 1 : 0.4 }}
                disabled={!colMap.name || !importTargetId || importing}
                onClick={handleImport}>
                {importing ? `IMPORTING… (${csvRows.length} rows)` : `IMPORT ${csvRows.length} ITEMS`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <div style={{ background: 'rgba(20,20,24,0.98)', border: '1px solid rgba(196,30,58,0.35)', borderRadius: 14, padding: '20px 24px', marginBottom: 24, animation: 'fadeSlideIn 0.25s ease' }}>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, color: '#C41E3A', letterSpacing: 1.5, marginBottom: 16 }}>{editId ? 'EDIT EQUIPMENT' : 'ADD EQUIPMENT'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelSm}>Equipment Name *</label>
              <input style={inputSm} placeholder="e.g. DJI Dock 3" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelSm}>{editId ? 'Reassign To' : 'Assign To'}</label>
              <select style={inputSm} value={`${formTargetType}:${formTargetId}`} onChange={e => {
                const [type, ...rest] = e.target.value.split(':')
                setFormTargetType(type as 'project' | 'section')
                setFormTargetId(rest.join(':'))
              }}>
                {projects.length > 0 && <optgroup label="DEALS">{projects.map(p => <option key={p.id} value={`project:${p.id}`}>{p.name}{p.client ? ` — ${p.client}` : ''}</option>)}</optgroup>}
                {sections.length > 0 && <optgroup label="SECTIONS">{sections.map(s => <option key={s.id} value={`section:${s.id}`}>{s.name}</option>)}</optgroup>}
              </select>
            </div>
            <div>
              <label style={labelSm}>Serial Number</label>
              <input style={inputSm} placeholder="e.g. SN-123456" value={form.serialNumber} onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} />
            </div>
            <div>
              <label style={labelSm}>FAA Registration #</label>
              <input style={inputSm} placeholder="e.g. FA3-1234567" value={form.faaRegNumber} onChange={e => setForm(f => ({ ...f, faaRegNumber: e.target.value }))} />
            </div>
            <div>
              <label style={labelSm}>Assigned Operator</label>
              {teamMembers.length > 0 ? (
                <select style={inputSm} value={form.assignedOperator} onChange={e => setForm(f => ({ ...f, assignedOperator: e.target.value }))}>
                  <option value="">— Unassigned —</option>
                  {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ''}</option>)}
                </select>
              ) : (
                <input style={inputSm} placeholder="e.g. Tyler Morris" value={form.assignedOperator} onChange={e => setForm(f => ({ ...f, assignedOperator: e.target.value }))} />
              )}
            </div>
            <div>
              <label style={labelSm}>Group / Category</label>
              <input style={inputSm} placeholder="e.g. Drones, DAA, Accessories..." value={form.groupName} onChange={e => setForm(f => ({ ...f, groupName: e.target.value }))} />
            </div>
            <div>
              <label style={labelSm}>Status</label>
              <select style={{ ...inputSm, color: STATUS_COLORS[form.status] || '#E8ECF4' }} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{STATUS_LABELS[opt]}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSm}>Qty</label>
              <input type="number" min={1} style={inputSm} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: Math.max(1, parseInt(e.target.value) || 1) }))} />
            </div>
            <div>
              <label style={labelSm}>Date Ordered</label>
              <input type="date" style={inputSm} value={form.dateOrdered} onChange={e => setForm(f => ({ ...f, dateOrdered: e.target.value }))} />
            </div>
            <div>
              <label style={labelSm}>Date Received</label>
              <input type="date" style={inputSm} value={form.dateReceived} onChange={e => setForm(f => ({ ...f, dateReceived: e.target.value }))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelSm}>Notes</label>
              <textarea style={{ ...inputSm, height: 70, resize: 'vertical' }} placeholder="Additional notes..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={s.ghostBtn} onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY_FORM) }}>CANCEL</button>
            <button style={{ ...s.primaryBtn, opacity: form.name.trim() ? 1 : 0.4 }} disabled={!form.name.trim() || createMut.isPending || updateMut.isPending} onClick={saveForm}>SAVE EQUIPMENT</button>
          </div>
        </div>
      )}

      {/* Content */}
      {equipQueries.isLoading && projects.length > 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>Loading...</div>
      ) : filtered.length === 0 && sections.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.25)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: 1, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>{search ? 'No Results' : 'No Equipment'}</div>
          <div>{search ? 'No items match your search.' : 'Add equipment or mark procurement items in Phase 2 of a project.'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {/* Project-grouped items */}
          {projects.map(proj => {
            const projItems = filtered.filter(e => e.projectId === proj.id)
            if (projItems.length === 0) return null
            const isCollapsed = !!collapsed[proj.id]
            return (
              <div key={proj.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
                <div onClick={() => toggleCollapse(proj.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', background: 'rgba(255,255,255,0.03)', borderBottom: isCollapsed ? 'none' : '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', userSelect: 'none', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.055)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', color: 'rgba(255,255,255,0.35)' }}>
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#C41E3A', boxShadow: '0 0 7px #C41E3A88', flexShrink: 0, display: 'inline-block' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 14, fontWeight: 700, color: '#E8ECF4', letterSpacing: 0.3 }}>{proj.name}</div>
                    {(proj.client || proj.site) && (
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>
                        {[proj.client, proj.site].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)', padding: '2px 10px', borderRadius: 10, flexShrink: 0 }}>{projItems.length} ITEM{projItems.length !== 1 ? 'S' : ''}</span>
                  <button onClick={e => { e.stopPropagation(); openAdd('project', proj.id) }}
                    style={{ background: 'rgba(196,30,58,0.15)', border: '1px solid rgba(196,30,58,0.3)', borderRadius: 6, cursor: 'pointer', color: '#C41E3A', padding: '4px 10px', fontSize: 11, fontFamily: "'Chakra Petch', sans-serif", letterSpacing: 0.5, flexShrink: 0 }}>
                    + Add
                  </button>
                </div>
                {!isCollapsed && (
                  <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                    {projItems.map(item => (
                      <EquipCard
                        key={item.id}
                        item={item}
                        onEdit={() => openEdit(item)}
                        onDelete={() => handleDelete(item)}
                        onStatusChange={status => updateMut.mutate({ id: item.id, body: { status } })}
                        onNoteChange={notes => handleNoteChange(item, notes)}
                        isSelected={selectedIds.has(item.id)}
                        onToggleSelect={() => toggleSelect(item.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Custom Sections */}
          <div>
            {/* Section header bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.09)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: '#6366F1', boxShadow: '0 0 6px #6366F188', flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700, letterSpacing: 3, color: 'rgba(255,255,255,0.6)' }}>CUSTOM SECTIONS</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', padding: '2px 10px', borderRadius: 10 }}>{sections.length}</span>
              </div>
              <button
                style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, cursor: 'pointer', color: '#818CF8', padding: '6px 12px', fontSize: 10, fontFamily: "'Chakra Petch', sans-serif", letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 5 }}
                onClick={() => setShowNewSection(v => !v)}>
                {Icons.plus}<span>NEW SECTION</span>
              </button>
            </div>

            {/* New section form */}
            {showNewSection && (
              <div style={{ background: 'rgba(30,30,40,0.95)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, padding: '16px 20px', marginBottom: 16, animation: 'fadeSlideIn 0.2s ease' }}>
                <label style={labelSm}>SECTION NAME</label>
                <input
                  autoFocus
                  style={inputSm}
                  placeholder="e.g. Shared Fleet, Demo Equipment, HQ Inventory..."
                  value={newSectionName}
                  onChange={e => setNewSectionName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newSectionName.trim()) createSectionMut.mutate(newSectionName.trim())
                    if (e.key === 'Escape') { setShowNewSection(false); setNewSectionName('') }
                  }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                  <button style={s.ghostBtn} onClick={() => { setShowNewSection(false); setNewSectionName('') }}>CANCEL</button>
                  <button
                    style={{ ...s.primaryBtn, background: '#6366F1', opacity: newSectionName.trim() ? 1 : 0.4 }}
                    disabled={!newSectionName.trim() || createSectionMut.isPending}
                    onClick={() => createSectionMut.mutate(newSectionName.trim())}>
                    {createSectionMut.isPending ? 'CREATING…' : 'CREATE SECTION'}
                  </button>
                </div>
              </div>
            )}

            {/* Section list */}
            {sections.length === 0 && !showNewSection ? (
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.2)', padding: '12px 4px' }}>
                No custom sections. Click "NEW SECTION" to create one for equipment not tied to a deal.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {sections.map(sec => {
                  const secItems = filtered.filter(e => e.sectionId === sec.id)
                  return (
                    <SectionGroup
                      key={sec.id}
                      section={sec}
                      items={secItems}
                      isCollapsed={!!collapsed[sec.id]}
                      onToggleCollapse={() => toggleCollapse(sec.id)}
                      onAddEquip={() => openAdd('section', sec.id)}
                      onDelete={() => {
                        if (window.confirm(`Delete section "${sec.name}" and all its equipment? This cannot be undone.`))
                          deleteSectionMut.mutate(sec.id)
                      }}
                      inputSm={inputSm}
                      labelSm={labelSm}
                      onEdit={openEdit}
                      onDeleteItem={handleDelete}
                      onStatusChange={(item, status) => updateMut.mutate({ id: item.id, body: { status } })}
                      onNoteChange={handleNoteChange}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleSelect}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
