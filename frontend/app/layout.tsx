'use client'

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Raw vanilla-JS diagnostic panel injected into the static HTML so it
// appears even if React never mounts (which is exactly the case we're
// trying to debug on mobile Safari). No React hooks, no imports, no
// dependency on the app bundle succeeding — it runs off a plain
// <script> tag embedded in every page.
const DIAGNOSTIC_BOOTSTRAP = `
(function(){
  try {
    if (window.__dxd_debug_installed__) return;
    window.__dxd_debug_installed__ = true;

    var caughtErrors = [];
    window.addEventListener('error', function(e){
      caughtErrors.push(String(e.message || e) + ' @ ' + (e.filename||'') + ':' + (e.lineno||''));
      renderPanel();
    });
    window.addEventListener('unhandledrejection', function(e){
      var r = e && e.reason;
      caughtErrors.push('Promise rejected: ' + (r && r.message ? r.message : String(r)));
      renderPanel();
    });

    var probeMe = { state: 'idle', val: '' };
    var probeProjects = { state: 'idle', val: '' };

    function runProbes(){
      probeMe.state = 'loading'; probeMe.val = '';
      probeProjects.state = 'loading'; probeProjects.val = '';
      renderPanel();
      fetch('/api/me').then(function(r){ return r.text().then(function(t){ return { ok: r.ok, status: r.status, body: t }; }); })
        .then(function(res){
          probeMe.state = res.ok ? 'ok' : 'err';
          probeMe.val = 'HTTP ' + res.status + ' — ' + (res.body || '').slice(0, 200);
        })
        .catch(function(e){ probeMe.state = 'err'; probeMe.val = 'fetch failed: ' + (e && e.message ? e.message : String(e)); })
        .finally(renderPanel);
      fetch('/api/projects').then(function(r){ return r.text().then(function(t){ return { ok: r.ok, status: r.status, body: t }; }); })
        .then(function(res){
          probeProjects.state = res.ok ? 'ok' : 'err';
          if (res.ok){
            try { var arr = JSON.parse(res.body); probeProjects.val = 'HTTP ' + res.status + ' — ' + arr.length + ' project(s)'; }
            catch (e){ probeProjects.val = 'HTTP ' + res.status + ' — invalid JSON'; }
          } else {
            probeProjects.val = 'HTTP ' + res.status + ' — ' + (res.body || '').slice(0, 200);
          }
        })
        .catch(function(e){ probeProjects.state = 'err'; probeProjects.val = 'fetch failed: ' + (e && e.message ? e.message : String(e)); })
        .finally(renderPanel);
    }

    function chipColor(s){ return s === 'ok' ? '#4ec94e' : s === 'err' ? '#e24b4a' : s === 'loading' ? '#f5c45b' : '#888'; }

    function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function renderPanel(){
      var panel = document.getElementById('__dxd_debug_panel');
      if (!panel) return;
      var open = panel.getAttribute('data-open') === '1';
      if (!open) { panel.style.display = 'none'; return; }
      panel.style.display = 'block';
      var mc = chipColor(probeMe.state), pc = chipColor(probeProjects.state);
      panel.innerHTML =
        '<div style="font-weight:700;margin-bottom:8px;color:#4a9eff">MOBILE DIAGNOSTIC</div>' +
        '<div>Viewport: ' + window.innerWidth + ' × ' + window.innerHeight + '</div>' +
        '<div>Location: ' + esc(window.location.href) + '</div>' +
        '<div style="word-break:break-all;color:#aaa;font-size:10px;margin-top:4px">' + esc(navigator.userAgent) + '</div>' +
        '<div style="margin-top:12px;font-weight:700;color:#4a9eff">API PROBE</div>' +
        '<div>/api/me <span style="padding:2px 6px;border-radius:4px;background:' + mc + '22;color:' + mc + ';font-size:10px;margin-left:4px">' + probeMe.state + '</span></div>' +
        '<div style="word-break:break-all;font-size:10px;color:#ccc">' + esc(probeMe.val) + '</div>' +
        '<div style="margin-top:6px">/api/projects <span style="padding:2px 6px;border-radius:4px;background:' + pc + '22;color:' + pc + ';font-size:10px;margin-left:4px">' + probeProjects.state + '</span></div>' +
        '<div style="word-break:break-all;font-size:10px;color:#ccc">' + esc(probeProjects.val) + '</div>' +
        '<button onclick="window.__dxd_reprobe()" style="margin-top:10px;padding:6px 12px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;font-family:monospace;font-size:11px">RE-PROBE</button>' +
        '<div style="margin-top:12px;font-weight:700;color:#4a9eff">CAUGHT ERRORS (' + caughtErrors.length + ')</div>' +
        (caughtErrors.length === 0
          ? '<div style="color:#4ec94e">None</div>'
          : caughtErrors.map(function(e){ return '<div style="color:#e24b4a;word-break:break-all;padding-top:2px">' + esc(e) + '</div>'; }).join('')) +
        '<div style="margin-top:12px;font-size:10px;color:#666">Screenshot this and send it back. Tap CLOSE (top-right chip) to dismiss.</div>';
    }
    window.__dxd_reprobe = runProbes;

    function install(){
      if (document.getElementById('__dxd_debug_chip')) return;
      var chip = document.createElement('button');
      chip.id = '__dxd_debug_chip';
      chip.textContent = 'DEBUG';
      chip.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:2147483647;background:rgba(192,57,43,0.95);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:20px;padding:8px 16px;font-family:monospace;font-size:12px;font-weight:700;box-shadow:0 3px 12px rgba(0,0,0,0.7);cursor:pointer;-webkit-tap-highlight-color:transparent';
      var panel = document.createElement('div');
      panel.id = '__dxd_debug_panel';
      panel.setAttribute('data-open', '0');
      panel.style.cssText = 'display:none;position:fixed;top:40px;left:8px;right:8px;bottom:60px;z-index:2147483646;background:rgba(10,11,13,0.98);border:1px solid #444;border-radius:8px;padding:12px;color:#e8e8e8;font-family:monospace;font-size:11px;overflow-y:auto;line-height:1.5;-webkit-overflow-scrolling:touch';
      chip.addEventListener('click', function(){
        var isOpen = panel.getAttribute('data-open') === '1';
        panel.setAttribute('data-open', isOpen ? '0' : '1');
        chip.textContent = isOpen ? 'DEBUG' : 'CLOSE';
        renderPanel();
      });
      // Append when body is ready
      if (document.body){
        document.body.appendChild(chip);
        document.body.appendChild(panel);
      } else {
        document.addEventListener('DOMContentLoaded', function(){
          document.body.appendChild(chip);
          document.body.appendChild(panel);
        });
      }
      runProbes();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install);
    } else {
      install();
    }
  } catch (bootErr) {
    // If the diagnostic itself dies, at least try to alert-ish it
    try { document.title = 'DXD debug boot error: ' + (bootErr && bootErr.message || bootErr); } catch(_){}
  }
})();
`;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
    mutations: { retry: 0 },
  },
})

