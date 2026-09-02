'use client'

export default function CostEstimator() {
  return (
    <iframe
      src="/cost-estimator.html"
      style={{ width: '100%', height: 'calc(var(--dxd-vh, 100vh) - 56px)', border: 'none', display: 'block' }}
      title="Cost Estimator"
    />
  )
}
