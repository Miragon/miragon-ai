// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ComponentType } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { LocaleProvider, queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import type {
  AnalyticsDashboardData,
  EngineLandscapeResult,
  FailureDashboardData,
} from "@miragon-ai/analytics-client"
import { setFormatLocale } from "@miragon-ai/widget-shell/testing"
import { ExecutionSummaryKpi } from "./analytics-dashboard/execution-summary-kpi.js"
import { ExecutionPerformanceKpi } from "./analytics-dashboard/execution-performance-kpi.js"
import { ProcessDefinitionBreakdown } from "./analytics-dashboard/definition-breakdown.js"
import { ActivityBottleneckTable } from "./analytics-dashboard/activity-bottleneck-table.js"
import { FailureSummaryKpi } from "./failure-dashboard/summary-kpi.js"
import { ErrorPatternsTable } from "./failure-dashboard/error-patterns-table.js"
import { FailureRateTable } from "./failure-dashboard/failure-rate-table.js"
import { EngineLandscapeWidget } from "./engine-landscape.js"
import { AnalyticsBpmnHeatmap, type AnalyticsBpmnHeatmapData } from "./bpmn-heatmap.js"

/**
 * The dashboards as a person reads them, in German and English: numbers in
 * the view's locale, the reference frame under the title (U7), and every
 * hand-off named after its function and the chat (U4) with a Lucide icon.
 */

const NOW = "2026-10-10T12:40:00.000Z"
const AS_OF = "2026-10-10T12:32:00.000Z"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(NOW))
})
afterEach(() => {
  cleanup()
  queryClient.clear()
  setFormatLocale(undefined)
  vi.useRealTimers()
})

function renderIn(language: "de" | "en", Widget: ComponentType<{ data: never }>, data: unknown) {
  setFormatLocale({
    language,
    locale: language === "de" ? "de-DE" : "en-GB",
    timeZone: "Europe/Berlin",
  })
  return render(
    <LocaleProvider locale={language}>
      <WidgetFixtureHost
        widget={Widget as unknown as ComponentType<Record<string, unknown>>}
        data={data as Record<string, unknown>}
      />
    </LocaleProvider>,
  )
}

const plain = (s: string | null | undefined) => s?.replace(/\u00a0/g, " ")
const metaLine = () => plain(document.querySelector("[data-view-meta]")?.textContent)
const iconOf = (el: HTMLElement) => el.querySelector("svg")?.getAttribute("class") ?? ""

const DASHBOARD: AnalyticsDashboardData = {
  processDefinitionKey: null,
  period: "7d",
  engines: ["prod-a", "prod-b", "prod-c"],
  reportingEngines: ["prod-a", "prod-c"],
  asOf: AS_OF,
  totalCount: 1629,
  completedCount: 1482,
  incidentsCreated: 55,
  incidentsResolved: 34,
  incidentRatePct: 3.38,
  avgDurationMs: 30_840_000,
  medianDurationMs: 24_600_000,
  p95DurationMs: 73_860_000,
  runningNow: 52,
  openIncidentsNow: null,
  activityBreakdown: [
    {
      processDefinitionKey: "miraveloLeasing",
      activityId: "Activity_DecideOnApplication",
      activityType: "userTask",
      executionCount: 1240,
      avgDurationMs: 187_000,
      p95DurationMs: 420_000,
      totalTimeMs: 231_880_000,
    },
  ],
  definitionBreakdown: [
    {
      processDefinitionKey: "miraveloLeasing",
      totalInstances: 1288,
      completed: 1262,
      runningNow: 1,
      incidentsCreated: 1,
      avgDurationMs: 8_340_000,
    },
  ],
}

