"use client"

import { use, useEffect, useMemo, useState } from "react"
import { useGrantView } from "@/hooks/use-grant-view"
import { DocumentViewer, DownloadButton } from "@/components/document-viewer"
import { Clock, AlertCircle } from "lucide-react"

// ─── Countdown ─────────────────────────────────────────────────────────────────

function ExpiryCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const msLeft = expiresAt - now
  if (msLeft <= 0) return <span className="text-rose-600 font-medium">EXPIRED</span>

  const hoursLeft   = Math.floor(msLeft / 3_600_000)
  const minutesLeft = Math.floor((msLeft % 3_600_000) / 60_000)

  if (hoursLeft >= 24) {
    const days = Math.floor(hoursLeft / 24)
    return <span className="text-emerald-700 font-medium">EXPIRES IN {days} DAY{days !== 1 ? "S" : ""}</span>
  }
  if (hoursLeft > 0) {
    return <span className="text-sv-blue font-medium">EXPIRES IN {hoursLeft}H {minutesLeft}M</span>
  }
  return <span className="text-amber-600 font-medium">EXPIRES IN {minutesLeft} MINUTE{minutesLeft !== 1 ? "S" : ""}</span>
}

// ─── Page ──────────────────────────────────────────────────────────────────────

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
      weekday: "long", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    })
  }, [data?.expiresAt])

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-5 h-5 mx-auto border-2 border-sv-blue border-t-transparent animate-spin" />
          <p className="text-sv-dim text-xs">Loading shared document…</p>
        </div>
      </main>
    )
  }

  if (!data || data.status === "not_found") {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-6 max-w-sm animate-scale-in">
          <div className="w-12 h-12 mx-auto border border-sv-border bg-sv-surface flex items-center justify-center">
            <Clock className="w-5 h-5 text-sv-dim" />
          </div>
          <div className="space-y-2">
            <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ ACCESS EXPIRED ]</p>
            <h1 className="text-lg font-bold text-sv-text">This link has expired</h1>
            <p className="text-sv-muted text-xs leading-relaxed">
              The access period for this document has ended, or the link is invalid.
              Contact the person who shared it if you need access again.
            </p>
          </div>
          <p className="text-[11px] text-sv-dim">SealVault · Your data, your rules</p>
        </div>
      </main>
    )
  }

  if (data.status === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-6 max-w-sm animate-scale-in">
          <div className="w-12 h-12 mx-auto border border-rose-200 bg-rose-50 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-rose-600" />
          </div>
          <div className="space-y-2">
            <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ ERROR ]</p>
            <h1 className="text-lg font-bold text-sv-text">Something went wrong</h1>
            <p className="text-sv-muted text-xs">
              This document could not be loaded. The link may be corrupted.
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 py-12 animate-fade-in">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="space-y-2 pb-6 border-b border-sv-border animate-slide-up">
          <div className="flex items-center gap-2 text-[11px] text-sv-dim uppercase tracking-widest">
            <span className="w-1.5 h-1.5 bg-emerald-500" />
            Document shared with you
          </div>
          <h1 className="text-2xl font-bold text-sv-text leading-tight">
            {data.label ?? "SHARED DOCUMENT"}
          </h1>
          {data.purpose && (
            <p className="text-sv-muted text-xs">Purpose: <span className="text-sv-text">{data.purpose}</span></p>
          )}
        </div>

        {/* Expiry badge */}
        {data.expiresAt && (
          <div className="animate-slide-up stagger-1 inline-flex items-center gap-2.5 px-3 py-2 border border-sv-border bg-sv-surface text-[11px] uppercase tracking-wide">
            <Clock className="w-3.5 h-3.5 text-sv-dim shrink-0" />
            <ExpiryCountdown expiresAt={data.expiresAt} />
            {expiryDate && (
              <span className="text-sv-dim">· until {expiryDate}</span>
            )}
          </div>
        )}

        {/* Document content */}
        {data.content && (
          <div className="animate-slide-up stagger-2 border border-sv-border overflow-hidden bg-sv-surface">
            <div className="p-2">
              <DocumentViewer content={data.content} fileType={data.fileType} label={data.label} />
            </div>
          </div>
        )}

        {data.content && data.fileType && !data.fileType.startsWith("text/") && (
          <div className="animate-slide-up stagger-3">
            <DownloadButton content={data.content} fileType={data.fileType} label={data.label} />
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[11px] text-sv-dim pt-4 uppercase tracking-widest">
          SealVault · Your data, your rules
        </p>

      </div>
    </main>
  )
}
