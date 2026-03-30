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
        <title>DXD — Drone Deployment Ops</title>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { height: 100%; }
          body { background: #1C1C1E; color: #E8ECF4; font-family: 'IBM Plex Mono', monospace; }
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); }
          ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
          input, textarea, select { font-family: 'IBM Plex Mono', monospace; }
          input[type="number"]::-webkit-inner-spin-button,
          input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
          input[type="number"] { -moz-appearance: textfield; }
          select {
            background: #1e1e22 !important; color: #E8ECF4 !important;
            border: 1px solid rgba(255,255,255,0.08); border-radius: 5px;
            appearance: none; -webkit-appearance: none;
            padding: 8px 28px 8px 10px;
            font-family: 'IBM Plex Mono', monospace; font-size: 12px; outline: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' stroke='rgba(255,255,255,0.35)' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") !important;
            background-repeat: no-repeat !important;
            background-position: right 8px center !important;
          }
          select option { background: #1e1e22; color: #E8ECF4; }
          @keyframes fadeSlideIn {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
          .leaflet-popup-content-wrapper { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
          .leaflet-popup-tip-container { display: none !important; }
          .leaflet-popup-content { margin: 0 !important; }
          .leaflet-container .leaflet-control-zoom a {
            background: rgba(4,10,4,0.92) !important; color: #39FF14 !important;
            border-color: rgba(57,255,20,0.3) !important; font-family: 'Courier New', monospace !important;
          }
          .leaflet-container .leaflet-control-zoom a:hover { background: rgba(57,255,20,0.15) !important; }
          .leaflet-container .leaflet-control-attribution {
            background: rgba(4,8,4,0.7) !important; color: rgba(57,255,20,0.3) !important; font-size: 9px !important;
          }
        `}</style>
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <div style={{
            minHeight: '100vh',
            background: '#1C1C1E',
            backgroundImage: 'url(/images/bg.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed',
            position: 'relative',
          }}>
            <div style={{
              position: 'fixed', inset: 0, pointerEvents: 'none',
              background: 'rgba(10,10,12,0.82)',
              zIndex: 0,
            }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              {children}
            </div>
          </div>
        </QueryClientProvider>
      </body>
    </html>
  )
}
