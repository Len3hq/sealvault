# SealVault + AgentMem — Architecture & Implementation Guide

## The Combined Concept

**SealVault** is an encrypted private data vault where your login = your access key and Arkiv = your database. No backend. No company holding your data.

**AgentMem** layered on top turns it into a living, intelligent vault. Instead of managing access grants through a complicated UI, you talk to an AI agent that:
- Understands who people are ("Dr. Smith" → their identifier)
- Executes grants on your behalf
- Monitors expirations and alerts you in real time
- Keeps an audit trail even after grants disappear from Arkiv
- Remembers *why* you shared something

The core insight: **Arkiv's TTL is the revocation mechanism**. When an access grant entity expires, Arkiv automatically prunes it. No cron jobs, no smart contracts, no revocation logic. The data layer handles it entirely.

---

## Scoring Rubric Alignment

The hackathon weights: **Arkiv Integration 40% · Functionality 30% · Design & UX 20% · Code Quality 10%**

| Criterion | Target Score | How We Hit It |
|---|---|---|
| Entity schema design | 5 | 4 distinct typed entities, all queryable attributes |
| Query usage | 5 | Multiple combined filters + sorting on every query |
| Ownership model | 5 | User wallet-bound, edit/delete controls in UI |
| Entity relationships | 5 | Explicit `parent_key` links + lifecycle deletion |
| Expiration dates | 5 | Differentiated: 10yr vault, variable grants, 2yr memory |
| Advanced features | 5 | Live events + entity extension + batch grants + $creator |
| Core flows | 5 | Upload → Encrypt → Grant → View → Expire — all tested |
| Filtering & search | 5 | Category, date range, label search, active/expired toggle |
| Wallet integration | 5 | Privy: social login, zero crypto UX for owner |
| Blockchain abstraction | 5 | Magic link: grantees need no wallet, no app, no account |
| Visual design | 4–5 | Distinctive dark vault aesthetic, not default shadcn |
| README | 5 | Architecture overview + setup + Arkiv integration explained |

---

## Biggest Design Decision: No Crypto UX

The rubric explicitly scores blockchain abstraction: *"1 = technical knowledge required → 5 = users unaware of web3."* We need a 5 on both sides — for the owner and for the grantee.

### Owner Login — Privy (Social Login)

Replace "Connect Wallet" with **Privy**. Users sign in with Google, Apple, or email. Privy silently creates and manages an embedded crypto wallet. The owner never sees a wallet address, never installs MetaMask, never touches a blockchain concept.

```
BEFORE                         AFTER
──────────────────────────     ──────────────────────────
[Connect Wallet]               [Continue with Google]
  ↓                            [Continue with Apple]
User needs MetaMask            [Continue with Email OTP]
User needs test tokens           ↓
User sees 0x addresses         Privy creates wallet silently
Popup on every action          Vault opens. Done.
```

All wallet signing operations (key derivation, grant creation, entity writes) happen invisibly through Privy's embedded wallet SDK. The user sees none of it.

### Grantee Access — Magic Link (No Wallet at All)

The grantee — a doctor, lawyer, accountant — does not have a crypto wallet. They should not need one. When the owner grants access, the app generates a **secure magic link**. The owner shares it via WhatsApp, email, or SMS. The grantee clicks it. The document opens. No account required.

```
Owner grants access for 48h
       ↓
App generates a random token (32 bytes)
App creates a grant entity on Arkiv (TTL = 48h)
  → payload contains encrypted doc + token as decryption hint
App returns: sealvault.app/view/[token]
       ↓
Owner shares link however they want
       ↓
Grantee clicks link in any browser
App queries Arkiv: find grant entity where token matches
Document decrypts and opens
       ↓
48 hours pass → Arkiv auto-prunes entity
Grantee revisits link → query returns nothing → "This link has expired"
```

The magic link token IS an Arkiv entity. Arkiv's TTL is still the revocation mechanism — the grantee flow just doesn't require a wallet.

---

## The Encryption Layer

