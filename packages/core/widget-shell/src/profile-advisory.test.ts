import { afterEach, describe, expect, it, vi } from "vitest"
import { readProfileAdvisory } from "./profile-advisory.js"

/** A driver-shaped outage: the message carries the database host:port. */
function driverError(): Error {
  return Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:5432"), { code: "ECONNREFUSED" })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("readProfileAdvisory", () => {
  it("returns the stored record", async () => {
    const store = { get: (key: string) => Promise.resolve({ key }) }
    expect(await readProfileAdvisory(store, "user-1")).toEqual({ key: "user-1" })
  })

  it("skips the store entirely without a key", async () => {
    const get = vi.fn(() => Promise.resolve({}))
    expect(await readProfileAdvisory({ get }, undefined)).toBeUndefined()
    expect(get).not.toHaveBeenCalled()
  })

  it("degrades an outage to 'no record' and logs ONE sanitized line per outage", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    let down = true
    const store = {
      get: () => (down ? Promise.reject(driverError()) : Promise.resolve({ language: "de" })),
    }

    expect(await readProfileAdvisory(store, "user-1")).toBeUndefined()
    expect(await readProfileAdvisory(store, "user-1")).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    const line = String(warn.mock.calls[0][0])
    expect(line).toContain("Error ECONNREFUSED")
    expect(line).not.toMatch(/10\.1\.2\.3|5432/)

    // Recovery is announced once, and the next outage logs again.
    down = false
    expect(await readProfileAdvisory(store, "user-1")).toEqual({ language: "de" })
    expect(await readProfileAdvisory(store, "user-1")).toEqual({ language: "de" })
    expect(warn).toHaveBeenCalledTimes(2)
    expect(String(warn.mock.calls[1][0])).toContain("reachable again")
    down = true
    await readProfileAdvisory(store, "user-1")
    expect(warn).toHaveBeenCalledTimes(3)
  })

  it("names only the error class (or type) when there is no code", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await readProfileAdvisory({ get: () => Promise.reject(new TypeError("at 10.1.2.3")) }, "k")
    // A driver rejecting with a bare string (typed as Error only to satisfy the lint).
    const bare = "10.1.2.3:5432" as unknown as Error
    await readProfileAdvisory({ get: () => Promise.reject(bare) }, "k")
    expect(String(warn.mock.calls[0][0])).toContain("(TypeError)")
    expect(String(warn.mock.calls[1][0])).toContain("(string)")
    expect(warn.mock.calls.flat().join(" ")).not.toContain("10.1.2.3")
  })
})
