"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useVaultAuth } from "@/hooks/use-vault-auth"
import { queryConversationMemories } from "@/lib/arkiv/queries/agent-memory"
import { publicClient } from "@/lib/arkiv/client"
import { ConversationMemoryPayloadSchema } from "@/lib/arkiv/payload-schemas"
import { BRAGA } from "@/lib/arkiv/constants"
import { relayDelete } from "@/lib/relay"
import { Brain, Trash2, ExternalLink, Bot } from "lucide-react"
import type { Entity } from "@arkiv-network/sdk"

function parseMemory(e: Entity) {
  const attrs = (e.attributes as Array<{ key: string; value: string | number }>) ?? []
  const get = (k: string) => attrs.find((a) => a.key === k)?.value

  const recordedAt = Number(get("recorded_at") ?? 0)
  const topic      = String(get("topic") ?? "")
  const actionCount = Number(get("action_count") ?? 0)

  let payload: { summary: string; keyFacts: string[]; actions: string[] } | null = null
  if (e.payload) {
    try {
      const raw = JSON.parse(new TextDecoder().decode(e.payload))
      const p = ConversationMemoryPayloadSchema.safeParse(raw)
      if (p.success) payload = p.data
    } catch { /* ignore */ }
  }

  return { key: String(e.key), recordedAt, topic, actionCount, payload }
}

function MemoryCard({
  memory,
  onDelete,
  isDeleting,
}: {
  memory: ReturnType<typeof parseMemory>
  onDelete: () => void
  isDeleting: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const date = new Date(memory.recordedAt).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  })
  const time = new Date(memory.recordedAt).toLocaleTimeString(undefined, {
    hour: "2-digit", minute: "2-digit",
  })
  const explorerUrl = `${BRAGA.explorerUrl}/entity/${memory.key}`

  return (
    <div className="border border-sv-border bg-sv-bg p-4 space-y-3 card-lift hover:border-sv-border-hi">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-sv-text leading-relaxed">
            {memory.payload?.summary ?? memory.topic}
          </p>
          <div className="flex items-center gap-3 text-[11px] text-sv-dim">
            <span className="tabular-nums">{date} · {time}</span>
            {memory.actionCount > 0 && (
              <span>{memory.actionCount} action{memory.actionCount !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="shrink-0 p-1.5 text-sv-dim hover:text-rose-600 hover:border-rose-200 border border-transparent transition-colors duration-150 disabled:opacity-40"
          title="Delete this memory"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {memory.payload && (memory.payload.keyFacts.length > 0 || memory.payload.actions.length > 0) && (
        <div>
          <button
            onClick={() => setExpanded((x) => !x)}
            className="text-[11px] text-sv-blue hover:text-sv-blue-li transition-colors"
          >
            {expanded ? "Hide details ↑" : "Show details ↓"}
          </button>
          {expanded && (
            <div className="mt-2 space-y-2 animate-fade-in">
              {memory.payload.actions.length > 0 && (
                <div>
                  <p className="text-[11px] text-sv-dim uppercase tracking-widest mb-1">Actions</p>
                  <ul className="space-y-0.5">
                    {memory.payload.actions.map((a, i) => (
                      <li key={i} className="text-[11px] text-sv-muted flex gap-1.5">
                        <span className="text-sv-blue">·</span>{a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {memory.payload.keyFacts.length > 0 && (
                <div>
                  <p className="text-[11px] text-sv-dim uppercase tracking-widest mb-1">Key facts</p>
                  <ul className="space-y-0.5">
                    {memory.payload.keyFacts.map((f, i) => (
                      <li key={i} className="text-[11px] text-sv-muted flex gap-1.5">
                        <span className="text-sv-dim">·</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-[11px] text-sv-dim hover:text-sv-blue transition-colors font-mono"
      >
        entity {memory.key.slice(0, 8)}…{memory.key.slice(-6)}
        <ExternalLink className="w-2.5 h-2.5" />
      </a>
    </div>
  )
}

export default function MemoryPage() {
  const { isAuthenticated, walletAddress, signature } = useVaultAuth()
  const queryClient = useQueryClient()

  const { data: memories, isLoading } = useQuery({
    queryKey: ["agent-memories", walletAddress],
    queryFn: async () => {
      const result = await queryConversationMemories(publicClient, walletAddress!, 50)
      return result.entities.map(parseMemory)
    },
    enabled: !!walletAddress,
    staleTime: 60_000,
  })

  const deleteMutation = useMutation({
    mutationFn: async (entityKey: string) => {
      if (!walletAddress || !signature) throw new Error("Not authenticated")
      await relayDelete("/api/relay/agent-memory", { entityKey }, walletAddress, signature)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-memories", walletAddress] })
    },
  })

  if (!isAuthenticated) {
    return (
      <main className="min-h-[calc(100dvh-57px)] flex items-center justify-center">
        <div className="text-center space-y-4 animate-scale-in">
          <p className="text-sv-muted text-xs">Please sign in to view your agent memory.</p>
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
      <div className="pb-4 border-b border-sv-border space-y-1">
        <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ AGENT MEMORY ]</p>
        <h1 className="text-lg font-bold text-sv-text">
          {isLoading ? "Memories" : `${memories?.length ?? 0} memor${(memories?.length ?? 0) !== 1 ? "ies" : "y"}`}
        </h1>
        <p className="text-xs text-sv-muted leading-relaxed max-w-lg">
          Every memory is an on-chain entity you own. The agent reads these at the start of each session to maintain context. Delete any memory and the agent will never reference it again.
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-sv-blue border-t-transparent animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && (memories?.length ?? 0) === 0 && (
        <div className="flex flex-col items-center justify-center py-20 space-y-5 text-center animate-scale-in">
          <div className="w-12 h-12 border border-sv-border bg-sv-surface flex items-center justify-center">
            <Brain className="w-5 h-5 text-sv-dim" />
          </div>
          <div className="space-y-1">
            <p className="text-sv-text text-sm font-bold uppercase tracking-wide">No memories yet</p>
            <p className="text-sv-muted text-xs max-w-xs leading-relaxed">
              Memories are created automatically when you perform actions via the agent — sharing documents, revoking access, and similar.
            </p>
          </div>
          <Link
            href="/agent"
            className="flex items-center gap-2 py-2 px-4 border border-sv-border text-sv-muted text-xs hover:border-sv-blue hover:text-sv-blue transition-colors duration-150"
          >
            <Bot className="w-3.5 h-3.5" />
            Open agent
          </Link>
        </div>
      )}

      {/* Memory list */}
      {!isLoading && (memories?.length ?? 0) > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-slide-up">
          {memories!.map((m) => (
            <MemoryCard
              key={m.key}
              memory={m}
              onDelete={() => deleteMutation.mutate(m.key)}
              isDeleting={deleteMutation.isPending && deleteMutation.variables === m.key}
            />
          ))}
        </div>
      )}

      {!isLoading && (memories?.length ?? 0) > 0 && (
        <p className="text-[11px] text-sv-dim text-center">
          Memories expire automatically after 1 year. Delete early to remove from agent context immediately.
        </p>
      )}

    </main>
  )
}
