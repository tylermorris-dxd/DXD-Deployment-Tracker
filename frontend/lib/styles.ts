import type { CSSProperties } from 'react'

export const s = {
  // Layout
  container: {
    maxWidth: 960, margin: '0 auto', padding: '28px 20px',
  } as CSSProperties,

  // Header
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 28,
  } as CSSProperties,
  logoRow: {
    display: 'flex', alignItems: 'center', gap: 14,
  } as CSSProperties,
  logoImg: {
    width: 44, height: 44, objectFit: 'contain' as const, borderRadius: 0,
  } as CSSProperties,
  logoTitle: {
    fontFamily: "'Chakra Petch', sans-serif", fontSize: 18, fontWeight: 700,
    letterSpacing: 3, color: '#E8ECF4', lineHeight: 1.2,
  } as CSSProperties,
  logoSub: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 9,
    color: 'rgba(255,255,255,0.35)', letterSpacing: 2, marginTop: 2,
  } as CSSProperties,

  // Buttons
  primaryBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: '#e63946', border: 'none', borderRadius: 6,
    color: '#fff', fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11, fontWeight: 500, letterSpacing: 1,
    padding: '8px 14px', cursor: 'pointer',
  } as CSSProperties,
  ghostBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'none', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6, color: 'rgba(255,255,255,0.55)',
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11, letterSpacing: 1, padding: '7px 12px', cursor: 'pointer',
  } as CSSProperties,
  iconBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'rgba(255,255,255,0.3)', padding: '2px 4px', lineHeight: 1,
    display: 'flex', alignItems: 'center',
  } as CSSProperties,

  // Cards
  card: {
    background: 'rgba(28,28,30,0.85)', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10, padding: '16px 20px', marginBottom: 10,
    backdropFilter: 'blur(8px)',
  } as CSSProperties,

  // Form fields
  fieldLabel: {
    display: 'block', fontFamily: "'Chakra Petch', sans-serif",
    fontSize: 10, color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.5, marginBottom: 5, textTransform: 'uppercase' as const,
  } as CSSProperties,
  fieldLabelSm: {
    display: 'block', fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 9, color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5, marginBottom: 3, textTransform: 'uppercase' as const,
  } as CSSProperties,
  input: {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
    color: '#E8ECF4', fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13, padding: '9px 12px', outline: 'none',
  } as CSSProperties,
  fieldInput: {
    width: '100%', background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5,
    color: '#E8ECF4', fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12, padding: '7px 10px', outline: 'none',
  } as CSSProperties,

  // Task
  taskCard: {
    background: 'rgba(30,30,34,0.7)', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 8, marginBottom: 8, overflow: 'hidden',
  } as CSSProperties,
  taskHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', cursor: 'pointer', userSelect: 'none' as const,
  } as CSSProperties,
  taskExpanded: {
    padding: '0 14px 14px', borderTop: '1px solid rgba(255,255,255,0.05)',
  } as CSSProperties,

  // Subtask
  subtaskRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 0', minHeight: 32,
  } as CSSProperties,
  subtaskText: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 13,
    color: 'rgba(255,255,255,0.65)', lineHeight: 1.4,
  } as CSSProperties,
  checkbox: {
    width: 15, height: 15, flexShrink: 0, cursor: 'pointer',
    accentColor: '#e63946',
  } as CSSProperties,

  // Attachment
  attachSection: { marginTop: 12 } as CSSProperties,
  attachHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
  } as CSSProperties,
  attachBtn: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: 'none', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 5, color: 'rgba(255,255,255,0.4)',
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 0.5,
    padding: '4px 8px', cursor: 'pointer',
  } as CSSProperties,
  attachItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 8px', background: 'rgba(255,255,255,0.03)',
    borderRadius: 5, marginBottom: 4,
  } as CSSProperties,
  attachName: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
    color: 'rgba(255,255,255,0.7)', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  } as CSSProperties,
  attachMeta: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
  } as CSSProperties,
  attachEmpty: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
    color: 'rgba(255,255,255,0.2)', fontStyle: 'italic',
  } as CSSProperties,

  // Misc
  badge: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
    padding: '2px 7px', borderRadius: 10, letterSpacing: 0.5,
  } as CSSProperties,
  divider: {
    height: 1, background: 'rgba(255,255,255,0.06)', margin: '16px 0',
  } as CSSProperties,
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function progressColor(pct: number): string {
  if (pct < 25) return '#ef4444'
  if (pct < 60) return '#f59e0b'
  if (pct < 100) return '#3b82f6'
  return '#22c55e'
}
