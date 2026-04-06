'use client'

import React, { useState } from 'react'
import type { ProjectFull } from '@/lib/types'

// ─── PRICING CATALOG ──────────────────────────────────────────────────────
const PRICING_CATALOG = [
  { name: 'DJI Matrice 4D with RC Plus 2', cost: 6798.80, category: 'DJI Dock 3' },
  { name: 'DJI Matrice 4TD with RC Plus 2', cost: 8469.75, category: 'DJI Dock 3' },
  { name: 'DJI Dock 3', cost: 11684.00, category: 'DJI Dock 3' },
  { name: 'DJI Matrice 4D', cost: 4834.60, category: 'DJI Dock 3' },
  { name: 'DJI Matrice 4TD', cost: 6847.10, category: 'DJI Dock 3' },
  { name: 'DJI Matrice 4D Series Battery', cost: 346.92, category: 'DJI Dock 3' },
  { name: 'DJI Matrice 4D Series 240W Charging Hub', cost: 127.60, category: 'DJI Dock 3' },
  { name: 'DJI 240W Power Adapter', cost: 179.80, category: 'DJI Dock 3' },
  { name: 'RC Plus 2 Enterprise', cost: 1687.50, category: 'DJI Dock 3' },
  { name: 'DJI Matrice 4D Series Low-Noise Anti-Ice Propellers', cost: 48.00, category: 'DJI Dock 3' },
  { name: 'AL1 Spotlight', cost: 300.00, category: 'DJI Dock 3' },
  { name: 'AS1 Speaker', cost: 242.68, category: 'DJI Dock 3' },
  { name: 'D-RTK 3 Relay Fixed Deployment Version', cost: 2435.70, category: 'DJI Dock 3' },
  { name: 'DJI Manifold 3', cost: 1740.00, category: 'DJI Dock 3' },
  { name: 'DJI Matrice 4D Obstacle Sensing Module', cost: 1955.00, category: 'DJI Dock 3' },
  { name: 'AVSS Parachute', cost: 2352.00, category: 'DJI Dock 3' },
  { name: 'DroneTag Scout', cost: 5473.08, category: 'DAA' },
  { name: 'DroneTag Scout License 1YR', cost: 920.00, category: 'DAA' },
  { name: 'DroneTag Scout License 1YR Additional Sensor', cost: 331.20, category: 'DAA' },
  { name: 'Uavionix / Casia G 1YR', cost: 20000.00, category: 'DAA' },
  { name: 'Sunflower Package per BeeHive (12-Month Lease)', cost: 41340.00, category: 'Sunflower (12-Month)' },
  { name: 'Sunflower Package per BeeHive (36-Month Lease)', cost: 110682.00, category: 'Sunflower (36-Month)' },
  { name: 'Axis Outdoor Camera for Dock', cost: 799.00, category: 'Accessories' },
  { name: 'Starlink Enterprise Kit', cost: 400.00, category: 'Accessories' },
  { name: 'Starlink Enterprise 1TB Monthly', cost: 290.00, category: 'Accessories' },
  { name: 'DroneSense License Fee (Annual)', cost: 8000.00, category: 'Installation & Services', manualPrice: true },
  { name: 'DJI Installation', cost: 8000.00, category: 'Installation & Services', manualPrice: true },
  { name: 'Sunflower Installation', cost: 4500.00, category: 'Installation & Services', manualPrice: true },
  { name: 'Casia G Installation', cost: 5000.00, category: 'Installation & Services', manualPrice: true },
  { name: 'DroneTag Installation', cost: 1500.00, category: 'Installation & Services', manualPrice: true },
  { name: 'Skydio Installation', cost: 0, category: 'Installation & Services', manualPrice: true },
] as Array<{ name: string; cost: number; category: string; manualPrice?: boolean }>

interface Props {
  project: ProjectFull
}

