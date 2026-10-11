// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { CockpitAppData } from "../../view-models.js"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import {
  CAMUNDA7_COCKPIT_OVERVIEW_DATA,
  CAMUNDA7_LIST_ENGINES,
  CAMUNDA7_SELECT_ENGINE,
} from "../../tool-names.js"
import { camunda7Instructions } from "../../instructions.js"
import { CockpitApp } from "./app.js"

const toolkitDefaults = queryClient.getDefaultOptions()

beforeEach(() => {
  queryClient.setDefaultOptions({
    ...toolkitDefaults,
    queries: { ...toolkitDefaults.queries, retry: false },
  })
})

afterEach(() => {
  cleanup()
  queryClient.clear()
  queryClient.setDefaultOptions(toolkitDefaults)
})

const ENGINES = [
  { id: "prod-a", environment: "default" },
  { id: "prod-b", environment: "default" },
]

/**
 * Boots the cockpit with recording engine-list and engine-select fixtures.
 * `bootstrap` is `camunda7_open_cockpit`'s payload; `list` what
 * `camunda7_list_engines` answers — mutable, so a test can reload it.
 */
function renderCockpit(
  bootstrap: CockpitAppData = { engineId: null, engines: ENGINES },
  list: { engines: CockpitAppData["engines"] } = { engines: ENGINES },
) {
  const listCalls: Array<Record<string, unknown>> = []
  const selectCalls: Array<Record<string, unknown>> = []
  const modelContexts: string[] = []
  const listEngines = (args: Record<string, unknown>) => {
    listCalls.push(args)
    return { engines: list.engines, environments: [], defaultEngineId: "prod-b" }
  }
  const selectEngine = (args: Record<string, unknown>) => {
    selectCalls.push(args)
    return { defaultEngineId: args.engineId ?? null }
  }
  const overview = (args: Record<string, unknown>) => ({
    summary: {
      totalDefinitions: 0,
      totalRunningInstances: 0,
      totalFailedJobs: 0,
      totalIncidents: 0,
    },
    definitions: [],
    engineId: args.engine,
  })
  const Cockpit: ComponentType<Record<string, unknown>> = () => <CockpitApp data={bootstrap} />
  render(
    <WidgetFixtureHost
      widget={Cockpit}
      data={{}}
      tools={{
        [CAMUNDA7_LIST_ENGINES]: listEngines,
        [CAMUNDA7_SELECT_ENGINE]: selectEngine,
        [CAMUNDA7_COCKPIT_OVERVIEW_DATA]: overview,
      }}
      onModelContext={(text) => modelContexts.push(text)}
    />,
  )
  return { listCalls, selectCalls, modelContexts }
}

describe("CockpitApp navigation is side-effect free", () => {
  it("entering and switching engines never writes the saved default engine", async () => {
    const { listCalls, selectCalls } = renderCockpit()

    // Landing chooser → operate one engine.
    fireEvent.click(await screen.findByRole("button", { name: /prod-a/ }))
    // Sidebar switcher → another engine.
    const switcher = await screen.findByLabelText("Selected engine")
    fireEvent.change(switcher, { target: { value: "prod-b" } })
    await waitFor(() => expect((switcher as HTMLSelectElement).value).toBe("prod-b"))

    // The transport reached the fixture (the engine list was read) …
    expect(listCalls).toContainEqual({})
    // … but no navigation step persisted anything: making an engine the
    // default is an explicit action on the settings page.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(selectCalls).toEqual([])
  })

  // Navigation no longer moves the saved default (prod-b in this fixture), so
  // the model must learn the VIEWED engine — an engine-less call would answer
  // from the default engine instead. The context carries it as an id, and the
  // module's server instructions tell the model to pass a model context's
  // `engine` on (pinned in instructions.test.ts).
  it("tells the model which engine the operator is viewing — and to pin it", async () => {
    const { modelContexts } = renderCockpit()
    fireEvent.click(await screen.findByRole("button", { name: /prod-a/ }))
    await waitFor(() => expect(modelContexts.at(-1)).toContain('Ids: engine="prod-a"'))
    const instructions = camunda7Instructions({
      engineIds: ["prod-a", "prod-b"],
      canSaveDefault: true,
      toolset: "operations",
    })
    expect(instructions).toContain(
      "widget model contexts (the view the operator is on) carry Ids/Tools lines: while one names a single `engine`, pass it on every camunda7 call",
    )
  })
})

