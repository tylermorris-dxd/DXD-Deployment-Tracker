'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ProjectFull, ProjectAttachmentMeta } from '@/lib/types'
import { useIsMobile } from '@/lib/useIsMobile'
import { showToast } from '@/lib/toast'

// Install photo record for a deal. Photos are stored as project_attachments
// tagged kind = "photo-<category>", so they share the existing upload
// pipeline with the signoff PDF and need no separate table.
//
// Phone cameras produce 4000px / 4MB JPEGs. Thirty of those in a grid is
// 120MB of transfer, so every upload is downscaled in the browser first —
// 2048px on the long edge is still far more detail than anyone needs to
// read a breaker label, at roughly a tenth the bytes.

interface Props {
  project: ProjectFull
}

interface Category {
  id: string
  label: string
  color: string
  hint: string
}

const CATEGORIES: Category[] = [
  { id: 'photo-pre',     label: 'Pre-Install',  color: '#3b82f6', hint: 'Site as found — mounting surface, power, existing conditions' },
  { id: 'photo-install', label: 'Install',      color: '#FFB300', hint: 'Work in progress — cable runs, mounting, terminations' },
  { id: 'photo-post',    label: 'Post-Install', color: '#3FB95A', hint: 'Finished state — dock in place, labeled, sealed' },
  { id: 'photo-issue',   label: 'Issue',        color: '#D2232A', hint: 'Damage, blockers, anything that needs a decision' },
]

const CAT_BY_ID = new Map(CATEGORIES.map(c => [c.id, c]))
const MAX_DIM = 2048
const JPEG_QUALITY = 0.82

// Downscale in the browser before upload. Falls back to the original file
// whenever the image can't be decoded (odd formats, very old browsers) so a
// failed resize never blocks the upload itself.
async function downscaleImage(file: File): Promise<{ blob: Blob; name: string }> {
  const original = { blob: file as Blob, name: file.name }
  if (!file.type.startsWith('image/')) return original

  let bitmap: ImageBitmap | null = null
  try { bitmap = await createImageBitmap(file) } catch { return original }
  if (!bitmap) return original

  const { width, height } = bitmap
  const longest = Math.max(width, height)
  const scale = Math.min(1, MAX_DIM / longest)

  // Already small and already light — don't re-encode and lose quality.
  if (scale >= 1 && file.size < 1_500_000) { bitmap.close(); return original }

  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) { bitmap.close(); return original }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY))
  if (!blob) return original
  return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' }
}

function fmtBytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function ProjectPhotos({ project }: Props) {
  const qc = useQueryClient()
  const isMobile = useIsMobile()
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const [uploadCat, setUploadCat] = useState<string>('photo-install')
  const [filter, setFilter] = useState<string>('all')
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const { data: all = [], isLoading } = useQuery({
    queryKey: ['projectAttachments', project.id],
    queryFn: () => api.projectAttachments.list(project.id),
  })

  const photos = useMemo(
    () => all.filter(a => a.kind?.startsWith('photo')),
    [all],
  )

  const shown = useMemo(
    () => (filter === 'all' ? photos : photos.filter(p => p.kind === filter)),
    [photos, filter],
  )

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of photos) m[p.kind] = (m[p.kind] || 0) + 1
    return m
  }, [photos])

  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: ['projectAttachments', project.id] }),
    [qc, project.id],
  )

  const upload = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!list.length) {
      showToast({ title: 'No images selected', detail: 'Only image files can be added here.', tone: 'info', durationMs: 2500 })
      return
    }
    setBusy({ done: 0, total: list.length })
    let ok = 0
    for (let i = 0; i < list.length; i++) {
      try {
        const { blob, name } = await downscaleImage(list[i])
        await api.projectAttachments.upload(project.id, blob, { filename: name, kind: uploadCat })
        ok++
      } catch {
        // Keep going — one bad file shouldn't abort a 20-photo batch.
      }
      setBusy({ done: i + 1, total: list.length })
    }
    setBusy(null)
    refresh()
    showToast({
      title: ok === list.length ? `Added ${ok} photo${ok === 1 ? '' : 's'}` : `Added ${ok} of ${list.length}`,
      detail: CAT_BY_ID.get(uploadCat)?.label,
      tone: ok === list.length ? 'success' : 'info',
      durationMs: 3000,
    })
  }, [project.id, uploadCat, refresh])

  const del = useMutation({
    mutationFn: (id: string) => api.projectAttachments.delete(id),
    onSuccess: () => { refresh(); showToast({ title: 'Photo deleted', tone: 'success', durationMs: 2000 }) },
  })

  const caption = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => api.projectAttachments.setCaption(id, text),
    onSuccess: refresh,
  })

  // Lightbox keyboard nav
  useEffect(() => {
    if (lightbox === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
      if (e.key === 'ArrowRight') setLightbox(i => (i === null ? null : Math.min(shown.length - 1, i + 1)))
      if (e.key === 'ArrowLeft') setLightbox(i => (i === null ? null : Math.max(0, i - 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, shown.length])

  // Clamp the lightbox if the underlying list shrinks (delete / filter change).
  useEffect(() => {
    if (lightbox !== null && lightbox >= shown.length) {
      setLightbox(shown.length ? shown.length - 1 : null)
    }
  }, [shown.length, lightbox])

  const current = lightbox !== null ? shown[lightbox] : null

  return (
    <div
      style={{ marginBottom: 24, position: 'relative' }}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer?.files?.length) upload(e.dataTransfer.files)
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="6" width="20" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
            <path d="M8 6l1.6-2.6h4.8L16 6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <circle cx="12" cy="13" r="3.6" stroke="currentColor" strokeWidth="1.7" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: 1, fontFamily: "'Chakra Petch', sans-serif" }}>INSTALL PHOTOS</h2>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginTop: 2 }}>
            {photos.length} PHOTO{photos.length === 1 ? '' : 'S'} ON THIS DEAL · {project.name.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Upload bar */}
      <div style={{
        background: 'rgba(30,30,34,0.7)',
        border: dragOver ? '1px dashed #8b5cf6' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8, padding: 14, marginBottom: 16,
        transition: 'border-color 0.15s',
      }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
          Add photos as
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {CATEGORIES.map(c => {
            const on = uploadCat === c.id
            return (
              <button
                key={c.id}
                onClick={() => setUploadCat(c.id)}
                title={c.hint}
                style={{
                  padding: '7px 13px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700,
                  letterSpacing: 1, textTransform: 'uppercase',
                  border: `1px solid ${on ? c.color : 'rgba(255,255,255,0.1)'}`,
                  background: on ? `${c.color}22` : 'transparent',
                  color: on ? c.color : 'rgba(255,255,255,0.45)',
                  transition: 'all 0.15s',
                }}
              >
                {c.label}
              </button>
            )
          })}
        </div>

        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 12, lineHeight: 1.5 }}>
          {CAT_BY_ID.get(uploadCat)?.hint}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!!busy}
            style={{
              padding: '10px 18px', borderRadius: 6, border: 'none',
              background: busy ? 'rgba(139,92,246,0.3)' : 'linear-gradient(135deg, #8b5cf6, #6366f1)',
              color: '#fff', cursor: busy ? 'wait' : 'pointer',
              fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
            }}
          >
            {busy ? `Uploading ${busy.done}/${busy.total}…` : '+ Choose Photos'}
          </button>
          {isMobile && (
            <button
              onClick={() => cameraRef.current?.click()}
              disabled={!!busy}
              style={{
                padding: '10px 18px', borderRadius: 6,
                border: '1px solid rgba(139,92,246,0.5)', background: 'transparent',
                color: '#a78bfa', cursor: busy ? 'wait' : 'pointer',
                fontFamily: "'Chakra Petch', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
              }}
            >
              📷 Take Photo
            </button>
          )}
          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
              …or drag images anywhere onto this panel
            </div>
          )}
        </div>

        <input
          ref={fileRef} type="file" accept="image/*" multiple hidden
          onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = '' }}
        />
        <input
          ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
          onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = '' }}
        />
      </div>

      {/* Filter row */}
      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <FilterChip label="All" count={photos.length} color="#e8eaf0" on={filter === 'all'} onClick={() => setFilter('all')} />
          {CATEGORIES.map(c => (
            <FilterChip key={c.id} label={c.label} count={counts[c.id] || 0} color={c.color} on={filter === c.id} onClick={() => setFilter(c.id)} />
          ))}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
          Loading photos…
        </div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.2)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 8 }}>
          <div style={{ fontSize: 34, marginBottom: 12, opacity: 0.4 }}>📷</div>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'rgba(255,255,255,0.45)' }}>
            {photos.length === 0 ? 'NO PHOTOS YET' : 'NONE IN THIS CATEGORY'}
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
            {photos.length === 0
              ? 'Add site photos so the next person on this deal can see what you saw.'
              : 'Switch the filter above to see the rest.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 140 : 200}px, 1fr))`, gap: 10 }}>
          {shown.map((p, i) => {
            const cat = CAT_BY_ID.get(p.kind)
            return (
              <button
                key={p.id}
                onClick={() => setLightbox(i)}
                style={{
                  position: 'relative', padding: 0, border: `1px solid ${cat?.color || '#555'}33`,
                  borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: '#0a0b0d',
                  aspectRatio: '4 / 3', display: 'block', width: '100%',
                }}
              >
                <img
                  src={api.projectAttachments.downloadUrl(p.id)}
                  alt={p.caption || p.name}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                <div style={{
                  position: 'absolute', top: 6, left: 6,
                  background: `${cat?.color || '#555'}dd`, color: '#fff',
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, fontWeight: 700,
                  letterSpacing: 0.8, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 3,
                }}>
                  {cat?.label || 'Photo'}
                </div>
                {p.caption && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.88))',
                    color: '#fff', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9,
                    padding: '14px 7px 6px', textAlign: 'left',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {p.caption}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Lightbox */}
      {current && (
        <Lightbox
          photo={current}
          index={lightbox!}
          total={shown.length}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox(i => (i === null ? null : Math.max(0, i - 1)))}
          onNext={() => setLightbox(i => (i === null ? null : Math.min(shown.length - 1, i + 1)))}
          onDelete={() => del.mutate(current.id)}
          onCaption={text => caption.mutate({ id: current.id, text })}
        />
      )}
    </div>
  )
}

