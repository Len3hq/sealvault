import { describe, it, expect, beforeEach, vi } from "vitest"
import { getAttributeValue } from "@/lib/arkiv/schemas"
import { VAULT_CATEGORIES, GRANT_STATUS, EXPIRY } from "@/lib/arkiv/constants"

// ─── Attribute extraction (pattern used throughout grants UI) ─────────────────

describe("getAttributeValue — grants UI patterns", () => {
  const attrs = [
    { key: "purpose",    value: "Annual checkup" },
    { key: "granted_at", value: 1_700_000_000_000 },
    { key: "expires_at", value: 1_700_172_800_000 },
    { key: "parent_key", value: "0xabc123" },
    { key: "granted_by", value: "0xowner" },
  ]

  it("extracts purpose string", () => {
    expect(getAttributeValue(attrs, "purpose")).toBe("Annual checkup")
  })

  it("extracts numeric granted_at timestamp", () => {
    expect(getAttributeValue(attrs, "granted_at")).toBe(1_700_000_000_000)
  })

  it("extracts numeric expires_at timestamp", () => {
    expect(getAttributeValue(attrs, "expires_at")).toBe(1_700_172_800_000)
  })

  it("extracts parent_key document reference", () => {
    expect(getAttributeValue(attrs, "parent_key")).toBe("0xabc123")
  })

  it("returns undefined for missing attribute", () => {
    expect(getAttributeValue(attrs, "token_hash")).toBeUndefined()
  })

  it("returns undefined for empty attribute list", () => {
    expect(getAttributeValue([], "purpose")).toBeUndefined()
  })
})

// ─── Time-left calculation (mimics formatTimeLeft in grants page) ─────────────

function formatTimeLeft(expiresAt: number, now = Date.now()): { label: string; urgent: boolean } {
  const ms = expiresAt - now
  if (ms <= 0) return { label: "Expired", urgent: true }

  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  const hr  = Math.floor(min / 60)
  const day = Math.floor(hr / 24)

  if (day >= 1) return { label: `${day}d ${hr % 24}h left`, urgent: day < 1 }
  if (hr  >= 1) return { label: `${hr}h ${min % 60}m left`, urgent: hr < 6 }
  return { label: `${min}m left`, urgent: true }
}

describe("formatTimeLeft", () => {
  const BASE = 1_700_000_000_000

  it("returns Expired for past timestamps", () => {
    const { label, urgent } = formatTimeLeft(BASE - 1, BASE)
    expect(label).toBe("Expired")
    expect(urgent).toBe(true)
  })

  it("returns Expired when exactly equal to now", () => {
    const { label } = formatTimeLeft(BASE, BASE)
    expect(label).toBe("Expired")
  })

  it("shows minutes when under 1 hour remains", () => {
    const { label, urgent } = formatTimeLeft(BASE + 30 * 60 * 1000, BASE)
    expect(label).toBe("30m left")
    expect(urgent).toBe(true)
  })

  it("shows hours when between 1 and 24 hours remain", () => {
    const { label, urgent } = formatTimeLeft(BASE + 3 * 3600 * 1000, BASE)
    expect(label).toBe("3h 0m left")
    expect(urgent).toBe(true) // < 6 hours
  })

  it("is not urgent when more than 6 hours remain", () => {
    const { urgent } = formatTimeLeft(BASE + 12 * 3600 * 1000, BASE)
    expect(urgent).toBe(false)
  })

  it("shows days when 1+ day remains", () => {
    const { label, urgent } = formatTimeLeft(BASE + 2 * 86_400 * 1000 + 3 * 3600 * 1000, BASE)
    expect(label).toBe("2d 3h left")
    expect(urgent).toBe(false)
  })

  it("shows 1d when just over 24 hours remain", () => {
    const { label } = formatTimeLeft(BASE + 25 * 3600 * 1000, BASE)
    expect(label).toBe("1d 1h left")
  })

  it("30-day grant is not urgent", () => {
    const { urgent } = formatTimeLeft(BASE + EXPIRY.days(30) * 1000, BASE)
    expect(urgent).toBe(false)
  })
})

