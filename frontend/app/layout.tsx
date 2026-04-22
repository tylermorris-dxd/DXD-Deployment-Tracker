'use client'

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
    mutations: { retry: 0 },
  },
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>DXD — Ops Tracker</title>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap"
        />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { height: 100%; }
          body {
            background: #0a0b0d; color: #e8eaf0; font-family: 'JetBrains Mono', monospace;
            background-image: url('/images/dxd-bg.jpg');
            background-size: cover; background-position: center top;
            background-attachment: fixed; background-repeat: no-repeat;
          }
          body::before {
            content: '';
            position: fixed; inset: 0; z-index: 0; pointer-events: none;
            background: linear-gradient(135deg, rgba(10,11,13,0.88) 0%, rgba(10,11,13,0.72) 50%, rgba(10,11,13,0.85) 100%);
          }
          body::after {
            content: '';
            position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: 0.03;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          }
          ::-webkit-scrollbar { width: 5px; height: 5px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #252b38; border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: #363d4f; }
          input, textarea { font-family: 'JetBrains Mono', monospace; }
          input[type="number"]::-webkit-inner-spin-button,
          input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
          input[type="number"] { -moz-appearance: textfield; }
          select {
            background: #111318 !important; color: #e8eaf0 !important;
            border: 1px solid #252b38; border-radius: 5px;
            appearance: none; -webkit-appearance: none;
            padding: 8px 28px 8px 10px;
            font-family: 'JetBrains Mono', monospace; font-size: 12px; outline: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' stroke='rgba(255,255,255,0.35)' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") !important;
            background-repeat: no-repeat !important;
            background-position: right 8px center !important;
          }
          select option { background: #111318; color: #e8eaf0; }
          @keyframes fadeSlideIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
          @keyframes slideInRight { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
          @keyframes spin  { from { transform:rotate(0deg); }   to { transform:rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity:0.4; } 50% { opacity:1; } }
          .leaflet-popup-content-wrapper { background:transparent!important; border:none!important; box-shadow:none!important; padding:0!important; }
          .leaflet-popup-tip-container { display:none!important; }
          .leaflet-popup-content { margin:0!important; }
          .leaflet-container .leaflet-control-zoom a {
            background:rgba(4,10,4,0.92)!important; color:#39FF14!important;
            border-color:rgba(57,255,20,0.3)!important; font-family:'Courier New',monospace!important;
          }
          .leaflet-container .leaflet-control-zoom a:hover { background:rgba(57,255,20,0.15)!important; }
          .leaflet-container .leaflet-control-attribution {
            background:rgba(4,8,4,0.7)!important; color:rgba(57,255,20,0.3)!important; font-size:9px!important;
          }
        `}</style>
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
            {children}
          </div>
        </QueryClientProvider>
      </body>
    </html>
  )
}
