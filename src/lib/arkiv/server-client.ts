import { createWalletClient, http } from "@arkiv-network/sdk"
import { braga } from "@arkiv-network/sdk/chains"
import { privateKeyToAccount } from "viem/accounts"
import type { WalletArkivClient } from "./client"

export function getRelayerClient(): WalletArkivClient {
  const key = process.env.RELAYER_PRIVATE_KEY
  if (!key) throw new Error("RELAYER_PRIVATE_KEY not configured")
  const normalized = key.startsWith("0x") ? key : `0x${key}`
  const account = privateKeyToAccount(normalized as `0x${string}`)
  return createWalletClient({
    account,
    chain: braga,
    transport: http(),
  }) as unknown as WalletArkivClient
}
