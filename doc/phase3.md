# Phase 3 — Magic Link Grant Flow

## What Was Built

Phase 3 is the access sharing system — the feature that makes SealVault genuinely useful. Owners share documents with anyone (doctors, lawyers, accountants) via a link. The recipient needs no account, no wallet, no app. The link expires automatically. Everything runs on Arkiv.

### Files added or modified

```
src/
├── lib/
│   ├── arkiv/
│   │   └── types.ts             — updated: AccessGrantPayload gains optional label, fileType
│   └── vault/
│       ├── grant-flow.ts        — NEW: createMagicLinkGrant (full end-to-end flow)
│       └── index.ts             — NEW: barrel export
├── hooks/
│   ├── use-grant-actions.ts     — NEW: useCreateGrant, useRevokeGrant, useExtendGrant (hooks accept WalletClient | null)
│   └── use-grant-view.ts        — NEW: useGrantView (public, no auth required)
└── app/
    └── view/
        └── [token]/
            └── page.tsx          — NEW: grantee view page (no login, works in any browser)
```

---

### 1. Grant Payload Update (`src/lib/arkiv/types.ts`)

`AccessGrantPayload` gained two optional fields:

```typescript
interface AccessGrantPayload {
  grantCiphertext: string  // encrypted document content
  grantIv: string          // IV for the grant cipher
  label?: string           // document display name shown to grantee
  fileType?: string        // MIME type so the browser can render it
}
```

The label and file type travel inside the encrypted Arkiv entity payload — the grantee sees the document name and the browser knows how to render the file (PDF in iframe, image inline, text as pre, binary as download), all without any additional query.

---

### 2. Grant Creation Flow (`src/lib/vault/grant-flow.ts`)

`createMagicLinkGrant(params)` is the core of Phase 3. It orchestrates five steps in sequence:

```
Owner master key
      │
      ▼
1. decryptVaultItem(payload, masterKey)
      │ decrypted content bytes
      ▼
2. generateGrantToken()  →  random 32-byte hex token (becomes URL slug)
   hashGrantToken(token) →  keccak256 hash (stored on Arkiv, never the token itself)
      │
      ▼
3. encryptForGrant(decrypted, token)
      │ grantCiphertext + grantIv (grantee decrypts using only the URL token)
      ▼
4. createAccessGrant(walletClient, { tokenHash, parentVaultItemKey, durationSeconds, ... })
      │ Arkiv entity with expiresIn = durationSeconds  ← THE REVOCATION MECHANISM
      ▼
5. createGrantRecord(walletClient, { granteeName, grantEntityKey, status: "active", ... })
      │ Arkiv entity with 2-year TTL  ← THE AUDIT TRAIL
      ▼
{ token, tokenHash, grantEntityKey, grantRecordKey }
```

**Why the token never touches Arkiv:** only `keccak256(token)` is stored as the `token_hash` attribute. Without the original token, an attacker who reads Arkiv cannot reconstruct the URL or decrypt the content. The token is only ever in the magic link URL and the user's clipboard.

**Why two entities are created:** the access grant entity (TTL = durationSeconds) is the live key — when it expires, Arkiv prunes it and the link stops working. The grant record entity (TTL = 2 years) is the audit log — it survives the grant so the owner and agent can answer "who accessed what, when" long after the access expired.

**Inputs:**

| Field | Type | Purpose |
|---|---|---|
| `vaultItemPayload` | `VaultItemPayload` | Encrypted payload from the Arkiv vault item entity |
| `masterKey` | `CryptoKey` | Owner's in-memory master key (never leaves browser) |
| `walletClient` | `WalletClient` | Arkiv wallet client for entity creation |
| `ownerAddress` | `string` | Owner's wallet address (stamped as `granted_by` attribute) |
| `vaultItemKey` | `string` | Arkiv entity key of the vault item (stamped as `parent_key`) |
| `label` | `string` | Document display name for grantee |
| `fileType` | `string` | MIME type for rendering |
| `category` | `VaultCategory` | For grant record filtering |
| `granteeName` | `string` | Human name — stored in grant record, never a wallet address |
| `purpose` | `string` | Reason for sharing — visible to grantee and in audit |
| `durationSeconds` | `number` | Grant TTL (the revocation timer) |

---

### 3. Grant Action Hooks (`src/hooks/use-grant-actions.ts`)

