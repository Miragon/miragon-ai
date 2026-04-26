import { describe, expect, it } from "vitest"
import {
  buildInstanceCockpitUrl,
  buildInstanceCockpitUrlPrefix,
  buildProcessCockpitUrl,
} from "./cockpit-url.js"

describe("buildProcessCockpitUrl", () => {
  it("builds the canonical CIB seven path from an explicit cockpit URL", () => {
    expect(
      buildProcessCockpitUrl("http://localhost:8080/webapp", "ignored", "miraveloLeasing"),
    ).toBe("http://localhost:8080/webapp/#/seven/auth/process/miraveloLeasing")
  })

  it("appends the configured tab as a query parameter", () => {
    expect(
      buildProcessCockpitUrl("http://localhost:8080/webapp", "ignored", "miraveloLeasing", {
        tab: "incidents",
      }),
    ).toBe("http://localhost:8080/webapp/#/seven/auth/process/miraveloLeasing?tab=incidents")
  })

  it("URL-encodes a tab value containing reserved characters", () => {
    expect(
      buildProcessCockpitUrl("http://x/webapp", "ignored", "k", { tab: "history & runs" }),
    ).toBe("http://x/webapp/#/seven/auth/process/k?tab=history%20%26%20runs")
  })

  it("falls back to deriving the webapp base from baseUrl", () => {
    expect(
      buildProcessCockpitUrl(undefined, "http://localhost:8080/engine-rest", "miraveloLeasing"),
    ).toBe("http://localhost:8080/webapp/#/seven/auth/process/miraveloLeasing")
  })

  it("returns null when baseUrl has no recognisable engine-rest suffix", () => {
    expect(buildProcessCockpitUrl(undefined, "http://localhost:8080/api/v1", "k")).toBe(null)
  })

  it("rejects non-http(s) cockpit URLs (XSS guard)", () => {
    expect(buildProcessCockpitUrl("javascript:alert(1)", "ignored", "k")).toBe(null)
    expect(buildProcessCockpitUrl("ftp://example.com", "ignored", "k")).toBe(null)
  })

  it("strips trailing slashes and hashes from a configured base", () => {
    expect(buildProcessCockpitUrl("http://x/webapp/", "ignored", "k")).toBe(
      "http://x/webapp/#/seven/auth/process/k",
    )
    expect(buildProcessCockpitUrl("http://x/webapp/#", "ignored", "k")).toBe(
      "http://x/webapp/#/seven/auth/process/k",
    )
    expect(buildProcessCockpitUrl("http://x/webapp/#/", "ignored", "k")).toBe(
      "http://x/webapp/#/seven/auth/process/k",
    )
  })

  it("URL-encodes process keys with reserved characters", () => {
    expect(
      buildProcessCockpitUrl("http://localhost:8080/webapp", "ignored", "tenant:scope/subKey"),
    ).toBe("http://localhost:8080/webapp/#/seven/auth/process/tenant%3Ascope%2FsubKey")
  })

  it("trims whitespace from the configured base", () => {
    expect(buildProcessCockpitUrl("  http://x/webapp  ", "ignored", "k")).toBe(
      "http://x/webapp/#/seven/auth/process/k",
    )
  })
})

describe("buildInstanceCockpitUrlPrefix", () => {
  it("returns the canonical prefix from a configured base", () => {
    expect(buildInstanceCockpitUrlPrefix("http://localhost:8080/webapp", "ignored")).toBe(
      "http://localhost:8080/webapp/#/seven/auth/process-instance/",
    )
  })

  it("derives the prefix from baseUrl when no cockpit URL is configured", () => {
    expect(buildInstanceCockpitUrlPrefix(undefined, "http://x:8080/engine-rest")).toBe(
      "http://x:8080/webapp/#/seven/auth/process-instance/",
    )
  })

  it("returns null on non-http(s) base", () => {
    expect(buildInstanceCockpitUrlPrefix("javascript:foo", "ignored")).toBe(null)
  })
})

describe("buildInstanceCockpitUrl", () => {
  it("builds a process-instance link from an explicit base", () => {
    expect(buildInstanceCockpitUrl("http://localhost:8080/webapp", "ignored", "inst-abc")).toBe(
      "http://localhost:8080/webapp/#/seven/auth/process-instance/inst-abc",
    )
  })

  it("falls back to deriving the webapp base from baseUrl", () => {
    expect(
      buildInstanceCockpitUrl(undefined, "http://localhost:8080/engine-rest", "inst-abc"),
    ).toBe("http://localhost:8080/webapp/#/seven/auth/process-instance/inst-abc")
  })

  it("URL-encodes the instance ID", () => {
    expect(
      buildInstanceCockpitUrl("http://localhost:8080/webapp", "ignored", "inst/with slash"),
    ).toBe("http://localhost:8080/webapp/#/seven/auth/process-instance/inst%2Fwith%20slash")
  })

  it("returns null on non-http(s) bases", () => {
    expect(buildInstanceCockpitUrl("javascript:foo", "ignored", "inst")).toBe(null)
  })
})