describe("the analytics dashboard in German", () => {
  it("frames the figures under the title and hands off to the chat to assess them", () => {
    renderIn("de", ExecutionSummaryKpi, DASHBOARD)
    expect(screen.getByText("Prozessanalyse")).toBeTruthy()
    expect(metaLine()).toBe("Letzte 7 Tage · 3 Engines (1 ohne Metriken) · Stand 14:32")
    expect(screen.getByText("1.629")).toBeTruthy()
    expect(screen.getByText("Neue Incidents")).toBeTruthy()
    // A live gauge nobody reports is unknown, never a plausible 0.
    expect(screen.getByText("—")).toBeTruthy()
    const ask = screen.getByRole("button", { name: /Im Chat bewerten/ })
    expect(iconOf(ask)).toContain("lucide-list-checks")
  })

  it("names the process a scoped dashboard is about first", () => {
    renderIn("de", ExecutionSummaryKpi, {
      ...DASHBOARD,
      processDefinitionKey: "order",
      period: "1d",
    })
    expect(metaLine()).toBe("order · Letzte 24 Stunden · 3 Engines (1 ohne Metriken) · Stand 14:32")
  })

  it("shows an incident rate as incidents per 100 starts, not as a share", () => {
    renderIn("de", ExecutionPerformanceKpi, DASHBOARD)
    expect(screen.getByText("Incidents je 100 Starts")).toBeTruthy()
    expect(screen.getByText("3,4")).toBeTruthy()
    expect(plain(screen.getByText(/^8 h/).textContent)).toBe("8 h 34 Min.")
  })

  it("counts in the plural only from two on", () => {
    renderIn("de", ProcessDefinitionBreakdown, DASHBOARD)
    expect(screen.getByText("1.288 gestartet")).toBeTruthy()
    expect(screen.getByText("1 läuft gerade")).toBeTruthy()
    expect(screen.getByText("1 Incident")).toBeTruthy()
  })

  // CI §3.3, decision f: a number is never coloured; the words say what it counts.
  it("renders the breakdown's counts neutral, never as coloured digits", () => {
    const { container } = renderIn("de", ProcessDefinitionBreakdown, DASHBOARD)
    for (const text of ["1.288 gestartet", "1.262 abgeschlossen", "1 läuft gerade"]) {
      expect(screen.getByText(text).className, text).not.toMatch(
        /text-(success|warning|danger|info)/,
      )
    }
    expect(container.querySelector("[class*='-ink']")).toBeNull()
  })

  it("explains a bottleneck in the chat from a labelled icon button", () => {
    renderIn("de", ActivityBottleneckTable, DASHBOARD)
    expect(screen.getByText("Aktivitäten nach Gesamtzeit")).toBeTruthy()
    expect(screen.getByText("1.240")).toBeTruthy()
    const ask = screen.getByRole("button", { name: "Engpass im Chat erklären" })
    expect(iconOf(ask)).toContain("lucide-hourglass")
  })
})

describe("the analytics dashboard in English", () => {
  it("frames the figures and keeps sentence case", () => {
    renderIn("en", ExecutionSummaryKpi, { ...DASHBOARD, reportingEngines: undefined })
    // Without the reporting engines the line says nothing about them.
    expect(metaLine()).toBe("Last 7 days · 3 engines · As of 14:32")
    expect(screen.getByText("1,629")).toBeTruthy()
    expect(screen.getByText("Process analytics")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Assess in chat/ })).toBeTruthy()
  })
})

const FAILURES: FailureDashboardData = {
  engines: ["prod-a"],
  totalIncidents: 1234,
  uniqueErrorPatterns: 2,
  mostAffectedProcess: "order",
  errorPatterns: [
    { incidentType: "failedJob", processDefinitionKey: "order", incidentCount: 1200 },
    { incidentType: "failedExternalTask", processDefinitionKey: "invoice", incidentCount: 34 },
  ],
  processBreakdown: [
    {
      processDefinitionKey: "order",
      runningNow: 3000,
      deadJobs: 1100,
      openIncidents: 1200,
      incidentRatePct: 40,
    },
    {
      processDefinitionKey: "invoice",
      runningNow: 8,
      deadJobs: 0,
      openIncidents: 34,
      incidentRatePct: 425,
    },
  ],
  asOf: AS_OF,
}

describe("the failure dashboard", () => {
  it("frames a live snapshot without a period and hands off to prioritize (de)", () => {
    renderIn("de", FailureSummaryKpi, FAILURES)
    expect(metaLine()).toBe("1 Engine · Stand 14:32")
    expect(screen.getByText("1.234")).toBeTruthy()
    expect(screen.getByText("Incident-Gruppen")).toBeTruthy()
    const ask = screen.getByRole("button", { name: /Im Chat priorisieren/ })
    expect(iconOf(ask)).toContain("lucide-list-ordered")
  })

  it("finds the cause of an incident group in the chat (en)", () => {
    renderIn("en", ErrorPatternsTable, FAILURES)
    expect(screen.getByText("1,200")).toBeTruthy()
    const asks = screen.getAllByRole("button", { name: "Find cause in chat" })
    expect(asks).toHaveLength(2)
    expect(iconOf(asks[0])).toContain("lucide-scan-search")
  })

  it("names the jobs without retries and a rate over 100 as a number (de)", () => {
    renderIn("de", FailureRateTable, FAILURES)
    expect(screen.getByText("Jobs ohne Versuche")).toBeTruthy()
    expect(screen.getByText("Incidents je 100 laufende Instanzen")).toBeTruthy()
    expect(screen.getByText("425")).toBeTruthy()
    expect(screen.getByText("3.000")).toBeTruthy()
    const asks = screen.getAllByRole("button", { name: "Ursache im Chat klären" })
    expect(asks).toHaveLength(2)
    expect(iconOf(asks[0])).toContain("lucide-scan-search")
  })
})

