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
          <footer className="border-t border-sv-border px-6 py-4 flex items-center justify-end text-[11px] text-sv-dim">
            Built by{" "}
            <a
              href="https://x.com/_christian_obi"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 text-sv-blue hover:text-sv-blue-li transition-colors duration-150"
            >
              Christian
            </a>
            <span className="mx-1">&</span>
            <a
              href="https://x.com/danny_4reel"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sv-blue hover:text-sv-blue-li transition-colors duration-150"
            >
              Daniel
            </a>
          </footer>
        </Providers>
      </body>
    </html>
  )
}
