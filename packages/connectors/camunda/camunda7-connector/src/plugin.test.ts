import { afterEach, describe, expect, it, vi } from "vitest"
import type { MCPServer } from "mcp-use"
import type { Client } from "@miragon-ai/camunda7-client"
import {
  createInMemoryProfileStore,
  runWithMcpRequestInfo,
  type ProfileStore,
} from "@miragon-ai/widget-shell/server"
import { createPlugin, type Camunda7PluginConfig } from "./plugin.js"
import {
  EngineNotSelectedError,
  resolveEngine,
  resolveStepEngine,
  type Camunda7StepAppConfig,
} from "./lib/resolve-engine.js"
import { CAMUNDA7_ADMIN_ONLY_TOOLS } from "./lib/toolsets.js"
import {
  CAMUNDA7_ENGINE,
  CAMUNDA7_SAVE_USER_PROFILE,
  CAMUNDA7_WIDGET_ACTIONS_DATA,
} from "./tool-names.js"

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Boots the plugin's BOTH registration paths (registrar tools + widget tools)
 * against a mock server — the wiring under test: one resolved toolset reaches
 * every gate, and the deployment flag reaches the registrar.
 */
async function bootSurface(config: Partial<Camunda7PluginConfig>) {
  const tool = vi.fn()
  const server = { tool, use: vi.fn(), prompt: vi.fn() } as unknown as MCPServer
  const plugin = createPlugin({
    engines: [{ id: "a", baseUrl: "http://a.example/engine-rest" }],
    ...config,
  })
  plugin.registerTools?.(server)
  plugin.registerWidgetTools?.(server)
  const calls = tool.mock.calls as Array<
    [{ name: string; annotations?: Record<string, unknown> }, (p: unknown) => Promise<unknown>]
  >
  const byName = new Map(
    calls.map(([definition, handler]) => [definition.name, { definition, handler }]),
  )
  const feed = (await byName.get(CAMUNDA7_WIDGET_ACTIONS_DATA)!.handler({})) as {
    structuredContent: { allowedActions: string[] }
  }
  return {
    names: [...byName.keys()],
    byName,
    allowedActions: feed.structuredContent.allowedActions,
  }
}

describe("createPlugin toolset wiring (fail-closed)", () => {
  it("without a toolset boots the read-only floor on every path — never everything", async () => {
    const { names, byName, allowedActions } = await bootSurface({})
    for (const admin of CAMUNDA7_ADMIN_ONLY_TOOLS) expect(names).not.toContain(admin)
    expect(names).not.toContain("camunda7_start_process_instance")
    expect(names).not.toContain(CAMUNDA7_SAVE_USER_PROFILE)
    expect(allowedActions).toEqual([])
    // The engine tool registers its read-only variant.
    expect(byName.get(CAMUNDA7_ENGINE)?.definition.annotations).toMatchObject({
      readOnlyHint: true,
    })
  })

  it("resolves an unknown toolset ONCE (one warning) and degrades every path to read-only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { names, allowedActions } = await bootSurface({ toolset: "superuser" })
    expect(warn).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown toolset "superuser"'))
    expect(names).not.toContain("camunda7_start_process_instance")
    expect(names).not.toContain(CAMUNDA7_SAVE_USER_PROFILE)
    expect(allowedActions).toEqual([])
  })

  it("operations: engine writes + profile save, no admin-only tool", async () => {
    const { names, allowedActions } = await bootSurface({
      toolset: "operations",
      allowDeployments: true,
    })
    expect(names).toContain("camunda7_start_process_instance")
    expect(names).toContain(CAMUNDA7_SAVE_USER_PROFILE)
    for (const admin of CAMUNDA7_ADMIN_ONLY_TOOLS) expect(names).not.toContain(admin)
    expect(allowedActions).toContain("camunda7_resolve_incident")
  })

  it("threads allowDeployments to the registrar: create_deployment needs it on top of admin", async () => {
    expect((await bootSurface({ toolset: "admin" })).names).not.toContain(
      "camunda7_create_deployment",
    )
    expect((await bootSurface({ toolset: "admin", allowDeployments: true })).names).toContain(
      "camunda7_create_deployment",
    )
  })
})

