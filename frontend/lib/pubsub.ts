// Minimalist typed pub/sub. Backing store for toasts + activity + settings.
// Not a state-management library, just enough for globally-observable events
// that a few components subscribe to.

export function makePubSub<T>() {
  const listeners = new Set<(v: T) => void>()
  return {
    subscribe(fn: (v: T) => void): () => void {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    emit(v: T) {
      // Copy the set so a listener that unsubs itself mid-emit doesn't skip peers.
      Array.from(listeners).forEach(fn => { try { fn(v) } catch { /* isolate */ } })
    },
  }
}
