import { afterEach, describe, expect, it, vi } from "vitest"
import { composeModules, type ComposableModule } from "./composition.js"

interface TestShared {
  tag: string
}

const moduleOf = (
  name: string,
  overrides: Partial<ComposableModule<TestShared>> = {},
): ComposableModule<TestShared> => ({
  name,
  configFromEnv: (env) => ({ url: env[`${name.toUpperCase()}_URL`] ?? "default" }),
  knownEnvVars: [`${name.toUpperCase()}_URL`],
  supportsToolsets: true,
  createPlugin: (config, shared) =>
    ({ definition: { name }, config, shared }) as unknown as ReturnType<
      ComposableModule<TestShared>["createPlugin"]
    >,
  ...overrides,
})

const compose = (modules: ComposableModule<TestShared>[] = [moduleOf("alpha"), moduleOf("beta")]) =>
  composeModules<TestShared>({
    label: "test-root",
    modules,
    appEnvVars: ["MCP_ACTIVE_MODULES", "MCP_PROFILE_DIR"],
  })

afterEach(() => {
  vi.restoreAllMocks()
})

describe("activeModules / appEntries", () => {
  it("activates every module when MCP_ACTIVE_MODULES is unset or 'all'", () => {
    expect(compose().activeModules({})).toEqual([{ name: "alpha" }, { name: "beta" }])
    expect(compose().activeModules({ MCP_ACTIVE_MODULES: "all" })).toEqual([
      { name: "alpha" },
      { name: "beta" },
    ])
  })

  it("parses the comma list with optional module:toolset suffixes", () => {
    expect(compose().activeModules({ MCP_ACTIVE_MODULES: "beta:read-only, alpha" })).toEqual([
      { name: "beta", toolset: "read-only" },
      { name: "alpha" },
    ])
  })

  it("skips unknown modules with a warning (fail open)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(compose().activeModules({ MCP_ACTIVE_MODULES: "nope:read-only,alpha" })).toEqual([
      { name: "alpha" },
    ])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown module "nope"'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[test-root]"))
  })

  it("threads the toolset into the module config; config comes from configFromEnv(env)", () => {
    const entries = compose().appEntries({
      MCP_ACTIVE_MODULES: "alpha:admin,beta",
      ALPHA_URL: "http://a",
    })
    expect(entries).toEqual([
      { app: "alpha", config: { url: "http://a", toolset: "admin" } },
      { app: "beta", config: { url: "default" } },
    ])
  })

  it("strips the toolset suffix (warning) for modules without toolset support", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const modules = [moduleOf("alpha", { supportsToolsets: false })]
    const entries = compose(modules).appEntries({ MCP_ACTIVE_MODULES: "alpha:read-only" })
    expect(entries[0].config).not.toHaveProperty("toolset")
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("has no toolsets"))
  })

  it("appConfig wraps the entries in the mcp-use shape", () => {
    expect(compose().appConfig({ MCP_ACTIVE_MODULES: "alpha" })).toEqual({
      activeApps: [{ app: "alpha", config: { url: "default" } }],
      pipelines: {},
    })
  })
})

describe("pluginsFor", () => {
  it("instantiates each entry's plugin with the shared resources", () => {
    const composition = compose()
    const entries = composition.appEntries({ MCP_ACTIVE_MODULES: "beta" })
    const plugins = composition.pluginsFor(entries, { tag: "shared-1" })
    expect(plugins).toHaveLength(1)
    expect(plugins[0]).toMatchObject({ shared: { tag: "shared-1" } })
  })
})

describe("warnUnknownEnvVars", () => {
  it("watches every prefix derived from known vars, not just a hardcoded family", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const unknown = compose().warnUnknownEnvVars({
      ALPHA_URLX: "typo", // derived prefix ALPHA_
      MCP_PROFILE_DIRX: "typo", // derived prefix MCP_
      PATH: "/usr/bin", // unwatched prefix
      BETA_URL: "http://ok", // known
    })
    expect(unknown.sort()).toEqual(["ALPHA_URLX", "MCP_PROFILE_DIRX"])
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it("exempts foreign prefixes and honors the extra allowlist", () => {
    expect(
      compose().warnUnknownEnvVars({ MCP_USE_ANONYMIZED_TELEMETRY: "false", MCP_SECRET: "x" }, [
        "MCP_SECRET",
      ]),
    ).toEqual([])
  })

  it("exempts `<KNOWN_VAR>_*` extensions (docker-secrets style), but not near-misses", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const unknown = compose().warnUnknownEnvVars({
      BETA_URL_FILE: "/run/secrets/beta", // extends the known BETA_URL — another process's var
      BETA_URLX: "typo", // near-miss, not an extension — still warns
    })
    expect(unknown).toEqual(["BETA_URLX"])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it("appends the optional hint to the warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    composeModules<TestShared>({
      label: "test-root",
      modules: [moduleOf("alpha")],
      envVarHint: "see docs/operations.md",
    }).warnUnknownEnvVars({ ALPHA_TYPO: "x" })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("(see docs/operations.md)"))
  })
})

describe("emitBootWarnings", () => {
  it("collects and logs hints from ACTIVE modules only", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const modules = [
      moduleOf("alpha", { bootWarnings: () => ["alpha hint"] }),
      moduleOf("beta", { bootWarnings: () => ["beta hint"] }),
    ]
    const warnings = compose(modules).emitBootWarnings({ MCP_ACTIVE_MODULES: "beta" })
    expect(warnings).toEqual(["beta hint"])
    expect(warn).toHaveBeenCalledWith("[test-root] beta hint")
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("alpha hint"))
  })
})
