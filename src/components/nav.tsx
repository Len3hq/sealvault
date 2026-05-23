"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useVaultAuth } from "@/hooks/use-vault-auth"

const LINKS = [
  { href: "/vault",  label: "VAULT" },
  { href: "/grants", label: "SHARES" },
  { href: "/agent",  label: "AGENT" },
]

export function Nav() {
  const pathname = usePathname()
  const { isAuthenticated, logout, login, walletAddress } = useVaultAuth()

  return (
    <nav className="sticky top-0 z-40 border-b border-sv-border bg-sv-bg px-6 py-4 flex items-center justify-between animate-slide-down">
      <div className="flex items-center gap-10">
        <Link
          href="/"
          className="text-sv-text font-bold text-sm tracking-tight hover:text-sv-blue transition-colors duration-150"
        >
          [ SEALVAULT ]
        </Link>

        {isAuthenticated && (
          <div className="hidden sm:flex items-center gap-6">
            {LINKS.map((l) => {
              const active = pathname === l.href || pathname.startsWith(l.href + "/")
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`text-xs font-medium tracking-wide transition-colors duration-150 pb-0.5 ${
                    active
                      ? "text-sv-text border-b border-sv-blue"
                      : "text-sv-muted hover:text-sv-text"
                  }`}
                >
                  {l.label}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-5">
        {isAuthenticated ? (
          <>
            {walletAddress && (
              <span className="hidden sm:inline text-xs text-sv-dim tabular-nums">
                {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
              </span>
            )}
            <button
              onClick={logout}
              className="text-xs text-sv-muted hover:text-sv-text transition-colors duration-150"
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            onClick={login}
            className="px-4 py-1.5 bg-sv-blue text-white text-xs font-medium hover:bg-sv-blue-li transition-colors duration-150"
          >
            Sign in ↗
          </button>
        )}
      </div>
    </nav>
  )
}
