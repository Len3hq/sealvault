"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { useActiveGrants } from "@/hooks/use-active-grants"
import { useRevokeGrant, useExtendGrant } from "@/hooks/use-grant-actions"
import { useVaultAuth } from "@/hooks/use-vault-auth"
import { useGrantExpiry } from "@/hooks/use-grant-expiry"
import { getAttributeValue } from "@/lib/arkiv/schemas"
import type { Entity } from "@/lib/arkiv/types"

// ─── Time helpers ─────────────────────────────────────────────────────────────

function formatTimeLeft(expiresAt: number): { label: string; urgent: boolean } {
  const ms = expiresAt - Date.now()
  if (ms <= 0) return { label: "Expired", urgent: true }

  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  const hr  = Math.floor(min / 60)
  const day = Math.floor(hr / 24)

  if (day >= 1) return { label: `${day}d ${hr % 24}h left`, urgent: day < 1 }
  if (hr  >= 1) return { label: `${hr}h ${min % 60}m left`, urgent: hr < 6 }
  return { label: `${min}m left`, urgent: true }
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day:   "numeric",
    year:  "numeric",
    hour:  "numeric",
    minute:"2-digit",
  })
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        {children}
      </div>
    </div>
  )
}

// ─── Revoke confirm dialog ─────────────────────────────────────────────────────

function RevokeDialog({
  grant,
  onClose,
  onRevoke,
  isPending,
}: {
  grant: Entity
  onClose: () => void
  onRevoke: () => void
  isPending: boolean
}) {
  const attrs = (grant.attributes ?? []) as Array<{ key: string; value: string | number }>
  const purpose = String(getAttributeValue(attrs, "purpose") ?? "No purpose")

  return (
    <Overlay onClose={onClose}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-50">Revoke share link?</h2>
        <p className="text-sm text-slate-400">
          Purpose: <span className="text-slate-300">{purpose}</span>
        </p>
      </div>
      <p className="text-sm text-slate-400">
        The magic link will stop working immediately. The recipient will no longer be
        able to open the document.
      </p>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:border-slate-600 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onRevoke}
          disabled={isPending}
          className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {isPending ? "Revoking…" : "Revoke link"}
        </button>
      </div>
    </Overlay>
  )
}

// ─── Extend dialog ────────────────────────────────────────────────────────────

const EXTEND_OPTIONS = [
  { label: "+1 hour",  seconds: 3_600 },
  { label: "+24 hours", seconds: 86_400 },
  { label: "+7 days",  seconds: 7 * 86_400 },
  { label: "+30 days", seconds: 30 * 86_400 },
]

