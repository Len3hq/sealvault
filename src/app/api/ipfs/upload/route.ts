import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

// Accepts raw binary, pins it to IPFS via Pinata, returns the CID.
// Runs server-side so PINATA_JWT is never exposed to the browser.
export async function POST(request: NextRequest) {
  const jwt = process.env.PINATA_JWT
  if (!jwt) {
    return NextResponse.json({ error: "Pinata not configured" }, { status: 500 })
  }

  const bytes = await request.arrayBuffer()

  const formData = new FormData()
  formData.append("file", new Blob([bytes]), "vault.bin")

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json(
      { error: `Pinata error: ${text}` },
      { status: res.status }
    )
  }

  const data = (await res.json()) as { IpfsHash: string }
  return NextResponse.json({ cid: data.IpfsHash })
}
