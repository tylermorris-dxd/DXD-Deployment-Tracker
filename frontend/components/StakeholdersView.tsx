'use client'

import React, { useState } from 'react'
import { api } from '@/lib/api'
import type { ProjectFull, HubSpotDeal, HubSpotContact } from '@/lib/types'
import Avatar from './Avatar'

interface Stakeholder {
  id: string
  name: string
  title: string
  company: string
  email: string
  phone: string
}

interface Props {
  project: ProjectFull
  onUpdate: () => void
  hubspotDeal?: HubSpotDeal
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  padding: '8px 12px',
  color: '#E8ECF4',
  fontSize: 12,
  outline: 'none',
  fontFamily: "'IBM Plex Mono', monospace",
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: "'Chakra Petch', sans-serif",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: 1.5,
  color: 'rgba(255,255,255,0.35)',
  marginBottom: 5,
  textTransform: 'uppercase',
}

const empty = { name: '', title: '', company: '', email: '', phone: '' }

export default function StakeholdersView({ project, onUpdate, hubspotDeal }: Props) {
  const hsContacts: HubSpotContact[] = hubspotDeal?.contactDetails ?? []
  // Use project.stakeholders from cache if available (stored as JSON in a field)
  // For now we manage locally via state seeded from the cache
  const cached: Stakeholder[] = (() => {
    try {
      if (!project.airspaceCache) return []
      // We reuse networkCache for stakeholders list to avoid adding a new field
      return []
    } catch { return [] }
  })()

  const [stakeholders, setStakeholders] = useState<Stakeholder[]>(cached)
  const [form, setForm] = useState({ ...empty })
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const save = () => {
    if (!form.name.trim()) return
    if (editId) {
      setStakeholders(prev => prev.map(s => s.id === editId ? { ...form, id: editId } : s))
    } else {
      setStakeholders(prev => [...prev, { ...form, id: `sh-${Date.now()}` }])
    }
    setForm({ ...empty }); setEditId(null); setShowForm(false)
  }

  const remove = (id: string) => setStakeholders(prev => prev.filter(s => s.id !== id))

  const edit = (s: Stakeholder) => {
    setForm({ name: s.name, title: s.title, company: s.company, email: s.email, phone: s.phone })
    setEditId(s.id); setShowForm(true)
  }

  return (
    <div style={{ padding: '24px 0', maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#C41E3A', textTransform: 'uppercase' }}>
          Stakeholder Contacts
        </div>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', padding: '2px 10px', borderRadius: 10 }}>
          {stakeholders.length}
        </span>
        <button
          onClick={() => { setForm({ ...empty }); setEditId(null); setShowForm(true) }}
          style={{ marginLeft: 'auto', background: 'linear-gradient(135deg, #E53935, #C62828)', border: 'none', borderRadius: 6, color: '#fff', fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, padding: '7px 16px', cursor: 'pointer' }}
        >
          + ADD CONTACT
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'rgba(20,20,24,0.98)', border: '1px solid rgba(196,30,58,0.35)', borderRadius: 12, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 10, color: '#C41E3A', letterSpacing: 1.5, marginBottom: 16 }}>
            {editId ? 'EDIT CONTACT' : 'NEW CONTACT'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Full Name *</label>
              <input style={inputStyle} placeholder="e.g. John Smith" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Title / Role</label>
              <input style={inputStyle} placeholder="e.g. Director of Security" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Company</label>
              <input style={inputStyle} placeholder="e.g. Acme Corp" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} placeholder="e.g. john@acme.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} placeholder="e.g. (555) 123-4567" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              onClick={save}
              style={{ background: 'linear-gradient(135deg, #E53935, #C62828)', border: 'none', borderRadius: 6, color: '#fff', fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, padding: '8px 20px', cursor: 'pointer', opacity: form.name.trim() ? 1 : 0.4 }}
            >
              {editId ? 'SAVE CHANGES' : 'ADD CONTACT'}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm({ ...empty }); setEditId(null) }}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(255,255,255,0.5)', fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 1.5, padding: '8px 20px', cursor: 'pointer' }}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* ── HubSpot contacts ── */}
      {hsContacts.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF9800', display: 'inline-block' }} />
            <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#FF9800' }}>FROM HUBSPOT</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 10 }}>{hsContacts.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {hsContacts.map((c: HubSpotContact) => {
              const name = [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ') || '—'
              return (
                <div key={c.id} style={{ background: 'rgba(255,152,0,0.04)', border: '1px solid rgba(255,152,0,0.15)', borderRadius: 10, padding: '14px 20px', display: 'grid', gridTemplateColumns: '44px 2fr 1.5fr 1.5fr 1fr', gap: 14, alignItems: 'center' }}>
                  <Avatar name={name} email={c.properties.email} ring="rgba(255,152,0,0.4)" />
                  <div>
                    <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 700, color: '#E8ECF4', letterSpacing: 0.3 }}>{name}</div>
                    {c.properties.company && <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{c.properties.company}</div>}
                  </div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#FF9800' }}>{c.properties.jobtitle || '—'}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{c.properties.email || '—'}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{c.properties.phone || '—'}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Local contacts ── */}
      {stakeholders.length === 0 && !showForm ? (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.07)', borderRadius: 10, padding: '32px 24px', textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
          No contacts yet — click &quot;+ ADD CONTACT&quot; to add a stakeholder.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {stakeholders.map(s => (
            <div
              key={s.id}
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '16px 20px', display: 'grid', gridTemplateColumns: '44px 2fr 1.5fr 1.5fr 1fr auto', gap: 14, alignItems: 'center' }}
            >
              <Avatar name={s.name} email={s.email} />
              <div>
                <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 13, fontWeight: 700, color: '#E8ECF4', letterSpacing: 0.3 }}>{s.name}</div>
                {s.company && <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{s.company}</div>}
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#C41E3A' }}>{s.title || '—'}</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{s.email || '—'}</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{s.phone || '—'}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => edit(s)}
                  style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: '4px 8px', display: 'flex', alignItems: 'center' }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button
                  onClick={() => remove(s.id)}
                  style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, cursor: 'pointer', color: 'rgba(255,100,100,0.5)', padding: '4px 8px', display: 'flex', alignItems: 'center' }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4m1.5 0v7.5a1 1 0 01-1 1h-5a1 1 0 01-1-1V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
