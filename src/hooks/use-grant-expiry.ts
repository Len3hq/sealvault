"use client"

import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { subscribeSealVaultEvents } from "@/lib/arkiv/events/subscription"
import { publicClient } from "@/lib/arkiv/client"
import { useVaultAuth } from "./use-vault-auth"

// Module-level set persists across component remounts within the same browser session,
// preventing duplicate PUT calls for the same grant on reconnect or StrictMode double-mount.
const processedExpiries = new Set<string>()

export function useGrantExpiry(ownerAddress: string | undefined) {
  const { signature } = useVaultAuth()
  const queryClient = useQueryClient()
  const unsubRef = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    if (!ownerAddress || !signature) return

    let cancelled = false

    subscribeSealVaultEvents(publicClient, ownerAddress, {
      onGrantExpired: async (grantEntityKey) => {
        // Skip if already handled this session
        if (processedExpiries.has(grantEntityKey)) return
        processedExpiries.add(grantEntityKey)

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
      if (cancelled) {
        fn()
      } else {
        unsubRef.current = fn
      }
    })

    return () => {
      cancelled = true
      unsubRef.current?.()
      unsubRef.current = undefined
    }
  }, [ownerAddress, signature, queryClient])
}
