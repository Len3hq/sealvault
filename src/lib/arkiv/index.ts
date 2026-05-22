// Client
export { publicClient } from "./client"
export type { PublicClientType } from "./client"

// Constants
export {
  PROJECT_ATTRIBUTE,
  ENTITY_TYPES,
  ENTITY_SUBTYPES,
  EXPIRY,
  TTL,
  BRAGA,
  MIME,
  VAULT_CATEGORIES,
  GRANT_STATUS,
} from "./constants"
export type { VaultCategory, GrantStatus } from "./constants"

// Types
export type {
  Entity,
  CreateEntityParameters,
  VaultItemPayload,
  VaultItemMeta,
  BuildVaultItemParams,
  AccessGrantPayload,
  BuildAccessGrantParams,
  GrantRecordPayload,
  BuildGrantRecordParams,
  ContactPayload,
  BuildContactParams,
  WalletClient,
} from "./types"

// Schemas
export {
  buildVaultItemEntity,
  buildAccessGrantEntity,
  buildGrantRecordEntity,
  buildContactEntity,
  getAttributeValue,
} from "./schemas"

// Queries
export {
  queryVaultItems,
  queryVaultItemByKey,
  queryActiveGrantsByOwner,
  queryGrantsByVaultItem,
  queryGrantByTokenHash,
  queryContacts,
  queryGrantHistory,
  queryGrantRecordByGrantEntity,
} from "./queries"

// Mutations
export {
  createVaultItem,
  deleteVaultItem,
  createAccessGrant,
  revokeAccessGrant,
  extendAccessGrant,
  createGrantRecord,
  updateGrantRecordStatus,
  batchCreateAccessGrants,
  deleteVaultItemWithGrants,
  handleGrantExpiry,
  saveContact,
} from "./mutations"

// Events
export { subscribeSealVaultEvents } from "./events/subscription"
export type { SubscriptionCallbacks } from "./events/subscription"
