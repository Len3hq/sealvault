import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const jwt = process.env.PINATA_JWT
  if (!jwt) {
    return NextResponse.json({ error: "Pinata not configured" }, { status: 500 })
  }

  let bytes: ArrayBuffer
  try {
    bytes = await request.arrayBuffer()
  } catch (err) {
    console.error("[ipfs/upload] failed to read request body:", err)
    return NextResponse.json({ error: "Failed to read upload body" }, { status: 400 })
  }

  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Upload body is empty" }, { status: 400 })
  }

  let res: Response
  try {
    const formData = new FormData()
    formData.append("file", new Blob([bytes]), "vault.bin")
    res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: formData,
    })
  } catch (err) {
    console.error("[ipfs/upload] Pinata fetch threw:", err)
    return NextResponse.json({ error: "Could not reach Pinata" }, { status: 502 })
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable)")
    console.error(`[ipfs/upload] Pinata ${res.status}:`, text)
    return NextResponse.json(
      { error: `Pinata ${res.status}: ${text}` },
      { status: res.status }
    )
  }

  const data = (await res.json()) as { IpfsHash?: string }
  if (!data.IpfsHash) {
    console.error("[ipfs/upload] Pinata response missing IpfsHash:", data)
    return NextResponse.json({ error: "Pinata returned no CID" }, { status: 502 })
  }

  return NextResponse.json({ cid: data.IpfsHash })
}