function ExtendDialog({
  grant,
  onClose,
  onExtend,
  isPending,
}: {
  grant: Entity
  onClose: () => void
  onExtend: (seconds: number) => void
  isPending: boolean
}) {
  const [selected, setSelected] = useState(86_400)
  const attrs = (grant.attributes ?? []) as Array<{ key: string; value: string | number }>
  const purpose = String(getAttributeValue(attrs, "purpose") ?? "No purpose")

  return (
    <Overlay onClose={onClose}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-50">Extend share link</h2>
        <p className="text-sm text-slate-400">
          Purpose: <span className="text-slate-300">{purpose}</span>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {EXTEND_OPTIONS.map((o) => (
          <button
            key={o.seconds}
            onClick={() => setSelected(o.seconds)}
            className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
              selected === o.seconds
                ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:border-slate-600 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onExtend(selected)}
          disabled={isPending}
          className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 text-sm font-semibold transition-colors"
        >
          {isPending ? "Extending…" : "Extend"}
        </button>
      </div>
    </Overlay>
  )
}

// ─── Grant card ───────────────────────────────────────────────────────────────

function GrantCard({
  grant,
  onRevoke,
  onExtend,
}: {
  grant: Entity
  onRevoke: (g: Entity) => void
  onExtend: (g: Entity) => void
}) {
  const attrs = (grant.attributes ?? []) as Array<{ key: string; value: string | number }>

  const purpose    = String(getAttributeValue(attrs, "purpose")    ?? "No purpose")
  const parentKey  = String(getAttributeValue(attrs, "parent_key") ?? "")
  const grantedAt  = getAttributeValue(attrs, "granted_at")  as number | undefined
  const expiresAt  = getAttributeValue(attrs, "expires_at")  as number | undefined

  const { label: timeLabel, urgent } = expiresAt
    ? formatTimeLeft(expiresAt)
    : { label: "No expiry", urgent: false }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-100 truncate">{purpose}</p>
          {grantedAt && (
            <p className="text-xs text-slate-500 mt-0.5">Shared {formatDate(grantedAt)}</p>
          )}
        </div>
        <span
          className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${
            urgent
              ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
              : "bg-amber-500/10 border-amber-500/20 text-amber-400"
          }`}
        >
          {timeLabel}
        </span>
      </div>

      {/* Document reference */}
      {parentKey && (
        <p className="text-xs text-slate-600 font-mono truncate">
          doc: {parentKey.slice(0, 20)}…
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onExtend(grant)}
          className="flex-1 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs font-medium hover:border-amber-500/40 hover:text-amber-300 transition-colors"
        >
          Extend
        </button>
        <button
          onClick={() => onRevoke(grant)}
          className="flex-1 py-1.5 rounded-lg border border-slate-700 text-slate-400 text-xs font-medium hover:border-rose-500/40 hover:text-rose-400 transition-colors"
        >
          Revoke
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GrantsPage() {
  const { isAuthenticated, walletAddress } = useVaultAuth()
  const { data: grants, isLoading } = useActiveGrants()

  useGrantExpiry(walletAddress)

  const revoke = useRevokeGrant()
  const extend = useExtendGrant()

  const [revokeTarget, setRevokeTarget] = useState<Entity | null>(null)
  const [extendTarget, setExtendTarget] = useState<Entity | null>(null)

  const handleRevoke = useCallback(() => {
    if (!revokeTarget) return
    revoke.mutate(
      { grantEntityKey: String(revokeTarget.key) },
      { onSuccess: () => setRevokeTarget(null) }
    )
  }, [revokeTarget, revoke])

  const handleExtend = useCallback((seconds: number) => {
    if (!extendTarget) return
    extend.mutate(
      { grantEntityKey: String(extendTarget.key), additionalSeconds: seconds },
      { onSuccess: () => setExtendTarget(null) }
    )
  }, [extendTarget, extend])

  if (!isAuthenticated) {
    return (
      <main className="min-h-[calc(100vh-57px)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-400">Please sign in to view your shares.</p>
          <Link href="/" className="text-amber-400 hover:text-amber-300 text-sm transition-colors">
            Go home →
          </Link>
        </div>
      </main>
    )
  }

  const sortedGrants = grants ?? []

  return (
    <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-50">Active shares</h1>
          <p className="text-sm text-slate-400">
            {sortedGrants.length === 0
              ? "No active magic links"
              : `${sortedGrants.length} link${sortedGrants.length !== 1 ? "s" : ""} currently active`}
          </p>
        </div>
        <Link
          href="/vault"
          className="py-2 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-semibold transition-colors"
        >
          + New share
        </Link>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && sortedGrants.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
            <span className="text-3xl">🔗</span>
          </div>
          <div className="space-y-1">
            <p className="text-slate-300 font-medium">No active links</p>
            <p className="text-slate-500 text-sm max-w-xs">
              Go to your vault, pick a document, and share it. The link will appear here.
            </p>
          </div>
          <Link
            href="/vault"
            className="mt-2 py-2 px-5 rounded-xl border border-slate-700 text-slate-300 text-sm hover:border-slate-600 hover:text-slate-100 transition-colors"
          >
            Open vault
          </Link>
        </div>
      )}

      {/* Grant list */}
      {sortedGrants.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sortedGrants.map((grant) => (
            <GrantCard
              key={String(grant.key)}
              grant={grant}
              onRevoke={setRevokeTarget}
              onExtend={setExtendTarget}
            />
          ))}
        </div>
      )}

      {/* Info footer */}
      {sortedGrants.length > 0 && (
        <p className="text-xs text-slate-600 text-center">
          Links expire automatically on-chain. Revoke early to cut access immediately.
        </p>
      )}

      {/* Dialogs */}
      {revokeTarget && (
        <RevokeDialog
          grant={revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onRevoke={handleRevoke}
          isPending={revoke.isPending}
        />
      )}
      {extendTarget && (
        <ExtendDialog
          grant={extendTarget}
          onClose={() => setExtendTarget(null)}
          onExtend={handleExtend}
          isPending={extend.isPending}
        />
      )}
    </main>
  )
}
