export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <div className="text-5xl">🔒</div>
        <h1 className="text-4xl font-bold text-slate-50">SealVault</h1>
        <p className="text-slate-400 text-lg">
          Your private documents, shared on your terms.
        </p>
        <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-vault-dark border border-vault-border text-sm text-slate-400">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          Phase 1 — Arkiv Entity Foundation
        </div>
      </div>
    </main>
  )
}
