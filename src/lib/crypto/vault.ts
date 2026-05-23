import type { VaultItemPayload } from "@/lib/arkiv/types"
import { fetchFromIPFS } from "@/lib/ipfs"
import { bufToHex, hexToBytes } from "./keys"

export interface EncryptedVaultItem {
  ciphertext: Uint8Array<ArrayBuffer>
  iv: string
  wrappedItemKey: string
  wrapIv: string
  version: number
}

// Returns raw ciphertext bytes separately from the key material.
// Caller uploads ciphertext to IPFS then stores { cid, iv, wrappedItemKey, wrapIv, version } on-chain.
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

// Fetches ciphertext from IPFS using payload.cid, then decrypts with the master key.
// Legacy guard: if payload still has the old `ciphertext` hex field (pre-IPFS records),
// decrypts inline without an IPFS fetch.
export async function decryptVaultItem(
  payload: VaultItemPayload,
  masterKey: CryptoKey
): Promise<Uint8Array<ArrayBuffer>> {
  const itemKey = await crypto.subtle.unwrapKey(
    "raw",
    hexToBytes(payload.wrappedItemKey),
    masterKey,
    { name: "AES-GCM", iv: hexToBytes(payload.wrapIv) },
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  )

  const ciphertext =
    "cid" in payload
      ? await fetchFromIPFS(payload.cid)
      : hexToBytes((payload as unknown as { ciphertext: string }).ciphertext)

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBytes(payload.iv) },
    itemKey,
    ciphertext
  )

  return new Uint8Array(plaintext)
}
