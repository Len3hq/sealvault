import { recoverMessageAddress } from "viem"
import { SIGN_MESSAGE } from "@/lib/crypto/keys"

/**
 * Verifies the x-owner-address + x-signature headers.
 * Returns the checksummed owner address on success, null on failure.
 * The signature must be a personal_sign of SIGN_MESSAGE from the owner's wallet.
 */
export async function verifyOwner(req: Request): Promise<string | null> {
  const ownerAddress = req.headers.get("x-owner-address")
  const signature = req.headers.get("x-signature")
  if (!ownerAddress || !signature) return null

  try {
    const recovered = await recoverMessageAddress({
      message: SIGN_MESSAGE,
      signature: signature as `0x${string}`,
    })
    if (recovered.toLowerCase() !== ownerAddress.toLowerCase()) return null
    return recovered
  } catch {
    return null
  }
}
