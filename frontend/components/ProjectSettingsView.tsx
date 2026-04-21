'use client'

import React, { useState } from 'react'
import { api } from '@/lib/api'
import type { ProjectFull } from '@/lib/types'

const BRANCH_QUESTIONS = [
  { key: 'drones',  label: 'Does this deal involve drones?' },
  { key: 'manned',  label: 'Does it involve manned aircraft?' },
  { key: 'govdef',  label: 'Is this government / defense?' },
  { key: 'bespoke', label: 'Does it require custom integration?' },
  { key: 'starter', label: 'Is this a Starter Program deal?' },
  { key: 'bvlos',   label: 'Does this involve BVLOS operations?' },
]

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
  const [answers, setAnswers] = useState<Record<string, boolean>>(project.branchAnswers ?? {})

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

      {/* Deal configuration */}
      <div style={{ marginTop: 36 }}>
        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#C41E3A', marginBottom: 6, textTransform: 'uppercase' }}>
          Deal Configuration
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 18 }}>
          These answers control which checklist items are shown for this deal.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {BRANCH_QUESTIONS.map(q => {
            const val = !!answers[q.key]
            const toggle = async () => {
              const next = { ...answers, [q.key]: !val }
              setAnswers(next)
              try {
                await api.projects.updateBranchAnswers(project.id, next)
                onUpdate()
              } catch {
                setAnswers(answers)
              }
            }
            return (
              <div key={q.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{q.label}</span>
                <button
                  onClick={toggle}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
                    background: val ? '#E53935' : 'rgba(255,255,255,0.1)',
                    position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3, left: val ? 23 : 3,
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  }} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
