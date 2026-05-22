import type { NextConfig } from "next"

const STUB = "./src/lib/empty.ts"

const nextConfig: NextConfig = {
  // Turbopack config (used with next dev --turbopack)
  // Only stub packages that are NOT installed in node_modules.
  // Installed packages (@solana/kit, @solana-program/*) must NOT be stubbed —
  // Turbopack statically validates named exports and will error if their real
  // consumers (privy, x402) try to import named exports from an empty module.
  turbopack: {
    resolveAlias: {
      "@farcaster/mini-app-solana": STUB,
      "@solana-program/memo":       STUB,
      "permissionless":             STUB,
    },
  },

  // Webpack fallback (next build / next start)
  webpack: (config) => {
    config.resolve.alias["@farcaster/mini-app-solana"] = false
    config.resolve.alias["@solana-program/memo"]       = false
    config.resolve.alias["permissionless"]             = false
    return config
  },
}

export default nextConfig
