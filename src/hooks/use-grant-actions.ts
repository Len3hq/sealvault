"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createMagicLinkGrant } from "@/lib/vault"
import { relayDelete, relayPatch } from "@/lib/relay"
import { useVaultAuth } from "./use-vault-auth"
import type { VaultItemPayload } from "@/lib/arkiv/types"
import type { VaultCategory } from "@/lib/arkiv/constants"

interface CreateGrantInput {
  vaultItemPayload: VaultItemPayload
  vaultItemKey: string
  label: string
  fileType: string
  category: VaultCategory
  granteeName: string
  purpose: string
  durationSeconds: number
}

export function useCreateGrant() {
  const { masterKey, walletAddress, signature } = useVaultAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateGrantInput) => {
      if (!masterKey) throw new Error("Vault is locked")
      if (!walletAddress) throw new Error("No wallet connected")
      if (!signature) throw new Error("Wallet not signed in — please refresh")

      return createMagicLinkGrant({
        ...input,
        masterKey,
        ownerAddress: walletAddress,
        signature,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grants"] })
    },
  })
}

export function useRevokeGrant() {
  const { walletAddress, signature } = useVaultAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ grantEntityKey }: { grantEntityKey: string }) => {
      if (!walletAddress || !signature) throw new Error("Not authenticated")
      await relayDelete("/api/relay/grant", { grantEntityKey }, walletAddress, signature)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grants"] })
      queryClient.invalidateQueries({ queryKey: ["vault-items"] })
    },
  })
}

export function useExtendGrant() {
  const { walletAddress, signature } = useVaultAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ grantEntityKey, additionalSeconds }: { grantEntityKey: string; additionalSeconds: number }) => {
      if (!walletAddress || !signature) throw new Error("Not authenticated")
      await relayPatch("/api/relay/grant", { grantEntityKey, additionalSeconds }, walletAddress, signature)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grants"] })
    },
  })
}
