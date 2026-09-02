'use client'

import React from 'react'

// Deterministic generative avatar. Given a person's name and (optionally)
// email, produces a consistent-looking chip that reads better than a plain
// initials circle:
//   • A radial gradient background whose two hues are derived from a name
//     hash — same name → same colors every time.
//   • Angled scanlines over the top for the tactical aesthetic.
//   • Initials in the middle in the display typeface.
//
// Purely SVG so it scales cleanly, has no runtime deps, and works when a
// customer can't provide a photo (which is 99% of the time in ops).

interface Props {
  name: string
  email?: string
  size?: number       // px
  ring?: string       // optional accent ring color
}

function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Avatar({ name, email, size = 44, ring }: Props) {
  const seed = hash((name || '') + '|' + (email || ''))
  const h1 = seed % 360
  const h2 = (h1 + 40 + (seed % 60)) % 360
  const initials = initialsOf(name)

  const id = `av-${seed}`
  const bg1 = `hsl(${h1}, 60%, 42%)`
  const bg2 = `hsl(${h2}, 60%, 26%)`

  return (
    <svg
      width={size} height={size} viewBox="0 0 48 48" aria-label={`Avatar for ${name}`}
      style={{ borderRadius: '50%', display: 'block', flexShrink: 0, background: '#0a0b0d' }}
    >
      <defs>
        <radialGradient id={`${id}-grad`} cx="30%" cy="25%" r="90%">
          <stop offset="0%"  stopColor={bg1} />
          <stop offset="100%" stopColor={bg2} />
        </radialGradient>
        <pattern id={`${id}-lines`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        </pattern>
        <clipPath id={`${id}-clip`}><circle cx="24" cy="24" r="23" /></clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <circle cx="24" cy="24" r="24" fill={`url(#${id}-grad)`} />
        <rect x="0" y="0" width="48" height="48" fill={`url(#${id}-lines)`} />
        <text
          x="24" y="24" textAnchor="middle" dominantBaseline="central"
          fontFamily="'Chakra Petch', sans-serif" fontWeight="700" fontSize="18"
          fill="rgba(255,255,255,0.95)" letterSpacing="0.5"
        >
          {initials}
        </text>
      </g>
      <circle
        cx="24" cy="24" r="23"
        fill="none" stroke={ring || 'rgba(255,255,255,0.14)'} strokeWidth="1.5"
      />
    </svg>
  )
}
