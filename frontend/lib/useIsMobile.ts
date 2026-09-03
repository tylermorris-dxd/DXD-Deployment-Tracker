'use client'

import { useEffect, useState } from 'react'

// One shared breakpoint hook so page.tsx and any component that needs
// mobile-aware layout agree on when to switch. 768px matches Tailwind's
// md breakpoint; things narrower are treated as "mobile" (single column,
// larger tap targets, sticky top-of-screen tab bar, etc.).
export const MOBILE_BREAKPOINT = 768
const MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT}px)`

function measure(): boolean {
  if (typeof window === 'undefined') return false
  // matchMedia is more reliable than window.innerWidth on iOS Safari after
  // a background/foreground swap or split-view resize. Fall back to the
  // width comparison on any UA that doesn't implement it.
  if (typeof window.matchMedia === 'function') return window.matchMedia(MEDIA_QUERY).matches
  return window.innerWidth <= MOBILE_BREAKPOINT
}

export function useIsMobile(): boolean {
  // Lazy initializer so the first client render already knows if we're on
  // mobile. Previously the state was seeded false and only updated in an
  // effect, which meant the very first render — the one React uses for
  // hydration — always drew the desktop layout on a phone.
  const [isMobile, setIsMobile] = useState<boolean>(measure)
  useEffect(() => {
    // Re-measure now in case matchMedia matched something different between
    // module init and this effect (SSR / hydration edge case).
    setIsMobile(measure())
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(MEDIA_QUERY)
    const onChange = () => setIsMobile(mq.matches)
    // Modern browsers: addEventListener. Very old Safari: addListener.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyMq = mq as any
    if (typeof anyMq.addEventListener === 'function') anyMq.addEventListener('change', onChange)
    else if (typeof anyMq.addListener === 'function')  anyMq.addListener(onChange)
    // Also listen for orientation changes and window resizes as a safety net.
    window.addEventListener('resize', onChange)
    window.addEventListener('orientationchange', onChange)
    return () => {
      if (typeof anyMq.removeEventListener === 'function') anyMq.removeEventListener('change', onChange)
      else if (typeof anyMq.removeListener === 'function')  anyMq.removeListener(onChange)
      window.removeEventListener('resize', onChange)
      window.removeEventListener('orientationchange', onChange)
    }
  }, [])
  return isMobile
}
