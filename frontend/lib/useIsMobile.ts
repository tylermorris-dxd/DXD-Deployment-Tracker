'use client'

import { useEffect, useState } from 'react'

// One shared breakpoint hook so page.tsx and any component that needs
// mobile-aware layout agree on when to switch. 768px matches Tailwind's
// md breakpoint; things narrower are treated as "mobile" (single column,
// larger tap targets, sticky top-of-screen tab bar, etc.).
const MOBILE_BREAKPOINT = 768

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT)
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])
  return isMobile
}
