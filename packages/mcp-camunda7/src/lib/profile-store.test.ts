import { describe, expect, it } from "vitest"
import { createInMemoryProfileStore } from "./profile-store.js"
import { defaultUserProfile, userProfilePreferencesSchema } from "./profile-schema.js"

describe("defaultUserProfile", () => {
  it("returns a complete, defaulted profile for an unsaved key", () => {
    const p = defaultUserProfile("sess-1")
    expect(p).toMatchObject({
      id: "sess-1",
      language: "en",
      theme: "system",
      pinnedDashboardIds: [],
      analyticsDefaultPeriod: "7d",
      analyticsMinBucketSize: 10,
      schemaVersion: 1,
    })
    expect(p.defaultEngineId).toBeUndefined()
    expect(p.allowedEngineIds).toBeUndefined()
  })

  it("the preferences schema fills every default from an empty object", () => {
    expect(userProfilePreferencesSchema.parse({})).toEqual({
      language: "en",
      theme: "system",
      pinnedDashboardIds: [],
      analyticsDefaultPeriod: "7d",
      analyticsMinBucketSize: 10,
    })
  })
})

describe("createInMemoryProfileStore", () => {
  it("returns undefined for an unknown key", async () => {
    const store = createInMemoryProfileStore()
    expect(await store.get("missing")).toBeUndefined()
  })

  it("creates, then merges partial updates without wiping other fields", async () => {
    const store = createInMemoryProfileStore()

    const created = await store.save("sess-1", { language: "de", allowedEngineIds: ["prod-a"] })
    expect(created.language).toBe("de")
    expect(created.allowedEngineIds).toEqual(["prod-a"])
    // Untouched fields keep their defaults.
    expect(created.theme).toBe("system")

    // A single-field update must not reset language/allowedEngineIds.
    const updated = await store.save("sess-1", { theme: "dark" })
    expect(updated.theme).toBe("dark")
    expect(updated.language).toBe("de")
    expect(updated.allowedEngineIds).toEqual(["prod-a"])
    // createdAt is preserved across saves; updatedAt advances (or is unchanged).
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.updatedAt >= created.updatedAt).toBe(true)
  })

  it('clears an optional id field when an empty string ("(auto)") is saved', async () => {
    const store = createInMemoryProfileStore()
    await store.save("sess-1", { defaultEngineId: "prod-a" })
    const cleared = await store.save("sess-1", { defaultEngineId: "" })
    expect(cleared.defaultEngineId).toBeUndefined()
  })

  it("deletes a stored profile", async () => {
    const store = createInMemoryProfileStore()
    await store.save("sess-1", { theme: "dark" })
    expect(await store.delete("sess-1")).toBe(true)
    expect(await store.get("sess-1")).toBeUndefined()
    expect(await store.delete("sess-1")).toBe(false)
  })
})
