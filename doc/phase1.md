# Phase 1 — Arkiv Data Layer

## What Was Built

Phase 1 is the complete data layer between SealVault and the Arkiv Network blockchain database. It has no UI and no auth — it is pure logic that every other phase will depend on. Everything sits under `src/lib/arkiv/`.

### Layer breakdown

```
src/lib/arkiv/
├── client.ts            — Arkiv public client (Braga testnet connection)
├── constants.ts         — Project-wide constants, TTL values, status enums
├── types.ts             — TypeScript interfaces for all entities and params
├── schemas/             — Entity builders (shape data before writing to Arkiv)
│   ├── vault-item.ts
│   ├── access-grant.ts
│   ├── grant-record.ts
│   └── contact.ts
├── queries/             — Read data from Arkiv
│   ├── vault-items.ts
│   ├── access-grants.ts
│   └── agent-memory.ts
├── mutations/           — Write, update, delete data on Arkiv
│   ├── vault-items.ts
│   ├── access-grants.ts
│   └── lifecycle.ts
├── events/
│   └── subscription.ts  — Live event listener (grant expiry, revocation)
└── index.ts             — Single barrel export for the entire layer
```

---

### 1. Client (`client.ts`)

Initialises the Arkiv public client pointed at the **Braga testnet** (Chain ID: 60138453102). Exports a typed `PublicClientType` so every query and subscription function receives a properly-typed client rather than `any`.

---

### 2. Constants (`constants.ts`)

Central registry of every magic string and number used across the codebase.