function FilterChip({ label, count, color, on, onClick }: {
  label: string; count: number; color: string; on: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
        border: `1px solid ${on ? color : 'rgba(255,255,255,0.1)'}`,
        background: on ? `${color}1e` : 'transparent',
        color: on ? color : 'rgba(255,255,255,0.4)',
        textTransform: 'uppercase', transition: 'all 0.15s',
      }}
    >
      {label} <span style={{ opacity: 0.6 }}>{count}</span>
    </button>
  )
}

function Lightbox({ photo, index, total, onClose, onPrev, onNext, onDelete, onCaption }: {
  photo: ProjectAttachmentMeta
  index: number
  total: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onDelete: () => void
  onCaption: (text: string) => void
}) {
  const [draft, setDraft] = useState(photo.caption || '')
  const [confirmDel, setConfirmDel] = useState(false)
  const cat = CAT_BY_ID.get(photo.kind)

  // Reset the editor when the viewer moves to a different photo.
  useEffect(() => { setDraft(photo.caption || ''); setConfirmDel(false) }, [photo.id, photo.caption])

  const dirty = draft.trim() !== (photo.caption || '')

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,0.93)', backdropFilter: 'blur(4px)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Top bar */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#12141a', borderBottom: `1px solid ${cat?.color || '#333'}55`, flexWrap: 'wrap' }}
      >
        <span style={{
          background: `${cat?.color || '#555'}22`, color: cat?.color || '#aaa',
          border: `1px solid ${cat?.color || '#555'}55`, borderRadius: 4,
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700,
          letterSpacing: 1, textTransform: 'uppercase', padding: '3px 8px', flexShrink: 0,
        }}>
          {cat?.label || 'Photo'}
        </span>
        <div style={{ flex: 1, minWidth: 120, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
          {fmtDate(photo.added_at)} · {fmtBytes(photo.size_bytes)} · {index + 1} of {total}
        </div>
        <a
          href={api.projectAttachments.downloadUrl(photo.id)}
          download={photo.name}
          onClick={e => e.stopPropagation()}
          style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5, color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}
        >
          ↓ Save
        </a>
        <button
          onClick={() => (confirmDel ? onDelete() : setConfirmDel(true))}
          style={{ padding: '6px 12px', border: '1px solid rgba(229,57,53,0.5)', borderRadius: 5, background: confirmDel ? 'rgba(229,57,53,0.25)' : 'transparent', color: '#ef5350', cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}
        >
          {confirmDel ? 'Confirm delete' : 'Delete'}
        </button>
        <button
          onClick={onClose}
          style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5, background: 'rgba(255,255,255,0.05)', color: '#e8eaf0', cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}
        >
          Close
        </button>
      </div>

      {/* Image + arrows */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, padding: 12 }}>
        {index > 0 && (
          <button onClick={e => { e.stopPropagation(); onPrev() }} style={navBtn('left')}>‹</button>
        )}
        <img
          src={api.projectAttachments.downloadUrl(photo.id)}
          alt={photo.caption || photo.name}
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }}
        />
        {index < total - 1 && (
          <button onClick={e => { e.stopPropagation(); onNext() }} style={navBtn('right')}>›</button>
        )}
      </div>

      {/* Caption editor */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', gap: 8, padding: '10px 16px', background: '#12141a', borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && dirty) onCaption(draft.trim()) }}
          placeholder="Add a caption — what is this, and why does it matter?"
          style={{
            flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, padding: '9px 12px', color: '#e8eaf0', outline: 'none',
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
          }}
        />
        <button
          onClick={() => onCaption(draft.trim())}
          disabled={!dirty}
          style={{
            padding: '9px 18px', borderRadius: 6, border: 'none',
            background: dirty ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'rgba(255,255,255,0.06)',
            color: dirty ? '#fff' : 'rgba(255,255,255,0.25)',
            cursor: dirty ? 'pointer' : 'default',
            fontFamily: "'Chakra Petch', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
          }}
        >
          Save
        </button>
      </div>
    </div>
  )
}

function navBtn(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', [side]: 10, top: '50%', transform: 'translateY(-50%)',
    width: 42, height: 60, borderRadius: 6,
    background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', fontSize: 30, lineHeight: 1, cursor: 'pointer', zIndex: 2,
  } as React.CSSProperties
}
