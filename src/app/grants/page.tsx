"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { useActiveGrants } from "@/hooks/use-active-grants"
import { useRevokeGrant, useExtendGrant } from "@/hooks/use-grant-actions"
import { useVaultAuth } from "@/hooks/use-vault-auth"
import { useGrantExpiry } from "@/hooks/use-grant-expiry"
import { getAttributeValue } from "@/lib/arkiv/schemas"
import type { Entity } from "@/lib/arkiv/types"
import { Link2, Plus, RefreshCw } from "lucide-react"

// ─── Time helpers ─────────────────────────────────────────────────────────────

function formatTimeLeft(expiresAt: number): { label: string; urgency: "ok" | "soon" | "expired" } {
  const ms = expiresAt - Date.now()
  if (ms <= 0) return { label: "Expired", urgency: "expired" }

  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  const hr  = Math.floor(min / 60)
  const day = Math.floor(hr / 24)

  if (day >= 1) return { label: `${day}d ${hr % 24}h left`, urgency: "ok" }
  if (hr  >= 1) return { label: `${hr}h ${min % 60}m left`, urgency: hr < 6 ? "soon" : "ok" }
  return { label: `${min}m left`, urgency: "expired" }
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  })
}

const URGENCY_STYLE = {
  ok:      "bg-emerald-50 border-emerald-200 text-emerald-700",
  soon:    "bg-amber-50 border-amber-200 text-amber-700",
  expired: "bg-rose-50 border-rose-200 text-rose-700",
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4 animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-sv-bg border border-sv-border shadow-xl w-full max-w-md animate-scale-in">
        {children}
      </div>
    </div>
  )
}

// ─── Revoke dialog ────────────────────────────────────────────────────────────

function RevokeDialog({
  grant, onClose, onRevoke, isPending,
}: {
  grant: Entity; onClose: () => void; onRevoke: () => void; isPending: boolean
}) {
  const attrs = (grant.attributes ?? []) as Array<{ key: string; value: string | number }>
  const purpose = String(getAttributeValue(attrs, "purpose") ?? "No purpose")

  return (
    <Overlay onClose={onClose}>
      <div className="p-6 border-b border-sv-border">
        <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ REVOKE LINK ]</p>
        <h2 className="text-sm font-bold text-sv-text mt-1">Are you sure?</h2>
        <p className="text-xs text-sv-muted mt-1">Purpose: {purpose}</p>
      </div>
      <div className="p-6 space-y-5">
        <p className="text-xs text-sv-muted leading-relaxed">
          The link will stop working immediately. The recipient can no longer open the document.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-sv-border text-sv-muted text-xs hover:border-sv-border-hi transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={onRevoke}
            disabled={isPending}
            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-medium transition-colors duration-150"
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border border-white/30 border-t-white animate-spin" />
                Revoking…
              </span>
            ) : "Revoke link"}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ─── Extend dialog ────────────────────────────────────────────────────────────

const EXTEND_OPTIONS = [
  { label: "+1 hour",   seconds: 3_600 },
  { label: "+24 hours", seconds: 86_400 },
  { label: "+7 days",   seconds: 7 * 86_400 },
  { label: "+30 days",  seconds: 30 * 86_400 },
]