MetaMask deprecated `eth_getEncryptionPublicKey` and `eth_decrypt` in 2023. We use the **Web Crypto API** (built into every browser) instead — no extra dependencies.

### Deriving the Master Key (once per session)

Privy's embedded wallet signs a deterministic message silently. The user sees nothing — just their vault opening.

```typescript
// Privy signs this message silently via embedded wallet
const signature = await privyWallet.signMessage(
  "SealVault master key v1 — sign to unlock your vault"
)

// Deterministic: same account → same signature → same key
const keyMaterial = await crypto.subtle.importKey(
  "raw",
  hexToBytes(keccak256(signature)),
  "HKDF",
  false,
  ["deriveKey"]
)

const masterKey = await crypto.subtle.deriveKey(
  {
    name: "HKDF",
    hash: "SHA-256",
    salt: new Uint8Array(32),
    info: new TextEncoder().encode("vault-master"),
  },
  keyMaterial,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
)
// masterKey lives in memory only — gone when tab closes
```

### Encrypting a Vault Item

```typescript
async function encryptVaultItem(content: string | ArrayBuffer, masterKey: CryptoKey) {
  // Per-item key — limits blast radius if one item is ever compromised
  const itemKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
  )

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = typeof content === "string"
    ? new TextEncoder().encode(content)
    : new Uint8Array(content)

  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, itemKey, plaintext)

  const wrapIv = crypto.getRandomValues(new Uint8Array(12))
  const wrappedItemKey = await crypto.subtle.wrapKey(
    "raw", itemKey, masterKey, { name: "AES-GCM", iv: wrapIv }
  )

  return {
    ciphertext: bufToHex(ciphertext),
    iv: bufToHex(iv),
    wrappedItemKey: bufToHex(wrappedItemKey),
    wrapIv: bufToHex(wrapIv),
    version: 1,
  }
}
```

### Creating the Magic Link Grant

```typescript
async function createMagicLinkGrant(
  vaultItemKey: string,
  encryptedPayload: EncryptedPayload,
  masterKey: CryptoKey,
  durationSeconds: number,
  purpose: string
) {
  // Generate a random token — this becomes the URL slug
  const token = bufToHex(crypto.getRandomValues(new Uint8Array(32)))

  // Re-encrypt the payload under the token as a symmetric key
  const tokenKeyMaterial = await crypto.subtle.importKey(
    "raw", hexToBytes(token), "HKDF", false, ["deriveKey"]
  )
  const grantKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("grant") },
    tokenKeyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )

  // Decrypt original content, re-encrypt under the token key
  const originalContent = await decryptVaultItem(vaultItemPayload, masterKey)
  const { ciphertext: grantCiphertext, grantIv } = await encryptForGrant(originalContent, token)

  // Upload re-encrypted ciphertext to IPFS (Pinata) — only the CID goes on-chain
  const grantCID = await uploadToIPFS(grantCiphertext)

  // Store only the CID + metadata on Arkiv (tiny on-chain footprint)
  const { entityKey } = await walletClient.createEntity({
    payload: jsonToPayload({
      grantCID,   // IPFS CID — token in URL decrypts it; token never stored here
      grantIv,
      label,
      fileType,
    }),
    contentType: "application/json",
    attributes: [
      { key: "project",    value: PROJECT_ATTRIBUTE },
      { key: "type",       value: "access_grant" },
      { key: "token_hash", value: keccak256(token) }, // hash only, not the token
      { key: "parent_key", value: vaultItemKey },     // explicit relationship
      { key: "granted_by", value: ownerAddress },
      { key: "purpose",    value: purpose },
      { key: "granted_at", value: Date.now() },
      { key: "expires_at", value: Date.now() + durationSeconds * 1000 },
    ],
    expiresIn: durationSeconds, // clamped to [1h, 30d] at schema layer
  })

  return {
    magicLink: `${APP_URL}/view/${token}`,
    grantEntityKey: entityKey,
  }
}
```

