"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Sun, Moon, Menu, X } from "lucide-react"
import { useVaultAuth } from "@/hooks/use-vault-auth"

const LINKS = [
  { href: "/vault",        label: "VAULT" },
  { href: "/grants",       label: "SHARES" },
  { href: "/transactions", label: "TXNS" },
  { href: "/agent",        label: "AGENT" },
  { href: "/memory",       label: "MEMORY" },
]

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  if (!mounted) return <div className="w-7 h-7" />

  const isDark = resolvedTheme === "dark"
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="w-7 h-7 flex items-center justify-center border border-sv-border text-sv-dim hover:border-sv-border-hi hover:text-sv-text transition-colors duration-150"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
    </button>
  )
}

export function Nav() {
  const pathname = usePathname()
  const { isAuthenticated, logout, login, walletAddress } = useVaultAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  // Close menu on route change
  useEffect(() => { setMenuOpen(false) }, [pathname])

  return (
    <nav className="sticky top-0 z-40 border-b border-sv-border bg-sv-bg animate-slide-down">
      <div className="px-6 py-4 flex items-center justify-between">
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

        <div className="flex items-center gap-3">
          <ThemeToggle />

          {isAuthenticated ? (
            <>
              {walletAddress && (
                <span className="hidden sm:inline text-xs text-sv-dim tabular-nums">
                  {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
                </span>
              )}
              <button
                onClick={logout}
                className="hidden sm:inline text-xs text-sv-muted hover:text-sv-text transition-colors duration-150"
              >
                Sign out
              </button>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="sm:hidden w-7 h-7 flex items-center justify-center border border-sv-border text-sv-dim hover:border-sv-border-hi hover:text-sv-text transition-colors duration-150"
                aria-label="Toggle menu"
              >
                {menuOpen ? <X className="w-3.5 h-3.5" /> : <Menu className="w-3.5 h-3.5" />}
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
      </div>

      {/* Mobile menu */}
      {isAuthenticated && menuOpen && (
        <div className="sm:hidden border-t border-sv-border bg-sv-bg px-6 py-4 space-y-4 animate-slide-down">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/")
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`block text-xs font-medium tracking-wide transition-colors duration-150 ${
                  active ? "text-sv-text" : "text-sv-muted hover:text-sv-text"
                }`}
              >
                {active && <span className="text-sv-blue mr-2">▸</span>}
                {l.label}
              </Link>
            )
          })}
          <div className="pt-2 border-t border-sv-border flex items-center justify-between">
            {walletAddress && (
              <span className="text-xs text-sv-dim tabular-nums">
                {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
              </span>
            )}
            <button
              onClick={logout}
              className="text-xs text-sv-muted hover:text-sv-text transition-colors duration-150"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
