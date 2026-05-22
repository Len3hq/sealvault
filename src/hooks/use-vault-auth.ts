"use client"

import { usePrivy, useWallets } from "@privy-io/react-auth"
import { useCallback, useEffect, useRef, useState } from "react"
import { deriveMasterKey, SIGN_MESSAGE } from "@/lib/crypto/keys"
import { publicClient } from "@/lib/arkiv/client"

export function useVaultAuth() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const { wallets } = useWallets()
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null)
  const [isDerivingKey, setIsDerivingKey] = useState(false)
  const derivingRef = useRef(false)

  const embeddedWallet = wallets.find(
    (w) => w.walletClientType === "privy" || w.walletClientType === "privy-v2"
  )

  useEffect(() => {
    if (!authenticated || !embeddedWallet || masterKey || derivingRef.current) return

    let cancelled = false
    derivingRef.current = true
    setIsDerivingKey(true)

    embeddedWallet
      .getEthereumProvider()
      .then((provider) =>
        provider.request({
          method: "personal_sign",
          params: [SIGN_MESSAGE, embeddedWallet.address],
        }) as Promise<string>
      )
      .then((signature) => {
        if (cancelled) return
        return deriveMasterKey(signature)
      })
      .then((key) => {
        if (cancelled || !key) return
        setMasterKey(key as CryptoKey)
      })
      .catch(console.error)
      .finally(() => {
        derivingRef.current = false
        if (!cancelled) setIsDerivingKey(false)
      })

    return () => {
      cancelled = true
    }
  }, [authenticated, embeddedWallet, masterKey])

  const handleLogout = useCallback(async () => {
    setMasterKey(null)
    derivingRef.current = false
    await logout()
  }, [logout])

  return {
    ready,
    isAuthenticated: authenticated,
    user,
    masterKey,
    isDerivingKey,
    // true once the app can act — either not logged in, or logged in + key ready
    isVaultReady: ready && (!authenticated || !!masterKey),
    login,
    logout: handleLogout,
    walletAddress: embeddedWallet?.address as string | undefined,
    publicClient,
  }
}
