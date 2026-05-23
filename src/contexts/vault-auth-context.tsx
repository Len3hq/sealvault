"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react"
import { usePrivy, useWallets, useCreateWallet, getEmbeddedConnectedWallet } from "@privy-io/react-auth"
import { deriveMasterKey, SIGN_MESSAGE } from "@/lib/crypto/keys"
import { publicClient } from "@/lib/arkiv/client"

const SIGN_TIMEOUT_MS = 15_000

// Cache key: scoped to the wallet address so different accounts don't share cached signatures.
function sigCacheKey(address: string) {
  return `sv_sig_${address}`
}

function getCachedSignature(address: string): string | null {
  try { return sessionStorage.getItem(sigCacheKey(address)) } catch { return null }
}

function setCachedSignature(address: string, sig: string) {
  try { sessionStorage.setItem(sigCacheKey(address), sig) } catch { /* private mode */ }
}

function clearCachedSignature(address: string) {
  try { sessionStorage.removeItem(sigCacheKey(address)) } catch { /* ignore */ }
}

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
  const { createWallet } = useCreateWallet()
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null)
  const [isDerivingKey, setIsDerivingKey] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)
  const derivingRef = useRef(false)

  const embeddedWallet = getEmbeddedConnectedWallet(wallets)

  useEffect(() => {
    if (!authenticated || !embeddedWallet || masterKey || derivingRef.current) return

    derivingRef.current = true
    setIsDerivingKey(true)
    setKeyError(null)

    let cancelled = false
    const address = embeddedWallet.address

    // Fast path: re-derive from session-cached signature (no network call).
    const cached = getCachedSignature(address)
    const sigPromise: Promise<string> = cached
      ? Promise.resolve(cached)
      : embeddedWallet
          .getEthereumProvider()
          .then((provider) => signWithTimeout(provider, address))
          .then((sig) => { setCachedSignature(address, sig); return sig })

    sigPromise
      .then((signature) => {
        if (cancelled) return
        return deriveMasterKey(signature)
      })
      .then((key) => {
        if (cancelled || !key) return
        setMasterKey(key as CryptoKey)
      })
      .catch((err) => {
        if (!cancelled) {
          // Clear stale cache on failure so next attempt re-signs.
          clearCachedSignature(address)
          setKeyError(err instanceof Error ? err.message : "Failed to unlock vault")
        }
      })
      .finally(() => {
        derivingRef.current = false
        setIsDerivingKey(false)
      })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, embeddedWallet, masterKey])

  useEffect(() => {
    if (!ready || !authenticated || embeddedWallet || masterKey || derivingRef.current) return
    const timer = setTimeout(() => {
      createWallet().catch(() => {})
    }, 3_000)
    return () => clearTimeout(timer)
  }, [ready, authenticated, embeddedWallet, masterKey, createWallet])

  useEffect(() => {
    if (!ready || !authenticated || embeddedWallet || masterKey) return
    const timer = setTimeout(() => {
      setKeyError("Vault wallet not found — please refresh and sign in again.")
    }, 35_000)
    return () => clearTimeout(timer)
  }, [ready, authenticated, embeddedWallet, masterKey])

  const retryKeyDerivation = useCallback(() => {
    if (embeddedWallet) clearCachedSignature(embeddedWallet.address)
    setKeyError(null)
    setMasterKey(null)
    derivingRef.current = false
    setIsDerivingKey(false)
  }, [embeddedWallet])

  const handleLogout = useCallback(async () => {
    if (embeddedWallet) clearCachedSignature(embeddedWallet.address)
    setMasterKey(null)
    setKeyError(null)
    derivingRef.current = false
    setIsDerivingKey(false)
    await logout()
  }, [logout, embeddedWallet])

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
