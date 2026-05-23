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

// All durations are in seconds (Arkiv expiresIn unit)
export const EXPIRY = {
  seconds: (n: number): number => n,
  minutes: (n: number): number => n * 60,
  hours: (n: number): number => n * 3_600,
  days: (n: number): number => n * 86_400,
  years: (n: number): number => n * 365 * 86_400,
} as const

// Canonical TTLs per entity type (matches research doc)
export const TTL = {
  VAULT_ITEM: EXPIRY.years(10),
  GRANT_MIN: EXPIRY.hours(1),
  GRANT_DEFAULT: EXPIRY.hours(48),
  GRANT_MAX: EXPIRY.days(30),
  AGENT_GRANT_RECORD: EXPIRY.years(2),
  AGENT_CONTACT: EXPIRY.years(5),
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

// Braga is a private testnet — zero gas price transactions are permitted.
// Fixed gas avoids eth_estimateGas, which fails on large encoded payloads.
export const DEFAULT_TX_PARAMS = {
  gas: 50_000_000n,
  gasPrice: 0n,
} as const

export const GRANT_STATUS = {
  ACTIVE: "active",
  EXPIRED: "expired",
  REVOKED: "revoked",
} as const

export type GrantStatus = (typeof GRANT_STATUS)[keyof typeof GRANT_STATUS]
