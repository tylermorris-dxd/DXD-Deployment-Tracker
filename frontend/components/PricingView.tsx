'use client'

import React, { useEffect, useRef } from 'react'
import type { ProjectFull } from '@/lib/types'

interface Props {
  project: ProjectFull
  onCacheUpdate?: (data: unknown) => void
}

// The Pricing tab is a thin wrapper around public/solutions-tool.html — a
// self-contained pricing/solutions configurator. The tool exposes a small
// postMessage bridge so the parent React app can hydrate its state from
// project.pricingCache and save state back on every change:
//
//   iframe → parent               parent → iframe
//   ─────────────────────         ─────────────────────
//   solutions:ready               solutions:init { state }
//   solutions:state { state }
//
// Saves are debounced (both inside the iframe at 400 ms, and here at 800 ms)
// so typing/dragging doesn't hammer the API.
export default function PricingView({ project, onCacheUpdate }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    // Parse the cached state once — used to hydrate the tool when it
    // announces solutions:ready. Anything unparseable becomes null so the
    // tool just boots at defaults.
    let cachedState: unknown = null
    try { cachedState = project.pricingCache ? JSON.parse(project.pricingCache) : null } catch { cachedState = null }

    function onMessage(evt: MessageEvent) {
      const msg = evt.data
      if (!msg || typeof msg !== 'object') return
      if (evt.source !== iframe?.contentWindow) return

      if (msg.type === 'solutions:ready') {
        if (cachedState && typeof cachedState === 'object') {
          iframe?.contentWindow?.postMessage({ type: 'solutions:init', payload: cachedState }, '*')
        }
        return
      }

      if (msg.type === 'solutions:state' && onCacheUpdate) {
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => {
          onCacheUpdate(msg.payload)
        }, 800)
      }
    }

    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    }
  }, [project.id, project.pricingCache, onCacheUpdate])

  return (
    <iframe
      ref={iframeRef}
      src="/solutions-tool.html"
      style={{
        width: '100%',
        height: 'calc(100vh - 56px)',
        border: 'none',
        display: 'block',
        background: '#0E0E0F',
      }}
      title="DXD Solutions Tool"
    />
  )
}
