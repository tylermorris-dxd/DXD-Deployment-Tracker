'use client'

import React, { useState } from 'react'
import { api } from '@/lib/api'
import type { ProjectFull } from '@/lib/types'

interface Props {
  project: ProjectFull
  onUpdate: () => void
}

export default function ProjectSettingsView({ project, onUpdate }: Props) {
  const [name, setName] = useState(project.name || '')
  const [client, setClient] = useState(project.client || '')
  const [site, setSite] = useState(project.site || '')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#E8ECF4',
    fontSize: 14,
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
    marginBottom: 6,
    textTransform: 'uppercase',
  }

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await api.projects.update(project.id, {
        name: name.trim() || project.name,
        client: client.trim(),
        site: site.trim(),
      })
      setSaved(true)
      onUpdate()
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '32px 0', maxWidth: 560 }}>
      <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#C41E3A', marginBottom: 24, textTransform: 'uppercase' }}>
        Project Settings
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <label style={labelStyle}>Project Name *</label>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Southside Industrial Complex" />
        </div>
        <div>
          <label style={labelStyle}>Client / Company</label>
          <input style={inputStyle} value={client} onChange={e => setClient(e.target.value)} placeholder="e.g. Acme Security Corp" />
        </div>
        <div>
          <label style={labelStyle}>Site Address</label>
          <input style={inputStyle} value={site} onChange={e => setSite(e.target.value)} placeholder="e.g. 5623 Two Notch Rd, Columbia, SC 29223" />
        </div>
        <div style={{ paddingTop: 8 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{ background: 'linear-gradient(135deg, #E53935, #C62828)', border: 'none', borderRadius: 8, color: '#fff', fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 2, padding: '12px 28px', cursor: saving ? 'wait' : 'pointer' }}
          >
            {saved ? 'SAVED ✓' : saving ? 'SAVING...' : 'SAVE CHANGES'}
          </button>
        </div>
      </div>
    </div>
  )
}