When the grantee visits `/view/[token]`, the app derives the same grant key from the token, queries Arkiv for the entity where `token_hash == keccak256(token)`, and decrypts the payload. No wallet. No account.

---

## Arkiv Entity Schema (4 Types)

Every entity carries `PROJECT_ATTRIBUTE = "sealvault"` and is queried with `.createdBy(ownerAddress)` to prevent injection attacks.

### Type 1 — Vault Item (10-year TTL)

```typescript
{
  // Encrypted bytes live on IPFS (Pinata). On-chain payload is ~200 bytes.
  payload: jsonToPayload({
    cid:            "QmXyz...",  // IPFS CID — content-addressed encrypted ciphertext
    iv:             "0xhex...",
    wrappedItemKey: "0xhex...",
    wrapIv:         "0xhex...",
    version:        1,
  }),
  contentType: "application/json",
  attributes: [
    { key: "project",    value: "sealvault" },
    { key: "type",       value: "vault_item" },
    { key: "category",   value: "medical" },         // plaintext for filtering
    { key: "label",      value: "Blood Work 2026" }, // plaintext for display
    { key: "file_type",  value: "application/pdf" },
    { key: "created_at", value: Date.now() },  // numeric → range queries
    { key: "size_bytes", value: 204800 },       // numeric → size filtering
  ],
  expiresIn: ExpirationTime.fromYears(10),
}
```

### Type 2 — Access Grant (variable TTL = the revocation mechanism)

`durationSeconds` is clamped to `[GRANT_MIN (1h), GRANT_MAX (30d)]` at schema build time.

```typescript
{
  // Re-encrypted ciphertext lives on IPFS. On-chain payload is ~200 bytes.
  payload: jsonToPayload({
    grantCID:  "QmXyz...",        // IPFS CID — re-encrypted ciphertext for this grantee
    grantIv:   "0xhex...",
    label:     "Blood Work 2026", // embedded so grantee can render without extra query
    fileType:  "application/pdf",
  }),
  contentType: "application/json",
  attributes: [
    { key: "project",    value: "sealvault" },
    { key: "type",       value: "access_grant" },
    { key: "token_hash", value: "keccak256(token)..." }, // hash only — token stays in URL
    { key: "parent_key", value: "vault_item_entity_key" }, // explicit relationship ←
    { key: "granted_by", value: "0xOwner..." },
    { key: "purpose",    value: "annual checkup" },
    { key: "granted_at", value: Date.now() },
    { key: "expires_at", value: Date.now() + 172800000 }, // numeric → queryable
  ],
  expiresIn: clampedDuration,  // ← THIS IS THE REVOCATION MECHANISM (clamped 1h–30d)
}
```

### Type 3 — Agent Memory: Grant Record (2-year TTL)

```typescript
{
  payload: jsonToPayload({
    summary: "Granted Dr. Smith access to Blood Work 2026 for 48h",
    context: "Annual specialist appointment 2026-05-22",
    outcome: null, // updated to "Expired automatically" or "Manually revoked" on event
  }),
  contentType: "application/json",
  attributes: [
    { key: "project",      value: "sealvault" },
    { key: "type",         value: "agent_memory" },
    { key: "subtype",      value: "grant_record" },
    { key: "grantee_name", value: "Dr. Smith" },       // human name, never address
    { key: "parent_key",   value: "vault_item_key" },  // links to vault item
    { key: "grant_entity", value: "grant_entity_key" }, // links to grant
    { key: "status",       value: "active" },           // active | expired | revoked
    { key: "category",     value: "medical" },          // for history filtering
    { key: "granted_at",   value: Date.now() },
    { key: "expires_at",   value: Date.now() + 172800000 },
  ],
  expiresIn: ExpirationTime.fromYears(2), // audit trail outlives the grant itself
}
```

### Type 4 — Agent Memory: Contact (5-year TTL)

Tags are stored as individual numbered attributes (not comma-joined) so each tag is independently queryable via `eq("tag_0", "doctor")`.

