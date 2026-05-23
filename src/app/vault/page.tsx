"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useVaultAuth } from "@/hooks/use-vault-auth"
import { useVaultItems } from "@/hooks/use-vault-items"
import { useCreateGrant } from "@/hooks/use-grant-actions"
import { queryVaultItemByKey } from "@/lib/arkiv/queries"
import { encryptVaultItem, decryptVaultItem } from "@/lib/crypto"
import { uploadToIPFS } from "@/lib/ipfs"
import { relayPost, relayDelete } from "@/lib/relay"
import { getAttributeValue } from "@/lib/arkiv/schemas"
import { VAULT_CATEGORIES } from "@/lib/arkiv/constants"
import type { VaultCategory } from "@/lib/arkiv/constants"
import { VaultItemPayloadSchema, parseEntityPayload } from "@/lib/arkiv/payload-schemas"
import { DocumentViewer, DownloadButton } from "@/components/document-viewer"
import {
  FileText, ImageIcon, Paperclip, Eye, Share2, Trash2,
  Upload, FolderOpen, Check, Copy, AlertTriangle,
} from "lucide-react"

// ─── Utilities ──────────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  medical:   "bg-rose-50 text-rose-700 border-rose-200",
  legal:     "bg-blue-50 text-blue-700 border-blue-200",
  financial: "bg-emerald-50 text-emerald-700 border-emerald-200",
  personal:  "bg-violet-50 text-violet-700 border-violet-200",
}

function CategoryBadge({ category }: { category: string }) {
  const cls = CAT_COLORS[category] ?? "bg-sv-surface text-sv-muted border-sv-border"
  return (
    <span className={`inline-flex px-2 py-0.5 border text-[11px] font-medium uppercase tracking-wide ${cls}`}>
      {category}
    </span>
  )
}

function FileTypeIcon({ fileType }: { fileType: string }) {
  const cls = "w-4 h-4 text-sv-dim shrink-0"
  if (fileType.startsWith("image/")) return <ImageIcon className={cls} />
  if (fileType === "application/pdf" || fileType.startsWith("text/")) return <FileText className={cls} />
  return <Paperclip className={cls} />
}

function formatSize(bytes: number) {
  if (bytes < 1024)         return `${bytes} B`
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const DURATION_PRESETS = [
  { label: "1 hour",   seconds: 3_600 },
  { label: "24 hours", seconds: 86_400 },
  { label: "7 days",   seconds: 604_800 },
  { label: "30 days",  seconds: 2_592_000 },
]

// ─── Overlay ───────────────────────────────────────────────────────────────────

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md bg-sv-bg border border-sv-border shadow-xl animate-scale-in">
        {children}
      </div>
    </div>
  )
}

// ─── Field ─────────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] text-sv-dim uppercase tracking-widest font-medium">{label}</label>
      {children}
    </div>
  )
}

// ─── Upload dialog ──────────────────────────────────────────────────────────────

function UploadDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { masterKey, walletAddress, signature } = useVaultAuth()
  const [file, setFile] = useState<File | null>(null)
  const [label, setLabel] = useState("")
  const [category, setCategory] = useState<VaultCategory>("personal")
  const [uploadStep, setUploadStep] = useState<"idle" | "encrypting" | "uploading" | "saving">("idle")
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const uploading = uploadStep !== "idle"
  const uploadLabel =
    uploadStep === "encrypting" ? "Encrypting…"
    : uploadStep === "uploading" ? "Uploading…"
    : uploadStep === "saving"    ? "Saving…"
    : "Upload document"

  async function handleUpload() {
    if (!file) return
    if (!masterKey)    { setError("Vault is locked — refresh and sign in again"); return }
    if (!walletAddress){ setError("No wallet address found — please reconnect"); return }
    if (!signature)    { setError("Wallet not signed in — please refresh and sign in again"); return }
    setError(null)
    try {
      setUploadStep("encrypting")
      const content = await file.arrayBuffer()
      const { ciphertext, ...keyMaterial } = await encryptVaultItem(content, masterKey)
      setUploadStep("uploading")
      const cid = await uploadToIPFS(ciphertext)
      setUploadStep("saving")
      await relayPost(
        "/api/relay/vault-item",
        { cid, ...keyMaterial, label: label || file.name, category, fileType: file.type || "application/octet-stream", sizeBytes: file.size },
        walletAddress,
        signature
      )
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploadStep("idle")
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="p-6 border-b border-sv-border">
        <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ ADD DOCUMENT ]</p>
        <h2 className="text-sm font-bold text-sv-text mt-1">Upload a file</h2>
      </div>

      <div className="p-6 space-y-5">
        {/* File picker */}
        <div
          onClick={() => fileRef.current?.click()}
          className="border border-dashed border-sv-border hover:border-sv-blue bg-sv-surface p-8 text-center cursor-pointer transition-colors duration-150"
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
              <p className="text-sv-text text-xs font-medium">{file.name}</p>
              <p className="text-[11px] text-sv-dim">{formatSize(file.size)}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-5 h-5 text-sv-dim" />
              <p className="text-sv-muted text-xs">Click to choose a file</p>
              <p className="text-[11px] text-sv-dim">PDF, image, video — any type</p>
            </div>
          )}
        </div>

        <Field label="Label">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Lab Results Jan 2026"
            className="w-full bg-sv-bg border border-sv-border px-3 py-2.5 text-xs text-sv-text placeholder:text-sv-dim focus:outline-none focus:border-sv-blue transition-colors duration-150"
          />
        </Field>

        <Field label="Category">
          <div className="flex gap-2 flex-wrap">
            {VAULT_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide border transition-colors duration-150 ${
                  category === c
                    ? "bg-sv-blue border-sv-blue text-white"
                    : "border-sv-border text-sv-muted hover:border-sv-border-hi hover:text-sv-text"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>

        {error && (
          <div className="px-3 py-2 bg-rose-50 border border-rose-200">
            <p className="text-rose-700 text-xs">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-sv-border text-sv-muted text-xs hover:border-sv-border-hi hover:text-sv-text transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex-1 py-2.5 bg-sv-blue text-white font-medium text-xs hover:bg-sv-blue-li transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border border-white/30 border-t-white animate-spin" />
                {uploadLabel}
              </span>
            ) : uploadLabel}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ─── View dialog ───────────────────────────────────────────────────────────────

function ViewDialog({
  vaultItemKey, vaultItemLabel, onClose,
}: {
  vaultItemKey: string; vaultItemLabel: string; onClose: () => void
}) {
  const { masterKey, walletAddress, publicClient } = useVaultAuth()
  const [content, setContent] = useState<Uint8Array<ArrayBuffer> | null>(null)
  const [fileType, setFileType] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!masterKey || !walletAddress) { setError("Vault is locked"); return }
    let cancelled = false
    async function decrypt() {
      try {
        const entity = await queryVaultItemByKey(publicClient, vaultItemKey, walletAddress!)
        if (!entity?.payload) { if (!cancelled) setError("Document not found"); return }
        const attrs = (entity.attributes ?? []) as Array<{ key: string; value: string | number }>
        const ft = String(getAttributeValue(attrs, "file_type") ?? "application/octet-stream")
        const decrypted = await decryptVaultItem(parseEntityPayload(VaultItemPayloadSchema, entity.payload), masterKey!)
        if (!cancelled) { setFileType(ft); setContent(decrypted); setLoaded(true) }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Decryption failed")
      }
    }
    decrypt()
    return () => { cancelled = true }
  }, [masterKey, walletAddress, vaultItemKey, publicClient])

  return (
    <Overlay onClose={onClose}>
      <div className="p-6 border-b border-sv-border">
        <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ DOCUMENT ]</p>
        <h2 className="text-sm font-bold text-sv-text mt-1 truncate">{vaultItemLabel}</h2>
      </div>

      <div className="p-6">
        {error && (
          <div className="px-3 py-2 bg-rose-50 border border-rose-200 text-center">
            <p className="text-rose-700 text-sm">{error}</p>
          </div>
        )}

        {!loaded && !error && (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="w-5 h-5 border-2 border-sv-blue border-t-transparent animate-spin" />
            <p className="text-sv-dim text-xs">Decrypting…</p>
          </div>
        )}

        {loaded && content && (
          <div className="space-y-4 animate-fade-in">
            <div className="border border-sv-border overflow-hidden bg-sv-surface p-2">
              <DocumentViewer content={content} fileType={fileType} label={vaultItemLabel} />
            </div>
            {fileType && !fileType.startsWith("text/") && (
              <DownloadButton content={content} fileType={fileType} label={vaultItemLabel} />
            )}
          </div>
        )}
      </div>
    </Overlay>
  )
}

