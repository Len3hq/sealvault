"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { deriveMasterKey, SIGN_MESSAGE } from "@/lib/crypto/keys"
import { publicClient } from "@/lib/arkiv/client"

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

interface VaultAuthState {
  ready: boolean
  isAuthenticated: boolean
  user: ReturnType<typeof usePrivy>["user"]
  masterKey: CryptoKey | null
  isDerivingKey: boolean
  keyError: string | null
  isVaultReady: boolean
  walletAddress: string | undefined
  retryKeyDerivation: () => void
  login: () => void
  logout: () => Promise<void>
  publicClient: typeof publicClient
}

const VaultAuthContext = createContext<VaultAuthState | null>(null)

export function VaultAuthProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const { wallets } = useWallets()
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null)
  const [isDerivingKey, setIsDerivingKey] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)

  const embeddedWallet = wallets.find(
    (w) => w.walletClientType === "privy" || w.walletClientType === "privy-v2"
  )

  useEffect(() => {
    // isDerivingKey (state) is the mutex — stable across Fast Refresh cycles
    // unlike useRef which creates a new object per instance.
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
        // Unconditional — clears the guard even when cancelled so the next
        // effect run can start a fresh derivation.
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

  return (
    <VaultAuthContext.Provider
      value={{
        ready,
        isAuthenticated: authenticated,
        user,
        masterKey,
        isDerivingKey,
        keyError,
        isVaultReady: ready && (!authenticated || !!masterKey || !!keyError),
        walletAddress: embeddedWallet?.address as string | undefined,
        retryKeyDerivation,
        login,
        logout: handleLogout,
        publicClient,
      }}
    >
      {children}
    </VaultAuthContext.Provider>
  )
}

export function useVaultAuth() {
  const ctx = useContext(VaultAuthContext)
  if (!ctx) throw new Error("useVaultAuth must be used within VaultAuthProvider")
  return ctx
}