| Export | Purpose |
|---|---|
| `PROJECT_ATTRIBUTE = "sealvault"` | Namespace filter on every Arkiv query — prevents reading other projects' data |
| `ENTITY_TYPES` | `vault_item`, `access_grant`, `agent_memory` |
| `ENTITY_SUBTYPES` | `grant_record`, `contact` |
| `EXPIRY` | Helper functions: `seconds()`, `minutes()`, `hours()`, `days()`, `years()` — all return values in seconds (Arkiv's unit) |
| `TTL` | Canonical time-to-live per entity type (see table below) |
| `VAULT_CATEGORIES` | `medical`, `legal`, `financial`, `personal` |
| `GRANT_STATUS` | `active`, `expired`, `revoked` |

**TTL table:**

| Entity | TTL | Why |
|---|---|---|
| Vault item | 10 years | Long-lived personal documents |
| Access grant | Caller-supplied (1h–30d) | The TTL *is* the revocation — when it expires, access dies |
| Grant record | 2 years | Outlives the grant to preserve audit trail |
| Contact | 5 years | Persistent address book |

---

### 3. Schemas (`schemas/`)

Pure functions that take typed params and return a `CreateEntityParameters` object ready for `walletClient.createEntity()`. They handle:

- Serialising payloads with `jsonToPayload()` (returns `Uint8Array` — Arkiv's required format)
- Stamping every entity with `project: "sealvault"` so queries are always scoped
- Computing derived attributes (`expires_at`, `granted_at`, `created_at`)

**Four builders:**

- `buildVaultItemEntity` — wraps encrypted payload, sets category/label/file_type/size_bytes, 7 attributes total
- `buildAccessGrantEntity` — stores the re-encrypted item key the grantee will use to decrypt; links to parent vault item via `parent_key`; stores `token_hash` for magic link lookup; `expiresIn` = `durationSeconds` (the revocation mechanic)
- `buildGrantRecordEntity` — human-readable audit record; links to both the vault item (`parent_key`) and the grant entity (`grant_entity`); starts with `outcome: null`
- `buildContactEntity` — the AI agent's address book; stores name, email, comma-joined tags in attributes; notes in payload

---

### 4. Queries (`queries/`)

All queries follow the same pattern: `client.buildQuery().where(predicates).createdBy(ownerAddress).fetch()`. The `.createdBy()` call is on every query without exception — it scopes results to the authenticated user and prevents cross-user data leakage.

| Function | What it returns |
|---|---|
| `queryVaultItems` | All vault items for an owner, optionally filtered by category |
| `queryVaultItemByKey` | Single item by its Arkiv entity key |
| `queryActiveGrantsByOwner` | All non-expired grants issued by a user |
| `queryGrantsByVaultItem` | All grants linked to a specific vault item (used before deletion) |
| `queryGrantByTokenHash` | Single grant looked up by magic link token hash |
| `queryContacts` | Full contact list, optional name search |
| `queryGrantHistory` | Audit log, filterable by category, grantee, or date |
| `queryGrantRecordByGrantEntity` | Finds the memory record linked to a specific grant |

---

### 5. Mutations (`mutations/`)

**Vault items:**
- `createVaultItem` — creates entity on Arkiv, returns `entityKey`
- `deleteVaultItem` — deletes a single entity (used only when no child grants exist)

**Access grants:**
- `createAccessGrant` — creates grant entity with TTL = revocation timer
- `revokeAccessGrant` — deletes the grant entity immediately (access dies instantly)
- `extendAccessGrant` — calls `extendEntity` to push the TTL further out
- `createGrantRecord` — creates the audit memory record
- `updateGrantRecordStatus` — updates status attribute + outcome in payload; recalculates remaining TTL from `expires_at` so `updateEntity` receives a valid `expiresIn` value
- `batchCreateAccessGrants` — creates multiple grants in one `mutateEntities` call (single transaction)

**Lifecycle (`lifecycle.ts`):**
- `deleteVaultItemWithGrants` — safe deletion that: (1) queries all child grants by `parent_key`, (2) marks each linked memory record as `revoked`, (3) deletes all grants + the vault item in parallel. Returns `{ deletedGrants: number }`.
- `handleGrantExpiry` — called when Arkiv fires an expiry event; finds the linked memory record and updates it to `expired` status. No-op if no record exists.

---

### 6. Event Subscription (`events/subscription.ts`)

`subscribeSealVaultEvents` returns a `Promise<() => void>`. Call the returned function to unsubscribe (e.g., on component unmount).

Internally polls `publicClient.subscribeEntityEvents` every 30 seconds. On `onEntityExpired`, it automatically calls `handleGrantExpiry` to keep the audit trail current, then fires the optional `onGrantExpired` callback so the UI can react. On `onEntityDeleted`, it fires `onGrantRevoked`.

---

## How This Helps Users

**Users never touch a wallet or think about blockchain.** Phase 1 encodes all the blockchain semantics — entity keys, TTLs, attribute namespacing — into typed TypeScript functions. Every later phase (UI, agent, magic links) calls these functions by name. The blockchain is invisible.

**Access control has zero running infrastructure.** A user granting a doctor access for 48 hours creates an Arkiv entity with `expiresIn: 172800`. When that timer hits zero, Arkiv deletes the entity. The doctor's magic link, which queries by token hash, finds nothing and returns "expired." No cron job. No backend revocation API. No database row to flip.

**Deletion is always safe.** `deleteVaultItemWithGrants` prevents orphaned grant entities. If a user deletes a document, all associated active grants are revoked and the audit records are updated in the same operation. The doctor gets access denied; the audit log still shows the grant happened.

**The audit trail outlives the access.** Grant records use a 2-year TTL even though the grants themselves expire in hours or days. The agent can always answer "who accessed this document and when" long after access was revoked.

**The agent has persistent memory.** Contacts and grant records are stored as Arkiv entities, not in a local database. When a user comes back days later and asks the agent "what did Dr. Smith access last month?", the agent queries Arkiv and has the full history.

---

## Tests Run and Passed

**67 tests across 3 test files — all passed.**

```
✓ src/__tests__/arkiv/constants.test.ts    (18 tests)
✓ src/__tests__/arkiv/schemas.test.ts      (40 tests)
✓ src/__tests__/arkiv/lifecycle.test.ts    ( 9 tests)
```

### constants.test.ts — 18 tests

| Group | Tests |
|---|---|
| `PROJECT_ATTRIBUTE` | Value is exactly `"sealvault"` |
| `ENTITY_TYPES` | All 3 types present and correctly named |
| `ENTITY_SUBTYPES` | `grant_record` and `contact` |
| `EXPIRY helpers` | seconds, minutes, hours, days, years convert correctly |
| `TTL values` | All 6 TTLs match expected durations; grant record outlives max grant |
| `VAULT_CATEGORIES` | All 4 categories present; exactly 4 entries |
| `GRANT_STATUS` | active, expired, revoked |

### schemas.test.ts — 40 tests

| Group | Tests |
|---|---|
| `buildVaultItemEntity` (13 tests) | contentType is `application/json`; expiresIn matches 10-year TTL; payload is a binary Uint8Array; all 7 attributes present with correct values; encrypted payload round-trips through binary serialisation |
| `buildAccessGrantEntity` (11 tests) | expiresIn equals `durationSeconds`; payload is Uint8Array; project/type/token_hash/parent_key/granted_by/purpose attributes correct; granted_at is numeric; expires_at > granted_at; expires_at ≈ granted_at + duration; grant payload round-trips |
| `buildGrantRecordEntity` (11 tests) | 2-year TTL; TTL outlives durationSeconds; project/type/subtype/grantee_name/parent_key/grant_entity/status/category attributes; payload summary contains grantee name; outcome starts as null |
| `buildContactEntity` (5 tests) | Full contact with email and tags; contact without optional fields (email omitted, tags default to empty string); notes stored in payload bytes; 5-year TTL |

### lifecycle.test.ts — 9 tests

All three query and mutation modules are mocked — no network calls.

| Group | Tests |
|---|---|
| `deleteVaultItemWithGrants` (5 tests) | Queries child grants by vault item key; deletes vault item when no grants; deletes vault item + all grants (3 delete calls for 2 grants + 1 item); marks memory records revoked with correct reason; skips memory update when no record exists |
| `handleGrantExpiry` (4 tests) | Updates memory record to expired; no-op when no record; queries by correct grant key + owner; no-op when entity has no payload |

**Technical note:** Uint8Array comparisons use `ArrayBuffer.isView()` instead of `instanceof Uint8Array` to handle the jsdom cross-realm issue where `instanceof` returns false even for genuine Uint8Array instances created in a different realm.

---

## Recommended Improvements

### High priority (before Phase 3)

**1. Validate TTL bounds before writing.**
`buildAccessGrantEntity` accepts any `durationSeconds` value. A caller could accidentally pass `0` or a value exceeding `TTL.GRANT_MAX`. Add a guard:

```typescript
const clampedDuration = Math.min(
  Math.max(durationSeconds, TTL.GRANT_MIN),
  TTL.GRANT_MAX
)
```

**2. Add `queryVaultItemByKey` to the queries barrel export.**
Currently it is exported from `index.ts` but the queries barrel (`queries/index.ts`) does not include it. Any file importing from `"@/lib/arkiv/queries"` directly would miss it.

**3. Retry logic on `subscribeEntityEvents`.**
The subscription polls every 30 seconds with no reconnect strategy. If the WebSocket drops, the user silently stops receiving expiry events. A simple exponential backoff on the `onError` callback would make this production-safe.

### Medium priority

**4. Token hash collision check.**
`queryGrantByTokenHash` returns the first match. If two grants ever share a token hash (however unlikely), the wrong grant entity is returned. Before creating a grant, query by the intended token hash and reject if a result already exists.

**5. Structured `outcome` field in grant records.**
`outcome` is currently a free-form string or null. Typed enum values (`"viewed"`, `"downloaded"`, `"no_action"`) would make agent queries and UI filtering more reliable.

**6. `batchCreateAccessGrants` return type.**
The function returns `string[]` of created entity keys from `result.createdEntities.map(String)`. The Arkiv SDK returns entity keys as `0x${string}` — casting to plain `string` discards that type information. Use `result.createdEntities as string[]` or keep the `0x${string}` type downstream.

### Low priority / Phase 5

**7. Add query tests.**
Phase 1 tests cover constants, schemas, and lifecycle mutations. The query functions are not unit-tested because they require a live or mocked Arkiv client. Mock the `buildQuery` chain with a fluent mock object to verify that predicate composition is correct — especially that `.createdBy()` is always called.

**8. Pagination for large vaults.**
`queryVaultItems` uses `.limit(100)` and `queryGrantHistory` uses `.limit(50)`. Users with large collections will silently get truncated results. Add cursor-based pagination or at minimum surface a `hasMore` flag in the return value.