function generateQuotePDF(opts: {
  project: ProjectFull; quantities: number[]; margin: number
  customItems: Array<{ id: number; name: string; cost: number; qty: number }>
  manualPrices: Record<number, string>; paymentMode: string
  contactName: string; contactPhone: string; contactEmail: string
}) {
  const { project, quantities, margin, customItems, manualPrices, paymentMode, contactName, contactPhone, contactEmail } = opts
  const win = window.open('', '_blank')
  if (!win) { alert('Pop-up blocked — please allow pop-ups and try again.'); return }
  const mult = 1 + margin / 100
  const payMonths = paymentMode === 'monthly12' ? 12 : paymentMode === 'monthly24' ? 24 : paymentMode === 'monthly36' ? 36 : null
  const dispPrice = (base: number) => payMonths ? Math.round(base / payMonths * 100) / 100 : base
  const fmtUSD = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const today = new Date()
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const exp = new Date(today); exp.setDate(exp.getDate() + 30)
  const quoteNum = `DXD-${today.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`

  const cats: Record<string, Array<typeof PRICING_CATALOG[0] & { qty: number; _idx: number }>> = {}
  PRICING_CATALOG.forEach((item, idx) => {
    const qty = quantities[idx] || 0
    if (!qty) return
    if (!cats[item.category]) cats[item.category] = []
    cats[item.category].push({ ...item, qty, _idx: idx })
  })

  let grandTotal = 0; let hasTBD = false; let itemsHTML = ''
  Object.entries(cats).forEach(([cat, items]) => {
    itemsHTML += `<tr class="cat-row"><td colspan="4" class="cat-label">${cat}</td></tr>`
    items.forEach(item => {
      const baseCp = item.manualPrice ? (parseFloat(manualPrices[item._idx] || '0') || null) : (item.cost ? Math.round(item.cost * mult * 100) / 100 : null)
      const unitPrice = baseCp !== null ? dispPrice(baseCp) : null
      const lineTotal = unitPrice ? unitPrice * item.qty : null
      if (lineTotal) grandTotal += lineTotal; else hasTBD = true
      itemsHTML += `<tr class="line-item"><td class="item-description">${item.name}</td><td class="item-qty">${item.qty}</td><td class="item-rate">${unitPrice ? '$' + fmtUSD(unitPrice) : "<span class='tbd'>TBD</span>"}</td><td class="item-amount">${lineTotal ? '$' + fmtUSD(lineTotal) : "<span class='tbd'>TBD</span>"}</td></tr>`
    })
  })
  const activeCustom = customItems.filter(i => i.qty > 0)
  if (activeCustom.length > 0) {
    itemsHTML += `<tr class="cat-row"><td colspan="4" class="cat-label">Custom Items</td></tr>`
    activeCustom.forEach(item => {
      const cp = dispPrice(Math.round(item.cost * mult * 100) / 100)
      const lt = cp * item.qty; grandTotal += lt
      itemsHTML += `<tr class="line-item"><td class="item-description">${item.name}</td><td class="item-qty">${item.qty}</td><td class="item-rate">$${fmtUSD(cp)}</td><td class="item-amount">$${fmtUSD(lt)}</td></tr>`
    })
  }

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Deus X Defense - ${quoteNum}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  html,body{font-family:'Courier New',monospace;background:#0a0a0a;padding:0;margin:0}
  .print-btn{display:block;margin:0 auto 30px;padding:12px 24px;background:#c41e3a;color:#fff;border:none;font-family:'Courier New',monospace;font-size:12px;font-weight:700;letter-spacing:2px;cursor:pointer;text-transform:uppercase}
  .container{max-width:900px;margin:0 auto;border-left:6px solid #c41e3a;box-shadow:0 8px 40px rgba(0,0,0,.8)}
  .print-wrap{padding:40px 20px}
  .header{background:linear-gradient(135deg,rgba(42,42,42,0.98),rgba(20,20,20,0.98));padding:40px;border-bottom:3px solid #c41e3a}
  .logo-title{font-size:28px;font-weight:700;color:#c41e3a;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px}
  .quote-badge{display:inline-block;background:#c41e3a;color:#fff;padding:8px 16px;font-size:11px;font-weight:700;letter-spacing:2px;margin-top:12px;text-transform:uppercase}
  .content{padding:40px;color:#ddd}
  .details-grid{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-bottom:40px;padding-bottom:30px;border-bottom:2px solid #333}
  .detail-label{font-size:10px;color:#c41e3a;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px}
  .detail-value{font-size:14px;color:#fff;line-height:1.5}
  .items-table{width:100%;border-collapse:collapse;margin-bottom:0}
  .items-table th{font-size:10px;color:#c41e3a;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:10px 8px;border-bottom:1px solid #444;text-align:left}
  .items-table th:not(:first-child){text-align:right}
  .cat-row td{background:#222;color:#888;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;padding:8px 10px;border-top:1px solid #333;font-weight:700}
  .line-item td{padding:12px 8px;border-bottom:1px solid #2a2a2a;font-size:13px}
  .item-description{color:#ddd}.item-qty,.item-rate{text-align:right;color:#aaa}.item-amount{text-align:right;color:#c41e3a;font-weight:700}
  .tbd{color:#c41e3a;font-style:italic}
  .grand-total{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:20px;padding:20px;background:#2a2a2a;border-left:4px solid #c41e3a;margin-top:20px;align-items:center}
  .grand-total-label{grid-column:1;text-align:right;font-size:13px;font-weight:700;color:#c41e3a;text-transform:uppercase}
  .grand-total-amount{text-align:right;font-size:22px;font-weight:700;color:#c41e3a}
  .tbd-note{font-size:10px;color:#c41e3a;font-style:italic;text-align:right;margin-top:4px}
  .terms-section{margin-top:40px;padding:20px;background:#2a2a2a;border-left:4px solid #c41e3a}
  .terms-label{font-size:10px;color:#c41e3a;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px}
  .terms-text{font-size:11px;color:#aaa;line-height:1.6}
  .footer{background:#0f0f0f;padding:20px 40px;border-top:1px solid #333;font-size:10px;color:#666;display:flex;justify-content:space-between;letter-spacing:1px}
  @page{margin:0}@media print{.print-btn{display:none!important}.container{box-shadow:none;max-width:100%}}</style></head>
  <body><div class="print-wrap"><button class="print-btn" onclick="window.print()">&#11123; Save as PDF / Print</button>
  <div class="container">
  <div class="header"><div class="logo-title">DEUS X DEFENSE</div><div class="quote-badge">&#9679; QUOTE</div></div>
  <div class="content">
  <div class="details-grid">
  <div><div class="detail-label">Project Name</div><div class="detail-value">${project?.name || '—'}</div></div>
  <div><div class="detail-label">Quote Number</div><div class="detail-value">${quoteNum}</div></div>
  <div><div class="detail-label">Client Name</div><div class="detail-value">${project?.client || '—'}</div></div>
  <div><div class="detail-label">Date Issued</div><div class="detail-value">${fmt(today)}</div></div>
  <div><div class="detail-label">Valid Through</div><div class="detail-value">${fmt(exp)}</div></div>
  <div><div class="detail-label">Point of Contact</div><div class="detail-value" style="font-size:12px">${[contactName, contactPhone, contactEmail].filter(Boolean).join('<br>') || '—'}</div></div>
  ${project?.site ? `<div style="grid-column:1/-1"><div class="detail-label">Site Address</div><div class="detail-value">${project.site}</div></div>` : ''}
  </div>
  <div style="margin-bottom:40px">
  <table class="items-table"><thead><tr><th>Item Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead>
  <tbody>${itemsHTML}</tbody></table>
  <div class="grand-total">
  <div class="grand-total-label">${payMonths ? `Monthly Payment (${payMonths}-Month Term)` : 'Total Quote Value'}</div>
  <div></div><div></div>
  <div><div class="grand-total-amount">$${fmtUSD(grandTotal)}${payMonths ? ' / mo' : ''}</div>${hasTBD ? '<div class="tbd-note">+ TBD items not included</div>' : ''}</div>
  </div></div>
  <div class="terms-section"><div class="terms-label">Quote Terms</div><div class="terms-text">This quote is valid for 30 days from the date of issue (expires ${fmt(exp)}). Pricing is subject to change based on site-specific requirements. All installations subject to FAA approval and local regulatory compliance. Prices quoted are pre-tax.</div></div>
  </div>
  <div class="footer"><span>DEUS X DEFENSE | Autonomous Drone Security &amp; Defense Systems</span><span>${quoteNum} | Confidential</span></div>
  </div></div></body></html>`

  win.document.open(); win.document.write(html); win.document.close()
}

export default function PricingView({ project }: Props) {
  const [quantities, setQuantities] = useState<number[]>(() => PRICING_CATALOG.map(() => 0))
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [generating, setGenerating] = useState(false)
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({})
  const [margin, setMargin] = useState(30)
  const [customItems, setCustomItems] = useState<Array<{ id: number; name: string; cost: number; qty: number }>>([])
  const [newName, setNewName] = useState('')
  const [newCost, setNewCost] = useState('')
  const [manualPrices, setManualPrices] = useState<Record<number, string>>({})
  const [paymentMode, setPaymentMode] = useState('upfront')

  const mult = 1 + margin / 100
  const custPrice = (cost: number) => Math.round(cost * mult * 100) / 100
  const payMonths = paymentMode === 'monthly12' ? 12 : paymentMode === 'monthly24' ? 24 : paymentMode === 'monthly36' ? 36 : null
  const displayPrice = (base: number) => payMonths ? Math.round(base / payMonths * 100) / 100 : base

  const setQty = (idx: number, val: string | number) => {
    const v = Math.max(0, parseInt(String(val)) || 0)
    setQuantities(prev => { const n = [...prev]; n[idx] = v; return n })
  }
  const addCustomItem = () => {
    const name = newName.trim(); const cost = parseFloat(newCost)
    if (!name || isNaN(cost) || cost < 0) return
    setCustomItems(prev => [...prev, { id: Date.now(), name, cost, qty: 1 }])
    setNewName(''); setNewCost('')
  }
  const removeCustomItem = (id: number) => setCustomItems(prev => prev.filter(i => i.id !== id))
  const setCustomQty = (id: number, val: string | number) => {
    const v = Math.max(0, parseInt(String(val)) || 0)
    setCustomItems(prev => prev.map(i => i.id === id ? { ...i, qty: v } : i))
  }
  const clearAll = () => { setQuantities(PRICING_CATALOG.map(() => 0)); setCustomItems([]); setManualPrices({}) }
  const toggleCat = (cat: string) => setCollapsedCats(prev => ({ ...prev, [cat]: !prev[cat] }))

  const categories: Record<string, Array<typeof PRICING_CATALOG[0] & { idx: number }>> = {}
  PRICING_CATALOG.forEach((item, idx) => {
    if (!categories[item.category]) categories[item.category] = []
    categories[item.category].push({ ...item, idx })
  })

  const catalogTotal = PRICING_CATALOG.reduce((sum, item, idx) => {
    const qty = quantities[idx] || 0
    const cpBase = item.manualPrice ? (parseFloat(manualPrices[idx] || '0') || 0) : custPrice(item.cost)
    return sum + displayPrice(cpBase) * qty
  }, 0)
  const customTotal = customItems.reduce((sum, i) => sum + displayPrice(custPrice(i.cost)) * i.qty, 0)
  const grandTotal = catalogTotal + customTotal
  const totalItems = quantities.reduce((s, q) => s + q, 0) + customItems.reduce((s, i) => s + i.qty, 0)
  const hasTBD = PRICING_CATALOG.some((item, idx) => quantities[idx] > 0 && !item.cost)
  const fmt2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const fieldSt: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 5, color: '#E8ECF4', fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 12, padding: '8px 12px', outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  const handleGeneratePDF = () => {
    setGenerating(true)
    try {
      generateQuotePDF({ project, quantities, margin, customItems, manualPrices, paymentMode, contactName, contactPhone, contactEmail })
    } finally {
      setTimeout(() => setGenerating(false), 500)
    }
  }

  return (
    <div style={{ paddingTop: 8 }}>
      {/* Contact info + generate button */}
      <div style={{ background: 'rgba(229,57,53,0.05)', border: '1px solid rgba(229,57,53,0.18)', borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "'Chakra Petch',sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: 1, color: '#fff', marginBottom: 2 }}>Quote Output</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Contact info prints on the PDF · project name and site auto-populated</div>
          </div>
          <button
            onClick={handleGeneratePDF}
            disabled={generating || totalItems === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: totalItems === 0 ? 'rgba(229,57,53,0.2)' : 'linear-gradient(135deg,#E53935,#C62828)', color: '#fff', border: 'none', borderRadius: 7, padding: '11px 22px', fontFamily: "'Chakra Petch',sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, cursor: totalItems === 0 ? 'not-allowed' : 'pointer', opacity: totalItems === 0 ? 0.5 : 1, whiteSpace: 'nowrap' }}
          >
            {generating ? 'BUILDING...' : 'DOWNLOAD QUOTE PDF'}
          </button>
        </div>
        {/* Payment mode */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[['upfront', 'All Upfront'], ['monthly12', '12-Month / Mo'], ['monthly24', '24-Month / Mo'], ['monthly36', '36-Month / Mo']].map(([val, label]) => (
            <button key={val} onClick={() => setPaymentMode(val)}
              style={{ flex: 1, padding: '9px 0', fontFamily: "'Chakra Petch',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1, border: '1px solid', borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s', borderColor: paymentMode === val ? '#E53935' : 'rgba(255,255,255,0.12)', background: paymentMode === val ? 'rgba(229,57,53,0.18)' : 'rgba(255,255,255,0.04)', color: paymentMode === val ? '#E53935' : 'rgba(255,255,255,0.45)' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 140px', gap: 14 }}>
          <div>
            <label style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase' as const, display: 'block', marginBottom: 6 }}>Contact Name</label>
            <input style={fieldSt} placeholder="e.g. John Smith" value={contactName} onChange={e => setContactName(e.target.value)} />
          </div>
          <div>
            <label style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase' as const, display: 'block', marginBottom: 6 }}>Phone</label>
            <input style={fieldSt} placeholder="e.g. (214) 555-0100" value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
          </div>
          <div>
            <label style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase' as const, display: 'block', marginBottom: 6 }}>Email</label>
            <input style={fieldSt} placeholder="e.g. john@company.com" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
          </div>
          <div>
            <label style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase' as const, display: 'block', marginBottom: 6 }}>Margin %</label>
            <div style={{ position: 'relative' }}>
              <input style={{ ...fieldSt, paddingRight: 28 }} type="number" min="0" max="200" step="1" value={margin} onChange={e => setMargin(Math.max(0, parseFloat(e.target.value) || 0))} />
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }}>%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Header + total */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, fontFamily: "'Chakra Petch',sans-serif" }}>Deployment Quote Builder</h2>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'IBM Plex Mono',monospace" }}>Set quantities to calculate total deployment cost</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: 1, marginBottom: 2 }}>
            {payMonths ? `PER MONTH (${payMonths} MO)` : 'CUSTOMER TOTAL'}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#E53935', fontFamily: "'IBM Plex Mono',monospace" }}>
            ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono',monospace" }}>
            {totalItems} item{totalItems !== 1 ? 's' : ''} · {margin}% margin
            {hasTBD && <span style={{ color: '#f59e0b', marginLeft: 6 }}>* Some items TBD</span>}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={clearAll} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, color: 'rgba(255,255,255,0.4)', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, padding: '5px 12px', cursor: 'pointer' }}>
          Clear All
        </button>
      </div>

      {/* Catalog */}
      {Object.entries(categories).map(([cat, items]) => {
        const catTotal = items.reduce((sum, item) => {
          const cpBase = item.manualPrice ? (parseFloat(manualPrices[item.idx] || '0') || 0) : custPrice(item.cost)
          return sum + displayPrice(cpBase) * (quantities[item.idx] || 0)
        }, 0)
        const isCollapsed = !!collapsedCats[cat]
        const selectedInCat = items.filter(item => (quantities[item.idx] || 0) > 0).length
        return (
          <div key={cat} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
            <div onClick={() => toggleCat(cat)} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', borderBottom: isCollapsed ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', color: 'rgba(255,255,255,0.4)', marginRight: 8 }}>
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontFamily: "'Chakra Petch',sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#E8ECF4' }}>{cat}</span>
              {selectedInCat > 0 && (
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: '#C41E3A', background: 'rgba(196,30,58,0.15)', border: '1px solid rgba(196,30,58,0.3)', borderRadius: 10, padding: '1px 8px', marginLeft: 8 }}>
                  {selectedInCat} selected
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, color: catTotal > 0 ? '#E8ECF4' : 'rgba(255,255,255,0.25)' }}>
                {catTotal > 0 ? `$${catTotal.toLocaleString()}` : ''}
              </span>
            </div>
            {!isCollapsed && items.map(item => {
              const qty = quantities[item.idx] || 0
              const cpBase = item.manualPrice ? (parseFloat(manualPrices[item.idx] || '0') || 0) : custPrice(item.cost)
              const cp = displayPrice(cpBase)
              const lineTotal = cp * qty
              return (
                <div key={item.idx} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 10 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: qty > 0 ? '#e63946' : 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: qty > 0 ? '#E8ECF4' : 'rgba(255,255,255,0.55)' }}>{item.name}</span>
                  <div style={{ flex: '0 0 auto', height: 1, background: 'rgba(255,255,255,0.05)', width: 20 }} />
                  {!item.manualPrice && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 90 }}>
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 1 }}>Our Cost</span>
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>${fmt2(item.cost)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 110, marginLeft: 14 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 1 }}>Customer</span>
                    {item.manualPrice ? (
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }}>$</span>
                        <input type="number" min="0" step="0.01" placeholder="0.00" value={manualPrices[item.idx] ?? ''} onChange={e => setManualPrices(p => ({ ...p, [item.idx]: e.target.value }))}
                          style={{ background: 'rgba(229,57,53,0.08)', border: '1px solid rgba(229,57,53,0.3)', borderRadius: 4, color: '#E53935', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, padding: '3px 6px 3px 18px', width: 100, outline: 'none', boxSizing: 'border-box' as const }} />
                      </div>
                    ) : (
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, color: '#e63946' }}>${fmt2(cp)}</span>
                    )}
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: '0 4px' }}>×</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={() => setQty(item.idx, qty - 1)} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <input type="number" min="0" value={qty} onChange={e => setQty(item.idx, e.target.value)}
                      style={{ width: 40, textAlign: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: qty > 0 ? '#E8ECF4' : 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, padding: '3px 4px', outline: 'none' }} />
                    <button onClick={() => setQty(item.idx, qty + 1)} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, color: qty > 0 && cp > 0 ? '#E8ECF4' : 'rgba(255,255,255,0.2)', minWidth: 90, textAlign: 'right' }}>
                    {qty > 0 && cp > 0 ? `$${fmt2(lineTotal)}` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Custom Items */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ fontFamily: "'Chakra Petch',sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#E8ECF4' }}>Custom Items</span>
          {customItems.length > 0 && (
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: '#C41E3A', background: 'rgba(196,30,58,0.15)', border: '1px solid rgba(196,30,58,0.3)', borderRadius: 10, padding: '1px 8px', marginLeft: 8 }}>{customItems.length} added</span>
          )}
          {customTotal > 0 && <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, color: '#E8ECF4' }}>${customTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
        </div>
        {customItems.map(item => {
          const cp = displayPrice(custPrice(item.cost)); const lt = cp * item.qty
          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 10 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#e63946', flexShrink: 0 }} />
              <span style={{ flex: 1, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: '#E8ECF4' }}>{item.name}</span>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, color: '#e63946' }}>${fmt2(cp)}</span>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: '0 4px' }}>×</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => setCustomQty(item.id, item.qty - 1)} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <input type="number" min="0" value={item.qty} onChange={e => setCustomQty(item.id, e.target.value)} style={{ width: 40, textAlign: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#E8ECF4', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, padding: '3px 4px', outline: 'none' }} />
                <button onClick={() => setCustomQty(item.id, item.qty + 1)} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, color: '#E8ECF4', minWidth: 90, textAlign: 'right' }}>{item.qty > 0 ? `$${fmt2(lt)}` : '—'}</span>
              <button onClick={() => removeCustomItem(item.id)} style={{ background: 'none', border: 'none', color: 'rgba(229,57,53,0.6)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 0 0 10px', flexShrink: 0 }}>×</button>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <input style={{ ...fieldSt, flex: 3, fontSize: 12 }} placeholder="Item name…" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomItem()} />
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>$</span>
            <input style={{ ...fieldSt, paddingLeft: 22, fontSize: 12 }} placeholder="Our cost" type="number" min="0" step="0.01" value={newCost} onChange={e => setNewCost(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomItem()} />
          </div>
          <button onClick={addCustomItem} disabled={!newName.trim() || isNaN(parseFloat(newCost))}
            style={{ background: (!newName.trim() || isNaN(parseFloat(newCost))) ? 'rgba(229,57,53,0.2)' : 'linear-gradient(135deg,#E53935,#C62828)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontFamily: "'Chakra Petch',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1, cursor: (!newName.trim() || isNaN(parseFloat(newCost))) ? 'not-allowed' : 'pointer', opacity: (!newName.trim() || isNaN(parseFloat(newCost))) ? 0.5 : 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
            + ADD ITEM
          </button>
        </div>
      </div>
    </div>
  )
}
