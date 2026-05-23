// Upload encrypted bytes to IPFS via our server route (keeps PINATA_JWT hidden).
export async function uploadToIPFS(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const res = await fetch("/api/ipfs/upload", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? "IPFS upload failed")
  }
  const { cid } = (await res.json()) as { cid: string }
  return cid
}

// Fetch encrypted bytes from IPFS. Data is ciphertext so any public gateway is fine.
export async function fetchFromIPFS(cid: string): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`)
  if (!res.ok) throw new Error(`IPFS fetch failed for CID: ${cid}`)
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}
