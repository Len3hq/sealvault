"use client"

import { useQuery } from "@tanstack/react-query"
import { queryVaultItems } from "@/lib/arkiv/queries"
import { useVaultAuth } from "./use-vault-auth"
import type { VaultCategory } from "@/lib/arkiv/constants"

export function useVaultItems(options?: { category?: VaultCategory }) {
  const { walletAddress, publicClient } = useVaultAuth()

  return useQuery({
    queryKey: ["vault-items", walletAddress, options?.category],
    queryFn: () => queryVaultItems(publicClient, walletAddress!, options),
    enabled: !!walletAddress,
    select: (result) => result.entities,
    staleTime: 5 * 60 * 1000,      // treat chain data as fresh for 5 min
    refetchOnWindowFocus: false,    // don't re-hit the chain on tab switch
  })
}
