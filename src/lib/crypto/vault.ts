import type { VaultItemPayload } from "@/lib/arkiv/types"
import { bufToHex, hexToBytes } from "./keys"

export async function encryptVaultItem(
  content: string | ArrayBuffer,
  masterKey: CryptoKey
): Promise<VaultItemPayload> {
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
    ciphertext: bufToHex(ciphertext),
    iv: bufToHex(iv),
    wrappedItemKey: bufToHex(wrappedItemKey),
    wrapIv: bufToHex(wrapIv),
    version: 1,
  }
}

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

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBytes(payload.iv) },
    itemKey,
    hexToBytes(payload.ciphertext)
  )

  return new Uint8Array(plaintext)
}
