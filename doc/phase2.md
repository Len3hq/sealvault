# Phase 2 — Auth & Encryption

## What Was Built

Phase 2 wires in authentication (Privy) and the cryptographic layer that protects every document. No document touches Arkiv unencrypted. The master key never leaves the browser tab. Users see none of this — they click "Sign in with Google" and their vault opens.

### Files added

```
src/
├── app/
│   ├── layout.tsx          — updated to wrap the app in <Providers>
│   ├── page.tsx            — updated with auth-aware loading/login/vault-open states
│   └── providers.tsx       — NEW: PrivyProvider + QueryClientProvider tree
├── lib/
│   └── crypto/
│       ├── keys.ts         — NEW: hexToBytes, bufToHex, deriveMasterKey, SIGN_MESSAGE
│       ├── vault.ts        — NEW: encryptVaultItem, decryptVaultItem
│       ├── grant.ts        — NEW: generateGrantToken, hashGrantToken, encryptForGrant, decryptGrant
│       └── index.ts        — NEW: barrel export
└── hooks/
    ├── use-vault-auth.ts   — NEW: Privy + master key derivation
    └── use-vault-items.ts  — NEW: TanStack Query wrappers (useVaultItems, useUploadVaultItem)
```

---

### 1. Providers (`src/app/providers.tsx`)

Wraps the entire app with:
- **PrivyProvider** — configured for `google`, `apple`, and `email` login methods. Ethereum embedded wallets are set to `createOnLogin: "users-without-wallets"` so every new user silently gets a wallet without any prompt.
- **QueryClientProvider** — TanStack Query with 30-second stale time and 2 retries.

The `Providers` component is a client component mounted in the root layout so all child server and client components can access auth state and query cache.

---

### 2. Crypto Layer (`src/lib/crypto/`)

Three pure functions modules. No React. No Privy. Fully testable in isolation.

#### `keys.ts`

**`hexToBytes(hex: string): Uint8Array<ArrayBuffer>`**
Converts a hex string (with or without `0x` prefix) to a typed byte array backed by an `ArrayBuffer`. This is the primitive used everywhere encrypted data moves between hex storage and Web Crypto operations.

**`bufToHex(buf: ArrayBuffer | Uint8Array): string`**
Inverse of `hexToBytes`. Converts binary data to a `0x`-prefixed lowercase hex string for storage in Arkiv entity attributes and payloads.

**`deriveMasterKey(signature: string): Promise<CryptoKey>`**
The key derivation function. Steps:
1. Takes the raw hex signature from the Privy embedded wallet
2. Applies `keccak256` (via viem) to get a deterministic 32-byte hash
3. Imports the hash as HKDF key material
4. Derives a 256-bit AES-GCM key with domain label `"vault-master"` and a zero salt
5. Returns a non-extractable `CryptoKey` with usages: `encrypt`, `decrypt`, `wrapKey`, `unwrapKey`

The key is deterministic: the same Google account signs the same message and gets the same key, every time. The key never leaves memory — it is not serialised, cached, or stored anywhere.

**`SIGN_MESSAGE`**
The fixed message every embedded wallet signs: `"SealVault master key v1 — sign to unlock your vault"`. Changing this string invalidates all existing encrypted data, so it is a named constant.

#### `vault.ts`

**`encryptVaultItem(content, masterKey): Promise<VaultItemPayload>`**
Encrypts a document (string or binary) for storage on Arkiv:
1. Generates a random **per-item AES-GCM-256 key** — limits blast radius to one document if the key were ever compromised
2. Encrypts the content with the item key (random 12-byte IV each time)
3. Wraps the item key with the master key (separate random wrapIv)
4. Returns `{ ciphertext, iv, wrappedItemKey, wrapIv, version: 1 }` — all as `0x`-prefixed hex strings, ready to pass into `buildVaultItemEntity`

**`decryptVaultItem(payload, masterKey): Promise<Uint8Array>`**
Reverses encryption:
1. Unwraps the item key using the master key + wrapIv
2. Decrypts the ciphertext using the recovered item key + iv
3. Returns raw bytes — caller converts to string or Blob depending on file type

#### `grant.ts`

**`generateGrantToken(): string`**
Generates a cryptographically random 32-byte token, hex-encoded. This becomes the URL slug: `/view/0x...`.

**`hashGrantToken(token: string): string`**
Returns `keccak256(token)`. Only the hash is stored on Arkiv — the token itself lives only in the magic link URL. A grantee without the URL cannot reconstruct the token.

**`encryptForGrant(content, token): Promise<AccessGrantPayload>`**
Re-encrypts decrypted document bytes under a key derived from the magic link token:
1. Derives a per-grant AES-GCM-256 key from the token via HKDF (domain: `"grant"`)
2. Encrypts the content with a random IV
3. Returns `{ grantCiphertext, grantIv }` — stored in the Arkiv access grant entity payload

