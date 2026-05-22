"use client"

import { useVaultAuth } from "@/hooks/use-vault-auth"

export default function Home() {
  const { ready, isAuthenticated, isVaultReady, isDerivingKey, login } =
    useVaultAuth()

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
      </main>
    )
  }

  if (isAuthenticated && isDerivingKey) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <div className="w-6 h-6 mx-auto rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          <p className="text-slate-400 text-sm">Unlocking your vault…</p>
        </div>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-6 max-w-sm">
          <div className="text-5xl">🔒</div>
          <h1 className="text-4xl font-bold text-slate-50">SealVault</h1>
          <p className="text-slate-400 text-lg leading-relaxed">
            Your private documents, shared on your terms.
          </p>
          <p className="text-slate-500 text-sm">
            No company holds your files. No one can read them but you.
          </p>
          <button
            onClick={login}
            className="w-full py-3 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold transition-colors"
          >
            Sign in to open your vault
          </button>
        </div>
      </main>
    )
  }

  // isVaultReady — vault is unlocked
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <div className="text-5xl">🔓</div>
        <h1 className="text-4xl font-bold text-slate-50">Vault open</h1>
        <p className="text-slate-400">
          Your documents are ready. Dashboard coming in Phase 5.
        </p>
        <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800 border border-slate-700 text-sm text-slate-400">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          Phase 2 — Auth &amp; Encryption complete
        </div>
      </div>
    </main>
  )
}
