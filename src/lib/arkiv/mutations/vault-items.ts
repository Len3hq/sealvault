import { buildVaultItemEntity } from "../schemas"
import type { WalletClient, BuildVaultItemParams } from "../types"

// Braga chain enforces a 100,002-character limit on params.transaction.data.
// AES-GCM ciphertext is incompressible, so the payload is base64(file) × 4/3 + overhead.
// Solving: (size × 4/3 + ~900) × 2 ≤ 100,002 → size ≤ ~37 KB. Use 32 KB for margin.
export const MAX_VAULT_ITEM_BYTES = 32 * 1024

// Fixed gas avoids eth_estimateGas, which fails when the tx body is large.
// 50M covers any realistic vault item on Braga's high-limit chain.
const VAULT_ITEM_GAS = 50_000_000n

export async function createVaultItem(
  walletClient: WalletClient,
  params: BuildVaultItemParams
): Promise<{ entityKey: string }> {
  const entity = buildVaultItemEntity(params)
  const result = await walletClient.createEntity(entity, { gas: VAULT_ITEM_GAS })
  return { entityKey: result.entityKey }
}

export async function deleteVaultItem(
  walletClient: WalletClient,
  entityKey: string
): Promise<void> {
  await walletClient.deleteEntity({ entityKey: entityKey as `0x${string}` })
}
