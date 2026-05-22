"use client"

import { useCallback, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai"
import type { ChatOnToolCallCallback } from "ai"
import {
  revokeAccessGrant,
  extendAccessGrant,
  saveContact,
  deleteVaultItemWithGrants,
  updateGrantRecordStatus,
} from "@/lib/arkiv/mutations"
import { queryVaultItemByKey, queryGrantRecordByGrantEntity } from "@/lib/arkiv/queries"
import { createMagicLinkGrant } from "@/lib/vault"
import { publicClient } from "@/lib/arkiv/client"
import { GRANT_STATUS, VAULT_CATEGORIES } from "@/lib/arkiv/constants"
import type { VaultCategory } from "@/lib/arkiv/constants"
import type { VaultItemPayload } from "@/lib/arkiv/types"
import type { WalletArkivClient } from "@/lib/arkiv/client"

interface UseAgentChatOptions {
  masterKey: CryptoKey | null
  walletAddress: string | undefined
  walletClient: WalletArkivClient | null
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
  walletClient,
}: UseAgentChatOptions) {
  // Stable ref so the async onToolCall handler always sees the latest addToolOutput
  const addOutputRef = useRef<AnyAddOutput | null>(null)

  // Stable ref for walletAddress so the transport closure never captures a stale value
  const walletAddressRef = useRef(walletAddress)
  walletAddressRef.current = walletAddress

  // Transport created once — uses ref to inject the current walletAddress per request
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/agent",
        prepareSendMessagesRequest: ({ body }) => ({
          body: { ...(body ?? {}), ownerAddress: walletAddressRef.current },
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

      if (!masterKey || !walletAddress || !walletClient) {
        emitError("Vault is locked — please wait for the vault to unlock.")
        return
      }

      const wc = walletClient as unknown as import("@/lib/arkiv/types").WalletClient

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

            const vaultItemPayload = JSON.parse(
              new TextDecoder().decode(entity.payload)
            ) as VaultItemPayload

            const attrList = (entity.attributes ?? []) as Array<{
              key: string
              value: string | number
            }>
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
              walletClient: wc,
              ownerAddress: walletAddress,
              vaultItemKey,
              label,
              fileType,
              category,
              granteeName,
              purpose,
              durationSeconds,
            })

            const origin =
              typeof window !== "undefined" ? window.location.origin : ""
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

            const grantRecord = await queryGrantRecordByGrantEntity(
              publicClient,
              grantEntityKey,
              walletAddress
            )

            await revokeAccessGrant(wc, grantEntityKey)

            if (grantRecord) {
              await updateGrantRecordStatus(
                wc,
                grantRecord,
                GRANT_STATUS.REVOKED,
                "Manually revoked by owner"
              )
            }

            emit({ success: true, revokedGrantKey: grantEntityKey, granteeName })
            break
          }

          case "extend_access": {
            const { grantEntityKey, additionalSeconds } = tc.args as {
              grantEntityKey: string
              additionalSeconds: number
            }
            await extendAccessGrant(wc, grantEntityKey, additionalSeconds)
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
            const { entityKey } = await saveContact(wc, { name, email, tags, notes })
            emit({ success: true, entityKey, name, email, tags })
            break
          }

          case "delete_vault_item": {
            const { vaultItemKey, label } = tc.args as {
              vaultItemKey: string
              label?: string
            }
            const { deletedGrants } = await deleteVaultItemWithGrants(
              publicClient,
              wc,
              vaultItemKey,
              walletAddress
            )
            emit({ success: true, vaultItemKey, label, deletedGrants })
            break
          }

          default:
            break
        }
      } catch (err) {
        emitError(err instanceof Error ? err.message : String(err))
      }
    },
    [masterKey, walletAddress, walletClient]
  )

  const chat = useChat({
    transport,
    onToolCall,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  })

  // Wire the latest addToolOutput into the stable ref each render
  addOutputRef.current = chat.addToolOutput as unknown as AnyAddOutput

  return chat
}
