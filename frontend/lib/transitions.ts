'use client'

// Cross-browser wrapper around the View Transitions API. Where supported
// (Chrome / Edge / Safari 18+), state changes wrapped in withViewTransition
// morph between visual snapshots automatically. Everywhere else, the
// callback just runs synchronously — no error, no degraded feel, just no
// morph.

// The browsers that implement the API define this on Document. Older
// lib.dom.d.ts revisions don't, so we type it loosely without extending
// Document directly (extending is what tripped the TS declaration merge).
type StartVT = (cb: () => void | Promise<void>) => unknown

export function withViewTransition<T>(update: () => T): T {
  if (typeof document === 'undefined') return update()
  const start = (document as unknown as { startViewTransition?: StartVT }).startViewTransition
  if (typeof start !== 'function') return update()
  let out: T | undefined
  // startViewTransition invokes its callback synchronously before returning,
  // so `out` is populated by the time we hit `return out`.
  start.call(document, () => { out = update() })
  return out as T
}

// Store the last click's coordinates so a following state change can grow
// from that point. Persists via a mutable module singleton — no state to
// serialize, just live coordinates.
let lastPoint: { x: number; y: number } | null = null

export function markZoomOrigin(e: React.MouseEvent | React.TouchEvent | { clientX: number; clientY: number }) {
  const point = 'clientX' in e ? e : 'touches' in e && e.touches[0] ? e.touches[0] : null
  if (!point) return
  lastPoint = { x: point.clientX, y: point.clientY }
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.style.setProperty('--dxd-zoom-x', `${point.clientX}px`)
    root.style.setProperty('--dxd-zoom-y', `${point.clientY}px`)
  }
}

export function getZoomOrigin(): { x: number; y: number } | null {
  return lastPoint
}
