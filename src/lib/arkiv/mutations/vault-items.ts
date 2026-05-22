import { buildVaultItemEntity } from "../schemas"
import type { WalletClient, BuildVaultItemParams } from "../types"

export async function createVaultItem(
  walletClient: WalletClient,
  params: BuildVaultItemParams
): Promise<{ entityKey: string }> {
  const entity = buildVaultItemEntity(params)
  const result = await walletClient.createEntity(entity)
  return { entityKey: result.entityKey }
}

export async function deleteVaultItem(
  walletClient: WalletClient,
  entityKey: string
): Promise<void> {
  return walletClient.deleteEntity({ entityKey: entityKey as `0x${string}` })
}
