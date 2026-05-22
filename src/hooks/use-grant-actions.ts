"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createMagicLinkGrant } from "@/lib/vault"
import {
  revokeAccessGrant,
  extendAccessGrant,
  updateGrantRecordStatus,
} from "@/lib/arkiv/mutations"
import { GRANT_STATUS } from "@/lib/arkiv/constants"
import { useVaultAuth } from "./use-vault-auth"
import type { WalletClient, VaultItemPayload } from "@/lib/arkiv/types"
import type { VaultCategory } from "@/lib/arkiv/constants"
import type { Entity } from "@/lib/arkiv/types"

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

export function useCreateGrant(walletClient: WalletClient) {
  const { masterKey, walletAddress } = useVaultAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateGrantInput) => {
      if (!masterKey) throw new Error("Vault is locked")
      if (!walletAddress) throw new Error("No wallet connected")

      return createMagicLinkGrant({
        ...input,
        masterKey,
        walletClient,
        ownerAddress: walletAddress,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grants"] })
    },
  })
}

interface RevokeInput {
  grantEntityKey: string
  grantRecord?: Entity
}

export function useRevokeGrant(walletClient: WalletClient) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ grantEntityKey, grantRecord }: RevokeInput) => {
      // Delete the grant entity — magic link stops working immediately
      await revokeAccessGrant(walletClient, grantEntityKey)

      // Update the audit record so history reflects the revocation
      if (grantRecord?.payload) {
        await updateGrantRecordStatus(
          walletClient,
          grantRecord,
          GRANT_STATUS.REVOKED,
          "Manually revoked"
        )
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grants"] })
      queryClient.invalidateQueries({ queryKey: ["vault-items"] })
    },
  })
}

interface ExtendInput {
  grantEntityKey: string
  additionalSeconds: number
}

export function useExtendGrant(walletClient: WalletClient) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ grantEntityKey, additionalSeconds }: ExtendInput) => {
      await extendAccessGrant(walletClient, grantEntityKey, additionalSeconds)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grants"] })
    },
  })
}
