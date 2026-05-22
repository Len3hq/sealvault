"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useMutation } from "@tanstack/react-query"
import { queryVaultItems, queryVaultItemByKey } from "@/lib/arkiv/queries"
import { createVaultItem } from "@/lib/arkiv/mutations"
import { encryptVaultItem, decryptVaultItem } from "@/lib/crypto"
import { useVaultAuth } from "./use-vault-auth"
import type { VaultCategory } from "@/lib/arkiv/constants"
import type { VaultItemPayload } from "@/lib/arkiv/types"

export function useVaultItems(options?: { category?: VaultCategory }) {
  const { walletAddress, publicClient } = useVaultAuth()

  return useQuery({
    queryKey: ["vault-items", walletAddress, options?.category],
    queryFn: () => queryVaultItems(publicClient, walletAddress!, options),
    enabled: !!walletAddress,
    select: (result) => result.entities,
  })
}

export function useVaultItem(entityKey: string | undefined) {
  const { walletAddress, publicClient } = useVaultAuth()

  return useQuery({
    queryKey: ["vault-item", entityKey],
    queryFn: () => queryVaultItemByKey(publicClient, entityKey!, walletAddress!),
    enabled: !!entityKey && !!walletAddress,
  })
}

interface UploadParams {
  file: File
  label: string
  category: VaultCategory
}

export function useUploadVaultItem(walletClient: {
  createEntity: (...args: unknown[]) => Promise<{ entityKey: string }>
}) {
  const { masterKey, walletAddress } = useVaultAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ file, label, category }: UploadParams) => {
      if (!masterKey) throw new Error("Vault is locked — please sign in again")
      if (!walletAddress) throw new Error("No wallet connected")

      const content = await file.arrayBuffer()
      const encryptedPayload = await encryptVaultItem(content, masterKey)

      return createVaultItem(walletClient as never, {
        encryptedPayload,
        label,
        category,
        fileType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        ownerAddress: walletAddress,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault-items"] })
    },
  })
}

export async function decryptItem(
  payload: VaultItemPayload,
  masterKey: CryptoKey
): Promise<Uint8Array> {
  return decryptVaultItem(payload, masterKey)
}
