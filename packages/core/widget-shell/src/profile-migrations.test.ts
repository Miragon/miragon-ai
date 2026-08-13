import { describe, expect, it } from "vitest"
import { PROFILE_MIGRATIONS, parseStoredProfile } from "./profile-migrations.js"
import { PROFILE_SCHEMA_VERSION } from "./profile-constants.js"

const V1_BASE = {
  id: "sess-1",
  language: "de",
  theme: "dark",
  pinnedDashboardIds: ["d1"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  schemaVersion: 1,
}

describe("PROFILE_MIGRATIONS completeness", () => {
  it("carries an entry for every version below PROFILE_SCHEMA_VERSION", () => {
    // The failure mode this guards: a PROFILE_SCHEMA_VERSION bump without its
    // migration entry ships, and every stored record silently resets on read.
    const expected = Array.from({ length: PROFILE_SCHEMA_VERSION - 1 }, (_, i) => i + 1)
    const actual = Object.keys(PROFILE_MIGRATIONS)
      .map(Number)
      .sort((a, b) => a - b)
    expect(actual).toEqual(expected)
  })
})

describe("parseStoredProfile", () => {
  it("passes a current-version record through unchanged", () => {
    const record = {
      id: "sess-1",
      language: "de",
      theme: "dark",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      schemaVersion: 3,
      modules: { analytics: { defaultPeriod: "14d" }, camunda7: { defaultEngineId: "prod-a" } },
    }
    expect(parseStoredProfile(record)).toMatchObject({
      language: "de",
      schemaVersion: 3,
      modules: { analytics: { defaultPeriod: "14d" }, camunda7: { defaultEngineId: "prod-a" } },
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
      schemaVersion: 3,
      modules: {
        analytics: { defaultPeriod: "30d", minBucketSize: 25 },
        camunda7: { pinnedDashboardIds: ["d1"] },
      },
    })
    expect(parsed).not.toHaveProperty("analyticsDefaultPeriod")
    expect(parsed).not.toHaveProperty("analyticsMinBucketSize")
  })

  it("migrates v2 flat camunda7 fields into modules.camunda7", () => {
    const parsed = parseStoredProfile({
      id: "sess-1",
      language: "de",
      theme: "dark",
      defaultEngineId: "prod-a",
      allowedEngineIds: ["prod-a"],
      pinnedDashboardIds: ["d1"],
      defaultDashboardId: "dash-1",
      preferredRole: "admin",
      modules: { analytics: { defaultPeriod: "14d" } },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      schemaVersion: 2,
    })
    expect(parsed).toMatchObject({
      schemaVersion: 3,
      modules: {
        analytics: { defaultPeriod: "14d" },
        camunda7: {
          defaultEngineId: "prod-a",
          allowedEngineIds: ["prod-a"],
          pinnedDashboardIds: ["d1"],
          defaultDashboardId: "dash-1",
          preferredRole: "admin",
        },
      },
    })
    expect(parsed).not.toHaveProperty("defaultEngineId")
    expect(parsed).not.toHaveProperty("preferredRole")
  })

  it("migrates a v1 record without module fields to just the moved dashboard pins", () => {
    expect(parseStoredProfile(V1_BASE)).toMatchObject({
      schemaVersion: 3,
      modules: { camunda7: { pinnedDashboardIds: ["d1"] } },
    })
  })

  it("never overwrites an already-present module slice", () => {
    const parsed = parseStoredProfile({
      ...V1_BASE,
      analyticsDefaultPeriod: "30d",
      modules: { analytics: { defaultPeriod: "1d" } },
    })
    expect(parsed?.modules.analytics).toEqual({ defaultPeriod: "1d" })
  })

  it("treats a missing schemaVersion as version 1", () => {
    const versionless: Record<string, unknown> = { ...V1_BASE, analyticsDefaultPeriod: "3d" }
    delete versionless.schemaVersion
    expect(parseStoredProfile(versionless)).toMatchObject({
      schemaVersion: 3,
      modules: { analytics: { defaultPeriod: "3d" } },
    })
  })

  it("reads records from a NEWER build as absent", () => {
    expect(parseStoredProfile({ ...V1_BASE, schemaVersion: 4 })).toBeUndefined()
  })

  it("reads garbage as absent", () => {
    expect(parseStoredProfile(null)).toBeUndefined()
    expect(parseStoredProfile("nope")).toBeUndefined()
    expect(parseStoredProfile({ schemaVersion: 0 })).toBeUndefined()
    expect(parseStoredProfile({ ...V1_BASE, language: 42 })).toBeUndefined()
  })
})