// ─── Category badge color mapping ─────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  medical:   "bg-rose-500/10 text-rose-400 border-rose-500/20",
  legal:     "bg-blue-500/10 text-blue-400 border-blue-500/20",
  financial: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  personal:  "bg-purple-500/10 text-purple-400 border-purple-500/20",
}
const FALLBACK = "bg-slate-700 text-slate-300 border-slate-600"

describe("category badge colors", () => {
  it("has a colour for every vault category", () => {
    for (const cat of VAULT_CATEGORIES) {
      expect(CAT_COLORS[cat]).toBeDefined()
    }
  })

  it("medical → rose palette", () => {
    expect(CAT_COLORS.medical).toContain("rose")
  })

  it("legal → blue palette", () => {
    expect(CAT_COLORS.legal).toContain("blue")
  })

  it("financial → emerald palette", () => {
    expect(CAT_COLORS.financial).toContain("emerald")
  })

  it("personal → purple palette", () => {
    expect(CAT_COLORS.personal).toContain("purple")
  })

  it("unknown category gets fallback", () => {
    const cls = CAT_COLORS["unknown"] ?? FALLBACK
    expect(cls).toBe(FALLBACK)
  })
})

// ─── File icon helper (dashboard + vault page) ─────────────────────────────────

function fileIcon(fileType: string): string {
  if (fileType.startsWith("image/"))       return "🖼️"
  if (fileType === "application/pdf")      return "📄"
  if (fileType.startsWith("text/"))        return "📝"
  if (fileType.includes("spreadsheet") || fileType.includes("excel")) return "📊"
  return "📎"
}

describe("fileIcon", () => {
  it("maps PDF to document icon", () => {
    expect(fileIcon("application/pdf")).toBe("📄")
  })

  it("maps images to picture icon", () => {
    expect(fileIcon("image/png")).toBe("🖼️")
    expect(fileIcon("image/jpeg")).toBe("🖼️")
  })

  it("maps text types to text icon", () => {
    expect(fileIcon("text/plain")).toBe("📝")
    expect(fileIcon("text/html")).toBe("📝")
  })

  it("maps spreadsheet types to chart icon", () => {
    expect(fileIcon("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("📊")
    expect(fileIcon("application/vnd.ms-excel")).toBe("📊")
  })

  it("uses paperclip for unknown types", () => {
    expect(fileIcon("application/octet-stream")).toBe("📎")
    expect(fileIcon("")).toBe("📎")
  })
})

// ─── Grant status constants ────────────────────────────────────────────────────

describe("GRANT_STATUS constants", () => {
  it("has active status", () => {
    expect(GRANT_STATUS.ACTIVE).toBe("active")
  })

  it("has expired status", () => {
    expect(GRANT_STATUS.EXPIRED).toBe("expired")
  })

  it("has revoked status", () => {
    expect(GRANT_STATUS.REVOKED).toBe("revoked")
  })
})

// ─── EXPIRY helpers (used in extend dialog) ───────────────────────────────────

describe("EXPIRY helpers", () => {
  it("1 hour = 3600 seconds", () => {
    expect(EXPIRY.hours(1)).toBe(3_600)
  })

  it("24 hours = 86400 seconds", () => {
    expect(EXPIRY.hours(24)).toBe(86_400)
  })

  it("7 days = 604800 seconds", () => {
    expect(EXPIRY.days(7)).toBe(604_800)
  })

  it("30 days = 2592000 seconds", () => {
    expect(EXPIRY.days(30)).toBe(2_592_000)
  })

  it("extend options cover all four presets", () => {
    const EXTEND_OPTIONS = [3_600, 86_400, 7 * 86_400, 30 * 86_400]
    expect(EXTEND_OPTIONS).toHaveLength(4)
    expect(EXTEND_OPTIONS[0]).toBe(EXPIRY.hours(1))
    expect(EXTEND_OPTIONS[1]).toBe(EXPIRY.hours(24))
    expect(EXTEND_OPTIONS[2]).toBe(EXPIRY.days(7))
    expect(EXTEND_OPTIONS[3]).toBe(EXPIRY.days(30))
  })
})