```typescript
{
  payload: jsonToPayload({ notes: "My GP, trusted for routine checkups" }),
  contentType: "application/json",
  attributes: [
    { key: "project",   value: "sealvault" },
    { key: "type",      value: "agent_memory" },
    { key: "subtype",   value: "contact" },
    { key: "name",      value: "Dr. Smith" },
    { key: "email",     value: "smith@clinic.com" }, // optional, for display
    { key: "tag_0",     value: "medical" },   // individual attribute per tag
    { key: "tag_1",     value: "trusted" },   // enables: eq("tag_0", "medical")
    { key: "tag_count", value: 2 },           // numeric — how many tag_N attrs exist
    { key: "added_at",  value: Date.now() },
  ],
  expiresIn: ExpirationTime.fromYears(5),
}
```

---

## Entity Lifecycle Management

When a vault item is deleted, all its child grant entities must be deleted immediately. Otherwise grants point at a missing item — orphaned data costs points on the rubric.

```typescript
async function deleteVaultItemWithGrants(itemEntityKey: string) {
  // Find all grants that reference this vault item
  const grantsResult = await publicClient
    .buildQuery()
    .where([
      eq("project",    PROJECT_ATTRIBUTE),
      eq("type",       "access_grant"),
      eq("parent_key", itemEntityKey),
    ])
    .createdBy(ownerAddress)
    .withAttributes(true)
    .fetch()

  // Update all memory records to status: "revoked" (audit trail preserved)
  await Promise.all(grantsResult.entities.map(async (grant) => {
    const memory = await findMemoryForGrant(String(grant.key))
    if (memory) await updateGrantRecordStatus(walletClient, memory, "revoked", "Parent document deleted")
  }))

  // Delete grants + the vault item in ONE transaction (not N+1 individual calls)
  const keysToDelete = [itemEntityKey, ...grantsResult.entities.map(e => String(e.key))]
  await walletClient.mutateEntities(
    { deletes: keysToDelete.map(key => ({ entityKey: key as `0x${string}` })) },
    DEFAULT_TX_PARAMS
  )
}
```

---

## Advanced Arkiv Features Used

### 1. Entity Extension (Extend a grant from the agent)

```typescript
// Agent hears: "Give Dr. Smith one more day"
await walletClient.extendEntity({
  entityKey: grantEntityKey,
  expiresIn: hours(24), // adds 24h to current expiry
})

// Also update the memory record's expires_at attribute
await walletClient.updateEntity({
  entityKey: memoryEntityKey,
  payload: currentMemoryPayload,
  attributes: [
    ...currentAttributes.filter(a => a.key !== "expires_at"),
    { key: "expires_at", value: newExpiresAt },
  ]
})
```

### 2. Batch Grants (Share with multiple people at once)

```typescript
// Agent hears: "Share my tax return with both my accountant and my lawyer"
const { createdEntities } = await walletClient.mutateEntities({
  creates: [
    buildGrantEntity(itemKey, accountantToken, ExpirationTime.fromHours(72), "Tax filing"),
    buildGrantEntity(itemKey, lawyerToken,     ExpirationTime.fromHours(72), "Legal review"),
  ],
}, DEFAULT_TX_PARAMS)
// Two grants created in one transaction — createdEntities[0] and [1] are the entity keys
```

### 3. $creator Verification on All Queries

```typescript
// Always filter by creator to prevent injection attacks
const myVaultItems = await publicClient
  .buildQuery()
  .where([eq("project", PROJECT_ATTRIBUTE), eq("type", "vault_item")])
  .createdBy(ownerAddress)   // ← tamper-proof: ignores entities from other wallets
  .withAttributes(true)
  .orderBy("created_at", "number", "desc")
  .fetch()
```

### 4. Live Expiry Events (Real-time revocation notifications)