**`decryptGrant(payload, token): Promise<Uint8Array>`**
Used on the `/view/[token]` page: derives the same grant key from the URL token, decrypts, returns the original bytes. The grantee needs no account — the token in the URL IS the key material.

---

### 3. Auth Hook (`src/hooks/use-vault-auth.ts`)

`useVaultAuth()` is the single hook any component calls to know the vault state.

**Flow:**
1. `usePrivy()` provides `{ ready, authenticated, user, login, logout }`
2. `useWallets()` provides the list of connected wallets
3. On mount (when `authenticated && embeddedWallet && !masterKey`), the hook calls `embeddedWallet.sign(SIGN_MESSAGE)` — this is the Privy silent sign, no UI prompt for embedded wallets
4. The signature is passed to `deriveMasterKey()` and the resulting `CryptoKey` is stored in React state
5. `logout()` clears the master key from state before calling Privy's logout

**Returns:**
| Field | Type | Meaning |
|---|---|---|
| `ready` | boolean | Privy SDK has initialised |
| `isAuthenticated` | boolean | User is logged in |
| `masterKey` | `CryptoKey \| null` | The AES master key; null until derived |
| `isDerivingKey` | boolean | Signing + derivation in progress |
| `isVaultReady` | boolean | Ready to use — either logged out or logged in with key derived |
| `walletAddress` | string | Embedded wallet address (the Arkiv entity owner) |
| `publicClient` | PublicClientType | Pre-wired Arkiv client for queries |
| `login` | fn | Opens the Privy login modal |
| `logout` | fn | Clears key + logs out |

---

### 4. Vault Item Hooks (`src/hooks/use-vault-items.ts`)

**`useVaultItems(options?)`** — TanStack Query wrapper around `queryVaultItems`. Scoped to the authenticated wallet address. Auto-fetches when the wallet address is available. Returns the `entities` array directly via `select`.

**`useVaultItem(entityKey)`** — Fetches a single entity. Used on document detail pages.

**`useUploadVaultItem(walletClient)`** — Mutation hook for the full upload flow:
1. Reads the `File` as `ArrayBuffer`
2. Calls `encryptVaultItem(content, masterKey)`
3. Calls `createVaultItem(walletClient, { encryptedPayload, label, category, fileType, sizeBytes, ownerAddress })`
4. Invalidates the `["vault-items"]` query on success

**`decryptItem(payload, masterKey)`** — Convenience async function that calls `decryptVaultItem`. Used in document viewer components.

---

### 5. Updated UI (`src/app/page.tsx`)

The home page now has four states, driven by `useVaultAuth`:

1. **Loading** — Privy SDK initialising. Shows a spinner.
2. **Unlocking** — User is authenticated, master key derivation is running. Shows "Unlocking your vault…" — the user never sees blockchain words.
3. **Signed out** — Shows the SealVault landing UI with a single "Sign in to open your vault" button that opens the Privy modal.
4. **Vault open** — Master key is in memory. Shows the vault-ready state. Full dashboard arrives in Phase 5.

---

## How This Helps Users

**Signing in is signing in.** The user clicks "Sign in with Google" and their vault opens. Privy creates an embedded wallet in the background; `use-vault-auth` silently signs the derivation message; the master key materialises in memory. The user never sees a wallet, a transaction, or a hex address.

**Every document is encrypted before it leaves the browser.** `encryptVaultItem` runs entirely in the Web Crypto API — no library, no server. The ciphertext is what gets stored on Arkiv. Even if someone extracted the raw Arkiv entity, they would have random bytes with no decryption key.

**Each document has its own key.** Per-item key wrapping means that if the master key derivation algorithm were ever broken for one item, all other items remain unaffected. The master key wraps item keys; it never directly encrypts content.

**Magic links are self-contained.** `encryptForGrant` creates a payload the grantee can decrypt using only the URL token — no account, no API call for the key. The Arkiv grant entity holds the encrypted content, and the token in the URL holds the key material. When the Arkiv entity expires (TTL), the content disappears even if someone kept the token.

**Logout is secure.** `handleLogout` sets `masterKey` to `null` before calling Privy's logout. The CryptoKey was never extractable, so it can't be serialised or stored. Closing the tab achieves the same result.

---

## Tests Run and Passed

**47 new tests — all passed. Total: 114 tests (6 test files).**

```
✓ src/__tests__/crypto/keys.test.ts    (19 tests)
✓ src/__tests__/crypto/vault.test.ts   (13 tests)
✓ src/__tests__/crypto/grant.test.ts   (15 tests)
```

All crypto tests run against Node.js's built-in Web Crypto API (available globally in Node 18+). No mocking.

