"use client"

import { useWallets } from "@privy-io/react-auth"
import { useMemo } from "react"
import { createWalletClient, custom } from "@arkiv-network/sdk"
import { braga } from "@arkiv-network/sdk/chains"
import type { WalletArkivClient } from "@/lib/arkiv/client"

/**
 * Returns a WalletArkivClient wired to the Privy embedded wallet.
 * Returns null if the embedded wallet is not yet connected.
 *
 * The client is memoized by wallet address — it does not re-create on
 * every render unless the active wallet changes.
 */
export function useArkivWallet(): WalletArkivClient | null {
  const { wallets } = useWallets()

  const embeddedWallet = wallets.find(
    (w) => w.walletClientType === "privy" || w.walletClientType === "privy-v2"
  )

  const walletClient = useMemo(() => {
    if (!embeddedWallet) return null

    return createWalletClient({
      chain: braga,
      transport: custom({
        request: async (args: { method: string; params?: unknown[] }) => {
          const provider = await embeddedWallet.getEthereumProvider()
          return provider.request(args)
        },
      }),
    }) as WalletArkivClient
  }, [embeddedWallet])

  return walletClient
}
