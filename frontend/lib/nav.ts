'use client'

// Tiny nav event bus. Any component can call requestOpenDeal(id) and the
// top-level page listens for the event and opens the panel. This is how
// deep components (mention chips, activity rows inside a widget) trigger
// navigation without having to thread the openDeal callback down.

const DEAL_EVENT = 'dxd-open-deal'

export function requestOpenDeal(id: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(DEAL_EVENT, { detail: { id } }))
}

export function onOpenDealRequest(handler: (id: string) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const wrapped = (e: Event) => {
    const detail = (e as CustomEvent<{ id: string }>).detail
    if (detail?.id) handler(detail.id)
  }
  window.addEventListener(DEAL_EVENT, wrapped)
  return () => window.removeEventListener(DEAL_EVENT, wrapped)
}
