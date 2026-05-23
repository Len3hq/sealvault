import { buildConversationMemoryEntity } from "../schemas"
import { DEFAULT_TX_PARAMS } from "../constants"
import type { WalletClient, BuildConversationMemoryParams } from "../types"

export async function saveConversationMemory(
  walletClient: WalletClient,
  params: BuildConversationMemoryParams
): Promise<{ entityKey: string }> {
  const entity = buildConversationMemoryEntity(params)
  const result = await walletClient.createEntity(entity, DEFAULT_TX_PARAMS)
  return { entityKey: result.entityKey }
}