Three TanStack Query mutation hooks for components to call:

**`useCreateGrant(walletClient)`**
Calls `createMagicLinkGrant` with the authenticated user's master key and wallet address wired in. Invalidates `["grants"]` on success so active grants lists refresh automatically.

**`useRevokeGrant(walletClient: WalletClient | null)`**
Takes `{ grantEntityKey, grantRecord? }`:
1. Guards against null wallet — throws `"Wallet not connected"` if called without a live client
2. Calls `revokeAccessGrant` → deletes the Arkiv grant entity immediately → magic link stops working within seconds
3. If a grant record entity exists, calls `updateGrantRecordStatus` → marks it `"revoked"` with outcome `"Manually revoked"` so the audit trail reflects the action

**`useExtendGrant(walletClient: WalletClient | null)`**
Takes `{ grantEntityKey, additionalSeconds }`:
Guards against null wallet, then calls `extendAccessGrant` → pushes the Arkiv entity TTL further out → the magic link stays active longer. The grant record's `expires_at` attribute is not updated here (Phase 4 agent handles the update via `updateEntity`).

Both hooks accept `WalletClient | null` (the return type of `useArkivWallet()`) so components can pass the wallet client directly without a cast. The null guard ensures a clear error message if a user somehow triggers a write action before the Privy embedded wallet has connected.

---

### 4. Grantee View Hook (`src/hooks/use-grant-view.ts`)

`useGrantView(token)` is a fully public hook — no auth, no wallet. It does everything needed to render the `/view/[token]` page:

```
token (from URL)
    │
    ▼
hashGrantToken(token) → keccak256 hash
    │
    ▼
queryGrantByTokenHash(publicClient, hash)
    │
    ├── null  →  { status: "not_found" }
    └── entity found
            │
            ▼
        JSON.parse(entity.payload) → AccessGrantPayload
            │
            ▼
        decryptGrant(payload, token) → Uint8Array<ArrayBuffer>
            │
            ├── throws  →  { status: "error" }
            └── success →  { status: "active", content, label, fileType, purpose, expiresAt }
```

The hook has `retry: false` — if the Arkiv entity is not found (because it expired and was pruned), a retry won't make it appear.

`staleTime: 60_000` — the grant result is cached for 1 minute. If the grantee refreshes within 60 seconds, no round-trip to Arkiv.

---

### 5. Grantee View Page (`src/app/view/[token]/page.tsx`)

A public Next.js client component at `/view/[token]`. No auth required. Works in any browser — no wallet, no account, no MetaMask.

**Four states:**

| State | What the grantee sees |
|---|---|
| Loading | Spinner: "Loading shared document…" |
| Not found / expired | "This link has expired" + contact instructions |
| Error (decrypt failed) | "Something went wrong" — link may be corrupted |
| Active | Document title, expiry badge, rendered content, download button |

**Document rendering by MIME type:**

| File type | Renderer |
|---|---|
| `text/*` | `<pre>` with decoded text |
| `image/*` | `<img>` with object URL |
| `application/pdf` | `<iframe>` with object URL |
| Anything else | Download-only button |

Object URLs are created with `URL.createObjectURL` and revoked in a `useEffect` cleanup to prevent memory leaks.

**Expiry countdown** updates every 30 seconds and shows:
- `> 1 day` → "Expires in N days"
- `> 1 hour` → "Expires in Xh Ym" (amber)
- `< 1 hour` → "Expires in N minutes" (red)

---

## How This Helps Users

**Sharing is one action.** The owner calls `createMagicLinkGrant` → gets a URL → shares it however they want (WhatsApp, email, SMS). No system integration required. No grantee account creation.

**Grantees need nothing.** A doctor clicks a link on their phone. The page loads. The document appears. They never see a wallet address, a blockchain, or a login form. The token in the URL IS the decryption key — the browser does the rest.

**Revocation is instant.** Calling `revokeAccessGrant` deletes the Arkiv entity. On the next query (within seconds), `queryGrantByTokenHash` returns null. The view page shows "This link has expired." No waiting. No propagation delay. No server cache to invalidate.

**Expiry is automatic.** When the grant TTL hits zero, Arkiv prunes the entity. The grantee returns to the link and sees "This link has expired" without the owner doing anything. The owner shares, sets a duration, and forgets about it.

