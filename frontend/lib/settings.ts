'use client'

import { useEffect, useState } from 'react'
import { makePubSub } from './pubsub'

// User settings that live only in the browser (localStorage). Every
// value here has a safe default so the app boots the same on a fresh
// browser.

export interface UISettings {
  sound: boolean          // opt-in sonar-style sound effects
  crosshair: boolean      // custom crosshair cursor over the Fleet Map
  physics: boolean        // small spring animations on interactive elements
}

const DEFAULTS: UISettings = {
  sound: false,
  crosshair: true,
  physics: true,
}

const STORAGE_KEY = 'dxd-ui-settings-v1'
const bus = makePubSub<UISettings>()

function load(): UISettings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch { return DEFAULTS }
}
function save(s: UISettings) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* quota */ }
}

let current: UISettings | null = null
export function getSettings(): UISettings {
  if (!current) current = load()
  return current
}
export function updateSettings(patch: Partial<UISettings>): UISettings {
  current = { ...(current ?? load()), ...patch }
  save(current)
  bus.emit(current)
  return current
}

export function useSettings(): UISettings {
  const [s, setS] = useState<UISettings>(() => (current ?? load()))
  useEffect(() => {
    current = load()
    setS(current)
    return bus.subscribe(setS)
  }, [])
  return s
}
