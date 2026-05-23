"use client"

import { use, useEffect, useMemo, useState } from "react"
import { useGrantView } from "@/hooks/use-grant-view"
import { DocumentViewer, DownloadButton } from "@/components/document-viewer"

// ─── Countdown ────────────────────────────────────────────────────────────────

function ExpiryCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const msLeft = expiresAt - now
  if (msLeft <= 0) return <span className="text-red-400">Expired</span>

  const hoursLeft  = Math.floor(msLeft / 3_600_000)
  const minutesLeft = Math.floor((msLeft % 3_600_000) / 60_000)

  if (hoursLeft >= 24) {
    const days = Math.floor(hoursLeft / 24)
    return <span className="text-emerald-400">Expires in {days} day{days !== 1 ? "s" : ""}</span>
  }
  if (hoursLeft > 0) {
    return <span className="text-amber-400">Expires in {hoursLeft}h {minutesLeft}m</span>
  }
  return <span className="text-red-400">Expires in {minutesLeft} minute{minutesLeft !== 1 ? "s" : ""}</span>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ViewPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)
  const { data, isLoading } = useGrantView(token)

  const expiryDate = useMemo(() => {
    if (!data?.expiresAt) return null
    return new Date(data.expiresAt).toLocaleString(undefined, {
      weekday: "long",
      month:   "short",
      day:     "numeric",
      hour:    "2-digit",
      minute:  "2-digit",
    })
  }, [data?.expiresAt])

  // ── Loading ──
  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-6 h-6 mx-auto rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          <p className="text-slate-400 text-sm">Loading shared document…</p>
        </div>
      </main>
    )
  }

  // ── Not found / expired ──
  if (!data || data.status === "not_found") {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">⏱</div>
          <h1 className="text-2xl font-bold text-slate-50">This link has expired</h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            The sharing period for this document has ended, or the link is invalid.
            Contact the person who shared it if you need access again.
          </p>
          <div className="mt-6 text-xs text-slate-600">Powered by SealVault · Your data, your rules</div>
        </div>
      </main>
    )
  }

  // ── Decryption error ──
  if (data.status === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-2xl font-bold text-slate-50">Something went wrong</h1>
          <p className="text-slate-400 text-sm">
            This document could not be loaded. The link may be corrupted.
          </p>
        </div>
      </main>
    )
  }

  // ── Active grant ──
  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Document shared with you
          </div>
          <h1 className="text-2xl font-bold text-slate-50">
            {data.label ?? "Shared Document"}
          </h1>
          {data.purpose && (
            <p className="text-slate-400 text-sm">Purpose: {data.purpose}</p>
          )}
        </div>

        {/* Expiry badge */}
        {data.expiresAt && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-sm">
            <ExpiryCountdown expiresAt={data.expiresAt} />
            {expiryDate && (
              <span className="text-slate-500">· until {expiryDate}</span>
            )}
          </div>
        )}

        {/* Document content */}
        {data.content && (
          <div className="rounded-2xl border border-slate-700 overflow-hidden bg-slate-900 p-2">
            <DocumentViewer
              content={data.content}
              fileType={data.fileType}
              label={data.label}
            />
          </div>
        )}

        {/* Download button for all types */}
        {data.content && data.fileType && !data.fileType.startsWith("text/") && (
          <DownloadButton content={data.content} fileType={data.fileType} label={data.label} />
        )}

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 pt-4">
          Powered by SealVault · Your data, your rules
        </p>
      </div>
    </main>
  )
}

