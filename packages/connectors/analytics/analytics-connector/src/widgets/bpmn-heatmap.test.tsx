// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ComponentType } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { LocaleProvider, queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { AnalyticsBpmnHeatmap, type AnalyticsBpmnHeatmapData } from "./bpmn-heatmap.js"

// The kit's viewer meets a diagram bpmn-js cannot import: the import-error
// alert is what this suite reads.
const viewer = vi.hoisted(() => ({
  MockViewer: class {
    importXML(): Promise<never> {
      return Promise.reject(new Error("unparsable content <bpmn:foo> detected"))
    }
    get(): unknown {
      return { zoom: () => 1 }
    }
    destroy() {}
  },
}))
vi.mock("bpmn-js/lib/NavigatedViewer", () => ({ default: viewer.MockViewer }))

afterEach(() => {
  cleanup()
  queryClient.clear()
})

const HEATMAP: AnalyticsBpmnHeatmapData = {
  processDefinitionKey: "order",
  period: "14d",
  engines: ["prod-a"],
  bpmnXml: "<broken/>",
  frequency: { Task_A: 12 },
  durationSec: { Task_A: 3.5 },
}

function renderIn(language: "de" | "en") {
  return render(
    <LocaleProvider locale={language}>
      <WidgetFixtureHost
        widget={AnalyticsBpmnHeatmap as unknown as ComponentType<Record<string, unknown>>}
        data={HEATMAP as unknown as Record<string, unknown>}
      />
    </LocaleProvider>,
  )
}

/**
 * The toolkit's AlertTitle clamps to one line, so a load error is two-part:
 * what happened in the title, the parser's cause, and what you can do under
 * it (the kit's `errorHint` label), never the next step riding in the title.
 */
describe("the BPMN heatmap — a diagram bpmn-js cannot import", () => {
  it.each([
    [
      "de" as const,
      "Das Diagramm konnte nicht gezeichnet werden." +
        "unparsable content <bpmn:foo> detected" +
        "Frag im Chat noch mal nach der Heatmap.",
    ],
    [
      "en" as const,
      "Could not draw the diagram." +
        "unparsable content <bpmn:foo> detected" +
        "Ask in the chat to show the heatmap again.",
    ],
  ])("says what happened, the cause and what you can do (%s)", async (language, text) => {
    renderIn(language)
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe(text)
  })
})
