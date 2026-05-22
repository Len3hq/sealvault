"use client"

import { usePrivy, useWallets } from "@privy-io/react-auth"
import { useCallback, useEffect, useState } from "react"
import { deriveMasterKey, SIGN_MESSAGE } from "@/lib/crypto/keys"
import { publicClient } from "@/lib/arkiv/client"

// If personal_sign doesn't resolve in this window, surface an error so
// the user can hit Retry instead of waiting forever.
const SIGN_TIMEOUT_MS = 15_000

function signWithTimeout(
  provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> },
  address: string
): Promise<string> {
  return Promise.race([
    provider.request({
      method: "personal_sign",
      params: [SIGN_MESSAGE, address],
    }) as Promise<string>,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Vault unlock timed out — please retry")),
        SIGN_TIMEOUT_MS
      )
    ),
  ])
}

export function useVaultAuth() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const { wallets } = useWallets()
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null)
  const [isDerivingKey, setIsDerivingKey] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)

  const embeddedWallet = wallets.find(
    (w) => w.walletClientType === "privy" || w.walletClientType === "privy-v2"
  )

  useEffect(() => {
    // Use isDerivingKey (state) as the mutex rather than a ref.
    // Refs survive Fast Refresh as the same object on the old instance but are
    // a fresh object on the new instance — so old-instance cleanup can't unblock
    // the new instance's ref. State setters are stable across renders and Hot
    // Refresh cycles, so `setIsDerivingKey(false)` in finally always clears the
    // guard regardless of which render cycle called it.
    if (!authenticated || !embeddedWallet || masterKey || isDerivingKey) return

    let cancelled = false
    setIsDerivingKey(true)
    setKeyError(null)

    embeddedWallet
      .getEthereumProvider()
      .then((provider) => signWithTimeout(provider, embeddedWallet.address))
      .then((signature) => {
        if (cancelled) return
        return deriveMasterKey(signature)
      })
      .then((key) => {
        if (cancelled || !key) return
        setMasterKey(key as CryptoKey)
      })
      .catch((err) => {
        if (!cancelled)
          setKeyError(err instanceof Error ? err.message : "Failed to unlock vault")
      })
      .finally(() => {
        // Unconditional: even if cancelled, clearing the flag lets the next
        // effect run start a fresh derivation instead of waiting forever.
        setIsDerivingKey(false)
      })

    return () => {
      cancelled = true
    }
  }, [authenticated, embeddedWallet, masterKey, isDerivingKey])

  const retryKeyDerivation = useCallback(() => {
    setKeyError(null)
    setMasterKey(null)
    setIsDerivingKey(false)
  }, [])

  const handleLogout = useCallback(async () => {
    setMasterKey(null)
    setKeyError(null)
    setIsDerivingKey(false)
    await logout()
  }, [logout])

  return {
    ready,
    isAuthenticated: authenticated,
    user,
    masterKey,
    isDerivingKey,
    keyError,
    retryKeyDerivation,
    isVaultReady: ready && (!authenticated || !!masterKey || !!keyError),
    login,
    logout: handleLogout,
    walletAddress: embeddedWallet?.address as string | undefined,
    publicClient,
  }
}
