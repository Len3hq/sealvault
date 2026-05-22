# SealVault — IPFS + Pinata Storage Implementation

## Why this change is needed

The Arkiv Braga chain enforces a hard limit of **100,002 characters** on transaction data.
Because AES-GCM encrypted bytes are random and cannot be compressed, and because the
current code hex-encodes ciphertext (doubling its size), the effective ceiling for a
stored file is roughly **~20 KB**. That rules out real PDFs, images, and videos.

**The fix:** store only a tiny IPFS address (CID, ~59 chars) on-chain. The encrypted
bytes live on IPFS via Pinata. The security model is identical — the ciphertext is
AES-256-GCM encrypted before it ever leaves the browser, so Pinata only ever holds
meaningless random bytes.

---

## How the data flows after this change

### Upload
```
Browser
  1. Encrypt file bytes with master key → raw ciphertext (Uint8Array)
  2. POST ciphertext to /api/ipfs/upload → Pinata pins it → returns CID (~59 chars)
  3. Store { cid, iv, wrappedItemKey, wrapIv, version } on Arkiv chain (~200 bytes)
```

### Share (create magic link)
```
Browser
  1. Read vault item from chain → get cid + key material
  2. Fetch ciphertext from IPFS using cid
  3. Decrypt with master key → plaintext
  4. Re-encrypt plaintext under one-time token key → grantCiphertext (Uint8Array)
  5. Upload grantCiphertext to IPFS → grantCID
  6. Store { grantCID, grantIv, label, fileType } on Arkiv chain (~200 bytes)
  7. Return magic link: /view/<token>
```

### View (recipient opens magic link)
```
Browser
  1. Token is extracted from the URL
  2. Fetch grant entity from chain → get grantCID + grantIv
  3. Fetch encrypted bytes from IPFS using grantCID
  4. Decrypt with key derived from token → plaintext
  5. Render in browser (no server sees the plaintext)
```

---

## Prerequisites

1. Create a free account at https://pinata.cloud
2. Go to **API Keys → New Key → enable Admin → Generate**
3. Copy the **JWT** (long string starting with `eyJ...`)

---

## Step 1 — Environment variable

Add to `.env.local`:

```bash
# Pinata (IPFS pinning) — server-side only, never exposed to the browser
PINATA_JWT=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Step 2 — Create the IPFS API route

Create **`src/app/api/ipfs/route.ts`** (new file):

```typescript
import { NextRequest, NextResponse } from "next/server"

// Accepts raw binary, pins it to IPFS via Pinata, returns the CID.
// Runs server-side so PINATA_JWT is never exposed to the browser.
export async function POST(request: NextRequest) {
  const jwt = process.env.PINATA_JWT
  if (!jwt) {
    return NextResponse.json({ error: "Pinata not configured" }, { status: 500 })
  }

  const bytes = await request.arrayBuffer()

  const formData = new FormData()
  formData.append("file", new Blob([bytes]), "vault.bin")

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json(
      { error: `Pinata error: ${text}` },
      { status: res.status }
    )
  }

  const data = (await res.json()) as { IpfsHash: string }
  return NextResponse.json({ cid: data.IpfsHash })
}
```

---

## Step 3 — Create the IPFS utility module

Create **`src/lib/ipfs.ts`** (new file):

```typescript
// Upload encrypted bytes to IPFS via our server route (keeps PINATA_JWT hidden).
export async function uploadToIPFS(bytes: Uint8Array): Promise<string> {
  const res = await fetch("/api/ipfs/upload", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "IPFS upload failed")
  }
  const { cid } = (await res.json()) as { cid: string }
  return cid
}

