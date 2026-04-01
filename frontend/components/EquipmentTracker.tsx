'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { s } from '@/lib/styles'
import { Icons } from '@/lib/icons'
import type { EquipmentItem, CreateEquipment, UpdateEquipment } from '@/lib/types'

const STATUS_COLORS: Record<string, string> = {
  pending:   'rgba(255,255,255,0.3)',
  ordered:   '#f59e0b',
  shipped:   '#3b82f6',
  delivered: '#8b5cf6',
  installed: '#22c55e',
}
const STATUS_OPTIONS = ['pending', 'ordered', 'shipped', 'delivered', 'installed']

interface EditCell { id: string; field: 'name' | 'serialNumber' | 'status' | 'operator' | 'qty' }

export default function EquipmentTracker() {
  const qc = useQueryClient()

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list })
  const [projectId, setProjectId] = useState('')

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['equipment', projectId],
    queryFn: () => api.equipment.list(projectId),
    enabled: !!projectId,
  })

  const [editCell, setEditCell] = useState<EditCell | null>(null)
  const [expandedNote, setExpandedNote] = useState<string | null>(null)
  const [addingRow, setAddingRow] = useState(false)
  const [newName, setNewName] = useState('')
  const [newQty, setNewQty] = useState(1)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['equipment', projectId] })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateEquipment }) => api.equipment.update(id, body),
    onSuccess: invalidate,
  })

  const createMut = useMutation({
    mutationFn: (body: CreateEquipment) => api.equipment.create(projectId, body),
    onSuccess: () => { invalidate(); setAddingRow(false); setNewName(''); setNewQty(1) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.equipment.delete(id),
    onSuccess: invalidate,
  })

  // Promote a virtual row to a real DB row, applying the patch at the same time
  const promote = (row: EquipmentItem, patch: UpdateEquipment) => {
    createMut.mutate({
      name: patch.name ?? row.name,
      serialNumber: patch.serialNumber ?? row.serialNumber,
      status: patch.status ?? row.status,
      operator: patch.operator ?? row.operator,
      qty: patch.qty ?? row.qty,
      notes: patch.notes ?? row.notes,
      subtaskId: row.subtaskId,
    })
  }

  const commitCell = (row: EquipmentItem, field: EditCell['field'], value: string | number) => {
    setEditCell(null)
    const patch: UpdateEquipment = { [field]: value }
    if (row.isVirtual) promote(row, patch)
    else updateMut.mutate({ id: row.id, body: patch })
  }

  const commitNote = (row: EquipmentItem, notes: string) => {
    if (row.isVirtual) promote(row, { notes })
    else updateMut.mutate({ id: row.id, body: { notes } })
  }

  const isBattery = (name: string) => name.toLowerCase().includes('battery')

  const thSt: React.CSSProperties = {
    fontFamily: "'Chakra Petch', sans-serif", fontSize: 9,
    color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5,
    textAlign: 'left', padding: '8px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    whiteSpace: 'nowrap',
  }
  const tdSt: React.CSSProperties = {
    padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)',
    verticalAlign: 'middle',
  }
  const inlineInput: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(230,57,70,0.5)',
    borderRadius: 4, padding: '3px 7px', color: '#E8ECF4',
    fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", outline: 'none', width: '100%',
  }

  const renderCell = (row: EquipmentItem, field: EditCell['field']) => {
    const isEditing = editCell?.id === row.id && editCell?.field === field

    if (field === 'status') {
      if (isEditing) return (
        <select autoFocus defaultValue={row.status}
          style={{ ...inlineInput, padding: '3px 4px' }}
          onBlur={e => commitCell(row, 'status', e.target.value)}
          onChange={e => commitCell(row, 'status', e.target.value)}>
          {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      )
      const color = STATUS_COLORS[row.status] ?? 'rgba(255,255,255,0.3)'
      return (
        <span onClick={() => setEditCell({ id: row.id, field: 'status' })}
          style={{ ...s.badge, background: color + '22', color, border: `1px solid ${color}55`, cursor: 'pointer', userSelect: 'none', textTransform: 'uppercase', fontSize: 9 }}>
          {row.status}
        </span>
      )
    }

    if (field === 'qty') {
      if (isEditing) return (
        <input autoFocus type="number" min={1} defaultValue={row.qty} style={{ ...inlineInput, width: 56 }}
          onBlur={e => commitCell(row, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
          onKeyDown={e => {
            if (e.key === 'Enter') commitCell(row, 'qty', Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1))
            if (e.key === 'Escape') setEditCell(null)
          }} />
      )
      if (isBattery(row.name)) return (
        <span onClick={() => setEditCell({ id: row.id, field: 'qty' })}
          style={{ ...s.badge, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', cursor: 'pointer' }}>
          ×{row.qty}
        </span>
      )
      return (
        <span onClick={() => setEditCell({ id: row.id, field: 'qty' })}
          style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace" }}>
          {row.qty}
        </span>
      )
    }

    // Text fields
    const val = field === 'name' ? row.name : field === 'serialNumber' ? row.serialNumber : row.operator
    if (isEditing) return (
      <input autoFocus defaultValue={val} style={inlineInput}
        onBlur={e => commitCell(row, field, e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') commitCell(row, field, (e.target as HTMLInputElement).value)
          if (e.key === 'Escape') setEditCell(null)
        }} />
    )
    return (
      <span onClick={() => setEditCell({ id: row.id, field })}
        title="Click to edit"
        style={{ cursor: 'pointer', color: val ? '#E8ECF4' : 'rgba(255,255,255,0.2)', fontSize: field === 'name' ? 13 : 11, fontFamily: "'IBM Plex Mono', monospace" }}>
        {val || '—'}
        {field === 'name' && row.isVirtual && (
          <span style={{ marginLeft: 8, fontSize: 8, color: '#f59e0b', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>AUTO</span>
        )}
      </span>
    )
  }

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
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={projectId}
            onChange={e => { setProjectId(e.target.value); setExpandedNote(null); setEditCell(null) }}
            style={{ ...s.fieldInput, minWidth: 220, color: projectId ? '#E8ECF4' : 'rgba(255,255,255,0.35)' } as React.CSSProperties}
          >
            <option value="">— Select Project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {projectId && (
            <button style={s.ghostBtn} onClick={() => setAddingRow(v => !v)}>
              {Icons.plus}<span>ADD ITEM</span>
            </button>
          )}
        </div>
      </div>

      {/* Add row form */}
      {addingRow && projectId && (
        <div style={{ ...s.card, display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={s.fieldLabelSm}>ITEM NAME *</label>
            <input autoFocus style={s.fieldInput} placeholder="e.g. DJI Matrice 4TD"
              value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setAddingRow(false) }} />
          </div>
          <div style={{ width: 72 }}>
            <label style={s.fieldLabelSm}>QTY</label>
            <input type="number" min={1} style={s.fieldInput} value={newQty}
              onChange={e => setNewQty(Math.max(1, parseInt(e.target.value) || 1))} />
          </div>
          <button style={{ ...s.primaryBtn, opacity: newName.trim() ? 1 : 0.4 }}
            disabled={!newName.trim() || createMut.isPending}
            onClick={() => createMut.mutate({ name: newName.trim(), qty: newQty })}>
            ADD
          </button>
          <button style={s.ghostBtn} onClick={() => { setAddingRow(false); setNewName(''); setNewQty(1) }}>✕</button>
        </div>
      )}

      {!projectId ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.25)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
          Select a project to view its equipment
        </div>
      ) : isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
          Loading...
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.2)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
          No equipment yet. Items checked in Phase 2 procurement tasks appear here automatically.
        </div>
      ) : (
        <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thSt}>ITEM</th>
                <th style={thSt}>QTY</th>
                <th style={thSt}>STATUS</th>
                <th style={thSt}>SERIAL #</th>
                <th style={thSt}>OPERATOR</th>
                <th style={{ ...thSt, width: 36 }}></th>
                <th style={{ ...thSt, width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map(row => (
                <React.Fragment key={row.id}>
                  <tr style={{ background: row.isVirtual ? 'rgba(255,255,255,0.01)' : 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                    onMouseLeave={e => (e.currentTarget.style.background = row.isVirtual ? 'rgba(255,255,255,0.01)' : 'transparent')}>
                    <td style={tdSt}>{renderCell(row, 'name')}</td>
                    <td style={tdSt}>{renderCell(row, 'qty')}</td>
                    <td style={tdSt}>{renderCell(row, 'status')}</td>
                    <td style={tdSt}>{renderCell(row, 'serialNumber')}</td>
                    <td style={tdSt}>{renderCell(row, 'operator')}</td>
                    <td style={tdSt}>
                      <button
                        style={{ ...s.iconBtn, color: expandedNote === row.id ? '#e63946' : row.notes ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)' }}
                        title={row.notes ? 'Edit note' : 'Add note'}
                        onClick={() => setExpandedNote(expandedNote === row.id ? null : row.id)}>
                        {Icons.note}
                      </button>
                    </td>
                    <td style={tdSt}>
                      {!row.isVirtual && (
                        <button style={{ ...s.iconBtn, color: 'rgba(255,80,80,0.4)' }} title="Delete"
                          onClick={() => { if (window.confirm(`Delete "${row.name}"?`)) deleteMut.mutate(row.id) }}>
                          {Icons.trash}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedNote === row.id && (
                    <tr>
                      <td colSpan={7} style={{ padding: '0 12px 10px', background: 'rgba(230,57,70,0.03)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <NoteEditor
                          key={row.id}
                          initialValue={row.notes}
                          onSave={notes => commitNote(row, notes)}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NoteEditor({ initialValue, onSave }: { initialValue: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initialValue)
  return (
    <textarea
      autoFocus
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => onSave(value)}
      placeholder="Add notes about this equipment item..."
      style={{
        width: '100%', minHeight: 64, resize: 'vertical', marginTop: 8,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6, color: '#E8ECF4', fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11, padding: '8px 10px', outline: 'none', boxSizing: 'border-box',
      }}
    />
  )
}