```typescript
const unsubscribe = publicClient.subscribeEntityEvents(
  {
    onEntityExpired: async (event) => {
      const memory = await findMemoryForGrant(event.entityKey)
      if (!memory) return

      // Update audit record
      await walletClient.updateEntity({
        entityKey: memory.arkivEntityKey,
        payload: JSON.stringify({ ...memory.payload, outcome: "Expired automatically" }),
        attributes: memory.attributes.map(a =>
          a.key === "status" ? { key: "status", value: "expired" } : a
        ),
      })

      // Show toast to user
      showNotification(`Access for "${memory.granteeName}" has expired`)
    },
    onEntityDeleted: async (event) => {
      // Handles immediate revocations too
      const memory = await findMemoryForGrant(event.entityKey)
      if (memory) await updateMemoryStatus(memory.arkivEntityKey, "revoked")
    },
  },
  30_000 // pollingInterval in ms — second positional argument
)
// Returns Promise<() => void> — call the returned function on unmount to stop polling
```

---

## AgentMem — The Intelligence Layer

The agent (Claude) is the primary interface to the vault. Arkiv is its memory substrate — contacts, grant history, and context all live there across sessions.

### Conversation Examples

```
You: "Give Dr. Smith access to my blood work for 48 hours"

Agent (internal steps):
  1. tool: lookup_contact("Dr. Smith") → found, email: smith@clinic.com
  2. tool: list_vault_items(category: "medical") → finds "Blood Work 2026"
  3. Asks: "Share Blood Work 2026 with Dr. Smith until Friday 6pm. Confirm?"
  4. You: Yes
  5. tool: grant_access(itemKey, duration: 172800, purpose: "specialist consult")
     → creates grant entity + magic link
  6. tool: save_grant_memory(...)
  "Done. Share this link with Dr. Smith: sealvault.app/view/abc123
   It works until Friday 6pm, then expires automatically."
```

```
You: "Who currently has access to my documents?"

Agent: tool: list_active_grants()
  → queries grant entities where granted_by = ownerAddress, expires_at > now()
  "3 active shares:
   • Dr. Smith → Blood Work 2026 — expires in 6 hours
   • Acme Legal → NDA Draft — expires in 2 days
   • My Accountant → Tax Return 2025 — expires in 28 minutes. Extend it?"
```

```
You: "Has anyone accessed my medical records this year?"

Agent: tool: query_grant_history(category: "medical", since: Jan 1 2026)
  → queries agent_memory entities (works even for expired grants)
  "3 shares were created:
   • Dr. Smith — May 22 (48h) — expired
   • Dr. Smith — April 15 (24h) — expired
   • Urgent Care Walk-In — April 3 (6h) — expired"
```

### Agent Tool Definitions

```typescript
const tools = [
  {
    name: "list_vault_items",
    description: "List the user's stored documents with metadata. Never returns encrypted content.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["medical", "legal", "financial", "personal"] },
        search: { type: "string", description: "Partial label match" },
      }
    }
  },
  {
    name: "list_active_grants",
    description: "List all currently active access shares. Only returns shares that have not expired.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "grant_access",
    description: "Create a time-limited magic link for a specific document. Returns the link to share.",
    inputSchema: {
      type: "object",
      required: ["itemEntityKey", "durationSeconds", "purpose"],
      properties: {
        itemEntityKey: { type: "string" },
        durationSeconds: { type: "number" },
        purpose: { type: "string" },
      }
    }
  },
  {
    name: "extend_access",
    description: "Extend an active grant by additional time.",
    inputSchema: {
      type: "object",
      required: ["grantEntityKey", "additionalSeconds"],
      properties: {
        grantEntityKey: { type: "string" },
        additionalSeconds: { type: "number" },
      }
    }
  },
  {
    name: "revoke_access",
    description: "Immediately revoke an active share. The link stops working instantly.",
    inputSchema: {
      type: "object",
      required: ["grantEntityKey"],
      properties: { grantEntityKey: { type: "string" } }
    }
  },
  {
    name: "lookup_contact",
    description: "Find a saved contact by name.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } }
    }
  },
  {
    name: "save_contact",
    description: "Save a person with a name for future sharing. Ask for email if available.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        notes: { type: "string" },
      }
    }
  },
  {
    name: "query_grant_history",
    description: "Query past sharing history including expired grants. Uses agent memory.",
    inputSchema: {
      type: "object",
      properties: {
        granteeName: { type: "string" },
        category: { type: "string" },
        since: { type: "number", description: "Unix timestamp in milliseconds" },
      }
    }
  },
  {
    name: "delete_vault_item",
    description: "Permanently delete a document and all active shares for it.",
    inputSchema: {
      type: "object",
      required: ["itemEntityKey"],
      properties: { itemEntityKey: { type: "string" } }
    }
  }
]
```

