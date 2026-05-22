"use client"

import { useRef, useEffect, FormEvent } from "react"
import { isToolUIPart, isTextUIPart, getToolName } from "ai"
import { useVaultAuth } from "@/hooks/use-vault-auth"
import { useArkivWallet } from "@/hooks/use-arkiv-wallet"
import { useAgentChat } from "@/hooks/use-agent-chat"
import type { UIMessage, UIMessagePart, UIDataTypes, UITools } from "ai"

// ─── Tool state badge ──────────────────────────────────────────────────────────

function ToolBadge({ part }: { part: UIMessagePart<UIDataTypes, UITools> }) {
  if (!isToolUIPart(part)) return null

  const toolName = getToolName(part)
  const label = toolName.replace(/_/g, " ")
  const isWrite = [
    "grant_access",
    "revoke_access",
    "extend_access",
    "save_contact",
    "delete_vault_item",
  ].includes(toolName)

  const inv = part as unknown as {
    state: string
    output?: unknown
    errorText?: string
  }

  if (inv.state === "input-streaming" || inv.state === "input-available") {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-400 border border-slate-700 rounded-lg px-3 py-2">
        <div className="w-3 h-3 rounded-full border border-amber-400 border-t-transparent animate-spin" />
        <span className={isWrite ? "text-amber-400" : ""}>
          {isWrite ? "Executing: " : "Querying: "}
          {label}
        </span>
      </div>
    )
  }

  if (inv.state === "output-available") {
    const result = inv.output as Record<string, unknown> | undefined
    const magicLink = result?.magicLink as string | undefined
    return (
      <div className="mt-2 text-xs border border-slate-700 rounded-lg px-3 py-2 space-y-1">
        <div className="flex items-center gap-1.5 text-emerald-400">
          <span>✓</span>
          <span>{label} complete</span>
        </div>
        {magicLink && (
          <div className="mt-1">
            <p className="text-slate-400 mb-1">Magic link:</p>
            <a
              href={magicLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 underline break-all"
            >
              {magicLink}
            </a>
          </div>
        )}
      </div>
    )
  }

  if (inv.state === "output-error") {
    return (
      <div className="mt-2 text-xs text-red-400 border border-red-800 rounded-lg px-3 py-2">
        <span className="font-medium">{label}</span> failed
        {inv.errorText && (
          <p className="mt-0.5 text-red-500">{inv.errorText}</p>
        )}
      </div>
    )
  }

  return null
}

// ─── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user"

  const textParts = message.parts.filter(isTextUIPart)
  const toolParts = message.parts.filter(isToolUIPart)

  const text = textParts.map((p) => p.text).join("")

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-amber-500 text-slate-900"
            : "bg-slate-800 border border-slate-700 text-slate-200"
        }`}
      >
        {text && <p className="whitespace-pre-wrap break-words">{text}</p>}
        {toolParts.map((p, i) => (
          <ToolBadge key={i} part={p} />
        ))}
      </div>
    </div>
  )
}

// ─── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 flex gap-1 items-center">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Suggested prompts ─────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "What documents do I have?",
  "Who has access to my files right now?",
  "Show my grant history",
]

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const { isAuthenticated, isVaultReady, masterKey, walletAddress, login } = useVaultAuth()
  const walletClient = useArkivWallet()

  const { messages, sendMessage, status, error } = useAgentChat({
    masterKey,
    walletAddress,
    walletClient,
  })

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const isStreaming = status === "streaming" || status === "submitted"

  function submit(text: string) {
    if (!text.trim() || isStreaming) return
    sendMessage({ text: text.trim() })
    if (inputRef.current) inputRef.current.value = ""
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    submit(inputRef.current?.value ?? "")
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit(inputRef.current?.value ?? "")
    }
  }

  // ── Not logged in ──
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <span className="text-2xl">🔐</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-50">SealVault Agent</h1>
          <p className="text-slate-400 text-sm">
            Sign in to manage your encrypted documents with AI assistance.
          </p>
          <button
            onClick={login}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold transition-colors text-sm"
          >
            Sign in
          </button>
        </div>
      </main>
    )
  }

  // ── Vault unlocking ──
  if (!isVaultReady) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-6 h-6 mx-auto rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          <p className="text-slate-400 text-sm">Unlocking vault…</p>
        </div>
      </main>
    )
  }

  // ── Chat ──
  return (
    <main className="flex flex-col h-screen max-w-3xl mx-auto px-4">
      {/* Header */}
      <div className="flex items-center gap-3 py-4 border-b border-slate-800 shrink-0">
        <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-sm font-bold">
          S
        </div>
        <div>
          <h1 className="text-sm font-semibold text-slate-100">SealVault Agent</h1>
          <p className="text-xs text-slate-500">
            {walletClient ? "Vault unlocked · ready" : "Connecting wallet…"}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <p className="text-slate-400 text-sm">
              Ask me about your documents or active shares.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => submit(prompt)}
                  className="px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {isStreaming && <TypingIndicator />}

        {error && (
          <div className="text-center text-red-400 text-xs py-2">
            Something went wrong — try again.
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="py-4 border-t border-slate-800 shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            rows={1}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="Ask about your vault…"
            className="flex-1 resize-none rounded-xl bg-slate-800 border border-slate-700 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50 transition-colors disabled:opacity-50"
            style={{ maxHeight: "160px", overflowY: "auto" }}
          />
          <button
            type="submit"
            disabled={isStreaming}
            className="px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-2 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </form>
    </main>
  )
}
