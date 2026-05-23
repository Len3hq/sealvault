import { ExpirationTime } from "@arkiv-network/sdk/utils"

export { ExpirationTime }

export const PROJECT_ATTRIBUTE = "sealvault" as const

export const ENTITY_TYPES = {
  VAULT_ITEM: "vault_item",
  ACCESS_GRANT: "access_grant",
  AGENT_MEMORY: "agent_memory",
} as const

export const ENTITY_SUBTYPES = {
  GRANT_RECORD: "grant_record",
  CONTACT: "contact",
} as const

// EXPIRY wraps the official SDK ExpirationTime helper.
// Prefer ExpirationTime directly in new code.
export const EXPIRY = {
  seconds: ExpirationTime.fromSeconds,
  minutes: ExpirationTime.fromMinutes,
  hours:   ExpirationTime.fromHours,
  days:    ExpirationTime.fromDays,
  years:   ExpirationTime.fromYears,
} as const

// Canonical TTLs per entity type
export const TTL = {
  VAULT_ITEM:         ExpirationTime.fromYears(10),
  GRANT_MIN:          ExpirationTime.fromHours(1),
  GRANT_DEFAULT:      ExpirationTime.fromHours(48),
  GRANT_MAX:          ExpirationTime.fromDays(30),
  AGENT_GRANT_RECORD: ExpirationTime.fromYears(2),
  AGENT_CONTACT:      ExpirationTime.fromYears(5),
} as const

export const BRAGA = {
  chainId: 60138453102,
  rpcUrl: "https://braga.hoodi.arkiv.network/rpc",
  wsUrl: "wss://braga.hoodi.arkiv.network/rpc/ws",
  explorerUrl: "https://explorer.braga.hoodi.arkiv.network",
  faucetUrl: "https://braga.hoodi.arkiv.network/faucet",
} as const

export const MIME = {
  JSON: "application/json",
  TEXT: "text/plain",
  PDF: "application/pdf",
  PNG: "image/png",
  JPEG: "image/jpeg",
} as const

export const VAULT_CATEGORIES = [
  "medical",
  "legal",
  "financial",
  "personal",
] as const

export type VaultCategory = (typeof VAULT_CATEGORIES)[number]

// Fixed gas avoids eth_estimateGas, which fails on large encoded payloads.
// gasPrice must exceed Braga's baseFee (~251 wei); 1000n gives a safe margin
// while keeping per-tx cost negligible (~0.00000005 GLM per 50M-gas tx).
export const DEFAULT_TX_PARAMS = {
  gas: 50_000_000n,
  gasPrice: 1_000n,
} as const

export const GRANT_STATUS = {
  ACTIVE: "active",
  EXPIRED: "expired",
  REVOKED: "revoked",
} as const

export type GrantStatus = (typeof GRANT_STATUS)[keyof typeof GRANT_STATUS]