---

## UI — Language Rules

Never use crypto terminology in the UI. Every label maps to plain language.

| Never show | Show instead |
|---|---|
| "Connect Wallet" | "Sign in" |
| "0x4f3a..." (addresses) | Contact name or "You" |
| "Entity" | "Document" |
| "Transaction" | (never surface this) |
| "Braga Testnet" | (never surface this) |
| "GLM tokens" | (never surface this) |
| "Grant entity" | "Shared access" |
| "TTL / expiresIn" | "Expires in" |
| "On-chain" | (never surface this) |

### Onboarding (3 screens, first visit only)

```
Screen 1                    Screen 2                    Screen 3
────────────────────────    ────────────────────────    ────────────────────────
Your private documents,     Share anything, for         Sign in to open
yours alone.                exactly as long as          your vault.
                            you choose.
No company holds them.      The link expires.           [Continue with Google]
No one can read them        Automatically.              [Continue with Apple]
but you.                                                [Continue with Email]
[Continue]                  [Continue]
```

### Vault Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  🔒 SealVault                                    [+ Add]  [Ask] │
├──────────────┬──────────────────────────────────────────────────┤
│ All          │  🔍 Search documents...                          │
│ Medical  (3) │  Sort: Newest ▾                                  │
│ Legal    (2) ├──────────────────────────────────────────────────┤
│ Financial(1) │  Blood Work — May 2026           Medical         │
│ Personal (1) │  Shared with 1 person · Expires in 6h    [···]  │
│              ├──────────────────────────────────────────────────┤
│              │  NDA — Acme Corp                 Legal           │
│              │  Not currently shared                    [···]  │
│              ├──────────────────────────────────────────────────┤
│              │  Tax Return 2025                 Financial        │
│              │  Shared with 2 people · 1 expires in 28m [···]  │
└──────────────┴──────────────────────────────────────────────────┘
```

### Active Shares Panel (per document)

```
Blood Work — May 2026
──────────────────────────────────────────
  Dr. Smith          Expires in 5h 42m   [Extend] [Revoke]
──────────────────────────────────────────
  [+ Share with someone new]
