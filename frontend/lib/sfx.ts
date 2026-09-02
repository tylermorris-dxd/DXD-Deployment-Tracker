'use client'

import { getSettings } from './settings'

// Web Audio synthesis for the tactical sound design. No assets — every
// sound is generated on the fly from oscillators + envelopes. Total
// footprint is a few hundred bytes of code.
//
// All calls are silent when the user hasn't enabled sound in settings,
// and gracefully no-op if the Web Audio API is unavailable.

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (ctx) return ctx
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AC: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    return ctx
  } catch { return null }
}

// Ensure the context is running. Browsers block audio until the first
// user gesture — most SFX callers happen after that so this is safe.
function ensureRunning(): AudioContext | null {
  const c = getCtx()
  if (!c) return null
  if (c.state === 'suspended') c.resume().catch(() => { /* ignore */ })
  return c
}

interface ToneOpts {
  freq: number
  duration: number
  type?: OscillatorType
  volume?: number
  attack?: number     // seconds
  release?: number    // seconds
  freqEnd?: number    // exponential glide from freq → freqEnd
}
function tone(o: ToneOpts) {
  const c = ensureRunning(); if (!c) return
  const now = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.freq, now)
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, now + o.duration)
  const vol = o.volume ?? 0.15
  const atk = o.attack ?? 0.005
  const rel = o.release ?? 0.08
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(vol, now + atk)
  gain.gain.setValueAtTime(vol, now + o.duration - rel)
  gain.gain.linearRampToValueAtTime(0, now + o.duration)
  osc.connect(gain).connect(c.destination)
  osc.start(now)
  osc.stop(now + o.duration + 0.02)
}

// A short noise burst — used for the "acquire" chirp on Cmd+K open.
function noise(duration: number, volume = 0.06) {
  const c = ensureRunning(); if (!c) return
  const now = c.currentTime
  const bufferSize = Math.max(1, Math.floor(c.sampleRate * duration))
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
  const src = c.createBufferSource()
  src.buffer = buffer
  const gain = c.createGain()
  gain.gain.setValueAtTime(volume, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  const filter = c.createBiquadFilter()
  filter.type = 'highpass'; filter.frequency.setValueAtTime(1200, now)
  src.connect(filter).connect(gain).connect(c.destination)
  src.start(now)
  src.stop(now + duration + 0.02)
}

function enabled() { return getSettings().sound }

// ── Public SFX vocabulary ────────────────────────────────────────────────
//   click     — subtle tick, used for palette open / small selections
//   ping      — sonar-style outbound ping (fleet marker appears, action commit)
//   whoosh    — quick sweep, used for tab or view changes
//   ack       — small success chirp (mutation succeeded, deal saved)
//   err       — flat descending tone (error / no-op)

export const sfx = {
  click() {
    if (!enabled()) return
    tone({ freq: 950, duration: 0.06, type: 'triangle', volume: 0.06, attack: 0.001, release: 0.04 })
  },
  ping() {
    if (!enabled()) return
    tone({ freq: 620, freqEnd: 940, duration: 0.28, type: 'sine', volume: 0.11, attack: 0.005, release: 0.18 })
    setTimeout(() => tone({ freq: 1100, duration: 0.12, type: 'sine', volume: 0.05, attack: 0.002, release: 0.10 }), 90)
  },
  whoosh() {
    if (!enabled()) return
    noise(0.14, 0.05)
  },
  ack() {
    if (!enabled()) return
    tone({ freq: 660, duration: 0.08, type: 'sine', volume: 0.10 })
    setTimeout(() => tone({ freq: 990, duration: 0.10, type: 'sine', volume: 0.09 }), 55)
  },
  err() {
    if (!enabled()) return
    tone({ freq: 300, freqEnd: 180, duration: 0.22, type: 'sawtooth', volume: 0.08, release: 0.12 })
  },
}