// Fetch encrypted bytes from IPFS. Data is ciphertext so any public gateway is fine.
export async function fetchFromIPFS(cid: string): Promise<Uint8Array> {
  const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`)
  if (!res.ok) throw new Error(`IPFS fetch failed for CID: ${cid}`)
  return new Uint8Array(await res.arrayBuffer())
}
```

---

## Step 4 — Update the type definitions

In **`src/lib/arkiv/types.ts`**, change `VaultItemPayload` and `AccessGrantPayload`:

```typescript
// BEFORE
export interface VaultItemPayload {
  ciphertext: string      // hex-encoded encrypted file — TOO LARGE for chain
  iv: string
  wrappedItemKey: string
  wrapIv: string
  version: number
}

// AFTER
export interface VaultItemPayload {
  cid: string             // IPFS CID (~59 chars) — tiny on-chain footprint
  iv: string
  wrappedItemKey: string
  wrapIv: string
  version: number
}
```

```typescript
// BEFORE
export interface AccessGrantPayload {
  grantCiphertext: string // hex-encoded re-encrypted file — TOO LARGE for chain
  grantIv: string
  label?: string
  fileType?: string
}

// AFTER
export interface AccessGrantPayload {
  grantCID: string        // IPFS CID for the grant ciphertext
  grantIv: string
  label?: string
  fileType?: string
}
```

No other interfaces in this file change.

---

## Step 5 — Update the vault crypto functions

Replace the entire **`src/lib/crypto/vault.ts`**:

```typescript
import type { VaultItemPayload } from "@/lib/arkiv/types"
import { fetchFromIPFS } from "@/lib/ipfs"
import { bufToHex, hexToBytes } from "./keys"

export interface EncryptedVaultItem {
  ciphertext: Uint8Array  // raw bytes — caller uploads this to IPFS
  iv: string
  wrappedItemKey: string
  wrapIv: string
  version: number
}

// Returns raw ciphertext bytes separately from the key material.
// Caller uploads ciphertext to IPFS, then stores { cid, iv, wrappedItemKey, wrapIv, version } on-chain.
export async function encryptVaultItem(
  content: string | ArrayBuffer,
  masterKey: CryptoKey
): Promise<EncryptedVaultItem> {
  const itemKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  )

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext =
    typeof content === "string"
      ? new TextEncoder().encode(content)
      : new Uint8Array(content)

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    itemKey,
    plaintext
  )

  const wrapIv = crypto.getRandomValues(new Uint8Array(12))
  const wrappedItemKey = await crypto.subtle.wrapKey("raw", itemKey, masterKey, {
    name: "AES-GCM",
    iv: wrapIv,
  })

  return {
    ciphertext: new Uint8Array(ciphertext),
    iv: bufToHex(iv),
    wrappedItemKey: bufToHex(wrappedItemKey),
    wrapIv: bufToHex(wrapIv),
    version: 1,
  }
}

// Fetches the ciphertext from IPFS using payload.cid, then decrypts with the master key.
export async function decryptVaultItem(
  payload: VaultItemPayload,
  masterKey: CryptoKey
): Promise<Uint8Array<ArrayBuffer>> {
  const ciphertext = await fetchFromIPFS(payload.cid)

  const itemKey = await crypto.subtle.unwrapKey(
    "raw",
    hexToBytes(payload.wrappedItemKey),
    masterKey,
    { name: "AES-GCM", iv: hexToBytes(payload.wrapIv) },
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  )

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBytes(payload.iv) },
    itemKey,
    ciphertext
  )

  return new Uint8Array(plaintext)
}
```

---

## Step 6 — Update the grant crypto functions

Replace the entire **`src/lib/crypto/grant.ts`**:

```typescript
import { keccak256 } from "viem"
import type { AccessGrantPayload } from "@/lib/arkiv/types"
import { fetchFromIPFS } from "@/lib/ipfs"
import { bufToHex, hexToBytes } from "./keys"

async function deriveGrantKey(token: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    hexToBytes(token),
    "HKDF",
    false,
    ["deriveKey"]
  )
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode("grant"),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

export function generateGrantToken(): string {
  return bufToHex(crypto.getRandomValues(new Uint8Array(32)))
}

export function hashGrantToken(token: string): string {
  const hex = (token.startsWith("0x") ? token : `0x${token}`) as `0x${string}`
  return keccak256(hex)
}

export interface EncryptedGrant {
  ciphertext: Uint8Array  // raw bytes — caller uploads this to IPFS
  grantIv: string
}

// Returns raw ciphertext bytes separately.
// Caller uploads to IPFS and stores { grantCID, grantIv, label, fileType } on-chain.
export async function encryptForGrant(
  content: Uint8Array<ArrayBuffer>,
  token: string
): Promise<EncryptedGrant> {
  const grantKey = await deriveGrantKey(token)
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    grantKey,
    content
  )

  return {
    ciphertext: new Uint8Array(ciphertext),
    grantIv: bufToHex(iv),
  }
}

// Fetches the ciphertext from IPFS using payload.grantCID, then decrypts with the token.
export async function decryptGrant(
  payload: AccessGrantPayload,
  token: string
): Promise<Uint8Array<ArrayBuffer>> {
  const grantKey = await deriveGrantKey(token)
  const ciphertext = await fetchFromIPFS(payload.grantCID)

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBytes(payload.grantIv) },
    grantKey,
    ciphertext
  )

  return new Uint8Array(plaintext)
}
```

---

## Step 7 — Update the grant creation flow

Replace the entire **`src/lib/vault/grant-flow.ts`**:

```typescript
import {
  decryptVaultItem,
  generateGrantToken,
  hashGrantToken,
  encryptForGrant,
} from "@/lib/crypto"
import { uploadToIPFS } from "@/lib/ipfs"
import {
  createAccessGrant,
  createGrantRecord,
} from "@/lib/arkiv/mutations"
import type { WalletClient, VaultItemPayload, AccessGrantPayload } from "@/lib/arkiv/types"
import type { VaultCategory } from "@/lib/arkiv/constants"
import { GRANT_STATUS } from "@/lib/arkiv/constants"

export interface CreateGrantParams {
  vaultItemPayload: VaultItemPayload
  masterKey: CryptoKey
  walletClient: WalletClient
  ownerAddress: string
  vaultItemKey: string
  label: string
  fileType: string
  category: VaultCategory
  granteeName: string
  purpose: string
  durationSeconds: number
}

export interface CreateGrantResult {
  token: string
  tokenHash: string
  grantEntityKey: string
  grantRecordKey: string
}

export async function createMagicLinkGrant(
  params: CreateGrantParams
): Promise<CreateGrantResult> {
  const {
    vaultItemPayload,
    masterKey,
    walletClient,
    ownerAddress,
    vaultItemKey,
    label,
    fileType,
    category,
    granteeName,
    purpose,
    durationSeconds,
  } = params

  // Step 1: Fetch from IPFS and decrypt with master key
  const decrypted = await decryptVaultItem(vaultItemPayload, masterKey)

  // Step 2: Generate one-time token for the magic link
  const token = generateGrantToken()
  const tokenHash = hashGrantToken(token)

  // Step 3: Re-encrypt under token key, upload ciphertext to IPFS
  const { ciphertext: grantCiphertext, grantIv } = await encryptForGrant(
    new Uint8Array(decrypted.buffer) as Uint8Array<ArrayBuffer>,
    token
  )
  const grantCID = await uploadToIPFS(grantCiphertext)

  const accessGrantPayload: AccessGrantPayload = {
    grantCID,
    grantIv,
    label,
    fileType,
  }

  // Step 4: Store tiny grant entity on-chain (CID + IV + metadata, ~200 bytes)
  const { entityKey: grantEntityKey } = await createAccessGrant(walletClient, {
    accessGrantPayload,
    tokenHash,
    parentVaultItemKey: vaultItemKey,
    grantedByAddress: ownerAddress,
    purpose,
    durationSeconds,
  })

  // Step 5: Audit trail record
  const { entityKey: grantRecordKey } = await createGrantRecord(walletClient, {
    granteeName,
    parentVaultItemKey: vaultItemKey,
    grantEntityKey,
    status: GRANT_STATUS.ACTIVE,
    category,
    purpose,
    durationSeconds,
  })

  return { token, tokenHash, grantEntityKey, grantRecordKey }
}
```

---

## Step 8 — Update the vault upload page

In **`src/app/vault/page.tsx`**, make two changes:

**Change the import line:**
```typescript
// BEFORE
import { createVaultItem, MAX_VAULT_ITEM_BYTES } from "@/lib/arkiv/mutations"

// AFTER
import { createVaultItem } from "@/lib/arkiv/mutations"
import { uploadToIPFS } from "@/lib/ipfs"
```

**Change the `handleUpload` function:**
```typescript
// BEFORE
async function handleUpload() {
  if (!file) return
  if (file.size > MAX_VAULT_ITEM_BYTES) {
    setError(`File too large — maximum size is ${Math.round(MAX_VAULT_ITEM_BYTES / 1024)} KB`)
    return
  }
  if (!masterKey) { setError("Vault is locked — refresh and sign in again"); return }
  if (!walletAddress) { setError("No wallet address found — please reconnect"); return }
  if (!walletClient) { setError("Wallet not ready — wait a moment and retry"); return }
  setUploading(true)
  setError(null)
  try {
    const content = await file.arrayBuffer()
    const encryptedPayload = await encryptVaultItem(content, masterKey)
    await createVaultItem(walletClient as unknown as WalletClient, {
      encryptedPayload,
      label: label || file.name,
      category,
      fileType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      ownerAddress: walletAddress,
    })
    onSuccess()
    onClose()
  } catch (err) {
    setError(err instanceof Error ? err.message : "Upload failed")
  } finally {
    setUploading(false)
  }
}

// AFTER
async function handleUpload() {
  if (!file) return
  if (!masterKey) { setError("Vault is locked — refresh and sign in again"); return }
  if (!walletAddress) { setError("No wallet address found — please reconnect"); return }
  if (!walletClient) { setError("Wallet not ready — wait a moment and retry"); return }
  setUploading(true)
  setError(null)
  try {
    const content = await file.arrayBuffer()
    // Step 1: encrypt in browser
    const { ciphertext, ...keyMaterial } = await encryptVaultItem(content, masterKey)
    // Step 2: upload encrypted bytes to IPFS (server proxies to Pinata)
    const cid = await uploadToIPFS(ciphertext)
    // Step 3: store tiny on-chain record (CID + key material, ~200 bytes)
    await createVaultItem(walletClient as unknown as WalletClient, {
      encryptedPayload: { cid, ...keyMaterial },
      label: label || file.name,
      category,
      fileType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      ownerAddress: walletAddress,
    })
    onSuccess()
    onClose()
  } catch (err) {
    setError(err instanceof Error ? err.message : "Upload failed")
  } finally {
    setUploading(false)
  }
}
```

Also remove the inline size warning from the file picker since there's no longer a meaningful limit:

```typescript
// BEFORE
<p className={`text-xs ${file.size > MAX_VAULT_ITEM_BYTES ? "text-rose-400" : "text-slate-400"}`}>
  {formatSize(file.size)}
  {file.size > MAX_VAULT_ITEM_BYTES && ` — exceeds ${Math.round(MAX_VAULT_ITEM_BYTES / 1024)} KB limit`}
</p>

// AFTER
<p className="text-xs text-slate-400">{formatSize(file.size)}</p>
```

And the empty-state hint:
```typescript
// BEFORE
<p className="text-xs text-slate-500">Any type · max {Math.round(MAX_VAULT_ITEM_BYTES / 1024)} KB</p>

// AFTER
<p className="text-xs text-slate-500">PDF, image, video — any type</p>
```

---

## Step 9 — Update vault-items mutation

In **`src/lib/arkiv/mutations/vault-items.ts`**, the on-chain payload is now tiny so the
size guard is no longer meaningful. Replace the file with:

```typescript
import { buildVaultItemEntity } from "../schemas"
import type { WalletClient, BuildVaultItemParams } from "../types"

// Gas is fixed to avoid eth_estimateGas — kept as a precaution even though
// the on-chain payload is now tiny (~200 bytes) with IPFS storage.
const VAULT_ITEM_GAS = 50_000_000n

export async function createVaultItem(
  walletClient: WalletClient,
  params: BuildVaultItemParams
): Promise<{ entityKey: string }> {
  const entity = buildVaultItemEntity(params)
  const result = await walletClient.createEntity(entity, { gas: VAULT_ITEM_GAS })
  return { entityKey: result.entityKey }
}

export async function deleteVaultItem(
  walletClient: WalletClient,
  entityKey: string
): Promise<void> {
  await walletClient.deleteEntity({ entityKey: entityKey as `0x${string}` })
}
```

Update **`src/lib/arkiv/mutations/index.ts`** — remove `MAX_VAULT_ITEM_BYTES` from the export:

```typescript
// BEFORE
export { createVaultItem, deleteVaultItem, MAX_VAULT_ITEM_BYTES } from "./vault-items"

// AFTER
export { createVaultItem, deleteVaultItem } from "./vault-items"
```

---

## File change summary

| File | Action | What changes |
|---|---|---|
| `.env.local` | Edit | Add `PINATA_JWT` |
| `src/app/api/ipfs/route.ts` | **Create** | Pinata upload proxy |
| `src/lib/ipfs.ts` | **Create** | `uploadToIPFS` + `fetchFromIPFS` |
| `src/lib/arkiv/types.ts` | Edit | `VaultItemPayload.ciphertext` → `cid`; `AccessGrantPayload.grantCiphertext` → `grantCID` |
| `src/lib/crypto/vault.ts` | Edit | `encryptVaultItem` returns raw bytes; `decryptVaultItem` fetches from IPFS |
| `src/lib/crypto/grant.ts` | Edit | `encryptForGrant` returns raw bytes; `decryptGrant` fetches from IPFS |
| `src/lib/vault/grant-flow.ts` | Edit | Upload grant ciphertext to IPFS; pass `grantCID` on-chain |
| `src/app/vault/page.tsx` | Edit | Upload ciphertext to IPFS; pass `cid` to `createVaultItem` |
| `src/lib/arkiv/mutations/vault-items.ts` | Edit | Remove `MAX_VAULT_ITEM_BYTES`; keep gas fix |
| `src/lib/arkiv/mutations/index.ts` | Edit | Remove `MAX_VAULT_ITEM_BYTES` export |

`src/hooks/use-grant-view.ts` requires **no changes** — it calls `decryptGrant(grantPayload, token)`,
and the updated `decryptGrant` fetches from IPFS internally before decrypting.

---

## Notes for the implementer

- **`fetchFromIPFS` is called client-side** directly against the Pinata public gateway.
  The data is ciphertext so no authentication is needed and no private data is exposed.
  If you want to avoid Pinata branding or rate limits, swap the URL for any IPFS gateway
  (e.g. `https://ipfs.io/ipfs/${cid}`).

- **`uploadToIPFS` must be called client-side** (it hits `/api/ipfs/upload` which is a
  Next.js server route). It cannot be called from a Node.js server context directly
  (use the Pinata SDK or a direct `fetch` to Pinata from server code if needed there).

- **Existing vault items stored with the old `ciphertext` field** will break after this
  migration — `decryptVaultItem` will look for `payload.cid` which won't exist on old
  records. If backward compatibility matters, add a guard:
  ```typescript
  // In decryptVaultItem, before fetchFromIPFS:
  if ('ciphertext' in payload) {
    // legacy path: ciphertext was stored directly as hex
    const ciphertext = hexToBytes((payload as { ciphertext: string }).ciphertext)
    // ... proceed with decryption using ciphertext directly
  }
  ```

- **Pinata free tier** gives 1 GB storage and 100 GB bandwidth per month. Each pin is
  permanent until manually unpinned. You may want to unpin the IPFS content when a vault
  item is deleted — call `DELETE https://api.pinata.cloud/pinning/unpin/{cid}` from a
  server route triggered alongside `deleteVaultItem`.
