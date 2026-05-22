import { createPublicClient, http, type WalletArkivClient } from "@arkiv-network/sdk"
import { braga } from "@arkiv-network/sdk/chains"

// Singleton public client — read-only, safe in browser, no wallet needed
export const publicClient = createPublicClient({
  chain: braga,
  transport: http(),
})

export type PublicClientType = typeof publicClient

// WalletArkivClient is the full wallet client type from the SDK.
// Exported so Privy (Phase 2) can type the client it creates.
export type { WalletArkivClient }
