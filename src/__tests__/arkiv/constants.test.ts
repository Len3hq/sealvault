import { describe, it, expect } from "vitest"
import {
  PROJECT_ATTRIBUTE,
  ENTITY_TYPES,
  ENTITY_SUBTYPES,
  EXPIRY,
  TTL,
  VAULT_CATEGORIES,
  GRANT_STATUS,
} from "@/lib/arkiv/constants"

describe("PROJECT_ATTRIBUTE", () => {
  it("is exactly the string sealvault", () => {
    expect(PROJECT_ATTRIBUTE).toBe("sealvault")
  })
})

describe("ENTITY_TYPES", () => {
  it("has all required entity types", () => {
    expect(ENTITY_TYPES.VAULT_ITEM).toBe("vault_item")
    expect(ENTITY_TYPES.ACCESS_GRANT).toBe("access_grant")
    expect(ENTITY_TYPES.AGENT_MEMORY).toBe("agent_memory")
  })
})

describe("ENTITY_SUBTYPES", () => {
  it("has grant_record and contact subtypes", () => {
    expect(ENTITY_SUBTYPES.GRANT_RECORD).toBe("grant_record")
    expect(ENTITY_SUBTYPES.CONTACT).toBe("contact")
  })
})

describe("EXPIRY helpers", () => {
  it("converts seconds correctly", () => {
    expect(EXPIRY.seconds(1)).toBe(1)
    expect(EXPIRY.seconds(60)).toBe(60)
  })

  it("converts minutes to seconds", () => {
    expect(EXPIRY.minutes(1)).toBe(60)
    expect(EXPIRY.minutes(30)).toBe(1800)
    expect(EXPIRY.minutes(60)).toBe(3600)
  })

  it("converts hours to seconds", () => {
    expect(EXPIRY.hours(1)).toBe(3600)
    expect(EXPIRY.hours(24)).toBe(86400)
    expect(EXPIRY.hours(48)).toBe(172800)
  })

  it("converts days to seconds", () => {
    expect(EXPIRY.days(1)).toBe(86400)
    expect(EXPIRY.days(7)).toBe(604800)
    expect(EXPIRY.days(30)).toBe(2592000)
  })

  it("converts years to seconds", () => {
    expect(EXPIRY.years(1)).toBe(31536000)
    expect(EXPIRY.years(2)).toBe(63072000)
    expect(EXPIRY.years(10)).toBe(315360000)
  })
})

describe("TTL values", () => {
  it("vault items have 10-year TTL", () => {
    expect(TTL.VAULT_ITEM).toBe(EXPIRY.years(10))
  })

  it("minimum grant TTL is 1 hour", () => {
    expect(TTL.GRANT_MIN).toBe(EXPIRY.hours(1))
  })

  it("default grant TTL is 48 hours", () => {
    expect(TTL.GRANT_DEFAULT).toBe(EXPIRY.hours(48))
  })

  it("maximum grant TTL is 30 days", () => {
    expect(TTL.GRANT_MAX).toBe(EXPIRY.days(30))
  })

  it("grant records last 2 years for audit trail", () => {
    expect(TTL.AGENT_GRANT_RECORD).toBe(EXPIRY.years(2))
  })

  it("contacts last 5 years", () => {
    expect(TTL.AGENT_CONTACT).toBe(EXPIRY.years(5))
  })

  it("grant record TTL outlives default grant TTL", () => {
    expect(TTL.AGENT_GRANT_RECORD).toBeGreaterThan(TTL.GRANT_MAX)
  })
})

describe("VAULT_CATEGORIES", () => {
  it("includes all expected categories", () => {
    expect(VAULT_CATEGORIES).toContain("medical")
    expect(VAULT_CATEGORIES).toContain("legal")
    expect(VAULT_CATEGORIES).toContain("financial")
    expect(VAULT_CATEGORIES).toContain("personal")
  })

  it("has exactly 4 categories", () => {
    expect(VAULT_CATEGORIES).toHaveLength(4)
  })
})

describe("GRANT_STATUS", () => {
  it("has active, expired, revoked statuses", () => {
    expect(GRANT_STATUS.ACTIVE).toBe("active")
    expect(GRANT_STATUS.EXPIRED).toBe("expired")
    expect(GRANT_STATUS.REVOKED).toBe("revoked")
  })
})
