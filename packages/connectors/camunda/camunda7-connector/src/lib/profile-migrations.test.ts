import { describe, expect, it } from "vitest"
import { parseStoredProfile } from "./profile-migrations.js"

const V1_BASE = {
  id: "sess-1",
  language: "de",
  theme: "dark",
  pinnedDashboardIds: ["d1"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  schemaVersion: 1,
}

describe("parseStoredProfile", () => {
  it("passes a current-version record through unchanged", () => {
    const record = {
      ...V1_BASE,
      schemaVersion: 2,
      modules: { analytics: { defaultPeriod: "14d" } },
    }
    expect(parseStoredProfile(record)).toMatchObject({
      language: "de",
      schemaVersion: 2,
      modules: { analytics: { defaultPeriod: "14d" } },
    })
  })

  it("migrates v1 flat analytics fields into modules.analytics with the slice's names", () => {
    const parsed = parseStoredProfile({
      ...V1_BASE,
      analyticsDefaultPeriod: "30d",
      analyticsMinBucketSize: 25,
    })
    expect(parsed).toMatchObject({
      language: "de",
      theme: "dark",
      pinnedDashboardIds: ["d1"],
      schemaVersion: 2,
      modules: { analytics: { defaultPeriod: "30d", minBucketSize: 25 } },
    })
    expect(parsed).not.toHaveProperty("analyticsDefaultPeriod")
    expect(parsed).not.toHaveProperty("analyticsMinBucketSize")
  })

  it("migrates a v1 record without analytics fields to an empty modules bag", () => {
    expect(parseStoredProfile(V1_BASE)).toMatchObject({ schemaVersion: 2, modules: {} })
  })

  it("never overwrites an already-present modules.analytics slice", () => {
    const parsed = parseStoredProfile({
      ...V1_BASE,
      analyticsDefaultPeriod: "30d",
      modules: { analytics: { defaultPeriod: "1d" } },
    })
    expect(parsed?.modules).toEqual({ analytics: { defaultPeriod: "1d" } })
  })

  it("treats a missing schemaVersion as version 1", () => {
    const versionless: Record<string, unknown> = { ...V1_BASE, analyticsDefaultPeriod: "3d" }
    delete versionless.schemaVersion
    expect(parseStoredProfile(versionless)).toMatchObject({
      schemaVersion: 2,
      modules: { analytics: { defaultPeriod: "3d" } },
    })
  })

  it("reads records from a NEWER build as absent", () => {
    expect(parseStoredProfile({ ...V1_BASE, schemaVersion: 3 })).toBeUndefined()
  })

  it("reads garbage as absent", () => {
    expect(parseStoredProfile(null)).toBeUndefined()
    expect(parseStoredProfile("nope")).toBeUndefined()
    expect(parseStoredProfile({ schemaVersion: 0 })).toBeUndefined()
    expect(parseStoredProfile({ ...V1_BASE, language: 42 })).toBeUndefined()
  })
})
