export { createVaultItem, deleteVaultItem, MAX_VAULT_ITEM_BYTES } from "./vault-items"

export {
  createAccessGrant,
  revokeAccessGrant,
  extendAccessGrant,
  createGrantRecord,
  updateGrantRecordStatus,
  batchCreateAccessGrants,
} from "./access-grants"

export {
  deleteVaultItemWithGrants,
  handleGrantExpiry,
} from "./lifecycle"

export { saveContact } from "./agent-memory"
