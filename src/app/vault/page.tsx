"use client"

import { useState, useRef, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useVaultAuth } from "@/hooks/use-vault-auth"
import { useArkivWallet } from "@/hooks/use-arkiv-wallet"
import { useVaultItems } from "@/hooks/use-vault-items"
import { useCreateGrant } from "@/hooks/use-grant-actions"
import { queryVaultItemByKey } from "@/lib/arkiv/queries"
import { deleteVaultItemWithGrants } from "@/lib/arkiv/mutations"
import { createVaultItem } from "@/lib/arkiv/mutations"
import { encryptVaultItem } from "@/lib/crypto"
import { getAttributeValue } from "@/lib/arkiv/schemas"
import { VAULT_CATEGORIES } from "@/lib/arkiv/constants"
import type { VaultCategory } from "@/lib/arkiv/constants"
import type { VaultItemPayload } from "@/lib/arkiv/types"
import type { WalletClient } from "@/lib/arkiv/types"

// ─── Shared utilities ──────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  medical:   "bg-rose-500/10 text-rose-400 border-rose-500/20",
  legal:     "bg-blue-500/10 text-blue-400 border-blue-500/20",
  financial: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  personal:  "bg-purple-500/10 text-purple-400 border-purple-500/20",
}

function CategoryBadge({ category }: { category: string }) {
  const cls = CAT_COLORS[category] ?? "bg-slate-700 text-slate-300 border-slate-600"
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${cls}`}>
      {category}
    </span>
  )
}

function fileIcon(fileType: string) {
  if (fileType.startsWith("image/"))  return "🖼️"
  if (fileType === "application/pdf") return "📄"
  if (fileType.startsWith("text/"))   return "📝"
  return "📎"
}

function formatSize(bytes: number) {
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const DURATION_PRESETS = [
  { label: "1 hour",   seconds: 3_600 },
  { label: "24 hours", seconds: 86_400 },
  { label: "7 days",   seconds: 604_800 },
  { label: "30 days",  seconds: 2_592_000 },
]

// ─── Upload dialog ─────────────────────────────────────────────────────────────

function UploadDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const { masterKey, walletAddress } = useVaultAuth()
  const walletClient = useArkivWallet()
  const [file, setFile] = useState<File | null>(null)
  const [label, setLabel] = useState("")
  const [category, setCategory] = useState<VaultCategory>("personal")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    if (!file || !masterKey || !walletAddress || !walletClient) return
    setUploading(true)
    setError(null)
    try {
      const content = await file.arrayBuffer()
      const encryptedPayload = await encryptVaultItem(content, masterKey)
      await createVaultItem(walletClient as unknown as WalletClient, {
        encryptedPayload,
        label: label || file.name,
        category,
        fileType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        ownerAddress: walletAddress,
      })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-lg font-semibold text-slate-50 mb-5">Add document</h2>

      {/* File picker */}
      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-slate-600 hover:border-amber-500/50 rounded-xl p-8 text-center cursor-pointer transition-colors mb-4"
      >
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            setFile(f)
            if (!label) setLabel(f.name.replace(/\.[^.]+$/, ""))
          }}
        />
        {file ? (
          <div className="space-y-1">
            <p className="text-slate-200 font-medium">{file.name}</p>
            <p className="text-xs text-slate-400">{formatSize(file.size)}</p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-slate-300 text-sm">Click to choose a file</p>
            <p className="text-xs text-slate-500">Any type supported</p>
          </div>
        )}
      </div>

      {/* Label */}
      <div className="space-y-1 mb-4">
        <label className="text-xs text-slate-400">Label</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Lab Results Jan 2026"
          className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50"
        />
      </div>

      {/* Category */}
      <div className="space-y-1 mb-6">
        <label className="text-xs text-slate-400">Category</label>
        <div className="flex gap-2 flex-wrap">
          {VAULT_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                category === c
                  ? "bg-amber-500 border-amber-500 text-slate-900"
                  : "border-slate-600 text-slate-300 hover:border-slate-500"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:border-slate-500 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {uploading ? "Encrypting…" : "Upload"}
        </button>
      </div>
    </Overlay>
  )
}

// ─── Share dialog ──────────────────────────────────────────────────────────────

function ShareDialog({
  vaultItemKey,
  vaultItemLabel,
  onClose,
}: {
  vaultItemKey: string
  vaultItemLabel: string
  onClose: () => void
}) {
  const { masterKey, walletAddress, publicClient } = useVaultAuth()
  const walletClient = useArkivWallet()
  const createGrant = useCreateGrant(walletClient as unknown as WalletClient)

  const [granteeName, setGranteeName] = useState("")
  const [purpose, setPurpose] = useState("")
  const [duration, setDuration] = useState(86_400)
  const [magicLink, setMagicLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    if (!masterKey || !walletAddress || !walletClient || !granteeName.trim()) return

    const entity = await queryVaultItemByKey(publicClient, vaultItemKey, walletAddress)
    if (!entity?.payload) return

    const vaultItemPayload = JSON.parse(
      new TextDecoder().decode(entity.payload)
    ) as VaultItemPayload

    const a = (entity.attributes ?? []) as Array<{ key: string; value: string | number }>
    const fileType  = String(getAttributeValue(a, "file_type") ?? "application/octet-stream")
    const category  = String(getAttributeValue(a, "category") ?? "personal") as VaultCategory

    const result = await createGrant.mutateAsync({
      vaultItemPayload,
      vaultItemKey,
      label: vaultItemLabel,
      fileType,
      category,
      granteeName: granteeName.trim(),
      purpose: purpose.trim() || `Shared with ${granteeName.trim()}`,
      durationSeconds: duration,
    })

    const link = `${window.location.origin}/view/${result.token}`
    setMagicLink(link)
  }

  function copyLink() {
    if (!magicLink) return
    navigator.clipboard.writeText(magicLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (magicLink) {
    return (
      <Overlay onClose={onClose}>
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl">
            ✅
          </div>
          <h2 className="text-lg font-semibold text-slate-50">Link ready</h2>
          <p className="text-sm text-slate-400">
            Share this link with {granteeName}. It expires in{" "}
            {DURATION_PRESETS.find((p) => p.seconds === duration)?.label ?? `${duration}s`}.
          </p>

          <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xs font-mono text-slate-300 break-all text-left">
            {magicLink}
          </div>

          <div className="flex gap-3">
            <button
              onClick={copyLink}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-sm transition-colors"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:border-slate-500 transition-colors"
            >
              Done
            </button>
          </div>

          <p className="text-xs text-slate-500">
            The link IS the decryption key — do not share it publicly.
          </p>
        </div>
      </Overlay>
    )
  }

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-lg font-semibold text-slate-50 mb-1">Share document</h2>
      <p className="text-xs text-slate-500 mb-5">{vaultItemLabel}</p>

      <div className="space-y-4 mb-6">
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Recipient name</label>
          <input
            value={granteeName}
            onChange={(e) => setGranteeName(e.target.value)}
            placeholder="e.g. Dr. Smith"
            className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-400">Purpose <span className="text-slate-600">(optional)</span></label>
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Annual check-up review"
            className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-400">Access duration</label>
          <div className="flex gap-2 flex-wrap">
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.seconds}
                onClick={() => setDuration(p.seconds)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  duration === p.seconds
                    ? "bg-amber-500 border-amber-500 text-slate-900"
                    : "border-slate-600 text-slate-300 hover:border-slate-500"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {createGrant.error && (
        <p className="text-red-400 text-xs mb-4">
          {createGrant.error instanceof Error ? createGrant.error.message : "Failed to create grant"}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:border-slate-500 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleShare}
          disabled={!granteeName.trim() || createGrant.isPending}
          className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {createGrant.isPending ? "Creating link…" : "Generate link"}
        </button>
      </div>
    </Overlay>
  )
}

// ─── Document card ─────────────────────────────────────────────────────────────

function VaultCard({
  entity,
  onShare,
  onDelete,
}: {
  entity: { key: string; attributes?: unknown }
  onShare: (key: string, label: string) => void
  onDelete: (key: string, label: string) => void
}) {
  const a = (entity.attributes ?? []) as Array<{ key: string; value: string | number }>
  const label    = String(getAttributeValue(a, "label") ?? "Untitled")
  const category = String(getAttributeValue(a, "category") ?? "personal")
  const fileType = String(getAttributeValue(a, "file_type") ?? "")
  const sizeBytes = getAttributeValue(a, "size_bytes") as number | undefined
  const createdAt = getAttributeValue(a, "created_at") as number | undefined

  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl border border-slate-700 bg-slate-800/40 hover:border-slate-600 transition-colors">
      <span className="text-2xl shrink-0">{fileIcon(fileType)}</span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-100 truncate">{label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {sizeBytes !== undefined && (
            <span className="text-xs text-slate-500">{formatSize(sizeBytes)}</span>
          )}
          {createdAt && (
            <span className="text-xs text-slate-500">
              · {new Date(createdAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      <CategoryBadge category={category} />

      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => onShare(entity.key, label)}
          className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:border-amber-500/50 hover:text-amber-400 text-xs transition-colors"
        >
          Share
        </button>
        <button
          onClick={() => onDelete(entity.key, label)}
          className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 hover:border-red-500/50 hover:text-red-400 text-xs transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

// ─── Confirm delete dialog ────────────────────────────────────────────────────

function DeleteConfirmDialog({
  label,
  onConfirm,
  onCancel,
  loading,
}: {
  label: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <Overlay onClose={onCancel}>
      <div className="space-y-4">
        <div className="w-12 h-12 mx-auto rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-xl">
          ⚠️
        </div>
        <h2 className="text-lg font-semibold text-slate-50 text-center">Delete document?</h2>
        <p className="text-sm text-slate-400 text-center">
          <span className="text-slate-200">{label}</span> and all its active magic links will
          be permanently removed. This cannot be undone.
        </p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:border-slate-500 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white font-semibold text-sm transition-colors disabled:opacity-40"
          >
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ─── Overlay wrapper ──────────────────────────────────────────────────────────

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
        {children}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VaultPage() {
  const { isAuthenticated, isVaultReady, masterKey, walletAddress, publicClient, login } =
    useVaultAuth()
  const walletClient = useArkivWallet()
  const queryClient = useQueryClient()

  const [categoryFilter, setCategoryFilter] = useState<VaultCategory | "all">("all")
  const [showUpload, setShowUpload] = useState(false)
  const [shareTarget, setShareTarget] = useState<{ key: string; label: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ key: string; label: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { data: vaultItems, isLoading } = useVaultItems(
    categoryFilter !== "all" ? { category: categoryFilter } : undefined
  )

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || !walletClient || !walletAddress) return
    setDeleting(true)
    try {
      await deleteVaultItemWithGrants(
        publicClient,
        walletClient as unknown as WalletClient,
        deleteTarget.key,
        walletAddress
      )
      queryClient.invalidateQueries({ queryKey: ["vault-items"] })
      queryClient.invalidateQueries({ queryKey: ["grants"] })
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, walletClient, walletAddress, publicClient, queryClient])

  if (!isAuthenticated) {
    return (
      <main className="min-h-[calc(100vh-57px)] flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-slate-400">Sign in to access your vault.</p>
          <button
            onClick={login}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-sm transition-colors"
          >
            Sign in
          </button>
        </div>
      </main>
    )
  }

  if (!isVaultReady) {
    return (
      <main className="min-h-[calc(100vh-57px)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-6 h-6 mx-auto rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          <p className="text-slate-400 text-sm">Unlocking vault…</p>
        </div>
      </main>
    )
  }

  const items = vaultItems ?? []

  return (
    <>
      <main className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Documents</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {items.length} {items.length === 1 ? "file" : "files"} · all encrypted
            </p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-sm transition-colors"
          >
            <span>+</span> Add document
          </button>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 flex-wrap">
          {(["all", ...VAULT_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                categoryFilter === c
                  ? "bg-amber-500 border-amber-500 text-slate-900"
                  : "border-slate-600 text-slate-300 hover:border-slate-500"
              }`}
            >
              {c === "all" ? "All" : c}
            </button>
          ))}
        </div>

        {/* Document list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <p className="text-3xl">📂</p>
            <p className="text-slate-400 text-sm">No documents yet.</p>
            <button
              onClick={() => setShowUpload(true)}
              className="px-5 py-2 rounded-xl border border-slate-600 text-slate-300 text-sm hover:border-amber-500/50 hover:text-amber-400 transition-colors"
            >
              Upload your first document
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((e) => (
              <VaultCard
                key={String(e.key)}
                entity={{ key: String(e.key), attributes: e.attributes }}
                onShare={(key, label) => setShareTarget({ key, label })}
                onDelete={(key, label) => setDeleteTarget({ key, label })}
              />
            ))}
          </div>
        )}
      </main>

      {/* Dialogs */}
      {showUpload && (
        <UploadDialog
          onClose={() => setShowUpload(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["vault-items"] })}
        />
      )}
      {shareTarget && (
        <ShareDialog
          vaultItemKey={shareTarget.key}
          vaultItemLabel={shareTarget.label}
          onClose={() => setShareTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmDialog
          label={deleteTarget.label}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </>
  )
}