describe("createPlugin default-engine routing — the saved default is advisory", () => {
  /** A preferences database that is down: the driver error names its host:port. */
  const downStore = () => {
    const fail = () =>
      Promise.reject(
        Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:5432"), { code: "ECONNREFUSED" }),
      )
    return { get: vi.fn(fail), save: fail, delete: fail }
  }
  /** A tool call's ctx for a signed-in caller (mcp-use's flattened `ctx.auth`). */
  const callAs = (id: string) => ({ auth: { user: { id } } })
  const MULTI = [
    { id: "a", baseUrl: "http://a.example/engine-rest" },
    { id: "b", baseUrl: "http://b.example/engine-rest" },
  ]
  const registryOf = (engines: Camunda7PluginConfig["engines"], profileStore: ProfileStore) =>
    (createPlugin({ engines }, { profileStore }).appConfig as unknown as Camunda7StepAppConfig)
      .registry

  it("one engine: resolves it without consulting the profile store at all", async () => {
    const store = downStore()
    const registry = registryOf([MULTI[0]], store)
    expect((await resolveEngine(undefined, registry)).engineId).toBe("a")
    expect(store.get).not.toHaveBeenCalled()
  })

  it("an explicit engine resolves during an outage", async () => {
    const registry = registryOf(MULTI, downStore())
    expect((await resolveEngine("b", registry)).engineId).toBe("b")
  })

  it("several engines, none named: the outage degrades to 'no saved default' — no host:port", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const registry = registryOf(MULTI, downStore())
    const error = await resolveEngine(undefined, registry, callAs("user-1")).then(
      () => undefined,
      (e: unknown) => e as Error,
    )
    expect(error).toBeInstanceOf(EngineNotSelectedError)
    expect(error?.message).not.toMatch(/10\.1\.2\.3|5432|ECONNREFUSED/)
    // Logged for operators — sanitized to the error class + code.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Error ECONNREFUSED"))
    expect(warn.mock.calls.flat().join(" ")).not.toMatch(/10\.1\.2\.3|5432/)
  })

  it("several engines, store healthy: the CALLER's saved default routes — nobody else's", async () => {
    const store = createInMemoryProfileStore()
    await store.save("user-1", { modules: { camunda7: { defaultEngineId: "b" } } })
    const registry = registryOf(MULTI, store)
    expect((await resolveEngine(undefined, registry, callAs("user-1"))).engineId).toBe("b")
    // Another signed-in caller, or no caller identity at all, has no default.
    await expect(resolveEngine(undefined, registry, callAs("user-2"))).rejects.toBeInstanceOf(
      EngineNotSelectedError,
    )
    await expect(resolveEngine(undefined, registry)).rejects.toBeInstanceOf(EngineNotSelectedError)
  })

  it("a ctx-less pipeline step routes by the ambient OAuth caller", async () => {
    const store = createInMemoryProfileStore()
    await store.save("user-1", { modules: { camunda7: { defaultEngineId: "b" } } })
    const appConfig = createPlugin({ engines: MULTI }, { profileStore: store })
      .appConfig as unknown as Camunda7StepAppConfig
    const step = await runWithMcpRequestInfo({ authUserId: "user-1" }, () =>
      resolveStepEngine(appConfig),
    )
    expect(step.engineId).toBe("b")
  })
})

function authHeader(client: Client): string | null {
  return (client.getConfig().headers as Headers).get("Authorization")
}

describe("createPlugin per-engine auth", () => {
  it("builds each engine's client from its own auth, falling back to the module-wide config", async () => {
    const plugin = createPlugin({
      engines: [
        { id: "a", baseUrl: "http://a.example/engine-rest" },
        {
          id: "b",
          baseUrl: "http://b.example/engine-rest",
          auth: { type: "bearer", token: "tok-b" },
        },
        { id: "c", baseUrl: "http://c.example/engine-rest", auth: { type: "none" } },
      ],
      authType: "basic",
      username: "demo",
      password: "secret",
    })
    const { registry } = plugin.appConfig as unknown as Camunda7StepAppConfig

    expect(authHeader((await resolveEngine("a", registry)).client)).toBe(
      `Basic ${Buffer.from("demo:secret").toString("base64")}`,
    )
    expect(authHeader((await resolveEngine("b", registry)).client)).toBe("Bearer tok-b")
    expect(authHeader((await resolveEngine("c", registry)).client)).toBeNull()
  })

  it("does not mix per-engine auth fields with the module-wide credentials", async () => {
    const plugin = createPlugin({
      engines: [
        // Declares its own auth but no token — must NOT inherit the global
        // basic credentials and must send no Authorization header at all.
        { id: "solo", baseUrl: "http://solo.example/engine-rest", auth: { type: "bearer" } },
      ],
      authType: "basic",
      username: "demo",
      password: "secret",
    })
    const { registry } = plugin.appConfig as unknown as Camunda7StepAppConfig

    expect(authHeader((await resolveEngine("solo", registry)).client)).toBeNull()
  })
})
