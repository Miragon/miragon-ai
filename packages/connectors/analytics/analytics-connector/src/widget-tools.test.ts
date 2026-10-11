import { describe, expect, it } from "vitest"
import type { MCPServer } from "mcp-use"
import type { PrometheusClient } from "@miragon-ai/analytics-client"
import { registerWidgetTools } from "./widget-tools.js"
import { createEngineScope } from "./engine-ids.js"
import type { ProfileSource } from "./server-locale.js"

type Cell = { widget: string; props?: Record<string, unknown> }
type ShowResult = { structuredContent: { layout: Array<{ row: Cell[] }> } }
type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<ShowResult>

/** Registers the widget tools on a stand-in server and returns their handlers. */
function handlers(ch: PrometheusClient): Map<string, Handler> {
  const byName = new Map<string, Handler>()
  const server = {
    tool: (definition: { name: string }, handler: Handler) => {
      byName.set(definition.name, handler)
    },
  } as unknown as MCPServer
  registerWidgetTools(server, ch, { engineScope: createEngineScope(["prod-a", "prod-b"]) })
  return byName
}

/** PrometheusClient that records every instant PromQL string and returns no samples. */
function recordingClient(): { client: PrometheusClient; queries: string[] } {
  const queries: string[] = []
  return {
    client: {
      instant: (query: string) => {
        queries.push(query)
        return Promise.resolve([])
      },
    },
    queries,
  }
}

const cells = (result: ShowResult) => result.structuredContent.layout.flatMap((r) => r.row)

/**
 * The engine-health hand-off renders `analytics_show_failure_dashboard` for
 * ONE engine: the cells must know that scope, or their hand-offs and model
 * contexts send the model to every engine (or the saved default) instead.
 */
describe("analytics_show_failure_dashboard engine scope", () => {
  it("queries the engine and hands it to every cell", async () => {
    const { client, queries } = recordingClient()
    const show = handlers(client).get("analytics_show_failure_dashboard")!
    const result = await show({ engine: "prod-b" }, {})

    expect(queries.length).toBeGreaterThan(0)
    for (const query of queries) expect(query).toContain('engine_id="prod-b"')
    // The cells' self-fetches keep their scope through these props; their
    // hand-offs and model contexts name the data's `engines` echo
    // (model-descriptions.test.ts pins the `engine` id they then carry).
    expect(cells(result)).toEqual([
      { widget: "analytics:failure-summary-kpi", props: { engine: "prod-b" } },
      { widget: "analytics:error-patterns-table", props: { engine: "prod-b" } },
      { widget: "analytics:failure-rate-table", props: { engine: "prod-b" } },
    ])
  })

  // The aggregate is the CONFIGURED fleet (#336), never the whole Prometheus:
  // the query names every configured engine, and the data echoes them.
  it("reads the configured fleet for the aggregate and leaves the cells unscoped", async () => {
    const { client, queries } = recordingClient()
    const result = await handlers(client).get("analytics_show_failure_dashboard")!({}, {})

    expect(queries.length).toBeGreaterThan(0)
    for (const query of queries) expect(query).toContain('engine_id=~"prod-a|prod-b"')
    expect(cells(result).every((cell) => cell.props === undefined)).toBe(true)
  })
})

describe("view titles (U3) and the heatmap's as-of stamp (U7)", () => {
  const CTX = { auth: { user: { id: "user-1" } } }
  function localizedHandlers(language: string): Map<string, Handler> {
    const byName = new Map<string, Handler>()
    const server = {
      tool: (definition: { name: string }, handler: Handler) => {
        byName.set(definition.name, handler)
      },
    } as unknown as MCPServer
    const profileStore: ProfileSource = { get: () => Promise.resolve({ language }) }
    registerWidgetTools(server, recordingClient().client, {
      engineScope: createEngineScope(["prod-a"]),
      profileStore,
    })
    return byName
  }
  const SHOWS: Array<[string, Record<string, unknown>]> = [
    ["analytics_show_dashboard", {}],
    ["analytics_show_failure_dashboard", {}],
    ["analytics_show_bpmn_heatmap", { processDefinitionKey: "order" }],
  ]
  const titles = async (language: string) => {
    const tools = localizedHandlers(language)
    const results = await Promise.all(SHOWS.map(([name, args]) => tools.get(name)!(args, CTX)))
    return results.map((r) => (r.structuredContent as unknown as { title?: string }).title)
  }

  it("titles each view in the caller's language, like the widget heading", async () => {
    expect(await titles("de")).toEqual(["Prozessanalyse", "Fehleranalyse", "BPMN-Heatmap"])
    expect(await titles("en")).toEqual(["Process analytics", "Failure analysis", "BPMN heatmap"])
  })

  it("stamps the heatmap with the time its values were read, in the view and the feed", async () => {
    const tools = localizedHandlers("en")
    const args = { processDefinitionKey: "order" }
    const show = (await tools.get("analytics_show_bpmn_heatmap")!(args, CTX)) as unknown as {
      structuredContent: { context: { stepData: { result: { data: { asOf?: string } } } } }
    }
    const feed = (await tools.get("analytics_bpmn_heatmap_data")!(args, CTX)) as unknown as {
      structuredContent: { asOf?: string }
    }
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    expect(show.structuredContent.context.stepData.result.data.asOf).toMatch(iso)
    expect(feed.structuredContent.asOf).toMatch(iso)
  })
})
