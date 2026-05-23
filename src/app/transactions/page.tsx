"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useVaultAuth } from "@/hooks/use-vault-auth"
import { useVaultItems } from "@/hooks/use-vault-items"
import { useActiveGrants } from "@/hooks/use-active-grants"
import { getAttributeValue } from "@/lib/arkiv/schemas"
import { BRAGA } from "@/lib/arkiv/constants"
import { TxRow, TX_STYLE } from "@/components/tx-row"
import type { TxEntry, TxType } from "@/components/tx-row"
import { ArrowUpRight } from "lucide-react"

const FILTERS: Array<{ value: TxType | "ALL"; label: string }> = [
  { value: "ALL",    label: "All" },
  { value: "UPLOAD", label: "Uploads" },
  { value: "SHARE",  label: "Shares" },
]

export default function TransactionsPage() {
  const { isAuthenticated, walletAddress } = useVaultAuth()
  const { data: vaultItems,   isLoading: loadingItems  } = useVaultItems()
  const { data: activeGrants, isLoading: loadingGrants } = useActiveGrants()

  const [filter, setFilter] = useState<TxType | "ALL">("ALL")

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
  }, [vaultItems, activeGrants])

  const visible = filter === "ALL" ? transactions : transactions.filter((t) => t.type === filter)
  const isLoading = loadingItems || loadingGrants

  if (!isAuthenticated) {
    return (
      <main className="min-h-[calc(100dvh-57px)] flex items-center justify-center">
        <div className="text-center space-y-4 animate-scale-in">
          <p className="text-sv-muted text-xs">Please sign in to view your transactions.</p>
          <Link href="/" className="text-sv-blue hover:text-sv-blue-li text-xs transition-colors">
            Go home →
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-8 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between pb-4 border-b border-sv-border">
        <div className="space-y-1">
          <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ ON-CHAIN ACTIVITY ]</p>
          <h1 className="text-lg font-bold text-sv-text">
            {isLoading ? "Transactions" : `${transactions.length} transaction${transactions.length !== 1 ? "s" : ""}`}
          </h1>
          {walletAddress && (
            <p className="text-[11px] text-sv-dim font-mono">
              owner: {walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}
            </p>
          )}
        </div>
        <a
          href={BRAGA.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] text-sv-dim hover:text-sv-blue transition-colors duration-150 mt-1"
        >
          <ArrowUpRight className="w-3 h-3" />
          Braga Explorer
        </a>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-0 border border-sv-border divide-x divide-sv-border w-fit">
        {FILTERS.map(({ value, label }) => {
          const count = value === "ALL"
            ? transactions.length
            : transactions.filter((t) => t.type === value).length
          const active = filter === value
          return (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-4 py-2 text-[11px] font-medium uppercase tracking-wide transition-colors duration-150 flex items-center gap-1.5 ${
                active
                  ? "bg-sv-blue text-white"
                  : "text-sv-muted hover:text-sv-text hover:bg-sv-surface"
              }`}
            >
              {label}
              <span className={`tabular-nums ${active ? "text-white/70" : "text-sv-dim"}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-sv-blue border-t-transparent animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && visible.length === 0 && (
        <div className="border border-sv-border px-4 py-16 text-center animate-scale-in">
          <p className="text-xs text-sv-muted">
            {filter === "ALL"
              ? "No transactions yet — upload a document to get started."
              : `No ${filter.toLowerCase()} transactions.`}
          </p>
        </div>
      )}

      {/* List */}
      {!isLoading && visible.length > 0 && (
        <div className="border border-sv-border divide-y divide-sv-border animate-slide-up">

          {/* Column header */}
          <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto] gap-3 px-4 py-2 bg-sv-surface">
            <span className="text-[11px] text-sv-dim uppercase tracking-widest w-16">Type</span>
            <span className="text-[11px] text-sv-dim uppercase tracking-widest">Label / Purpose</span>
            <span className="text-[11px] text-sv-dim uppercase tracking-widest text-right">Timestamp</span>
            <span className="text-[11px] text-sv-dim uppercase tracking-widest text-right">Entity</span>
          </div>

          {visible.map((tx) => (
            <TxRow key={tx.id} tx={tx} />
          ))}
        </div>
      )}

      {/* Legend */}
      {!isLoading && visible.length > 0 && (
        <div className="flex items-center gap-4 pt-2">
          {(["UPLOAD", "SHARE"] as TxType[]).map((t) => (
            <div key={t} className="flex items-center gap-1.5">
              <span className={`inline-flex items-center px-2 py-0.5 border text-[11px] font-medium uppercase tracking-wide ${TX_STYLE[t]}`}>
                {t}
              </span>
              <span className="text-[11px] text-sv-dim">
                {t === "UPLOAD" ? "vault item created" : "access grant issued"}
              </span>
            </div>
          ))}
        </div>
      )}

    </main>
  )
}
