import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["viem", "@arkiv-network/sdk"],
  webpack: (config) => {
    // Privy includes optional Farcaster/Solana peer deps we don't use — silence the warnings
    config.resolve.alias["@farcaster/mini-app-solana"] = false
    config.resolve.alias["@solana-program/memo"]       = false
    config.resolve.alias["@solana-program/system"]     = false
    config.resolve.alias["@solana-program/token"]      = false
    config.resolve.alias["@solana/kit"]                = false
    config.resolve.alias["permissionless"]             = false
    return config
  },
}

export default nextConfig
