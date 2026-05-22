import type { NextConfig } from "next"

const STUB = "./src/lib/empty.ts"

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // Peer deps not installed — must stub so Turbopack doesn't error on missing modules.
      "@farcaster/mini-app-solana": STUB,
      "@solana-program/memo":       STUB,
      "permissionless":             STUB,
      // x402 is a Privy payment-protocol dep (21 MB, CJS) we never use.
      // CJS packages are safe to stub — Turbopack can't statically validate
      // their named exports so it won't error on the empty module.
      "x402":                       STUB,
    },
  },

  webpack: (config) => {
    config.resolve.alias["@farcaster/mini-app-solana"] = false
    config.resolve.alias["@solana-program/memo"]       = false
    config.resolve.alias["permissionless"]             = false
    config.resolve.alias["x402"]                       = false
    return config
  },
}

export default nextConfig
