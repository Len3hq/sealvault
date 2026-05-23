import { buildContactEntity } from "../schemas"
import { DEFAULT_TX_PARAMS } from "../constants"
import type { WalletClient, BuildContactParams } from "../types"

export async function saveContact(
  walletClient: WalletClient,
  ownerAddress: string,
  params: BuildContactParams
): Promise<{ entityKey: string }> {
  const entity = buildContactEntity({ ...params, ownerAddress })
  const result = await walletClient.createEntity(entity, DEFAULT_TX_PARAMS)
  return { entityKey: result.entityKey }
}
