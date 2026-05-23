"use client"

import { useRef, useEffect, FormEvent } from "react"
import { isToolUIPart, isTextUIPart, getToolName } from "ai"
import { useVaultAuth } from "@/hooks/use-vault-auth"
import { useAgentChat } from "@/hooks/use-agent-chat"
import type { UIMessage, UIMessagePart, UIDataTypes, UITools } from "ai"
import { Send, Bot, Check, ExternalLink } from "lucide-react"

// ─── Tool state badge ──────────────────────────────────────────────────────────

function ToolBadge({ part }: { part: UIMessagePart<UIDataTypes, UITools> }) {
  if (!isToolUIPart(part)) return null

  const toolName = getToolName(part)
  const label = toolName.replace(/_/g, " ").toUpperCase()
  const isWrite = [
    "grant_access", "revoke_access", "extend_access", "save_contact", "delete_vault_item",
  ].includes(toolName)

  const inv = part as unknown as { state: string; output?: unknown; errorText?: string }

  if (inv.state === "input-streaming" || inv.state === "input-available") {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px] text-sv-muted border border-sv-border px-3 py-2 bg-sv-surface">
        <div className="w-3 h-3 border border-sv-blue border-t-transparent animate-spin shrink-0" />
        <span className={isWrite ? "text-sv-blue" : ""}>
          {isWrite ? "EXECUTING: " : "QUERYING: "}{label}
        </span>
      </div>
    )
  }

  if (inv.state === "output-available") {
    const result = inv.output as Record<string, unknown> | undefined
    const magicLink = result?.magicLink as string | undefined
    return (
      <div className="mt-2 text-[11px] border border-emerald-200 px-3 py-2 bg-emerald-50 space-y-1.5">
        <div className="flex items-center gap-1.5 text-emerald-700">
          <Check className="w-3 h-3" />
          <span className="font-medium">{label} COMPLETE</span>
        </div>
        {magicLink && (
          <div className="pt-0.5">
            <p className="text-sv-muted mb-1">Share link:</p>
            <a
              href={magicLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sv-blue hover:text-sv-blue-li underline break-all transition-colors"
            >
              {magicLink}
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
        )}
      </div>
    )
  }

  if (inv.state === "output-error") {
    return (
      <div className="mt-2 text-[11px] text-rose-700 border border-rose-200 px-3 py-2 bg-rose-50">
        <span className="font-medium">{label}</span> FAILED
        {inv.errorText && <p className="mt-0.5 text-rose-500">{inv.errorText}</p>}
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
    <div className={`flex gap-2.5 animate-slide-up ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-6 h-6 border border-sv-border bg-sv-surface flex items-center justify-center shrink-0 mt-1">
          <Bot className="w-3 h-3 text-sv-muted" />
        </div>
      )}
      <div
        className={`max-w-[78%] px-4 py-3 text-xs leading-relaxed border ${
          isUser
            ? "bg-sv-blue border-sv-blue text-white"
            : "bg-sv-bg border-sv-border text-sv-text"
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
    <div className="flex gap-2.5 justify-start animate-fade-in">
      <div className="w-6 h-6 border border-sv-border bg-sv-surface flex items-center justify-center shrink-0 mt-1">
        <Bot className="w-3 h-3 text-sv-muted" />
      </div>
      <div className="bg-sv-bg border border-sv-border px-4 py-3 flex gap-1.5 items-center">
        {[0, 150, 300].map((delay) => (
          <div
            key={delay}
            className="w-1.5 h-1.5 bg-sv-dim animate-bounce"
            style={{ animationDelay: `${delay}ms`, animationDuration: "900ms" }}
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
  "Show my active share links",
]

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const { isAuthenticated, isVaultReady, masterKey, walletAddress, signature, login } = useVaultAuth()

  const { messages, sendMessage, status, error } = useAgentChat({
    masterKey,
    walletAddress,
    signature,
  })

  const inputRef  = useRef<HTMLTextAreaElement>(null)
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

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-5 max-w-sm animate-scale-in">
          <div className="w-12 h-12 mx-auto border border-sv-border bg-sv-surface flex items-center justify-center">
            <Bot className="w-5 h-5 text-sv-dim" />
          </div>
          <div className="space-y-2">
            <h1 className="text-sm font-bold text-sv-text uppercase tracking-wide">[ SEALVAULT AGENT ]</h1>
            <p className="text-sv-muted text-xs leading-relaxed">
              Sign in to manage your encrypted documents with AI assistance.
            </p>
          </div>
          <button
            onClick={login}
            className="px-6 py-2.5 bg-sv-blue hover:bg-sv-blue-li text-white font-medium transition-colors duration-150 text-xs"
          >
            Sign in
          </button>
        </div>
      </main>
    )
  }

  if (!isVaultReady) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-5 h-5 mx-auto border-2 border-sv-blue border-t-transparent animate-spin" />
          <p className="text-sv-dim text-xs">Unlocking vault…</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex flex-col h-[calc(100dvh-57px)] max-w-3xl mx-auto px-4">

      {/* Header */}
      <div className="flex items-center gap-3 py-4 border-b border-sv-border shrink-0">
        <div className="w-8 h-8 border border-sv-border bg-sv-surface flex items-center justify-center">
          <Bot className="w-4 h-4 text-sv-muted" />
        </div>
        <div>
          <p className="text-xs font-bold text-sv-text uppercase tracking-wide">[ SEALVAULT AGENT ]</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-1.5 h-1.5 ${masterKey ? "bg-emerald-500" : "bg-sv-dim"}`} />
            <p className="text-[11px] text-sv-dim">
              {masterKey ? "Vault unlocked · ready" : "Connecting…"}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-14 space-y-6 animate-fade-in">
            <div className="space-y-1">
              <p className="text-sv-text text-xs font-bold uppercase tracking-widest">[ HOW CAN I HELP? ]</p>
              <p className="text-sv-muted text-xs">Ask me about your documents or active shares.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((prompt, i) => (
                <button
                  key={prompt}
                  onClick={() => submit(prompt)}
                  className="px-3 py-1.5 border border-sv-border bg-sv-surface hover:border-sv-blue hover:text-sv-blue text-sv-muted text-[11px] transition-colors duration-150 animate-slide-up"
                  style={{ animationDelay: `${i * 60}ms` }}
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
          <div className="text-center text-rose-600 text-[11px] py-2 animate-fade-in">
            Something went wrong — try again.
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="py-4 border-t border-sv-border shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            rows={1}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="Ask about your vault…"
            className="flex-1 resize-none bg-sv-bg border border-sv-border px-4 py-3 text-xs text-sv-text placeholder:text-sv-dim focus:outline-none focus:border-sv-blue transition-colors duration-150 disabled:opacity-50"
            style={{ maxHeight: "160px", overflowY: "auto" }}
          />
          <button
            type="submit"
            disabled={isStreaming}
            className="p-3 bg-sv-blue hover:bg-sv-blue-li text-white transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-sv-dim mt-2 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </form>

    </main>
  )
}
