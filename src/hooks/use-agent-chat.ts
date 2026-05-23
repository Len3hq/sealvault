"use client"

import { useCallback, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai"
import type { ChatOnToolCallCallback } from "ai"
import { relayPost, relayDelete, relayPatch } from "@/lib/relay"
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
  const addOutputRef = useRef<AnyAddOutput | null>(null)

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
            emit({ success: true, revokedGrantKey: grantEntityKey, granteeName })
            break
          }

          case "extend_access": {
            const { grantEntityKey, additionalSeconds } = tc.args as {
              grantEntityKey: string
              additionalSeconds: number
            }
            await relayPatch("/api/relay/grant", { grantEntityKey, additionalSeconds }, walletAddress, signature)
            emit({ success: true, grantEntityKey, additionalSeconds })
            break
          }

          case "save_contact": {
            const { name, email, tags, notes } = tc.args as {
              name: string
              email?: string
              tags?: string[]
              notes?: string
            }
            const result = await relayPost("/api/relay/contact", { name, email, tags, notes }, walletAddress, signature) as { entityKey: string }
            emit({ success: true, entityKey: result.entityKey, name, email, tags })
            break
          }

          case "delete_vault_item": {
            const { vaultItemKey, label } = tc.args as {
              vaultItemKey: string
              label?: string
            }
            const result = await relayDelete("/api/relay/vault-item", { vaultItemKey }, walletAddress, signature) as { deletedGrants: number }
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

  return chat
}
