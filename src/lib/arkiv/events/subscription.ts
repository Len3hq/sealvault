import type { PublicClientType } from "../client"

export interface SubscriptionCallbacks {
  onGrantExpired?: (grantEntityKey: string) => void
  onGrantRevoked?: (grantEntityKey: string) => void
  onError?: (error: Error) => void
}

export async function subscribeSealVaultEvents(
  publicClient: PublicClientType,
  ownerAddress: string,
  callbacks: SubscriptionCallbacks = {}
): Promise<() => void> {
  const { onGrantExpired, onGrantRevoked, onError } = callbacks

  const unsubscribe = await publicClient.subscribeEntityEvents(
    {
      onEntityExpired: async (event) => {
        try {
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
    30_000
  )

  return unsubscribe
}