### keys.test.ts — 19 tests

| Group | Tests |
|---|---|
| `hexToBytes` | Converts plain hex; strips `0x` prefix; handles all-zero bytes; handles 32-byte value; throws on odd-length string |
| `bufToHex` | Converts Uint8Array; converts ArrayBuffer; pads single-digit bytes with leading zero; always starts with `0x` |
| Round-trip | `bufToHex(hexToBytes(x)) === x` for random bytes; for known hex string |
| `deriveMasterKey` | Returns CryptoKey; AES-GCM algorithm; 256-bit length; non-extractable; correct usages (encrypt, decrypt, wrapKey, unwrapKey); same signature → functionally identical key (cross-encrypt test); different signatures → different keys (cross-decrypt fails); accepts signature without `0x` prefix |

### vault.test.ts — 13 tests

| Group | Tests |
|---|---|
| `encryptVaultItem` | Returns VaultItemPayload; all fields start with `0x`; unique IVs per call; unique ciphertext per call; accepts ArrayBuffer input; accepts empty string |
| `decryptVaultItem` | String round-trip; binary (256-byte) round-trip; returns Uint8Array; empty string round-trip; 1 MB binary round-trip; throws with wrong master key; throws with tampered ciphertext |

### grant.test.ts — 15 tests

| Group | Tests |
|---|---|
| `generateGrantToken` | Returns `0x`-prefixed hex; is 66 characters (32 bytes); generates unique tokens |
| `hashGrantToken` | Returns 64-char keccak256 hash; deterministic; different input → different hash; handles token without `0x` prefix |
| `encryptForGrant + decryptGrant` | Text round-trip; 256-byte binary round-trip; returns Uint8Array; payload has correct fields; unique ciphertext per call; fails with different token; fails with tampered ciphertext; 512 KB round-trip |

**Technical notes:**
- `crypto.getRandomValues` is capped at 65,536 bytes per call in jsdom. Large-payload tests use a chunked helper `makeRandomBytes(size)` that fills in 64 KB slices.
- `Uint8Array<ArrayBuffer>` (TypeScript 5.9 generic) is used explicitly in `hexToBytes` and `encryptForGrant` parameters to satisfy the Web Crypto API's `BufferSource` type, which requires `ArrayBufferView<ArrayBuffer>` rather than the default `Uint8Array<ArrayBufferLike>`.

---

## Recommended Improvements

### High priority (before Phase 3)

**1. Session persistence for the master key.**
Currently the master key is lost on every page refresh — the user's embedded wallet must sign again. Privy's embedded wallet re-signs silently (no UI prompt), so this works, but adds ~200ms latency on every page load. An alternative: store the signature (not the key) in `sessionStorage` so it survives navigation without re-signing. The key must still be re-derived from it, but that is fast.

**2. Key versioning.**
`SIGN_MESSAGE` is hard-coded as v1. If the derivation algorithm ever needs to change (e.g., different HKDF params), there is no migration path. Add a `version` field to the vault item payload and check it on decrypt so old items can be handled alongside new ones.

**3. Validate file types and sizes before encrypting.**
`useUploadVaultItem` accepts any `File` with no size check. Encrypting a 1 GB file and then failing on the Arkiv entity creation wastes time and tokens. Add a guard: `if (file.size > 10 * 1024 * 1024) throw new Error("File exceeds 10 MB limit")`.

### Medium priority

**4. Streaming encryption for large files.**
The current `encryptVaultItem` loads the entire file into memory as an `ArrayBuffer`. Files over ~50 MB will stall on low-memory devices. The Web Crypto API supports streaming via `TransformStream` — implement a chunked encrypt path for large files.

**5. Add a `WalletClient` context.**
`useUploadVaultItem` takes `walletClient` as a parameter because the Arkiv wallet client isn't available without Privy's active wallet. A context provider that creates and memoises the `WalletArkivClient` from the Privy embedded wallet would simplify every hook and component in Phases 3–5.

**6. Error boundary for derivation failure.**
If `embeddedWallet.sign()` throws (e.g., Privy rate limit, wallet locked), the `use-vault-auth` hook currently only `console.error`s. Show a user-facing error state: "Your vault couldn't be unlocked. Try signing in again."

### Low priority

**7. Encrypt file name.**
The `label` attribute on the vault item entity is stored in plaintext on Arkiv (it needs to be for filtering). A separate encrypted filename stored in the payload would add privacy for sensitive document names. Display names remain the same; actual filenames stay encrypted.

**8. Key rotation flow.**
If a user suspects their session was compromised, there is no way to re-encrypt all items under a new key. A rotation function that decrypts every item with the old master key and re-encrypts with a new one would close this gap — expensive but necessary for a full production offering.
