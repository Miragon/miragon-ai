import { describe, expect, it } from "vitest"
import { createLocalizeFor, resolveProfileLocale } from "./server-locale.js"
import { runWithMcpRequestInfo } from "./request-context.js"
import type { ProfileSource } from "./profile.js"

const storeWith = (language?: string): ProfileSource => ({
  get: () => Promise.resolve({ language }),
})

// Without any request context, resolveProfileKey falls back to the shared
// anonymous record — so a plain call reads the store.
describe("resolveProfileLocale", () => {
  it("reads the profile language", async () => {
    expect(await resolveProfileLocale(storeWith("de"))).toBe("de")
  })

  it("falls back to English without a store, without a stored language, and without a key", async () => {
    expect(await resolveProfileLocale(undefined)).toBe("en")
    expect(await resolveProfileLocale(storeWith(undefined))).toBe("en")
    // Identity-less HTTP request: ambient info exists but carries no key.
    expect(await runWithMcpRequestInfo({}, () => resolveProfileLocale(storeWith("de")))).toBe("en")
  })

  it("degrades to English on a store OUTAGE instead of failing the tool", async () => {
    const broken: ProfileSource = { get: () => Promise.reject(new Error("pg down")) }
    expect(await resolveProfileLocale(broken)).toBe("en")
  })
})

describe("createLocalizeFor", () => {
  const translator = (locale: string, key: string, params?: Record<string, unknown>) =>
    `${locale}:${key}${params ? `:${JSON.stringify(params)}` : ""}`

  it("binds the module translator to the resolved locale", async () => {
    const localizeFor = createLocalizeFor(translator)
    const t = await localizeFor(storeWith("de"))
    expect(t("greeting")).toBe("de:greeting")
    expect(t("count", { n: 2 })).toBe('de:count:{"n":2}')
  })

  it("localizes to English when no store is wired", async () => {
    const t = await createLocalizeFor(translator)()
    expect(t("greeting")).toBe("en:greeting")
  })
})
