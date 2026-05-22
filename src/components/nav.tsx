"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useVaultAuth } from "@/hooks/use-vault-auth"

const LINKS = [
  { href: "/vault",  label: "Vault" },
  { href: "/grants", label: "Active Shares" },
  { href: "/agent",  label: "AI Agent" },
]

export function Nav() {
  const pathname = usePathname()
  const { isAuthenticated, logout, walletAddress } = useVaultAuth()

  if (!isAuthenticated) return null

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-amber-400 font-bold text-base tracking-tight">
          SealVault
        </Link>
        <div className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/")
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-slate-800 text-slate-100"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                {l.label}
              </Link>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {walletAddress && (
          <span className="text-xs font-mono text-slate-500">
            {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
          </span>
        )}
        <button
          onClick={logout}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
