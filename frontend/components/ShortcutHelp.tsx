'use client'

import React from 'react'

interface Props { open: boolean; onClose: () => void }

// Global "?" cheatsheet. Every keyboard-driven feature in the app should
// show up here so the UI documents itself. Groups are named after their
// scope so the operator finds what they want fast.
const GROUPS: Array<{ title: string; rows: Array<{ keys: string[]; desc: string }> }> = [
  {
    title: 'Global',
    rows: [
      { keys: ['⌘', 'K'],        desc: 'Open command palette (search deals, run commands)' },
      { keys: ['?'],             desc: 'Toggle this shortcut sheet' },
      { keys: ['Esc'],           desc: 'Close any open overlay (palette, modal, this sheet)' },
    ],
  },
  {
    title: 'Command palette',
    rows: [
      { keys: ['↑', '↓'],        desc: 'Move selection' },
      { keys: ['↵'],             desc: 'Run selected item' },
      { keys: ['mark', '<deal>', 'steady'], desc: 'Mark a deal steady state' },
      { keys: ['mark', '<deal>', 'faa'],    desc: 'Enable FAA tracking on a deal' },
      { keys: ['delete', '<deal>'],         desc: 'Delete a deal (with 7-second undo)' },
      { keys: ['open', '<deal>'],           desc: 'Jump straight into a deal' },
    ],
  },
  {
    title: 'Fleet Map',
    rows: [
      { keys: ['Click pin'],     desc: 'Open that deal' },
      { keys: ['Weather toggle'],desc: 'Live wind + temp rings around each pin' },
      { keys: ['Ops area toggle'],desc: 'Draw a 5-mile ops-area ring per pin' },
      { keys: ['Time scrubber'], desc: 'Watch the fleet come online over time' },
    ],
  },
]

export default function ShortcutHelp({ open, onClose }: Props) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: 'fadeSlideIn 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(680px, 95vw)', maxHeight: '85vh', overflowY: 'auto',
          background: '#12141a', border: '1px solid #2a3040',
          borderRadius: 14, padding: '22px 24px',
          boxShadow: '0 40px 80px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15, color: '#e8eaf0', letterSpacing: 0.8 }}>
              KEYBOARD SHORTCUTS
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#5a6380', marginTop: 3 }}>
              Every keystroke this UI understands
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: '1px solid #2a3040', borderRadius: 5, color: '#9aa3b8', padding: '4px 10px', cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}
          >
            Esc
          </button>
        </div>

        {GROUPS.map(g => (
          <div key={g.title} style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: 2, color: '#D2232A', textTransform: 'uppercase', marginBottom: 10 }}>
              {g.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {g.rows.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0, minWidth: 220 }}>
                    {r.keys.map((k, j) => (
                      <React.Fragment key={j}>
                        {j > 0 && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#5a6380', padding: '0 2px' }}>+</span>}
                        <kbd style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#e8eaf0',
                          background: '#0d1017', border: '1px solid #2a3040', borderRadius: 4,
                          padding: '2px 7px', minWidth: 20, textAlign: 'center' as const,
                        }}>
                          {k}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#9aa3b8', flex: 1 }}>
                    {r.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#5a6380', letterSpacing: 0.5 }}>
          Interface preferences live under the ⚙ icon in the topbar — sound, crosshair cursor, small physics.
        </div>
      </div>
    </div>
  )
}