/** The engine the sidebar shows as active — null while no engine is open. */
const activeEngine = () =>
  screen.queryByLabelText<HTMLSelectElement>("Selected engine")?.value ?? null
const onLanding = () => screen.queryByText("Work with one engine") !== null

/**
 * The cockpit OPENS where `camunda7_open_cockpit` resolved — the per-call
 * `engine`, else the saved default, else the only engine (#341 K43) — and the
 * model context says exactly what the user sees: an engine, or the picker
 * (N105). Before, a multi-engine cockpit always showed the picker while the
 * summary claimed the engine.
 */
describe("CockpitApp opens on the bootstrap's engine", () => {
  it("a resolved engine (per-call `engine` or saved default): lands on it, not on the picker", async () => {
    // The list's saved default is prod-b; the bootstrap resolved prod-a
    // (the model passed it) — the bootstrap wins.
    const { modelContexts } = renderCockpit({ engineId: "prod-a", engines: ENGINES })
    await waitFor(() => expect(activeEngine()).toBe("prod-a"))
    expect(onLanding()).toBe(false)
    await waitFor(() => expect(modelContexts.at(-1)).toContain('Ids: engine="prod-a"'))
  })

  it("a single engine: lands on it", async () => {
    const solo = [{ id: "solo", environment: "default" }]
    const { modelContexts } = renderCockpit({ engineId: "solo", engines: solo }, { engines: solo })
    await waitFor(() => expect(modelContexts.at(-1)).toContain('Ids: engine="solo"'))
    expect(onLanding()).toBe(false)
  })

  it("no resolved engine: the picker — and the model hears it is on the picker", async () => {
    const { modelContexts } = renderCockpit()
    expect(onLanding()).toBe(true)
    await waitFor(() => expect(modelContexts.at(-1)).toContain("engine picker"))
    const last = modelContexts.at(-1)!
    // No single engine is in scope: nothing the model could pin.
    expect(last).not.toMatch(/Ids: engine="/)
    expect(last).toContain('engines=["prod-a","prod-b"]')
  })
})

/**
 * The scope follows the engine list (#341 N106): when it reloads without the
 * engine the cockpit is on (curated away in Settings, or a bootstrap that
 * raced the list), the cockpit falls back EXPLICITLY — the only engine left,
 * else the picker with a note — never keeps querying a stale id.
 */
describe("CockpitApp reconciles its engine scope with the engine list", () => {
  const THREE = [...ENGINES, { id: "prod-c", environment: "default" }]

  async function reloadEngines(list: { engines: CockpitAppData["engines"] }, next: typeof THREE) {
    list.engines = next
    await queryClient.invalidateQueries({ queryKey: ["camunda7:engines"] })
  }

  it("the open engine leaves the list, two remain: back to the picker, saying why", async () => {
    const list = { engines: THREE }
    const { modelContexts } = renderCockpit({ engineId: "prod-a", engines: THREE }, list)
    await waitFor(() => expect(activeEngine()).toBe("prod-a"))

    await reloadEngines(list, THREE.slice(1))

    await waitFor(() => expect(onLanding()).toBe(true))
    expect(screen.getByText(/prod-a is no longer in your engine list/)).toBeTruthy()
    await waitFor(() => expect(modelContexts.at(-1)).toContain("engine picker"))
  })

  it("the open engine leaves the list, one remains: opens on it", async () => {
    const list = { engines: ENGINES }
    const { modelContexts } = renderCockpit({ engineId: "prod-a", engines: ENGINES }, list)
    await waitFor(() => expect(modelContexts.at(-1)).toContain('Ids: engine="prod-a"'))

    await reloadEngines(list, [ENGINES[1]])

    await waitFor(() => expect(modelContexts.at(-1)).toContain('Ids: engine="prod-b"'))
    expect(screen.getByText(/prod-a is no longer in your engine list/)).toBeTruthy()
  })

  it("a bootstrap engine the loaded list does not carry falls back the same way", async () => {
    renderCockpit({ engineId: "prod-a", engines: THREE }, { engines: THREE.slice(1) })
    await waitFor(() => expect(onLanding()).toBe(true))
    expect(screen.getByText(/prod-a is no longer in your engine list/)).toBeTruthy()
  })
})
