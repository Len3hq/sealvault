import type {
  CreateEntityParameters,
  UpdateEntityParameters,
  DeleteEntityParameters,
  ExtendEntityParameters,
  MutateEntitiesParameters,
  MutateEntitiesReturnType,
  CreateEntityReturnType,
  UpdateEntityReturnType,
  DeleteEntityReturnType,
  ExtendEntityReturnType,
  TxParams,
  Entity,
} from "@arkiv-network/sdk"
import type { VaultCategory, GrantStatus } from "./constants"

// Re-export SDK types used across the codebase
export type { Entity, CreateEntityParameters, TxParams }

// ─── Minimal WalletClient interface ───────────────────────────────────────────
// Matches the Arkiv SDK wallet actions — keeps mutation functions testable.
// The real WalletArkivClient from the SDK satisfies this interface.

export interface WalletClient {
  createEntity(params: CreateEntityParameters, txParams?: TxParams): Promise<CreateEntityReturnType>
  updateEntity(params: UpdateEntityParameters, txParams?: TxParams): Promise<UpdateEntityReturnType>
  deleteEntity(params: DeleteEntityParameters, txParams?: TxParams): Promise<DeleteEntityReturnType>
  mutateEntities(params: MutateEntitiesParameters, txParams?: TxParams): Promise<MutateEntitiesReturnType>
  extendEntity(params: ExtendEntityParameters, txParams?: TxParams): Promise<ExtendEntityReturnType>
}

// ─── Vault Item ───────────────────────────────────────────────────────────────

export interface VaultItemPayload {
  cid: string             // IPFS CID (~59 chars) — tiny on-chain footprint
  iv: string
  wrappedItemKey: string
  wrapIv: string
  version: number
}

export interface VaultItemMeta {
  label: string
  category: string
  fileType: string
  sizeBytes: number
}

export interface BuildVaultItemParams extends VaultItemMeta {
  encryptedPayload: VaultItemPayload
  ownerAddress: string
}

// ─── Access Grant ─────────────────────────────────────────────────────────────

export interface AccessGrantPayload {
  grantCID: string        // IPFS CID for the re-encrypted grant ciphertext
  grantIv: string
  label?: string
  fileType?: string
}

export interface BuildAccessGrantParams {
  accessGrantPayload: AccessGrantPayload
  tokenHash: string
  parentVaultItemKey: string
  grantedByAddress: string
  purpose: string
  durationSeconds: number
  label: string
  granteeName: string
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
  category: string
  purpose: string
  durationSeconds: number
  ownerAddress: string
}

// ─── Agent Memory: Conversation Summary ──────────────────────────────────────

export interface ConversationMemoryPayload {
  summary: string
  keyFacts: string[]
  actions: string[]
}

export interface BuildConversationMemoryParams {
  summary: string
  keyFacts: string[]
  actions: string[]
  ownerAddress: string
}
