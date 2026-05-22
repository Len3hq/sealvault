import { handleGrantExpiry } from "../mutations/lifecycle"
import type { PublicClientType } from "../client"
import type { WalletClient } from "../types"

export interface SubscriptionCallbacks {
  onGrantExpired?: (grantEntityKey: string) => void
  onGrantRevoked?: (grantEntityKey: string) => void
  onError?: (error: Error) => void
}

/**
 * Subscribes to entity lifecycle events relevant to SealVault.
 * Automatically updates memory records on expiry and fires user callbacks.
 * Returns a promise that resolves to an unsubscribe function.
 * Call the returned function on component unmount.
 */
export async function subscribeSealVaultEvents(
  publicClient: PublicClientType,
  walletClient: WalletClient,
  ownerAddress: string,
  callbacks: SubscriptionCallbacks = {}
): Promise<() => void> {
  const { onGrantExpired, onGrantRevoked, onError } = callbacks

  // subscribeEntityEvents returns Promise<() => void>
  const unsubscribe = await publicClient.subscribeEntityEvents(
    {
      onEntityExpired: async (event) => {
        try {
          await handleGrantExpiry(
            publicClient,
            walletClient,
            String(event.entityKey),
            ownerAddress
          )
          onGrantExpired?.(String(event.entityKey))
        } catch (err) {
          onError?.(err instanceof Error ? err : new Error(String(err)))
        }
      },

      onEntityDeleted: (event) => {
        onGrantRevoked?.(String(event.entityKey))
      },

      onError: (err) => {
        onError?.(err)
      },
    },
    30_000 // pollingInterval in ms — second positional argument
  )

  return unsubscribe
}
