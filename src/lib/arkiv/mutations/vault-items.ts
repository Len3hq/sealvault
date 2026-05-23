import { buildVaultItemEntity } from "../schemas"
import { DEFAULT_TX_PARAMS } from "../constants"
import type { WalletClient, BuildVaultItemParams } from "../types"

export async function createVaultItem(
  walletClient: WalletClient,
  params: BuildVaultItemParams
): Promise<{ entityKey: string }> {
  const entity = buildVaultItemEntity(params)
  const result = await walletClient.createEntity(entity, DEFAULT_TX_PARAMS)
  return { entityKey: result.entityKey }
}

export async function deleteVaultItem(
  walletClient: WalletClient,
  entityKey: string
): Promise<void> {
  await walletClient.deleteEntity({ entityKey: entityKey as `0x${string}` }, DEFAULT_TX_PARAMS)
}
