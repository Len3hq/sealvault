"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { subscribeSealVaultEvents } from "@/lib/arkiv/events/subscription"
import { publicClient } from "@/lib/arkiv/client"
import { useVaultAuth } from "./use-vault-auth"

export function useGrantExpiry(ownerAddress: string | undefined) {
  const { signature } = useVaultAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!ownerAddress || !signature) return

    let unsub: (() => void) | undefined

    subscribeSealVaultEvents(publicClient, ownerAddress, {
      onGrantExpired: async (grantEntityKey) => {
        // Notify relay to update the audit record status
        try {
          await fetch("/api/relay/grant", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-owner-address": ownerAddress,
              "x-signature": signature,
            },
            body: JSON.stringify({ grantEntityKey }),
          })
        } catch { /* non-fatal */ }
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
  }, [ownerAddress, signature, queryClient])
}