// Top-level error boundary — on mobile Safari we can't attach a devtools
// inspector, so any thrown error would just result in a blank page. This
// makes the failure visible instead of silent.
class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { err: Error | null }
> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('App error boundary caught:', err, info)
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{
          padding: 20, color: '#fca5a5', fontFamily: 'monospace',
          fontSize: 12, lineHeight: 1.6, wordBreak: 'break-word',
          minHeight: '100vh', background: '#0a0b0d',
        }}>
          <div style={{ color: '#e24b4a', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
            SOMETHING BROKE
          </div>
          <div style={{ color: '#e8e8e8' }}>{this.state.err.message}</div>
          <pre style={{ marginTop: 12, fontSize: 10, color: '#888', whiteSpace: 'pre-wrap' }}>
            {(this.state.err.stack || '').split('\n').slice(0, 8).join('\n')}
          </pre>
          <button
            onClick={() => this.setState({ err: null })}
            style={{ marginTop: 16, padding: '8px 16px', background: '#c0392b', color: '#fff', border: 'none', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 }}
          >
            RETRY
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        {/* Let iOS Safari style its top/bottom UI chrome to match the dark app */}
        <meta name="theme-color" content="#0a0b0d" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <title>DXD — Ops Tracker</title>
        {/* Raw vanilla-JS diagnostic that installs before React does.
            Renders a DEBUG chip in the corner regardless of whether the
            React bundle mounts, so we can see the actual failure state
            on a phone with no devtools. */}
        <script dangerouslySetInnerHTML={{ __html: DIAGNOSTIC_BOOTSTRAP }} />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap"
        />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          /* iOS Safari: neutralize the double-tap-zoom delay + tap flash.
             tap-highlight-color and touch-action are the two knobs that
             usually explain "the page loads but nothing responds". */
          html { -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; }
          html, body { height: 100%; }
          /* --dxd-vh is a mobile-safe viewport height. iOS Safari's 100vh
             doesn't shrink for the URL bar; 100dvh does but isn't supported
             everywhere. Modern browsers get the dvh value; older ones fall
             back to plain vh (still correct on desktop). */
          :root { --dxd-vh: 100vh; --dxd-vh: 100dvh; }
          body {
            background: #0a0b0d; color: #e8eaf0; font-family: 'JetBrains Mono', monospace;
            background-image: url('/images/dxd-bg.jpg');
            background-size: cover; background-position: center top;
            /* background-attachment: fixed is broken on iOS Safari and can
               cause layout thrash + touch-routing weirdness. We fake the
               "fixed" look with a body::before below that IS position:fixed
               (pointer-events:none), which works everywhere. */
            background-attachment: scroll; background-repeat: no-repeat;
            overscroll-behavior-y: none;
          }
          body::before {
            content: '';
            position: fixed; inset: 0; z-index: 0; pointer-events: none;
            background: linear-gradient(135deg, rgba(10,11,13,0.70) 0%, rgba(10,11,13,0.52) 50%, rgba(10,11,13,0.68) 100%);
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

          /* Cinematic view transitions — Chrome/Edge/Safari 18+. Falls back
             to no animation elsewhere. --dxd-zoom-x/y are set by
             lib/transitions.ts to the last click point so the panel grows
             from wherever the operator interacted. */
          @keyframes dxd-zoom-in {
            from {
              opacity: 0;
              clip-path: circle(0px at var(--dxd-zoom-x, 50%) var(--dxd-zoom-y, 50%));
              transform: scale(0.98);
            }
            to {
              opacity: 1;
              clip-path: circle(150% at var(--dxd-zoom-x, 50%) var(--dxd-zoom-y, 50%));
              transform: scale(1);
            }
          }
          @keyframes dxd-zoom-out {
            from {
              opacity: 1;
              clip-path: circle(150% at var(--dxd-zoom-x, 50%) var(--dxd-zoom-y, 50%));
            }
            to {
              opacity: 0;
              clip-path: circle(0px at var(--dxd-zoom-x, 50%) var(--dxd-zoom-y, 50%));
            }
          }
          @keyframes dxd-tab-in  { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes dxd-tab-out { from { opacity: 1; } to { opacity: 0; } }

          ::view-transition-old(root) { animation: dxd-tab-out 0.18s ease forwards; }
          ::view-transition-new(root) { animation: dxd-tab-in  0.28s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
          ::view-transition-old(root),
          ::view-transition-new(root) { mix-blend-mode: normal; }

          /* When the deal panel opens/closes it grows from / collapses to
             the last click coordinates. */
          ::view-transition-new(deal-panel) { animation: dxd-zoom-in  0.42s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
          ::view-transition-old(deal-panel) { animation: dxd-zoom-out 0.32s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
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
          <AppErrorBoundary>
            <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
              {children}
            </div>
          </AppErrorBoundary>
        </QueryClientProvider>
      </body>
    </html>
  )
}
