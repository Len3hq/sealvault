"use client"

import { useQuery } from "@tanstack/react-query"
import { queryActiveGrantsByOwner } from "@/lib/arkiv/queries"
import { useVaultAuth } from "./use-vault-auth"

export function useActiveGrants() {
  const { walletAddress, publicClient } = useVaultAuth()

  return useQuery({
    queryKey: ["grants", walletAddress],
    queryFn: () => queryActiveGrantsByOwner(publicClient, walletAddress!),
    enabled: !!walletAddress,
    select: (result) => result.entities,
    staleTime: 30_000,
  })
}
