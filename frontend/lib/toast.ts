'use client'

import { makePubSub } from './pubsub'

// Toast system with optional undo. Anywhere in the app can call
// showToast({...}) and a rendered <Toaster/> at the root shows it.
//
// A toast with an undo action defers the "real" work until the timeout
// expires (or explicitly, via commit()). If the user hits Undo before
// then, the work is skipped. This is how a "safe delete" flow avoids
// the usual confirm dialog while still being reversible.

export type ToastTone = 'info' | 'success' | 'warn' | 'error' | 'undo'

export interface ToastPayload {
  id: string
  title: string
  detail?: string
  tone: ToastTone
  durationMs: number
  // Only set for undoable toasts.
  undo?: {
    label: string
    onUndo: () => void
    onCommit: () => void
    committed?: boolean
    undone?: boolean
  }
}

const bus = makePubSub<ToastPayload>()

export const toastBus = {
  subscribe: bus.subscribe,
}

let counter = 0
function newId() {
  counter++
  return `t-${Date.now()}-${counter}`
}

export function showToast(opts: {
  title: string
  detail?: string
  tone?: ToastTone
  durationMs?: number
}): string {
  const payload: ToastPayload = {
    id: newId(),
    title: opts.title,
    detail: opts.detail,
    tone: opts.tone ?? 'info',
    durationMs: opts.durationMs ?? 3500,
  }
  bus.emit(payload)
  return payload.id
}

// Show a toast with an Undo affordance. The heavy action runs when the
// countdown expires. If Undo is clicked first, onCancel runs and the
// heavy action never fires.
//
// Returns a controller so callers can also commit or cancel programmatically
// (e.g. commit early if the user takes a definitely-final follow-up action).
export function showUndoableToast(opts: {
  title: string
  detail?: string
  durationMs?: number
  undoLabel?: string
  onCommit: () => void  // fires when the undo window expires
  onCancel?: () => void // fires when the user hits Undo
}): { id: string; commit: () => void; cancel: () => void } {
  const id = newId()
  const state = { committed: false, undone: false }
  const payload: ToastPayload = {
    id,
    title: opts.title,
    detail: opts.detail,
    tone: 'undo',
    durationMs: opts.durationMs ?? 7000,
    undo: {
      label: opts.undoLabel ?? 'Undo',
      onUndo:  () => { if (state.committed || state.undone) return; state.undone = true; opts.onCancel?.() },
      onCommit:() => { if (state.committed || state.undone) return; state.committed = true; opts.onCommit() },
    },
  }
  bus.emit(payload)
  return {
    id,
    commit: () => payload.undo!.onCommit(),
    cancel: () => payload.undo!.onUndo(),
  }
}
