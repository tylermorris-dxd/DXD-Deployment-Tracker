'use client'

interface Props {
  site?: string
  name?: string
}

export default function OpsPlanner({ site, name }: Props) {
  const params = new URLSearchParams()
  if (site) params.set('address', site)
  if (name) params.set('title', name)
  const src = `/ops-planner.html${params.toString() ? '?' + params.toString() : ''}`

  return (
    <iframe
      src={src}
      style={{ width: '100%', height: 'calc(100vh - 56px)', border: 'none', display: 'block' }}
      title="Ops Planner"
    />
  )
}
