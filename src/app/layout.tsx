import type { Metadata } from "next"
import { IBM_Plex_Mono } from "next/font/google"
import { Providers } from "./providers"
import { Nav } from "@/components/nav"
import "./globals.css"

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600", "700"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "SealVault — Your documents, your terms",
  description:
    "A trustless document vault — store encrypted files and share them with time-scoped access links. No counterparty risk. Powered by Arkiv.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={ibmPlexMono.variable} suppressHydrationWarning>
      <body className={ibmPlexMono.className}>
        <Providers>
          <Nav />
          {children}
        </Providers>
      </body>
    </html>
  )
}
