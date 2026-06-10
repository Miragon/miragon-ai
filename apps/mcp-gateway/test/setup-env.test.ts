import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getAppConfig } from "../src/setup.js"

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