```

### Grantee View (magic link, no account needed)

```
sealvault.app/view/abc123
──────────────────────────────────────────────
  🔒 Document shared with you

  Blood Work — May 2026
  Shared by: [owner's display name]
  Access expires: Friday, May 24 at 6:00 PM

  [View Document]   [Download]

  ──────────────────────────────────────────
  Powered by SealVault · Your data, your rules
```

After expiry:

```
  ⏱ This link has expired.

  The owner's sharing period ended on May 24 at 6:00 PM.
  Contact them if you need access again.
```

---

## Error Handling

| Situation | What the user sees |
|---|---|
| Ran out of test tokens | "Your vault needs a small top-up to save changes. [Get free tokens →]" — links to Arkiv faucet |
| Network down | "Connection lost. Your documents are safe — reconnecting..." with spinner |
| Magic link expired | "This link has expired. The owner's access period ended on [date]." |
| Magic link not found | "This link is invalid or has already been removed." |
| File too large | "Maximum file size is 10MB. Try compressing it first." |
| Unsupported file type | "Supported: PDF, images, text files, and documents." |
| Grant creation fails | "Something went wrong creating the share. Try again." with retry button |
| Vault item deleted mid-share | All child grants deleted atomically — grantee sees expired state |

---

## Full System Architecture

```
OWNER (any person, no crypto knowledge)
  Logs in with Google via Privy
  Privy creates embedded wallet silently
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SealVault Browser App                        │
│                                                                  │
│  Privy Auth Layer                                                │
│  └── embedded wallet (invisible to user)                        │
│       └── signs once → master key derived → stored in memory   │
│                                                                  │
│  Encryption Layer (Web Crypto API, AES-256-GCM + HKDF)         │
│  └── encryptVaultItem / decryptVaultItem (per-item key wrap)    │
│  └── encryptForGrant / decryptGrant (token-derived key)         │
│                                                                  │
│  Vault UI                                                        │
│  └── upload, view, search, filter, manage shares                │
│                                                                  │
│  Agent Layer (gpt-4o-mini via OpenAI / AI SDK v6)               │
│  └── natural language → tools → Arkiv SDK + crypto calls        │
│  └── reads/writes agent_memory entities                          │
│  └── subscribes to expiry events → live notifications            │
└──────────┬────────────────────────────────────┬─────────────────┘
           │ encrypted bytes (Uint8Array)        │ CID + key material
           ▼                                     ▼
┌──────────────────────┐          ┌──────────────────────────────────────┐
│  IPFS / Pinata       │          │  Arkiv DB-Chain (Braga)              │
│                      │          │                                      │
│  Encrypted ciphertext│          │  vault_item   (TTL: 10yr)           │
│  for vault items     │          │    payload: { cid, iv, wrappedKey }  │
│                      │          │                                      │
│  Re-encrypted bytes  │          │  access_grant (TTL: 1h–30d) ← REVOKE│
│  for each grant      │          │    payload: { grantCID, grantIv }   │
│                      │          │                                      │
│  Content-addressed:  │          │  agent_memory/grant (TTL: 2yr)      │
│  CID is immutable    │          │  agent_memory/contact (TTL: 5yr)    │
│  proof of content    │          │                                      │
└──────────────────────┘          │  All queries: PROJECT_ATTRIBUTE      │
  Neither layer alone             │  + .createdBy(ownerAddress)          │
  reveals the document:           │                                      │
  IPFS has locked box,            │  Arkiv Coordination Layer (L2)       │
  Arkiv has the key.              │  Ethereum Mainnet (L1) — proofs      │
                                  └──────────────────────────────────────┘
                                                 │
                                                 │  magic link → no wallet needed
                                                 ▼
GRANTEE (any person, any browser, zero crypto knowledge)
  Clicks link → token in URL → query Arkiv by token_hash → fetch IPFS by grantCID
  → decrypt with token-derived key → document opens. No account.
  Link expires → Arkiv prunes entity → "This link has expired"
```

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | Vercel deploy, streaming agent responses via RSC |
| Auth & Wallet | **Privy** | Social login → embedded wallet, zero MetaMask dependency |
| Arkiv | `@arkiv-network/sdk` | Required — entities, queries, events |
| Off-chain storage | **IPFS + Pinata** | Encrypted bytes stored on IPFS; only CID (~59 chars) goes on-chain — keeps GLM cost minimal |
| Encryption | Web Crypto API (native) | No deps, runs in browser, AES-256-GCM + HKDF |
| Payload validation | Zod | Schema validation on all entity payload parses |
| Agent | `gpt-4o-mini` via OpenAI SDK | Streaming tool use (4 read + 5 write tools) |
| AI SDK | Vercel AI SDK v6 | Streaming chat UI, client-side tool execution |
| Data fetching | TanStack Query | React Query for Arkiv reads with stale-time caching |
| UI | shadcn/ui + Tailwind | Customised heavily — not default theme |
| Deployment | Vercel | Zero config, matches Next.js App Router |

---

## Build Order

Given Arkiv Integration is 40% of the score, get entities right first.

### Phase 1 — Arkiv Entity Foundation ✅
- [x] Define `PROJECT_ATTRIBUTE = "sealvault"`
- [x] Implement all 4 entity schemas with correct attributes
- [x] Implement `.createdBy()` on every query
- [x] Test entity lifecycle deletion (delete item → delete grants)
- [x] Wire up `subscribeEntityEvents` for expiry/deletion

### Phase 2 — Auth & Encryption ✅
- [x] Privy setup — Google + Apple + email login
- [x] Silent master key derivation via Privy embedded wallet
- [x] `encryptVaultItem` / `decryptVaultItem` functions
- [x] File upload → encrypt → IPFS → store CID on Arkiv
- [x] Decrypt + display vault items (fetch from IPFS by CID)

### Phase 3 — Magic Link Grant Flow ✅
- [x] Token generation + grant entity creation
- [x] Magic link URL generation
- [x] `/view/[token]` page — query Arkiv by token hash → fetch IPFS → decrypt → display
- [x] Expiry state on the view page
- [x] Extend grant flow (`extendEntity`)
- [x] Revoke grant flow (`deleteEntity` → update memory)
- [x] Batch grant to multiple people

### Phase 4 — Agent ✅
- [x] Agent with all tool definitions (read + write split)
- [x] Agent memory: save/query contacts and grant records
- [x] Chat UI with streaming (Vercel AI SDK v6)
- [x] Natural language: grant, revoke, extend, who has access, history
- [x] Proactive expiry alerts from live events

### Phase 5 — UI & Polish ✅
- [x] Vault dashboard with category sidebar + search + sort
- [x] Active shares panel per document with countdown timers
- [x] Onboarding 3-screen flow (first visit only)
- [x] All error states with helpful messages
- [x] Remove all crypto language from UI

### Phase 6 — Submission
- [ ] README: what it is, setup steps, architecture overview, how Arkiv is used
- [ ] Public GitHub repo
- [ ] Deploy to Vercel → working demo link
- [ ] 2–3 min demo video: Alice signs in → uploads → agent grants → Bob views via link → link expires

---

## Demo Script (What Judges See)

1. **Alice opens the app** → clicks "Continue with Google" → vault opens instantly
2. **Alice uploads "Blood Work 2026.pdf"** → encrypted in-browser → stored on Arkiv → appears in vault
3. **Alice opens the agent chat** and types: *"Share my blood work with Dr. Smith for 48 hours — he's my specialist"*
4. **Agent:** "I don't have Dr. Smith saved yet. What's his email so I can remember him?"
5. **Alice:** "smith@clinic.ie" → agent saves contact to Arkiv
6. **Agent:** "Sharing Blood Work 2026 with Dr. Smith until Friday 6pm. Confirm?"
7. **Alice confirms** → agent creates grant entity (48h TTL) + memory record → returns magic link
8. **Alice copies the link** and sends it to Dr. Smith via WhatsApp
9. **Dr. Smith clicks the link** on his phone → no account, no app → document opens → he reads it
10. **Alice asks the agent:** *"Who currently has access to my documents?"* → agent queries Arkiv → "Dr. Smith, Blood Work, expires in 47h"
11. **Fast-forward: grant expires** → live event fires → notification: "Dr. Smith's access has expired"
12. **Dr. Smith tries the link** → "This link has expired" — Arkiv pruned the entity
13. **Alice asks:** *"Has Dr. Smith ever accessed my records?"* → agent queries memory entities → full history shown

---

## Why This Wins

- **Blockchain abstraction: complete** — owner uses Google login, grantee uses a link. Nobody touches crypto.
- **TTL-as-revocation is genuinely novel** — no one builds access control this way
- **Zero backend** — runs entirely in-browser + Arkiv + Claude API. Nothing to hack, nothing to maintain.
- **Real cryptography** — AES-256-GCM with per-item keys and key wrapping. Not fake "privacy."
- **Agent earns its place** — the only persistent memory across sessions. Contacts, history, context. Without it the app resets every visit.
- **All 4 advanced Arkiv features** — live events, entity extension, batch grants, $creator filtering
- **Strong human narrative** — "Your medical records, shared on your terms, revoked automatically." Judges remember this.