function ExtendDialog({
  grant, onClose, onExtend, isPending,
}: {
  grant: Entity; onClose: () => void; onExtend: (seconds: number) => void; isPending: boolean
}) {
  const [selected, setSelected] = useState(86_400)
  const attrs = (grant.attributes ?? []) as Array<{ key: string; value: string | number }>
  const purpose = String(getAttributeValue(attrs, "purpose") ?? "No purpose")

  return (
    <Overlay onClose={onClose}>
      <div className="p-6 border-b border-sv-border">
        <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ EXTEND LINK ]</p>
        <h2 className="text-sm font-bold text-sv-text mt-1">Extend access</h2>
        <p className="text-xs text-sv-muted mt-1">Purpose: {purpose}</p>
      </div>
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 gap-2">
          {EXTEND_OPTIONS.map((o) => (
            <button
              key={o.seconds}
              onClick={() => setSelected(o.seconds)}
              className={`py-2.5 text-xs font-medium border transition-colors duration-150 ${
                selected === o.seconds
                  ? "bg-sv-blue border-sv-blue text-white"
                  : "border-sv-border text-sv-muted hover:border-sv-border-hi hover:text-sv-text"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-sv-border text-sv-muted text-xs hover:border-sv-border-hi transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={() => onExtend(selected)}
            disabled={isPending}
            className="flex-1 py-2.5 bg-sv-blue hover:bg-sv-blue-li disabled:opacity-50 text-white text-xs font-medium transition-colors duration-150"
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border border-white/30 border-t-white animate-spin" />
                Extending…
              </span>
            ) : "Extend"}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ─── Grant card ───────────────────────────────────────────────────────────────

function GrantCard({
  grant, onRevoke, onExtend,
}: {
  grant: Entity; onRevoke: (g: Entity) => void; onExtend: (g: Entity) => void
}) {
  const attrs = (grant.attributes ?? []) as Array<{ key: string; value: string | number }>

  const purpose   = String(getAttributeValue(attrs, "purpose")    ?? "No purpose")
  const parentKey = String(getAttributeValue(attrs, "parent_key") ?? "")
  const grantedAt = getAttributeValue(attrs, "granted_at") as number | undefined
  const expiresAt = getAttributeValue(attrs, "expires_at") as number | undefined

  const { label: timeLabel, urgency } = expiresAt
    ? formatTimeLeft(expiresAt)
    : { label: "No expiry", urgency: "ok" as const }

  return (
    <div className="border border-sv-border bg-sv-bg p-4 space-y-3 card-lift hover:border-sv-border-hi">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-sv-text truncate">{purpose}</p>
          {grantedAt && (
            <p className="text-[11px] text-sv-dim mt-0.5 tabular-nums">Shared {formatDate(grantedAt)}</p>
          )}
        </div>
        <span className={`shrink-0 text-[11px] font-medium uppercase tracking-wide px-2 py-1 border ${URGENCY_STYLE[urgency]}`}>
          {timeLabel}
        </span>
      </div>

      {parentKey && (
        <p className="text-[11px] text-sv-dim font-mono truncate bg-sv-surface border border-sv-border px-2 py-1">
          {parentKey.slice(0, 28)}…
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onExtend(grant)}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 border border-sv-border text-sv-muted text-[11px] font-medium uppercase tracking-wide hover:border-sv-blue hover:text-sv-blue transition-colors duration-150"
        >
          <RefreshCw className="w-3 h-3" />
          Extend
        </button>
        <button
          onClick={() => onRevoke(grant)}
          className="flex-1 py-1.5 border border-sv-border text-sv-muted text-[11px] font-medium uppercase tracking-wide hover:border-rose-300 hover:text-rose-600 transition-colors duration-150"
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
      <main className="min-h-[calc(100dvh-57px)] flex items-center justify-center">
        <div className="text-center space-y-4 animate-scale-in">
          <p className="text-sv-muted text-xs">Please sign in to view your shares.</p>
          <Link href="/" className="text-sv-blue hover:text-sv-blue-li text-xs transition-colors">
            Go home →
          </Link>
        </div>
      </main>
    )
  }

  const sortedGrants = grants ?? []

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-8 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-sv-border">
        <div className="space-y-1">
          <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ ACTIVE SHARES ]</p>
          <h1 className="text-lg font-bold text-sv-text">
            {sortedGrants.length === 0
              ? "No active links"
              : `${sortedGrants.length} link${sortedGrants.length !== 1 ? "s" : ""} active`}
          </h1>
        </div>
        <Link
          href="/vault"
          className="flex items-center gap-2 py-2 px-4 bg-sv-blue hover:bg-sv-blue-li text-white text-xs font-medium uppercase tracking-wide transition-colors duration-150"
        >
          <Plus className="w-3.5 h-3.5" />
          New share
        </Link>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-sv-blue border-t-transparent animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && sortedGrants.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 space-y-5 text-center animate-scale-in">
          <div className="w-12 h-12 border border-sv-border bg-sv-surface flex items-center justify-center">
            <Link2 className="w-5 h-5 text-sv-dim" />
          </div>
          <div className="space-y-1">
            <p className="text-sv-text text-sm font-bold uppercase tracking-wide">No active links</p>
            <p className="text-sv-muted text-xs max-w-xs leading-relaxed">
              Go to your vault, pick a document, and share it. The link will appear here.
            </p>
          </div>
          <Link
            href="/vault"
            className="py-2 px-5 border border-sv-border text-sv-muted text-xs hover:border-sv-blue hover:text-sv-blue transition-colors duration-150"
          >
            Open vault
          </Link>
        </div>
      )}

      {/* Grant list */}
      {sortedGrants.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-slide-up">
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

      {sortedGrants.length > 0 && (
        <p className="text-[11px] text-sv-dim text-center">
          Links expire automatically on-chain. Revoke early to cut access immediately.
        </p>
      )}

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
