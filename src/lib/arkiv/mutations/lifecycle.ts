import { queryGrantsByVaultItem, queryGrantRecordByGrantEntity } from "../queries"
import { updateGrantRecordStatus } from "./access-grants"
import { GRANT_STATUS } from "../constants"
import type { PublicClientType } from "../client"
import type { WalletClient } from "../types"

/**
 * Deletes a vault item and ALL child access grants atomically.
 * Updates memory records to "revoked" so the audit trail is preserved.
 * Prevents orphaned grant entities pointing at a deleted item.
 */
export async function deleteVaultItemWithGrants(
  publicClient: PublicClientType,
  walletClient: WalletClient,
  vaultItemKey: string,
  ownerAddress: string
): Promise<{ deletedGrants: number }> {
  // 1. Find all grants referencing this vault item
  const grantsResult = await queryGrantsByVaultItem(
    publicClient,
    vaultItemKey,
    ownerAddress
  )
  const grants = grantsResult.entities

  // 2. Mark all memory records as revoked (audit trail preserved)
  await Promise.all(
    grants.map(async (grant) => {
      const memoryRecord = await queryGrantRecordByGrantEntity(
        publicClient,
        String(grant.key),
        ownerAddress
      )
      if (memoryRecord && memoryRecord.payload) {
        await updateGrantRecordStatus(
          walletClient,
          memoryRecord,
          GRANT_STATUS.REVOKED,
          "Parent document deleted"
        )
      }
    })
  )

  // 3. Delete all child grants + the vault item itself in parallel
  const keysToDelete = [vaultItemKey, ...grants.map((g) => String(g.key))]
  await Promise.all(
    keysToDelete.map((key) =>
      walletClient.deleteEntity({ entityKey: key as `0x${string}` })
    )
  )

  return { deletedGrants: grants.length }
}

/**
 * Called when a grant expires naturally (via subscribeEntityEvents).
 * Updates the memory record status to "expired" without deleting it.
 */
export async function handleGrantExpiry(
  publicClient: PublicClientType,
  walletClient: WalletClient,
  grantEntityKey: string,
  ownerAddress: string
): Promise<void> {
  const memoryRecord = await queryGrantRecordByGrantEntity(
    publicClient,
    grantEntityKey,
    ownerAddress
  )

  if (!memoryRecord || !memoryRecord.payload) return

  await updateGrantRecordStatus(
    walletClient,
    memoryRecord,
    GRANT_STATUS.EXPIRED,
    "Expired automatically"
  )
}
