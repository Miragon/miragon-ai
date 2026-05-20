import { describe, expect, it } from "vitest"
import { buildInstanceCockpitUrl, buildProcessCockpitUrl } from "./cockpit-url.js"

describe("buildProcessCockpitUrl", () => {
  it("builds the canonical CIB seven path with version from an explicit cockpit URL", () => {
    expect(
      buildProcessCockpitUrl("http://localhost:8080/webapp", "ignored", "miraveloLeasing", 1),
    ).toBe("http://localhost:8080/webapp/#/seven/auth/process/miraveloLeasing/1")
  })

  it("omits the version segment when version is null (cockpit resolves to latest)", () => {
    expect(
      buildProcessCockpitUrl("http://localhost:8080/webapp", "ignored", "miraveloLeasing", null),
    ).toBe("http://localhost:8080/webapp/#/seven/auth/process/miraveloLeasing")
  })

  it("appends the configured tab as a query parameter", () => {
    expect(
      buildProcessCockpitUrl("http://localhost:8080/webapp", "ignored", "miraveloLeasing", 2, {
        tab: "incidents",
      }),
    ).toBe("http://localhost:8080/webapp/#/seven/auth/process/miraveloLeasing/2?tab=incidents")
  })

  it("URL-encodes a tab value containing reserved characters", () => {
    expect(
      buildProcessCockpitUrl("http://x/webapp", "ignored", "k", 1, { tab: "history & runs" }),
    ).toBe("http://x/webapp/#/seven/auth/process/k/1?tab=history%20%26%20runs")
  })

  it("falls back to deriving the webapp base from baseUrl", () => {
    expect(
      buildProcessCockpitUrl(undefined, "http://localhost:8080/engine-rest", "miraveloLeasing", 3),
    ).toBe("http://localhost:8080/webapp/#/seven/auth/process/miraveloLeasing/3")
  })

  it("returns null when baseUrl has no recognisable engine-rest suffix", () => {
    expect(buildProcessCockpitUrl(undefined, "http://localhost:8080/api/v1", "k", 1)).toBe(null)
  })

  it("rejects non-http(s) cockpit URLs (XSS guard)", () => {
    expect(buildProcessCockpitUrl("javascript:alert(1)", "ignored", "k", 1)).toBe(null)
    expect(buildProcessCockpitUrl("ftp://example.com", "ignored", "k", 1)).toBe(null)
  })

  it("strips trailing slashes and hashes from a configured base", () => {
    expect(buildProcessCockpitUrl("http://x/webapp/", "ignored", "k", 1)).toBe(
      "http://x/webapp/#/seven/auth/process/k/1",
    )
    expect(buildProcessCockpitUrl("http://x/webapp/#", "ignored", "k", 1)).toBe(
      "http://x/webapp/#/seven/auth/process/k/1",
    )
    expect(buildProcessCockpitUrl("http://x/webapp/#/", "ignored", "k", 1)).toBe(
      "http://x/webapp/#/seven/auth/process/k/1",
    )
  })

  it("URL-encodes process keys with reserved characters", () => {
    expect(
      buildProcessCockpitUrl("http://localhost:8080/webapp", "ignored", "tenant:scope/subKey", 1),
    ).toBe("http://localhost:8080/webapp/#/seven/auth/process/tenant%3Ascope%2FsubKey/1")
  })

  it("trims whitespace from the configured base", () => {
    expect(buildProcessCockpitUrl("  http://x/webapp  ", "ignored", "k", 1)).toBe(
      "http://x/webapp/#/seven/auth/process/k/1",
    )
  })
})

describe("buildInstanceCockpitUrl", () => {
  it("builds a process-instance link nested under the process route", () => {
    expect(
      buildInstanceCockpitUrl(
        "http://localhost:8080/webapp",
        "ignored",
        "miraveloLeasing",
        1,
        "inst-abc",
      ),
    ).toBe("http://localhost:8080/webapp/#/seven/auth/process/miraveloLeasing/1/inst-abc")
  })

  it("appends the configured tab", () => {
    expect(
      buildInstanceCockpitUrl(
        "http://localhost:8080/webapp",
        "ignored",
        "miraveloLeasing",
        1,
        "inst-abc",
        { tab: "variables" },
      ),
    ).toBe(
      "http://localhost:8080/webapp/#/seven/auth/process/miraveloLeasing/1/inst-abc?tab=variables",
    )
  })

  it("omits the version segment when version is null (cockpit resolves to latest)", () => {
    expect(
      buildInstanceCockpitUrl(
        "http://localhost:8080/webapp",
        "ignored",
        "miraveloLeasing",
        null,
        "inst-abc",
        { tab: "variables" },
      ),
    ).toBe(
      "http://localhost:8080/webapp/#/seven/auth/process/miraveloLeasing/inst-abc?tab=variables",
    )
  })

  it("falls back to deriving the webapp base from baseUrl", () => {
    expect(
      buildInstanceCockpitUrl(
        undefined,
        "http://localhost:8080/engine-rest",
        "miraveloLeasing",
        2,
        "inst-abc",
      ),
    ).toBe("http://localhost:8080/webapp/#/seven/auth/process/miraveloLeasing/2/inst-abc")
  })

  it("URL-encodes both the key and the instance ID", () => {
    expect(
      buildInstanceCockpitUrl(
        "http://localhost:8080/webapp",
        "ignored",
        "tenant:scope/key",
        1,
        "inst/with slash",
      ),
    ).toBe(
      "http://localhost:8080/webapp/#/seven/auth/process/tenant%3Ascope%2Fkey/1/inst%2Fwith%20slash",
    )
  })

  it("returns null on non-http(s) bases", () => {
    expect(buildInstanceCockpitUrl("javascript:foo", "ignored", "k", 1, "inst")).toBe(null)
  })
})
