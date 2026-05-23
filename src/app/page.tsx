"use client"

import Link from "next/link"
import { useMemo } from "react"
import { useVaultAuth } from "@/hooks/use-vault-auth"
import { useVaultItems } from "@/hooks/use-vault-items"
import { useActiveGrants } from "@/hooks/use-active-grants"
import { getAttributeValue } from "@/lib/arkiv/schemas"
import { TxRow } from "@/components/tx-row"
import type { TxEntry } from "@/components/tx-row"
import {
  FileText, ImageIcon, Paperclip,
  FolderOpen, Share2, Bot,
} from "lucide-react"

// ─── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, href,
}: {
  label: string
  value: string | number
  sub?: string
  href?: string
}) {
  const inner = (
    <div className="border border-sv-border bg-sv-bg p-5 card-lift group">
      <p className="text-[11px] text-sv-dim uppercase tracking-widest mb-2">{label}</p>
      <p className="text-2xl font-bold text-sv-text">{value}</p>
      {sub && <p className="text-xs text-sv-dim mt-1">{sub}</p>}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

// ─── Category badge ──────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  medical:   "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
  legal:     "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
  financial: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  personal:  "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900",
}

function CategoryBadge({ category }: { category: string }) {
  const cls = CAT_COLORS[category] ?? "bg-sv-surface text-sv-muted border-sv-border"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 border text-[11px] font-medium uppercase tracking-wide ${cls}`}>
      {category}
    </span>
  )
}

// ─── Quick action ────────────────────────────────────────────────────────────────

function QuickAction({
  href, icon, label, description,
}: {
  href: string
  icon: React.ReactNode
  label: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 p-4 border border-sv-border bg-sv-bg card-lift hover:border-sv-border-hi"
    >
      <div className="w-7 h-7 border border-sv-border bg-sv-surface flex items-center justify-center shrink-0 mt-0.5 group-hover:border-sv-blue group-hover:text-sv-blue transition-colors duration-150">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-sv-text uppercase tracking-wide group-hover:text-sv-blue transition-colors duration-150">{label}</p>
        <p className="text-xs text-sv-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
    </Link>
  )
}

// ─── File icon ────────────────────────────────────────────────────────────────────

function FileTypeIcon({ fileType }: { fileType: string }) {
  const cls = "w-4 h-4 text-sv-dim shrink-0"
  if (fileType.startsWith("image/")) return <ImageIcon className={cls} />
  if (fileType === "application/pdf") return <FileText className={cls} />
  if (fileType.startsWith("text/"))  return <FileText className={cls} />
  return <Paperclip className={cls} />
}

// ─── Spinner ──────────────────────────────────────────────────────────────────────

function Spinner({ label }: { label?: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-5 h-5 mx-auto border-2 border-sv-blue border-t-transparent animate-spin" />
        {label && <p className="text-sv-dim text-xs">{label}</p>}
      </div>
    </main>
  )
}

// ─── Feature list items ───────────────────────────────────────────────────────────

const FEATURE_LIST = [
  "ENCRYPTED",
  "TIME-SCOPED",
  "VERIFIABLE",
  "TRUSTLESS BY DEFAULT",
  "ARKIV-NATIVE",
]

const COMPARISON = {
  before: [
    "Files uploaded to centralised servers",
    "Access links never expire",
    "Recipients must create an account",
  ],
  after: [
    "Encrypted client-side before upload. Keys stay on device.",
    "Share links expire exactly when you choose.",
    "Recipients open the document immediately. Zero friction.",
  ],
}

// ─── Page ──────────────────────────────────────────────────────────────────────────

export default function Home() {
  const { ready, isAuthenticated, isDerivingKey, login, walletAddress } = useVaultAuth()
  const { data: vaultItems } = useVaultItems()
  const { data: activeGrants } = useActiveGrants()

  const transactions = useMemo<TxEntry[]>(() => {
    const uploads: TxEntry[] = (vaultItems ?? []).map((e) => {
      const a = (e.attributes ?? []) as Array<{ key: string; value: string | number }>
      return {
        id:        `upload-${String(e.key)}`,
        type:      "UPLOAD",
        label:     String(getAttributeValue(a, "label") ?? "Untitled document"),
        timestamp: (getAttributeValue(a, "created_at") as number | undefined) ?? 0,
        entityKey: String(e.key),
      }
    })

    const shares: TxEntry[] = (activeGrants ?? []).map((e) => {
      const a = (e.attributes ?? []) as Array<{ key: string; value: string | number }>
      const docLabel    = getAttributeValue(a, "label") as string | undefined
      const granteeName = getAttributeValue(a, "grantee_name") as string | undefined
      const displayLabel = docLabel
        ? granteeName ? `${docLabel} → ${granteeName}` : docLabel
        : String(getAttributeValue(a, "purpose") ?? "Shared document")
      return {
        id:        `share-${String(e.key)}`,
        type:      "SHARE",
        label:     displayLabel,
        timestamp: (getAttributeValue(a, "granted_at") as number | undefined) ?? 0,
        entityKey: String(e.key),
      }
    })

    return [...uploads, ...shares]
      .filter((t) => t.timestamp > 0)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10)
  }, [vaultItems, activeGrants])

  if (!ready) return <Spinner />
  if (isAuthenticated && isDerivingKey) return <Spinner label="Unlocking your vault…" />

  // ── Landing ──
  if (!isAuthenticated) {
    return (
      <main className="min-h-[calc(100dvh-57px)] flex flex-col">

        {/* Hero */}
        <section className="flex-1 border-b border-sv-border">
          <div className="max-w-6xl mx-auto px-6 py-16 grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

            {/* Left */}
            <div className="space-y-8 animate-slide-up">
              <p className="text-xs text-sv-dim uppercase tracking-widest">[ SV ]</p>
              <h1 className="text-4xl sm:text-5xl font-bold text-sv-text leading-[1.1] tracking-tight">
                PRIVATE DOCUMENTS,{" "}
                <br className="hidden sm:block" />
                SHARED ON YOUR TERMS.
              </h1>
              <p className="text-sm text-sv-muted leading-relaxed max-w-md">
                A trustless document vault — store encrypted files and share
                them with time-scoped access links. No counterparty risk.
                Your keys, your data.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={login}
                  className="px-6 py-2.5 bg-sv-blue text-white text-xs font-medium uppercase tracking-wide hover:bg-sv-blue-li transition-colors duration-150"
                >
                  Open your vault
                </button>
                <span className="text-xs text-sv-dim">Sign in with email</span>
              </div>
            </div>

            {/* Right — feature list */}
            <div className="animate-slide-up stagger-2 space-y-4">
              <div className="border border-sv-border p-6 space-y-2">
                {FEATURE_LIST.map((f) => (
                  <div key={f} className="flex items-center gap-3 py-2 border-b border-sv-border last:border-0">
                    <span className="w-1.5 h-1.5 bg-sv-blue shrink-0" />
                    <span className="text-xs font-medium text-sv-text uppercase tracking-widest">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Comparison — mirrors Arkiv's left/right split */}
        <section className="border-b border-sv-border">
          <div className="max-w-6xl mx-auto px-6 py-12">
            <p className="text-[11px] text-sv-dim uppercase tracking-widest mb-8">[ WHY SEALVAULT ]</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 border border-sv-border animate-slide-up stagger-3">

              {/* Left — without */}
              <div className="p-8 border-r border-sv-border space-y-5">
                <p className="text-sm font-bold text-sv-text uppercase tracking-wide">CURRENT STATE OF DATA</p>
                <div className="space-y-3">
                  {COMPARISON.before.map((t) => (
                    <p key={t} className="text-xs text-sv-muted leading-relaxed border-b border-sv-border pb-3 last:border-0">
                      {t}
                    </p>
                  ))}
                </div>
              </div>

              {/* Right — with SealVault (cobalt blue, Arkiv-style) */}
              <div className="card-blue p-8 space-y-5">
                <p className="text-sm font-bold uppercase tracking-wide">WITH SEALVAULT</p>
                <div className="space-y-3">
                  {COMPARISON.after.map((t) => (
                    <p key={t} className="text-xs leading-relaxed border-b border-white/20 pb-3 last:border-0 text-white/80">
                      {t}
                    </p>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-6 px-6">
          <p className="text-[11px] text-sv-dim text-center">
            © 2026 SealVault · Your data, your rules · Built on Arkiv Network
          </p>
        </footer>
      </main>
    )
  }

  // ── Dashboard ──
  const docCount   = vaultItems?.length ?? 0
  const grantCount = activeGrants?.length ?? 0
  const recentDocs = vaultItems?.slice(0, 3) ?? []

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-10 animate-fade-in">

      {/* Greeting */}
      <div className="space-y-1 pb-4 border-b border-sv-border">
        <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ YOUR VAULT ]</p>
        <h1 className="text-lg font-bold text-sv-text mt-1">
          {walletAddress
            ? `${walletAddress.slice(0, 10)}…${walletAddress.slice(-6)}`
            : "Welcome back"}
        </h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-0 border border-sv-border divide-x divide-sv-border">
        <div className="p-5">
          <p className="text-[11px] text-sv-dim uppercase tracking-widest mb-2">Documents</p>
          <p className="text-2xl font-bold text-sv-text">{docCount}</p>
          <p className="text-xs text-sv-dim mt-1">{docCount} encrypted</p>
        </div>
        <div className="p-5">
          <p className="text-[11px] text-sv-dim uppercase tracking-widest mb-2">Active shares</p>
          <p className="text-2xl font-bold text-sv-text">{grantCount}</p>
          <p className="text-xs text-sv-dim mt-1">
            {grantCount === 0 ? "No links out" : `${grantCount} link${grantCount !== 1 ? "s" : ""} active`}
          </p>
        </div>
        <div className="p-5 col-span-2 sm:col-span-1 border-t sm:border-t-0 border-sv-border">
          <p className="text-[11px] text-sv-dim uppercase tracking-widest mb-2">Encryption</p>
          <p className="text-2xl font-bold text-sv-text">AES-256</p>
          <p className="text-xs text-sv-dim mt-1">Keys stay on device</p>
        </div>
      </div>

      {/* Recent documents */}
      {recentDocs.length > 0 && (
        <section className="space-y-3 animate-slide-up">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ RECENT DOCUMENTS ]</p>
            <Link href="/vault" className="text-xs text-sv-blue hover:text-sv-blue-li transition-colors">
              View all →
            </Link>
          </div>
          <div className="border border-sv-border divide-y divide-sv-border">
            {recentDocs.map((e) => {
              const a = (e.attributes ?? []) as Array<{ key: string; value: string | number }>
              const label    = String(getAttributeValue(a, "label") ?? "Untitled")
              const category = String(getAttributeValue(a, "category") ?? "personal")
              const fileType = String(getAttributeValue(a, "file_type") ?? "")
              const createdAt = getAttributeValue(a, "created_at") as number | undefined

              return (
                <div
                  key={String(e.key)}
                  className="flex items-center justify-between px-4 py-3 hover:bg-sv-surface transition-colors duration-150"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileTypeIcon fileType={fileType} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-sv-text truncate">{label}</p>
                      {createdAt && (
                        <p className="text-[11px] text-sv-dim tabular-nums">
                          {new Date(createdAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <CategoryBadge category={category} />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Recent transactions */}
      <section className="space-y-3 animate-slide-up stagger-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ RECENT TRANSACTIONS ]</p>
          {transactions.length > 0 && (
            <Link href="/transactions" className="text-xs text-sv-blue hover:text-sv-blue-li transition-colors">
              View all →
            </Link>
          )}
        </div>

        {transactions.length === 0 ? (
          <div className="border border-sv-border px-4 py-8 text-center">
            <p className="text-xs text-sv-muted">No transactions yet — upload a document to get started.</p>
          </div>
        ) : (
          <div className="border border-sv-border divide-y divide-sv-border">
            {transactions.map((tx) => (
              <TxRow key={tx.id} tx={tx} compact />
            ))}
          </div>
        )}
      </section>

      {/* Quick actions */}
      <section className="space-y-3 animate-slide-up stagger-3">
        <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ QUICK ACTIONS ]</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 border border-sv-border divide-y sm:divide-y-0 sm:divide-x divide-sv-border">
          <QuickAction
            href="/vault"
            icon={<FolderOpen className="w-3.5 h-3.5 text-sv-muted" />}
            label="Manage vault"
            description="Upload documents and share them"
          />
          <QuickAction
            href="/grants"
            icon={<Share2 className="w-3.5 h-3.5 text-sv-muted" />}
            label="Active shares"
            description="Revoke or extend time-scoped links"
          />
          <QuickAction
            href="/agent"
            icon={<Bot className="w-3.5 h-3.5 text-sv-muted" />}
            label="AI assistant"
            description="Ask questions, manage by voice"
          />
        </div>
      </section>

    </main>
  )
}