// ─── Share dialog ──────────────────────────────────────────────────────────────

function ShareDialog({
  vaultItemKey, vaultItemLabel, onClose,
}: {
  vaultItemKey: string; vaultItemLabel: string; onClose: () => void
}) {
  const { masterKey, walletAddress, publicClient } = useVaultAuth()
  const createGrant = useCreateGrant()

  const [granteeName, setGranteeName] = useState("")
  const [purpose, setPurpose] = useState("")
  const [duration, setDuration] = useState(86_400)
  const [magicLink, setMagicLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    if (!granteeName.trim() || !masterKey || !walletAddress) return
    const entity = await queryVaultItemByKey(publicClient, vaultItemKey, walletAddress)
    if (!entity?.payload) return
    const vaultItemPayload = parseEntityPayload(VaultItemPayloadSchema, entity.payload)
    const a = (entity.attributes ?? []) as Array<{ key: string; value: string | number }>
    const fileType = String(getAttributeValue(a, "file_type") ?? "application/octet-stream")
    const category = String(getAttributeValue(a, "category") ?? "personal") as VaultCategory
    const result = await createGrant.mutateAsync({
      vaultItemPayload, vaultItemKey, label: vaultItemLabel,
      fileType, category, granteeName: granteeName.trim(),
      purpose: purpose.trim() || `Shared with ${granteeName.trim()}`,
      durationSeconds: duration,
    })
    setMagicLink(`${window.location.origin}/view/${result.token}`)
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
        <div className="p-6 border-b border-sv-border">
          <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ LINK READY ]</p>
          <h2 className="text-sm font-bold text-sv-text mt-1">Share with {granteeName}</h2>
        </div>
        <div className="p-6 space-y-4 animate-scale-in">
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-700">
              Expires in {DURATION_PRESETS.find((p) => p.seconds === duration)?.label ?? `${duration}s`}.
            </p>
          </div>

          <div className="bg-sv-surface border border-sv-border px-4 py-3 text-[11px] font-mono text-sv-muted break-all">
            {magicLink}
          </div>

          <div className="flex gap-3">
            <button
              onClick={copyLink}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-sv-blue hover:bg-sv-blue-li text-white font-medium text-xs transition-colors duration-150"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-sv-border text-sv-muted text-xs hover:border-sv-border-hi transition-colors duration-150"
            >
              Done
            </button>
          </div>

          <p className="text-[11px] text-sv-dim text-center">
            The link IS the decryption key — do not share it publicly.
          </p>
        </div>
      </Overlay>
    )
  }

  return (
    <Overlay onClose={onClose}>
      <div className="p-6 border-b border-sv-border">
        <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ SHARE DOCUMENT ]</p>
        <h2 className="text-sm font-bold text-sv-text mt-1 truncate">{vaultItemLabel}</h2>
      </div>

      <div className="p-6 space-y-4">
        <Field label="Recipient name">
          <input
            value={granteeName}
            onChange={(e) => setGranteeName(e.target.value)}
            placeholder="e.g. Dr. Smith"
            className="w-full bg-sv-bg border border-sv-border px-3 py-2.5 text-xs text-sv-text placeholder:text-sv-dim focus:outline-none focus:border-sv-blue transition-colors duration-150"
          />
        </Field>

        <Field label="Purpose (optional)">
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Annual check-up review"
            className="w-full bg-sv-bg border border-sv-border px-3 py-2.5 text-xs text-sv-text placeholder:text-sv-dim focus:outline-none focus:border-sv-blue transition-colors duration-150"
          />
        </Field>

        <Field label="Access duration">
          <div className="grid grid-cols-4 gap-2">
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.seconds}
                onClick={() => setDuration(p.seconds)}
                className={`py-2 text-[11px] font-medium border transition-colors duration-150 ${
                  duration === p.seconds
                    ? "bg-sv-blue border-sv-blue text-white"
                    : "border-sv-border text-sv-muted hover:border-sv-border-hi hover:text-sv-text"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        {createGrant.error && (
          <div className="px-3 py-2 bg-rose-50 border border-rose-200">
            <p className="text-rose-700 text-xs">
              {createGrant.error instanceof Error ? createGrant.error.message : "Failed to create grant"}
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-sv-border text-sv-muted text-xs hover:border-sv-border-hi transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleShare}
            disabled={!granteeName.trim() || createGrant.isPending}
            className="flex-1 py-2.5 bg-sv-blue hover:bg-sv-blue-li text-white font-medium text-xs transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {createGrant.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border border-white/30 border-t-white animate-spin" />
                Creating…
              </span>
            ) : "Generate link"}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ─── Document row ───────────────────────────────────────────────────────────────

function VaultCard({
  entity, onView, onShare, onDelete,
}: {
  entity: { key: string; attributes?: unknown }
  onView: (key: string, label: string) => void
  onShare: (key: string, label: string) => void
  onDelete: (key: string, label: string) => void
}) {
  const a = (entity.attributes ?? []) as Array<{ key: string; value: string | number }>
  const label     = String(getAttributeValue(a, "label") ?? "Untitled")
  const category  = String(getAttributeValue(a, "category") ?? "personal")
  const fileType  = String(getAttributeValue(a, "file_type") ?? "")
  const sizeBytes = getAttributeValue(a, "size_bytes") as number | undefined
  const createdAt = getAttributeValue(a, "created_at") as number | undefined

  return (
    <div className="group flex items-center gap-4 px-4 py-3.5 hover:bg-sv-surface transition-colors duration-150">
      <FileTypeIcon fileType={fileType} />

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-sv-text truncate">{label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {sizeBytes !== undefined && (
            <span className="text-[11px] text-sv-dim tabular-nums">{formatSize(sizeBytes)}</span>
          )}
          {createdAt && (
            <span className="text-[11px] text-sv-dim tabular-nums">
              · {new Date(createdAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      <CategoryBadge category={category} />

      <div className="flex gap-1 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity duration-150">
        <button
          onClick={() => onView(entity.key, label)}
          className="p-1.5 border border-sv-border text-sv-dim hover:border-sv-border-hi hover:text-sv-text transition-colors duration-150"
          title="View"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onShare(entity.key, label)}
          className="p-1.5 border border-sv-border text-sv-dim hover:border-sv-blue hover:text-sv-blue transition-colors duration-150"
          title="Share"
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(entity.key, label)}
          className="p-1.5 border border-sv-border text-sv-dim hover:border-rose-300 hover:text-rose-600 transition-colors duration-150"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Delete confirm ─────────────────────────────────────────────────────────────

function DeleteConfirmDialog({
  label, onConfirm, onCancel, loading,
}: {
  label: string; onConfirm: () => void; onCancel: () => void; loading: boolean
}) {
  return (
    <Overlay onClose={onCancel}>
      <div className="p-6 border-b border-sv-border">
        <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ DELETE DOCUMENT ]</p>
        <h2 className="text-sm font-bold text-sv-text mt-1">Are you sure?</h2>
      </div>
      <div className="p-6 space-y-5">
        <div className="flex items-start gap-3 p-3 bg-rose-50 border border-rose-200">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-700 leading-relaxed">
            <span className="font-medium">{label}</span> and all its active share links will be
            permanently removed. This cannot be undone.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-sv-border text-sv-muted text-xs hover:border-sv-border-hi transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs transition-colors duration-150 disabled:opacity-40"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border border-white/30 border-t-white animate-spin" />
                Deleting…
              </span>
            ) : "Delete"}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function VaultPage() {
  const { isAuthenticated, isVaultReady, walletAddress, signature, login, keyError, retryKeyDerivation } =
    useVaultAuth()
  const queryClient = useQueryClient()

  const [categoryFilter, setCategoryFilter] = useState<VaultCategory | "all">("all")
  const [showUpload, setShowUpload] = useState(false)
  const [viewTarget, setViewTarget] = useState<{ key: string; label: string } | null>(null)
  const [shareTarget, setShareTarget] = useState<{ key: string; label: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ key: string; label: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { data: vaultItems, isLoading } = useVaultItems(
    categoryFilter !== "all" ? { category: categoryFilter } : undefined
  )

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || !walletAddress || !signature) return
    setDeleting(true)
    try {
      await relayDelete("/api/relay/vault-item", { vaultItemKey: deleteTarget.key }, walletAddress, signature)
      queryClient.invalidateQueries({ queryKey: ["vault-items"] })
      queryClient.invalidateQueries({ queryKey: ["grants"] })
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, walletAddress, signature, queryClient])

  if (!isAuthenticated) {
    return (
      <main className="min-h-[calc(100dvh-57px)] flex items-center justify-center px-4">
        <div className="text-center space-y-5 animate-scale-in">
          <div className="w-12 h-12 mx-auto border border-sv-border bg-sv-surface flex items-center justify-center">
            <FolderOpen className="w-5 h-5 text-sv-dim" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-sv-text uppercase tracking-wide">Access your vault</p>
            <p className="text-xs text-sv-muted">Sign in to manage your encrypted documents.</p>
          </div>
          <button
            onClick={login}
            className="px-6 py-2.5 bg-sv-blue text-white text-xs font-medium hover:bg-sv-blue-li transition-colors duration-150"
          >
            Sign in
          </button>
        </div>
      </main>
    )
  }

  if (keyError) {
    return (
      <main className="min-h-[calc(100dvh-57px)] flex items-center justify-center px-4">
        <div className="text-center space-y-4 animate-scale-in">
          <p className="text-sv-muted text-sm">Failed to unlock vault.</p>
          <p className="text-xs text-sv-dim max-w-xs">{keyError}</p>
          <button
            onClick={retryKeyDerivation}
            className="px-6 py-2.5 bg-sv-blue text-white text-xs font-medium hover:bg-sv-blue-li transition-colors duration-150"
          >
            Retry
          </button>
        </div>
      </main>
    )
  }

  if (!isVaultReady) {
    return (
      <main className="min-h-[calc(100dvh-57px)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-5 h-5 mx-auto border-2 border-sv-blue border-t-transparent animate-spin" />
          <p className="text-sv-dim text-xs">Unlocking vault…</p>
        </div>
      </main>
    )
  }

  const items = vaultItems ?? []

  return (
    <>
      <main className="max-w-4xl mx-auto px-6 py-10 space-y-6 animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-sv-border">
          <div>
            <p className="text-[11px] text-sv-dim uppercase tracking-widest">[ DOCUMENTS ]</p>
            <h1 className="text-lg font-bold text-sv-text mt-1">
              {items.length} {items.length === 1 ? "file" : "files"} · all encrypted
            </h1>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-sv-blue hover:bg-sv-blue-li text-white font-medium text-xs uppercase tracking-wide transition-colors duration-150"
          >
            <Upload className="w-3.5 h-3.5" />
            Add document
          </button>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 flex-wrap">
          {(["all", ...VAULT_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`px-3 py-1 text-[11px] font-medium uppercase tracking-wide border transition-colors duration-150 ${
                categoryFilter === c
                  ? "bg-sv-blue border-sv-blue text-white"
                  : "border-sv-border text-sv-muted hover:border-sv-border-hi hover:text-sv-text"
              }`}
            >
              {c === "all" ? "All" : c}
            </button>
          ))}
        </div>

        {/* Document list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-sv-blue border-t-transparent animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 space-y-5 animate-scale-in">
            <div className="w-12 h-12 mx-auto border border-sv-border bg-sv-surface flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-sv-dim" />
            </div>
            <div className="space-y-1">
              <p className="text-sv-text text-sm font-bold uppercase tracking-wide">No documents yet</p>
              <p className="text-sv-muted text-xs">Upload your first encrypted document to get started.</p>
            </div>
            <button
              onClick={() => setShowUpload(true)}
              className="px-5 py-2 border border-sv-border text-sv-muted text-xs hover:border-sv-blue hover:text-sv-blue transition-colors duration-150"
            >
              Upload your first document
            </button>
          </div>
        ) : (
          <div className="border border-sv-border divide-y divide-sv-border animate-slide-up">
            {items.map((e) => (
              <VaultCard
                key={String(e.key)}
                entity={{ key: String(e.key), attributes: e.attributes }}
                onView={(key, label) => setViewTarget({ key, label })}
                onShare={(key, label) => setShareTarget({ key, label })}
                onDelete={(key, label) => setDeleteTarget({ key, label })}
              />
            ))}
          </div>
        )}
      </main>

      {showUpload && (
        <UploadDialog
          onClose={() => setShowUpload(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["vault-items"] })}
        />
      )}
      {viewTarget && (
        <ViewDialog
          vaultItemKey={viewTarget.key}
          vaultItemLabel={viewTarget.label}
          onClose={() => setViewTarget(null)}
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
