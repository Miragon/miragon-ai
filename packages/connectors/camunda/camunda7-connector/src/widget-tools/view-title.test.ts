import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { MCPServer } from "mcp-use"
import { createInMemoryProfileStore } from "@miragon-ai/widget-shell/server"
import { createEngineRegistry } from "../lib/resolve-engine.js"
import { providerForEntry } from "../providers/index.js"
import { CAMUNDA7_SHOW_USER_PROFILE } from "../tool-names.js"
import { registerUserProfileTools } from "../tools/user-profile.js"
import { registerWidgetTools } from "../widget-tools.js"

/**
 * Structural guard for #322 U3 over EVERY camunda7 show tool (each tool with
 * a view binding): the server titles a view only in a language the caller's
 * profile names. "system" follows the host's locale, which the server never
 * sees, so the view carries no title and the widget's own heading names it;
 * a hard-coded English title would sit over a German view. A new show tool
 * that skips `localizeViewFor`/`viewLocaleOf` fails here, not in review.
 */

type ToolCallback = (args: Record<string, unknown>, ctx?: unknown) => Promise<unknown>
type ViewResult = { structuredContent?: { title?: unknown; layout?: unknown } }

const engine = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" })
  res.end(req.url?.includes("/count") ? '{"count":0}' : "[]")
})

let baseUrl = ""

beforeAll(async () => {
  await new Promise<void>((resolve) => engine.listen(0, "127.0.0.1", resolve))
  baseUrl = `http://127.0.0.1:${(engine.address() as AddressInfo).port}/engine-rest`
})

afterAll(async () => {
  engine.closeAllConnections()
  await new Promise<void>((resolve) => engine.close(() => resolve()))
})

/** Arguments every show tool accepts (each takes the fields it knows). */
const ARGS = {
  processDefinitionKey: "order",
  processDefinitionId: "order:1:abc",
  processInstanceId: "pi-1",
  incidentId: "inc-1",
  activityId: "task-1",
}

const callerCtx = (id: string) => ({ auth: { user: { id } } })

async function showTools() {
  const tools = new Map<string, ToolCallback>()
  const server = {
    tool: (definition: { name: string; view?: unknown }, callback: ToolCallback) => {
      if (definition.view) tools.set(definition.name, callback)
    },
  } as unknown as MCPServer
  const registry = createEngineRegistry([{ id: "prod-a", baseUrl }], (e) =>
    providerForEntry(e).createClient(e, { type: "none" }, { timeoutMs: 2000 }),
  )
  const profileStore = createInMemoryProfileStore()
  await profileStore.save("de-user", { language: "de" })
  await profileStore.save("en-user", { language: "en" })
  await profileStore.save("system-user", { language: "system" })
  registerWidgetTools(server, registry, { toolset: "read-only", profileStore })
  registerUserProfileTools(server, profileStore, registry, "read-only")
  return tools
}

/** Each show tool's view title for one caller, for the tools that rendered a view. */
async function titlesFor(tools: Map<string, ToolCallback>, ctx: unknown) {
  const titles = new Map<string, unknown>()
  for (const [name, call] of tools) {
    const result = (await call(ARGS, ctx)) as ViewResult
    if (result.structuredContent?.layout) titles.set(name, result.structuredContent.title)
  }
  return titles
}

describe("show tools title their view only in a language the profile names", () => {
  it("no title for an anonymous caller or one whose profile follows the host", async () => {
    const tools = await showTools()
    for (const ctx of [undefined, callerCtx("system-user"), callerCtx("nobody-saved-yet")]) {
      const titles = await titlesFor(tools, ctx)
      // Not vacuous: the fake engine is enough for most views to render, the
      // settings view among them.
      expect(titles.size).toBeGreaterThanOrEqual(9)
      expect(titles.has(CAMUNDA7_SHOW_USER_PROFILE)).toBe(true)
      expect(Object.fromEntries([...titles].filter(([, title]) => title !== undefined))).toEqual({})
    }
  })

  // Some views set no title in any language (their widget heading names
  // them); a named language must not change WHICH views carry one.
  it("a named language titles the same views, each in that language", async () => {
    const tools = await showTools()
    const de = await titlesFor(tools, callerCtx("de-user"))
    const en = await titlesFor(tools, callerCtx("en-user"))
    const titled = (titles: Map<string, unknown>) =>
      [...titles]
        .filter(([, title]) => title !== undefined)
        .map(([name]) => name)
        .sort()
    expect(titled(de)).toEqual(titled(en))
    expect(titled(de).length).toBeGreaterThanOrEqual(8)
    expect(de.get(CAMUNDA7_SHOW_USER_PROFILE)).toBe("Profil & Einstellungen")
    expect(en.get(CAMUNDA7_SHOW_USER_PROFILE)).toBe("Profile & settings")
  })
})
