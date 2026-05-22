import { buildContactEntity } from "../schemas"
import type { WalletClient, BuildContactParams } from "../types"

export async function saveContact(
  walletClient: WalletClient,
  params: BuildContactParams
): Promise<{ entityKey: string }> {
  const entity = buildContactEntity(params)
  const result = await walletClient.createEntity(entity)
  return { entityKey: result.entityKey }
}
