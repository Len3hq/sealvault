"use client"

import { Share2, Upload, ExternalLink } from "lucide-react"
import { BRAGA } from "@/lib/arkiv/constants"

export type TxType = "UPLOAD" | "SHARE"

export interface TxEntry {
  id: string
  type: TxType
  label: string
  timestamp: number
  entityKey: string
}

export const TX_STYLE: Record<TxType, string> = {
  UPLOAD: "bg-sv-blue-muted text-sv-blue border-sv-blue/20",
  SHARE:  "bg-emerald-50 text-emerald-700 border-emerald-200",
}

function formatTs(ts: number) {
  const d = new Date(ts)
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  return { date, time }
}

export function TxRow({ tx, compact = false }: { tx: TxEntry; compact?: boolean }) {
  const explorerUrl = `${BRAGA.explorerUrl}/entity/${tx.entityKey}`
  const shortKey    = `${tx.entityKey.slice(0, 8)}…${tx.entityKey.slice(-6)}`
  const { date, time } = formatTs(tx.timestamp)

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-sv-surface transition-colors duration-150">

      {/* type badge */}
      <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 border text-[11px] font-medium uppercase tracking-wide ${TX_STYLE[tx.type]}`}>
        {tx.type === "UPLOAD"
          ? <Upload className="w-2.5 h-2.5" />
          : <Share2 className="w-2.5 h-2.5" />}
        {tx.type}
      </span>

      {/* label */}
      <p className="flex-1 text-xs text-sv-text truncate min-w-0">{tx.label}</p>

      {/* timestamp */}
      <div className="shrink-0 text-right hidden sm:block">
        <p className="text-[11px] text-sv-dim tabular-nums">{date}</p>
        {!compact && <p className="text-[11px] text-sv-dim tabular-nums">{time}</p>}
      </div>

      {/* entity + explorer link */}
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`Entity ${tx.entityKey} · View on Braga Explorer`}
        className="shrink-0 flex items-center gap-1.5 text-[11px] text-sv-dim hover:text-sv-blue transition-colors duration-150 group"
      >
        <span className="hidden md:inline text-sv-dim/60 group-hover:text-sv-blue/60">entity</span>
        <span className="font-mono">{shortKey}</span>
        <ExternalLink className="w-2.5 h-2.5" />
      </a>

    </div>
  )
}