const LANDSCAPE: EngineLandscapeResult = {
  engines: [
    {
      engineId: "prod-a",
      reporting: true,
      runningInstances: 1500,
      openIncidents: 3,
      failedJobs: 0,
      executableJobs: 12,
      suspendedJobs: 0,
      jobsDueFuture: 4,
      openExternalTasks: 2,
      deployedDefinitionKeys: 2,
      exclusiveDefinitionKeys: 1,
    },
    {
      engineId: "prod-b",
      reporting: false,
      runningInstances: 0,
      openIncidents: 0,
      failedJobs: 0,
      executableJobs: 0,
      suspendedJobs: 0,
      jobsDueFuture: 0,
      openExternalTasks: 0,
      deployedDefinitionKeys: 1,
      exclusiveDefinitionKeys: 0,
    },
  ],
  processes: [
    {
      processDefinitionKey: "order",
      engineIds: ["prod-a", "prod-b"],
      shared: true,
      runningByEngine: { "prod-a": 1500 },
      runningTotal: 1500,
      openIncidentsTotal: 3,
      failedJobsTotal: 0,
    },
  ],
  sharedProcessKeys: ["order"],
  totals: {
    engineCount: 2,
    reportingEngineCount: 1,
    processKeyCount: 1,
    sharedProcessKeyCount: 1,
    runningInstances: 1500,
    openIncidents: 3,
    failedJobs: 0,
  },
  asOf: AS_OF,
}

describe("the cross-engine landscape", () => {
  it("frames the snapshot and compares a shared process across engines in the chat (de)", () => {
    renderIn("de", EngineLandscapeWidget, LANDSCAPE)
    expect(metaLine()).toBe("2 Engines (1 ohne Metriken) · Stand 14:32")
    expect(screen.getByText("Was wo läuft. Keine Rangliste der Engines.")).toBeTruthy()
    expect(screen.getAllByText("1.500").length).toBeGreaterThan(0)
    expect(screen.getByText("auf 2 Engines")).toBeTruthy()
    const ask = screen.getByRole("button", {
      name: "„order“ im Chat zwischen seinen Engines vergleichen",
    })
    expect(iconOf(ask)).toContain("lucide-arrow-left-right")
  })
})

const HEATMAP: AnalyticsBpmnHeatmapData = {
  processDefinitionKey: "order",
  period: "14d",
  engines: ["prod-a", "prod-b"],
  bpmnXml: '<?xml version="1.0"?><definitions />',
  frequency: { Task_A: 12 },
  durationSec: { Task_A: 3.5 },
  asOf: AS_OF,
}

describe("the BPMN heatmap", () => {
  it("states period, engines and as-of in place of the period badge (de)", () => {
    renderIn("de", AnalyticsBpmnHeatmap, HEATMAP)
    expect(screen.getByText("BPMN-Heatmap")).toBeTruthy()
    expect(metaLine()).toBe("Letzte 14 Tage · 2 Engines · Stand 14:32")
    expect(screen.queryByText(/Zeitraum:/)).toBeNull()
  })

  it("blames the missing camunda7 module only when the server says so (en)", () => {
    renderIn("en", AnalyticsBpmnHeatmap, {
      ...HEATMAP,
      bpmnXml: null,
      bpmnMissing: "no-camunda7",
    })
    expect(
      screen.getByText(
        "The diagram is not available here: without the camunda7 module, analytics cannot load BPMN files. Ask in the chat for the figures per activity instead.",
      ),
    ).toBeTruthy()
    expect(document.querySelector("[data-view-meta]")).toBeNull()
  })

  it("names the engine lookup when camunda7 is there but found no diagram (de)", () => {
    renderIn("de", AnalyticsBpmnHeatmap, {
      ...HEATMAP,
      bpmnXml: null,
      bpmnMissing: "not-loaded",
    })
    expect(
      screen.getByText(
        "Das Diagramm konnte nicht geladen werden: Die erste konfigurierte Engine war nicht erreichbar, oder der Prozess ist dort nicht bereitgestellt. Prüf die Engine oder frag im Chat nach den Kennzahlen je Aktivität.",
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/camunda7-Modul/)).toBeNull()
  })

  it.each([undefined, "constructor"])(
    "names no cause it does not know (bpmnMissing: %s)",
    (bpmnMissing) => {
      renderIn("en", AnalyticsBpmnHeatmap, { ...HEATMAP, bpmnXml: null, bpmnMissing })
      expect(
        screen.getByText(
          "Could not load the diagram. Ask in the chat for the figures per activity instead.",
        ),
      ).toBeTruthy()
    },
  )
})
