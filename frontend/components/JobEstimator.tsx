'use client'

export default function JobEstimator() {
  return (
    <iframe
      src="/job-estimator.html"
      style={{ width: '100%', height: 'calc(var(--dxd-vh, 100vh) - 56px)', border: 'none', display: 'block' }}
      title="DXD Job Estimator"
    />
  )
}
