import { describe, expect, it, vi } from "vitest"
import { createLocalizeFor, resolveProfileLocale } from "./server-locale.js"
import { runWithMcpRequestInfo } from "./request-context.js"
import type { ProfileSource } from "./profile.js"

const storeWith = (language?: string): ProfileSource => ({
  get: () => Promise.resolve({ language }),
})

/** A signed-in caller's handler ctx. */
const CTX = { auth: { user: { id: "user-1" } } }

describe("resolveProfileLocale", () => {
  it("reads the caller's profile language", async () => {
    expect(await resolveProfileLocale(storeWith("de"), CTX)).toBe("de")
  })

  it("falls back to English without a store, without a stored language, and without a key", async () => {
    expect(await resolveProfileLocale(undefined, CTX)).toBe("en")
    expect(await resolveProfileLocale(storeWith(undefined), CTX)).toBe("en")
    // No identity: no request context at all, or an HTTP request without OAuth.
    expect(await resolveProfileLocale(storeWith("de"))).toBe("en")
    expect(await runWithMcpRequestInfo({}, () => resolveProfileLocale(storeWith("de")))).toBe("en")
  })

  it("degrades to English on a store OUTAGE instead of failing the tool", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const broken: ProfileSource = { get: () => Promise.reject(new Error("pg down")) }
    expect(await resolveProfileLocale(broken, CTX)).toBe("en")
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})

describe("createLocalizeFor", () => {
  const translator = (locale: string, key: string, params?: Record<string, unknown>) =>
    `${locale}:${key}${params ? `:${JSON.stringify(params)}` : ""}`

  it("binds the module translator to the resolved locale", async () => {
    const localizeFor = createLocalizeFor(translator)
    const t = await localizeFor(storeWith("de"), CTX)
    expect(t("greeting")).toBe("de:greeting")
    expect(t("count", { n: 2 })).toBe('de:count:{"n":2}')
  })

  it("localizes to English when no store is wired", async () => {
    const t = await createLocalizeFor(translator)()
    expect(t("greeting")).toBe("en:greeting")
  })
})
