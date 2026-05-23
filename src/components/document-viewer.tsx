"use client"

import { useEffect, useState } from "react"

export function DocumentViewer({
  content,
  fileType,
  label,
  disableDownload = false,
}: {
  content: Uint8Array<ArrayBuffer>
  fileType?: string
  label?: string
  disableDownload?: boolean
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    const mime = fileType ?? "application/octet-stream"
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [content, fileType])

  const isImage = fileType?.startsWith("image/")
  const isPdf   = fileType === "application/pdf"
  const isText  = fileType?.startsWith("text/")

  if (isText) {
    const text = new TextDecoder().decode(content)
    return (
      <pre className="w-full max-h-[70vh] overflow-auto rounded-xl bg-slate-900 border border-slate-700 p-6 text-slate-300 text-sm leading-relaxed whitespace-pre-wrap break-words">
        {text}
      </pre>
    )
  }

  if (!objectUrl) return null

  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={objectUrl}
        alt={label ?? "Document"}
        className="max-w-full max-h-[70vh] rounded-xl object-contain border border-slate-700"
      />
    )
  }

  if (isPdf) {
    return (
      <iframe
        src={objectUrl}
        title={label ?? "Document"}
        className="w-full h-[70vh] rounded-xl border border-slate-700"
      />
    )
  }

  if (disableDownload) {
    return (
      <div className="text-center py-10">
        <p className="text-sv-muted text-xs">This file type cannot be previewed in the browser.</p>
      </div>
    )
  }

  return (
    <div className="text-center space-y-4">
      <p className="text-slate-400 text-sm">
        This file type cannot be previewed in the browser.
      </p>
      <a
        href={objectUrl}
        download={label ?? "document"}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold transition-colors text-sm"
      >
        Download {label ?? "file"}
      </a>
    </div>
  )
}

export function DownloadButton({
  content,
  fileType,
  label,
}: {
  content: Uint8Array<ArrayBuffer>
  fileType: string
  label?: string
}) {
  function handleDownload() {
    const blob = new Blob([content], { type: fileType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = label ?? "document"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="text-center">
      <button
        onClick={handleDownload}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-medium transition-colors text-sm"
      >
        Download
      </button>
    </div>
  )
}
