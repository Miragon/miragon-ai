// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { CAMUNDA7_COCKPIT_OVERVIEW_DATA, CAMUNDA7_ENGINE } from "../../tool-names.js"
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

/** Boots the cockpit with a recording `camunda7_engine` fixture. */
function renderCockpit() {
  const engineCalls: Array<Record<string, unknown>> = []
  const modelContexts: string[] = []
  const engineTool = (args: Record<string, unknown>) => {
    engineCalls.push(args)
    return args.action === "list"
      ? { engines: ENGINES, environments: [], defaultEngineId: "prod-b" }
      : { defaultEngineId: args.engineId ?? null }
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
  const Cockpit: ComponentType<Record<string, unknown>> = () => (
    <CockpitApp data={{ engineId: null, engines: ENGINES }} />
  )
  render(
    <WidgetFixtureHost
      widget={Cockpit}
      data={{}}
      tools={{ [CAMUNDA7_ENGINE]: engineTool, [CAMUNDA7_COCKPIT_OVERVIEW_DATA]: overview }}
      onModelContext={(text) => modelContexts.push(text)}
    />,
  )
  return { engineCalls, modelContexts }
}

describe("CockpitApp navigation is side-effect free", () => {
  it("entering and switching engines never writes the saved default engine", async () => {
    const { engineCalls } = renderCockpit()

    // Landing chooser → operate one engine.
    fireEvent.click(await screen.findByRole("button", { name: /prod-a/ }))
    // Sidebar switcher → another engine.
    const switcher = await screen.findByLabelText("Active engine")
    fireEvent.change(switcher, { target: { value: "prod-b" } })
    await waitFor(() => expect((switcher as HTMLSelectElement).value).toBe("prod-b"))

    // The transport reached the fixture (the engine list was read) …
    expect(engineCalls).toContainEqual({ action: "list" })
    // … but no navigation step persisted anything: making an engine the
    // default is an explicit action on the settings page.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(engineCalls.filter((args) => args.action !== "list")).toEqual([])
  })

  // Navigation no longer moves the saved default (prod-b in this fixture), so
  // the model must be told to scope its calls to the VIEWED engine — an
  // engine-less call would answer from the default engine instead.
  it("tells the model to pass the viewed engine on every camunda7_* call", async () => {
    const { modelContexts } = renderCockpit()
    fireEvent.click(await screen.findByRole("button", { name: /prod-a/ }))
    await waitFor(() =>
      expect(modelContexts.at(-1)).toContain('Pass engine: "prod-a" on every camunda7_* call'),
    )
  })
})
