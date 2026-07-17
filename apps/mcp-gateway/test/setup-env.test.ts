import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  getAppConfig,
  getPlugins,
  warnPrometheusDefault,
  warnUnknownEnvVars,
} from "../src/setup.js"

const FILE_ENGINES = [{ id: "from-file", baseUrl: "http://file.example/engine-rest" }]
const JSON_ENGINES = [{ id: "from-json", baseUrl: "http://json.example/engine-rest" }]

/** Engines the camunda7 module would boot with, as resolved from the current env. */
function configuredEngines(): unknown {
  const entry = getAppConfig().activeApps.find((e) => e.app === "camunda7")
  expect(entry, "camunda7 module should be active").toBeDefined()
  return (entry!.config as { engines?: unknown }).engines
}

describe("setup.ts engine resolution precedence (ENGINES_FILE > ENGINES_JSON > BASE_URL > default)", () => {
  let tmpDir: string | undefined

  function writeEnginesFile(engines: unknown): string {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-gateway-engines-"))
    const file = path.join(tmpDir, "engines.json")
    fs.writeFileSync(file, JSON.stringify(engines))
    return file
  }

  beforeEach(() => {
    // Neutral baseline so ambient shell env can't leak into the assertions.
    vi.stubEnv("MCP_ACTIVE_MODULES", undefined)
    vi.stubEnv("CAMUNDA_ENGINES_FILE", undefined)
    vi.stubEnv("CAMUNDA_ENGINES_JSON", undefined)
    vi.stubEnv("CAMUNDA_BASE_URL", undefined)
    vi.stubEnv("CAMUNDA_COCKPIT_URL", undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  })

  it("prefers CAMUNDA_ENGINES_FILE over ENGINES_JSON and BASE_URL", () => {
    vi.stubEnv("CAMUNDA_ENGINES_FILE", writeEnginesFile(FILE_ENGINES))
    vi.stubEnv("CAMUNDA_ENGINES_JSON", JSON.stringify(JSON_ENGINES))
    vi.stubEnv("CAMUNDA_BASE_URL", "http://legacy.example/engine-rest")

    expect(configuredEngines()).toEqual(FILE_ENGINES)
  })

  it("prefers CAMUNDA_ENGINES_JSON over BASE_URL when no file is set", () => {
    vi.stubEnv("CAMUNDA_ENGINES_JSON", JSON.stringify(JSON_ENGINES))
    vi.stubEnv("CAMUNDA_BASE_URL", "http://legacy.example/engine-rest")

    expect(configuredEngines()).toEqual(JSON_ENGINES)
  })

  it("synthesizes a single `default` engine from legacy CAMUNDA_BASE_URL (+ cockpit URL)", () => {
    vi.stubEnv("CAMUNDA_BASE_URL", "http://legacy.example/engine-rest")
    vi.stubEnv("CAMUNDA_COCKPIT_URL", "http://legacy.example/camunda")

    expect(configuredEngines()).toEqual([
      {
        id: "default",
        baseUrl: "http://legacy.example/engine-rest",
        cockpitUrl: "http://legacy.example/camunda",
      },
    ])
  })

  it("omits cockpitUrl when only CAMUNDA_BASE_URL is set", () => {
    vi.stubEnv("CAMUNDA_BASE_URL", "http://legacy.example/engine-rest")

    expect(configuredEngines()).toEqual([
      { id: "default", baseUrl: "http://legacy.example/engine-rest" },
    ])
  })

  it("falls back to the local default engine when nothing is set", () => {
    expect(configuredEngines()).toEqual([
      { id: "default", baseUrl: "http://localhost:8410/engine-rest" },
    ])
  })

  it("treats whitespace-only values as unset when resolving precedence", () => {
    vi.stubEnv("CAMUNDA_ENGINES_FILE", "   ")
    vi.stubEnv("CAMUNDA_ENGINES_JSON", JSON.stringify(JSON_ENGINES))

    expect(configuredEngines()).toEqual(JSON_ENGINES)
  })
})

describe("setup.ts MCP_ACTIVE_MODULES module:toolset syntax", () => {
  beforeEach(() => {
    vi.stubEnv("CAMUNDA_ENGINES_FILE", undefined)
    vi.stubEnv("CAMUNDA_ENGINES_JSON", undefined)
    vi.stubEnv("CAMUNDA_BASE_URL", undefined)
    vi.stubEnv("CAMUNDA_COCKPIT_URL", undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function activeApps() {
    return getAppConfig().activeApps
  }

  it("threads the toolset suffix into the camunda7 module config", () => {
    vi.stubEnv("MCP_ACTIVE_MODULES", "camunda7:read-only,analytics")

    const camunda7 = activeApps().find((e) => e.app === "camunda7")
    expect(camunda7?.config).toMatchObject({ toolset: "read-only" })
    const analytics = activeApps().find((e) => e.app === "analytics")
    expect(analytics?.config).not.toHaveProperty("toolset")
  })

  it("activates all modules without a toolset when MCP_ACTIVE_MODULES is unset", () => {
    vi.stubEnv("MCP_ACTIVE_MODULES", undefined)

    const apps = activeApps()
    expect(apps.map((e) => e.app).sort()).toEqual(["analytics", "camunda7"])
    for (const entry of apps) {
      expect(entry.config).not.toHaveProperty("toolset")
    }
  })

  it("warns and drops the toolset for modules without toolset support (fail-open)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.stubEnv("MCP_ACTIVE_MODULES", "analytics:read-only")

    const analytics = activeApps().find((e) => e.app === "analytics")
    expect(analytics).toBeDefined()
    expect(analytics?.config).not.toHaveProperty("toolset")
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Module "analytics" has no toolsets'))
    warn.mockRestore()
  })

  it("still skips unknown modules, with or without a toolset suffix", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.stubEnv("MCP_ACTIVE_MODULES", "nope:read-only,camunda7:admin")

    const apps = activeApps()
    expect(apps.map((e) => e.app)).toEqual(["camunda7"])
    expect(apps[0].config).toMatchObject({ toolset: "admin" })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown module "nope"'))
    warn.mockRestore()
  })
})

describe("setup.ts engine credential enforcement (fail fast, no silent anonymous requests)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.stubEnv("MCP_ACTIVE_MODULES", undefined)
    vi.stubEnv("CAMUNDA_ENGINES_FILE", undefined)
    vi.stubEnv("CAMUNDA_ENGINES_JSON", undefined)
    vi.stubEnv("CAMUNDA_BASE_URL", undefined)
    vi.stubEnv("CAMUNDA_AUTH_TYPE", undefined)
    vi.stubEnv("CAMUNDA_USERNAME", undefined)
    vi.stubEnv("CAMUNDA_PASSWORD", undefined)
    vi.stubEnv("CAMUNDA_TOKEN", undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("fails the boot when basic auth lacks a password", () => {
    vi.stubEnv("CAMUNDA_AUTH_TYPE", "basic")
    vi.stubEnv("CAMUNDA_USERNAME", "demo")

    expect(() => getPlugins()).toThrow(/CAMUNDA_USERNAME and CAMUNDA_PASSWORD/)
  })

  it("fails the boot when bearer auth lacks a token", () => {
    vi.stubEnv("CAMUNDA_AUTH_TYPE", "bearer")

    expect(() => getPlugins()).toThrow(/CAMUNDA_TOKEN/)
  })

  it("boots with complete basic credentials", () => {
    vi.stubEnv("CAMUNDA_AUTH_TYPE", "basic")
    vi.stubEnv("CAMUNDA_USERNAME", "demo")
    vi.stubEnv("CAMUNDA_PASSWORD", "demo")

    expect(getPlugins().length).toBeGreaterThan(0)
  })

  it("does not require global credentials when every engine carries per-engine auth", () => {
    vi.stubEnv("CAMUNDA_AUTH_TYPE", "basic")
    vi.stubEnv(
      "CAMUNDA_ENGINES_JSON",
      JSON.stringify([
        {
          id: "a",
          baseUrl: "http://a.example/engine-rest",
          auth: { type: "bearer", token: "tok-a" },
        },
      ]),
    )

    expect(getPlugins().length).toBeGreaterThan(0)
  })

  it("accepts per-engine auth entries in CAMUNDA_ENGINES_JSON", () => {
    vi.stubEnv(
      "CAMUNDA_ENGINES_JSON",
      JSON.stringify([
        { id: "a", baseUrl: "http://a.example/engine-rest" },
        {
          id: "b",
          baseUrl: "http://b.example/engine-rest",
          auth: { type: "bearer", token: "tok-b" },
        },
      ]),
    )

    expect(getPlugins().length).toBeGreaterThan(0)
  })

  it("fails the boot on an incomplete per-engine auth entry", () => {
    vi.stubEnv(
      "CAMUNDA_ENGINES_JSON",
      JSON.stringify([
        { id: "a", baseUrl: "http://a.example/engine-rest", auth: { type: "basic" } },
      ]),
    )

    expect(() => getPlugins()).toThrow(/requires username and password/)
  })
})

describe("setup.ts PROMETHEUS_URL boot hint", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("warns when PROMETHEUS_URL is unset (default does not match the compose stack)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    expect(warnPrometheusDefault({})).toBe(true)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("PROMETHEUS_URL"))
  })

  it("stays silent when PROMETHEUS_URL is set or the analytics module is inactive", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    expect(warnPrometheusDefault({ PROMETHEUS_URL: "http://localhost:8460" })).toBe(false)
    expect(warnPrometheusDefault({ MCP_ACTIVE_MODULES: "camunda7" })).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  it("lets an empty PROMETHEUS_URL fall through to the schema default", () => {
    vi.stubEnv("MCP_ACTIVE_MODULES", undefined)
    vi.stubEnv("PROMETHEUS_URL", "")

    const analytics = getAppConfig().activeApps.find((e) => e.app === "analytics")
    expect((analytics?.config as { url?: string }).url).toBeUndefined()
  })
})

describe("warnUnknownEnvVars", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("flags unknown CAMUNDA_*/MCP_* variables (typos)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const unknown = warnUnknownEnvVars({
      CAMUNDA_ENGINE_JSON: "[]",
      MCP_DASHBOARDS_DIR: "./x",
      CAMUNDA_BASE_URL: "http://ok.example",
    })

    expect(unknown.sort()).toEqual(["CAMUNDA_ENGINE_JSON", "MCP_DASHBOARDS_DIR"])
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it("ignores known variables, foreign prefixes, and unrelated names", () => {
    const unknown = warnUnknownEnvVars({
      MCP_OAUTH: "{}",
      MCP_USE_ANONYMIZED_TELEMETRY: "false",
      MCP_INSPECTOR_FRAME_ANCESTORS: "*",
      MCP_DEBUG_LEVEL: "debug",
      PATH: "/usr/bin",
      PROMETHEUS_URL: "http://localhost:8460",
    })

    expect(unknown).toEqual([])
  })

  it("accepts extra secret names (e.g. from MCP_OAUTH) via the extra allowlist", () => {
    expect(
      warnUnknownEnvVars({ MCP_IDP_CLIENT_SECRET: "secret" }, ["MCP_IDP_CLIENT_SECRET"]),
    ).toEqual([])
  })
})
