"use client"

import Link from "next/link"
import { useVaultAuth } from "@/hooks/use-vault-auth"
import { useVaultItems } from "@/hooks/use-vault-items"
import { useActiveGrants } from "@/hooks/use-active-grants"
import { getAttributeValue } from "@/lib/arkiv/schemas"

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string
  value: string | number
  sub?: string
  href?: string
}) {
  const inner = (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6 space-y-1 hover:border-slate-600 transition-colors">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="text-3xl font-bold text-slate-50">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

// ─── Category badge ────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  medical:   "bg-rose-500/10 text-rose-400 border-rose-500/20",
  legal:     "bg-blue-500/10 text-blue-400 border-blue-500/20",
  financial: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  personal:  "bg-purple-500/10 text-purple-400 border-purple-500/20",
}

function CategoryBadge({ category }: { category: string }) {
  const cls = CAT_COLORS[category] ?? "bg-slate-700 text-slate-300 border-slate-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${cls}`}>
      {category}
    </span>
  )
}

// ─── Quick action ─────────────────────────────────────────────────────────────

function QuickAction({
  href,
  icon,
  label,
  description,
}: {
  href: string
  icon: string
  label: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-4 p-4 rounded-xl border border-slate-700 bg-slate-800/40 hover:bg-slate-800/80 hover:border-slate-600 transition-colors"
    >
      <span className="text-2xl mt-0.5">{icon}</span>
      <div>
        <p className="text-sm font-medium text-slate-100">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const { ready, isAuthenticated, isDerivingKey, login, walletAddress } = useVaultAuth()
  const { data: vaultItems } = useVaultItems()
  const { data: activeGrants } = useActiveGrants()

  // ── Loading ──
  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
      </main>
    )
  }

  // ── Unlocking ──
  if (isAuthenticated && isDerivingKey) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-6 h-6 mx-auto rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          <p className="text-slate-400 text-sm">Unlocking your vault…</p>
        </div>
      </main>
    )
  }

  // ── Not logged in ──
  if (!isAuthenticated) {
    return (
      <main className="min-h-[calc(100vh-57px)] flex items-center justify-center px-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <span className="text-4xl">🔒</span>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-slate-50">SealVault</h1>
            <p className="text-slate-400 text-lg">
              Your private documents, shared on your terms.
            </p>
          </div>
          <div className="space-y-3 text-sm text-slate-500 max-w-xs mx-auto">
            <p>End-to-end encrypted storage on the Arkiv network.</p>
            <p>Share any document via a link that expires automatically.</p>
            <p>Recipients need no account — just the link.</p>
          </div>
          <button
            onClick={login}
            className="w-full py-3 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold transition-colors text-base"
          >
            Sign in to open your vault
          </button>
          <p className="text-xs text-slate-600">
            Google, Apple, or email — no crypto knowledge needed
          </p>
        </div>
      </main>
    )
  }

  // ── Dashboard ──
  const docCount = vaultItems?.length ?? 0
  const grantCount = activeGrants?.length ?? 0
  const recentDocs = vaultItems?.slice(0, 3) ?? []

  return (
    <main className="max-w-4xl mx-auto px-4 py-10 space-y-10">
      {/* Greeting */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-50">Your vault</h1>
        <p className="text-slate-400 text-sm">
          {walletAddress && (
            <span className="font-mono">{walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}</span>
          )}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard
          label="Documents"
          value={docCount}
          sub={docCount === 1 ? "1 file" : `${docCount} files`}
          href="/vault"
        />
        <StatCard
          label="Active shares"
          value={grantCount}
          sub={grantCount === 0 ? "No links out" : `${grantCount} link${grantCount !== 1 ? "s" : ""} active`}
          href="/grants"
        />
        <StatCard
          label="Encryption"
          value="AES-256"
          sub="Keys never leave your device"
        />
      </div>

      {/* Recent documents */}
      {recentDocs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Recent documents
            </h2>
            <Link href="/vault" className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {recentDocs.map((e) => {
              const a = (e.attributes ?? []) as Array<{ key: string; value: string | number }>
              const label    = String(getAttributeValue(a, "label") ?? "Untitled")
              const category = String(getAttributeValue(a, "category") ?? "personal")
              const fileType = String(getAttributeValue(a, "file_type") ?? "")
              const createdAt = getAttributeValue(a, "created_at") as number | undefined

              return (
                <div
                  key={String(e.key)}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-700 bg-slate-800/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg shrink-0">{fileIcon(fileType)}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">{label}</p>
                      {createdAt && (
                        <p className="text-xs text-slate-500">
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

      {/* Quick actions */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Quick actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <QuickAction
            href="/vault"
            icon="📁"
            label="Manage vault"
            description="Upload documents and share them"
          />
          <QuickAction
            href="/grants"
            icon="🔗"
            label="Active shares"
            description="Revoke or extend your magic links"
          />
          <QuickAction
            href="/agent"
            icon="🤖"
            label="AI assistant"
            description="Ask questions, manage by voice"
          />
        </div>
      </section>
    </main>
  )
}

function fileIcon(fileType: string): string {
  if (fileType.startsWith("image/"))       return "🖼️"
  if (fileType === "application/pdf")      return "📄"
  if (fileType.startsWith("text/"))        return "📝"
  if (fileType.includes("spreadsheet") || fileType.includes("excel")) return "📊"
  return "📎"
}
