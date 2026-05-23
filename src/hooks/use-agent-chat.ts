"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai"
import type { ChatOnToolCallCallback } from "ai"
import { relayDelete, relayPatch } from "@/lib/relay"
import { queryVaultItemByKey } from "@/lib/arkiv/queries"
import { createMagicLinkGrant } from "@/lib/vault"
import { publicClient } from "@/lib/arkiv/client"
import { VAULT_CATEGORIES } from "@/lib/arkiv/constants"
import type { VaultCategory } from "@/lib/arkiv/constants"
import { VaultItemPayloadSchema, parseEntityPayload } from "@/lib/arkiv/payload-schemas"

interface UseAgentChatOptions {
  masterKey: CryptoKey | null
  walletAddress: string | undefined
  signature: string | null
}

type AnyAddOutput = (args: {
  tool: string
  toolCallId: string
  output?: unknown
  state?: "output-error"
  errorText?: string
}) => void

export function useAgentChat({
  masterKey,
  walletAddress,
  signature,
}: UseAgentChatOptions) {
  const addOutputRef    = useRef<AnyAddOutput | null>(null)
  const writeActionsRef = useRef<string[]>([])
  const memorySavedRef  = useRef(false)
  const [memorySaved, setMemorySaved] = useState(false)

  const walletAddressRef = useRef(walletAddress)
  walletAddressRef.current = walletAddress

  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/agent",
        prepareSendMessagesRequest: ({ body, messages }) => ({
          body: { ...(body ?? {}), messages, ownerAddress: walletAddressRef.current },
        }),
      })
  )

  const onToolCall = useCallback<ChatOnToolCallCallback>(
    async ({ toolCall }) => {
      const tc = toolCall as unknown as {
        toolName: string
        toolCallId: string
        args: Record<string, unknown>
      }

      const emit = (output: unknown) =>
        addOutputRef.current?.({ tool: tc.toolName, toolCallId: tc.toolCallId, output })

      const emitError = (msg: string) =>
        addOutputRef.current?.({
          tool: tc.toolName,
          toolCallId: tc.toolCallId,
          state: "output-error",
          errorText: msg,
        })

      if (!masterKey || !walletAddress || !signature) {
        emitError("Vault is locked — please wait for the vault to unlock.")
        return
      }

      try {
        switch (tc.toolName) {
          case "grant_access": {
            const { vaultItemKey, granteeName, purpose, durationSeconds } = tc.args as {
              vaultItemKey: string
              granteeName: string
              purpose: string
              durationSeconds: number
            }

            const entity = await queryVaultItemByKey(publicClient, vaultItemKey, walletAddress)
            if (!entity?.payload) {
              emitError(`Vault item not found: ${vaultItemKey}`)
              return
            }

            const vaultItemPayload = parseEntityPayload(VaultItemPayloadSchema, entity.payload)

            const attrList = (entity.attributes ?? []) as Array<{ key: string; value: string | number }>
            const getAttr = (k: string) => attrList.find((a) => a.key === k)?.value

            const label    = String(getAttr("label") ?? "Document")
            const fileType = String(getAttr("file_type") ?? "application/octet-stream")
            const rawCat   = String(getAttr("category") ?? "personal")
            const category: VaultCategory = (VAULT_CATEGORIES as readonly string[]).includes(rawCat)
              ? (rawCat as VaultCategory)
              : "personal"

            const { token } = await createMagicLinkGrant({
              vaultItemPayload,
              masterKey,
              ownerAddress: walletAddress,
              signature,
              vaultItemKey,
              label,
              fileType,
              category,
              granteeName,
              purpose,
              durationSeconds,
            })

            const origin = typeof window !== "undefined" ? window.location.origin : ""
            const magicLink = `${origin}/view/${token}`

            writeActionsRef.current.push(`Shared "${label}" with ${granteeName} for ${Math.round(durationSeconds / 3600)}h`)
            emit({
              success: true,
              granteeName,
              label,
              magicLink,
              durationSeconds,
              expiresAt: Date.now() + durationSeconds * 1000,
            })
            break
          }

          case "revoke_access": {
            const { grantEntityKey, granteeName } = tc.args as {
              grantEntityKey: string
              granteeName?: string
            }
            await relayDelete("/api/relay/grant", { grantEntityKey }, walletAddress, signature)
            writeActionsRef.current.push(`Revoked access${granteeName ? ` for ${granteeName}` : ""}`)
            emit({ success: true, revokedGrantKey: grantEntityKey, granteeName })
            break
          }

          case "extend_access": {
            const { grantEntityKey, additionalSeconds } = tc.args as {
              grantEntityKey: string
              additionalSeconds: number
            }
            await relayPatch("/api/relay/grant", { grantEntityKey, additionalSeconds }, walletAddress, signature)
            writeActionsRef.current.push(`Extended access by ${Math.round(additionalSeconds / 3600)}h`)
            emit({ success: true, grantEntityKey, additionalSeconds })
            break
          }

          case "delete_vault_item": {
            const { vaultItemKey, label } = tc.args as {
              vaultItemKey: string
              label?: string
            }
            const result = await relayDelete("/api/relay/vault-item", { vaultItemKey }, walletAddress, signature) as { deletedGrants: number }
            writeActionsRef.current.push(`Deleted document "${label ?? vaultItemKey}" (${result.deletedGrants} grants removed)`)
            emit({ success: true, vaultItemKey, label, deletedGrants: result.deletedGrants })
            break
          }

          default:
            break
        }
      } catch (err) {
        emitError(err instanceof Error ? err.message : String(err))
      }
    },
    [masterKey, walletAddress, signature]
  )

  const chat = useChat({
    transport,
    onToolCall,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  })

  addOutputRef.current = chat.addToolOutput as unknown as AnyAddOutput

  // Save memory when conversation goes idle after write actions
  useEffect(() => {
    const isIdle = chat.status !== "streaming" && chat.status !== "submitted"
    if (!isIdle) return
    if (chat.messages.length < 2) return
    if (memorySavedRef.current) return
    if (!walletAddress || !signature) return

    memorySavedRef.current = true

    fetch("/api/agent/memory", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-owner-address": walletAddress,
        "x-signature": signature,
      },
      body: JSON.stringify({
        messages: chat.messages.map((m) => {
          const text = m.parts
            ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join(" ") ?? "(tool interaction)"
          return { role: m.role, content: text }
        }),
        writeActions: writeActionsRef.current,
      }),
    })
      .then(() => setMemorySaved(true))
      .catch(() => { /* non-fatal */ })
  }, [chat.status, chat.messages, walletAddress, signature])

  return { ...chat, memorySaved }
}
