"use client"

import { PrivyProvider } from "@privy-io/react-auth"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { braga } from "@arkiv-network/sdk/chains"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 2 },
        },
      })
  )

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        defaultChain: braga,
        supportedChains: [braga],
        loginMethods: ["google", "apple", "email"],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          showWalletUIs: false,
        },
        appearance: {
          theme: "dark",
          accentColor: "#f59e0b",
        },
      }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </PrivyProvider>
  )
}
