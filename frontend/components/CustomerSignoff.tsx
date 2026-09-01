'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { ProjectFull } from '@/lib/types'
import { api } from '@/lib/api'

interface Props {
  project: ProjectFull
}

// Bridge between the standalone customer-signoff.html (rendered in an
// iframe so we don't have to re-implement the signature pads / print
// styles in React) and the app's backend:
//
//   iframe posts       →  React handles
//   ─────────────────     ────────────────────────────────────────────
//   signoff:ready         → we reply with signoff:context (project info)
//   signoff:save          → upload PDF to /api/projects/:id/attachments
//                           and POST /api/send-signoff-email
//                           → reply with signoff:result { ok, error? }
//
// The iframe generates the PDF itself (jsPDF + html2canvas of the .page
// element) so what gets emailed and archived matches exactly what the
// operator saw on screen at signoff time.
export default function CustomerSignoff({ project }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [saving, setSaving] = useState(false)
  const [attachments, setAttachments] = useState<{ id: string; name: string; addedAt: string }[]>([])

  // Load the list of existing signoff PDFs on this deal so the operator
  // can re-download prior signoffs. Runs once on mount.
  useEffect(() => {
    let cancelled = false
    api.projectAttachments
      .list(project.id)
      .then(list => {
        if (cancelled) return
        setAttachments(
          list
            .filter(a => a.kind === 'signoff' || a.mime_type === 'application/pdf')
            .map(a => ({ id: a.id, name: a.name, addedAt: a.added_at })),
        )
      })
      .catch(() => { /* non-fatal — list stays empty */ })
    return () => { cancelled = true }
  }, [project.id])

  // The postMessage bridge. This is the whole point of the component.
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    function sendContext() {
      iframe?.contentWindow?.postMessage({
        type: 'signoff:context',
        payload: {
          id: project.id,
          name: project.name || '',
          client: project.client || '',
          site: project.site || '',
        },
      }, '*')
    }

    async function onMessage(evt: MessageEvent) {
      const msg = evt.data
      if (!msg || typeof msg !== 'object') return
      if (evt.source !== iframe?.contentWindow) return

      if (msg.type === 'signoff:ready') {
        sendContext()
        return
      }

      if (msg.type === 'signoff:save') {
        const p = msg.payload || {}
        setSaving(true)
        try {
          // 1. Decode base64 PDF into a Blob and upload as a
          //    project-scoped attachment tagged kind=signoff.
          const pdfBytes = base64ToBytes(p.pdf_base64)
          // `Blob` in TS 5+ needs BlobPart, and Uint8Array has ambient
          // ArrayBufferLike issues in this Next config. Cast to keep TS happy.
          const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' })
          const uploaded = await api.projectAttachments.upload(project.id, blob, {
            filename: p.filename || `signoff-${project.id}.pdf`,
            kind: 'signoff',
          })

          // 2. Fire the email. Backend picks the recipient from either
          //    the request body or the SIGNOFF_EMAIL_RECIPIENT env var.
          await api.sendSignoffEmail({
            subject: `Customer Signoff — ${p.project || project.name || 'Deployment'}`,
            project: p.project || project.name || '',
            client: p.client || project.client || '',
            site: p.site || project.site || '',
            filename: p.filename || uploaded.name,
            pdf_base64: p.pdf_base64,
          })

          // 3. Refresh the list of attachments so the newly saved PDF
          //    shows up in the "Prior signoffs" panel below the iframe.
          const fresh = await api.projectAttachments.list(project.id)
          setAttachments(fresh
            .filter(a => a.kind === 'signoff' || a.mime_type === 'application/pdf')
            .map(a => ({ id: a.id, name: a.name, addedAt: a.added_at })),
          )

          iframe?.contentWindow?.postMessage({
            type: 'signoff:result',
            payload: { ok: true },
          }, '*')
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e)
          iframe?.contentWindow?.postMessage({
            type: 'signoff:result',
            payload: { ok: false, error: err },
          }, '*')
        } finally {
          setSaving(false)
        }
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [project.id, project.name, project.client, project.site])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      <iframe
        ref={iframeRef}
        src="/customer-signoff.html"
        style={{ flex: 1, width: '100%', border: 'none', display: 'block', background: '#e9e9ec' }}
        title="Customer Signoff"
      />

      {(attachments.length > 0 || saving) && (
        <div style={{
          background: 'rgba(10,11,13,0.94)',
          borderTop: '1px solid #252b38',
          padding: '10px 20px',
          maxHeight: 160,
          overflowY: 'auto',
          color: '#e8eaf0',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, letterSpacing: 1.2 }}>
            <span style={{ color: '#9aa3b8', textTransform: 'uppercase', fontSize: 10 }}>
              PRIOR SIGNOFFS ({attachments.length})
            </span>
            {saving && (
              <span style={{ color: '#22C55E', fontSize: 10 }}>
                Saving + emailing…
              </span>
            )}
          </div>
          {attachments.map(a => (
            <div key={a.id} style={{ display: 'flex', gap: 12, padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <a
                href={api.projectAttachments.downloadUrl(a.id)}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#e8eaf0', textDecoration: 'none' }}
              >
                ↓ {a.name}
              </a>
              <span style={{ color: '#5a6380', fontSize: 10 }}>
                {new Date(a.addedAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Decode a standard base64 string (no data: prefix) into a Uint8Array
// that Blob can consume. We avoid atob() → String → TextEncoder because
// atob returns a "binary string" which mangles high bytes.
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const len = binary.length
  const out = new Uint8Array(len)
  for (let i = 0; i < len; i++) out[i] = binary.charCodeAt(i)
  return out
}
