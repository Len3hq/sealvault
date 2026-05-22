import type {
  CreateEntityParameters,
  UpdateEntityParameters,
  DeleteEntityParameters,
  ExtendEntityParameters,
  MutateEntitiesParameters,
  MutateEntitiesReturnType,
  CreateEntityReturnType,
  Entity,
} from "@arkiv-network/sdk"
import type { VaultCategory, GrantStatus } from "./constants"

// Re-export SDK types used across the codebase
export type { Entity, CreateEntityParameters }

// ─── Minimal WalletClient interface ───────────────────────────────────────────
// Matches the Arkiv SDK wallet actions — keeps mutation functions testable.
// The real WalletArkivClient from the SDK satisfies this interface.

export interface WalletClient {
  createEntity(params: CreateEntityParameters): Promise<CreateEntityReturnType>
  updateEntity(params: UpdateEntityParameters): Promise<void>
  deleteEntity(params: DeleteEntityParameters): Promise<void>
  mutateEntities(params: MutateEntitiesParameters): Promise<MutateEntitiesReturnType>
  extendEntity(params: ExtendEntityParameters): Promise<void>
}

// ─── Vault Item ───────────────────────────────────────────────────────────────

export interface VaultItemPayload {
  ciphertext: string
  iv: string
  wrappedItemKey: string
  wrapIv: string
  version: number
}

export interface VaultItemMeta {
  label: string
  category: VaultCategory
  fileType: string
  sizeBytes: number
}

export interface BuildVaultItemParams extends VaultItemMeta {
  encryptedPayload: VaultItemPayload
  ownerAddress: string
}

// ─── Access Grant ─────────────────────────────────────────────────────────────

export interface AccessGrantPayload {
  grantCiphertext: string
  grantIv: string
  label?: string    // document display name shown to grantee
  fileType?: string // MIME type for rendering (e.g. "application/pdf")
}

export interface BuildAccessGrantParams {
  accessGrantPayload: AccessGrantPayload
  tokenHash: string
  parentVaultItemKey: string
  grantedByAddress: string
  purpose: string
  durationSeconds: number
}

// ─── Agent Memory: Grant Record ───────────────────────────────────────────────

export interface GrantRecordPayload {
  summary: string
  context: string
  outcome: string | null
}

export interface BuildGrantRecordParams {
  granteeName: string
  parentVaultItemKey: string
  grantEntityKey: string
  status: GrantStatus
  category: VaultCategory
  purpose: string
  durationSeconds: number
}

// ─── Agent Memory: Contact ────────────────────────────────────────────────────

export interface ContactPayload {
  notes: string
}

export interface BuildContactParams {
  name: string
  email?: string
  tags?: string[]
  notes?: string
}
