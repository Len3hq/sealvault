"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { subscribeSealVaultEvents } from "@/lib/arkiv/events/subscription"
import { publicClient } from "@/lib/arkiv/client"
import type { WalletClient } from "@/lib/arkiv/types"

/**
 * Subscribes to on-chain grant lifecycle events while mounted.
 * Updates the grants query cache when a grant expires or is deleted externally.
 * Also triggers updateGrantRecordStatus so audit records stay accurate.
 */
export function useGrantExpiry(
  walletClient: WalletClient | null,
  ownerAddress: string | undefined
) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!walletClient || !ownerAddress) return

    let unsub: (() => void) | undefined

    subscribeSealVaultEvents(publicClient, walletClient, ownerAddress, {
      onGrantExpired: () => {
        queryClient.invalidateQueries({ queryKey: ["grants"] })
      },
      onGrantRevoked: () => {
        queryClient.invalidateQueries({ queryKey: ["grants"] })
      },
      onError: (err) => {
        console.error("[grant-expiry]", err)
      },
    }).then((fn) => {
      unsub = fn
    })

    return () => {
      unsub?.()
    }
  }, [walletClient, ownerAddress, queryClient])
}
