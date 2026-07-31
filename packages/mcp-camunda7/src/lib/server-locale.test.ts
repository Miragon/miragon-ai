import { describe, expect, it } from "vitest"
import { ANONYMOUS_PROFILE_KEY } from "@miragon-ai/widget-shell/server"
import { createInMemoryProfileStore, type ProfileStore } from "./profile-store.js"
import { localizeFor, resolveLocale } from "./server-locale.js"

// Vitest runs without an mcp-use request context, so `resolveProfileKey()`
// resolves the shared anonymous key — enough to exercise the store lookup.
const outageStore: ProfileStore = {
  get: () => Promise.reject(new Error("connection refused")),
  save: () => Promise.reject(new Error("connection refused")),
  delete: () => Promise.reject(new Error("connection refused")),
  cleanupSessions: () => Promise.reject(new Error("connection refused")),
}

describe("resolveLocale", () => {
  it("reads the language off the profile record", async () => {
    const store = createInMemoryProfileStore()
    await store.save(ANONYMOUS_PROFILE_KEY, { language: "de" })
    expect(await resolveLocale(store)).toBe("de")
  })

  it("falls back to English on a store OUTAGE (must not fail engine-backed tools)", async () => {
    // With DATABASE_URL the store is a network call and this runs as the first
    // `await` of every widget tool — a Postgres hiccup may only cost the
    // translation, never the tool result.
    expect(await resolveLocale(outageStore)).toBe("en")
  })
})

describe("localizeFor", () => {
  it("binds the translate to the profile language", async () => {
    const store = createInMemoryProfileStore()
    await store.save(ANONYMOUS_PROFILE_KEY, { language: "de" })
    const t = await localizeFor(store)
    expect(t("profile.heading")).toBe("Profil & Einstellungen")
  })

  it("still returns a working translate when the store is down", async () => {
    const t = await localizeFor(outageStore)
    expect(t("profile.heading")).toBe("Profile & Settings")
  })
})