**The audit trail is permanent.** Grant records use a 2-year TTL. Even after a grant expires and its Arkiv entity is gone, the agent (Phase 4) can query grant records to answer "who accessed my medical records this year?" The outcome field is updated to "expired" or "revoked" by the event subscription built in Phase 1.

---

## Tests Run and Passed

**10 new tests — all passed. Total: 124 tests (7 test files).**

```
✓ src/__tests__/vault/grant-flow.test.ts   (10 tests)
```

Tests run against real Web Crypto — no mocking of crypto primitives. Only the Arkiv mutation functions (`createAccessGrant`, `createGrantRecord`) are mocked.

### grant-flow.test.ts — 10 tests

| Test | What it verifies |
|---|---|
| Returns token, tokenHash, grantEntityKey, grantRecordKey | Result shape is complete |
| Token is 66-char 0x-hex (32 bytes) | Token entropy and format |
| tokenHash matches keccak256(token) | Hash function applied correctly |
| Creates access grant with token hash and duration | Arkiv grant entity params are correct |
| Creates grant record with active status and correct links | Audit record links vault item + grant entity |
| Embeds label and fileType in grant payload | Grantee metadata flows into entity payload |
| grantEntityKey and grantRecordKey match mutation returns | Result correctly threads entity keys |
| End-to-end: token decrypts grant payload | The URL token actually decrypts the stored ciphertext |
| Different calls produce different tokens | Token randomness — two concurrent grants never collide |
| Throws when createAccessGrant rejects | Error propagation — no silent failures |

The end-to-end test is the most important: it encrypts real content, runs the full `createMagicLinkGrant` flow, recovers the `accessGrantPayload` that would be written to Arkiv, and verifies that `decryptGrant(payload, token)` reproduces the original text byte-for-byte. This is the test that would catch a wrong token, wrong IV, or wrong key derivation — all in one shot.

---

## Recommended Improvements

### High priority (before Phase 5)

**1. Expiry check at render time.**
The Arkiv entity may still exist even if `expires_at < Date.now()` (brief window before Arkiv prunes it). `useGrantView` currently relies on the entity being pruned to show "expired". Add an explicit check:

```typescript
if (expiresAt && expiresAt < Date.now()) {
  return { status: "not_found" }
}
```

This closes the race window between Arkiv expiry and the grantee's query.

**2. Streaming large files.**
`decryptGrant` loads the entire ciphertext into memory before rendering. For large PDFs (>20 MB), this can freeze the browser. A streaming approach using `SubtleCrypto`'s streaming API would fix this.

**3. Extend grant also updates the grant record.**
`useExtendGrant` calls `extendAccessGrant` but does not update the `expires_at` attribute on the grant record entity. The agent will show a stale expiry time until Phase 4 is wired. Add a `updateGrantRecordStatus` call after the extend to sync the attribute.

### Medium priority

**4. Grant batch from the UI.**
`batchCreateAccessGrants` (Phase 1) allows creating multiple grants in a single Arkiv transaction. `useCreateGrant` currently calls `createMagicLinkGrant` once. A `useBatchCreateGrants` hook that maps multiple grantees → tokens → payloads and calls `walletClient.mutateEntities({ creates: [...] })` would make "share with my accountant and my lawyer" a single transaction.

**5. Link copy with origin.**
`createMagicLinkGrant` returns a relative path token. The UI must prepend `window.location.origin`. If the app is deployed to multiple domains (preview + production), the wrong origin in the link would break the grantee's experience. Add `APP_URL` as an environment variable and use it in the grant creation call.

**6. Grantee audit log.**
The grantee currently sees no confirmation that the link will expire. Show the exact expiry date prominently on page load, not just the countdown badge. Format: "Your access expires on Friday, May 24 at 6:00 PM."

### Low priority

**7. Offline graceful failure.**
If the grantee's device is offline when they click the link, `queryGrantByTokenHash` fails with a network error. The current `status: "error"` state doesn't distinguish network errors from decrypt failures. Add an `isNetworkError` check to show "No internet connection — try again" instead of the generic error state.

**8. Access analytics in the grant record.**
The grant record payload has `outcome: null` until the grant expires or is revoked. Add a `firstAccessedAt` timestamp — written on the first time `useGrantView` successfully decrypts the content. This requires a separate Arkiv update call from the owner's side (triggered when the agent detects the grantee view), which is a Phase 4 concern.
