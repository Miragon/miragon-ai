import { describe, expect, it } from "vitest"
import type { CompareKpiDelta } from "@miragon-ai/analytics-client"
import { translator } from "../messages/index.js"
import type { T } from "../messages/use-t.js"
import { buildComparisonMetrics, deltaFacts } from "./comparison-shared.js"

const t: T = (key, params) => translator("en", key, params)

type Kpis = Parameters<typeof buildComparisonMetrics>[1]

const kpis = (over: Partial<Kpis> = {}): Kpis => ({
  instance_count: 40,
  incident_rate_pct: 5,
  element_incident_count: null,
  element_incident_rate_pct: null,
  avg_duration_sec: 60,
  p95_duration_sec: 187,
  ...over,
})

const delta: CompareKpiDelta = {
  started_per_day_delta_pct: 10,
  incident_rate_delta_pp: -2,
  element_incident_rate_delta_pp: null,
  avg_duration_delta_pct: 5,
  p95_duration_delta_pct: null,
}

const row = (metrics: ReturnType<typeof buildComparisonMetrics>, labelKey: string) =>
  metrics.find((m) => m.label === t(labelKey))

describe("buildComparisonMetrics", () => {
  it("formats measured rates as percentages and keeps the raw deltas", () => {
    const metrics = buildComparisonMetrics(t, kpis(), kpis({ incident_rate_pct: 3 }), delta)

    expect(row(metrics, "aComparison.metricIncidentRate")).toEqual({
      label: t("aComparison.metricIncidentRate"),
      before: "5.0%",
      after: "3.0%",
      delta: { value: -2, unit: "pp", worseIfUp: true },
    })
    // The count per window, the delta per day — fair across unequal windows.
    expect(row(metrics, "aComparison.metricStarted")).toMatchObject({
      before: "40",
      delta: { value: 10, unit: "pct", worseIfUp: false },
    })
    expect(row(metrics, "aComparison.metricP95Duration")).toMatchObject({
      before: "3m 7s",
      delta: { value: null },
    })
  })

  it("renders unmeasured rates as n/a with no delta, never as 0.0% (#327)", () => {
    const unmeasured = kpis({ incident_rate_pct: null })
    const metrics = buildComparisonMetrics(t, unmeasured, unmeasured, {
      ...delta,
      incident_rate_delta_pp: null,
    })

    expect(row(metrics, "aComparison.metricIncidentRate")).toMatchObject({
      before: "n/a",
      after: "n/a",
      delta: { value: null },
    })
    expect(JSON.stringify(metrics)).not.toContain("0.0%")
  })

  it("renders 'nothing ended' as an unmeasured duration, never 0ms (N78)", () => {
    const noneEnded = kpis({ avg_duration_sec: null, p95_duration_sec: null })
    const metrics = buildComparisonMetrics(t, kpis(), noneEnded, {
      ...delta,
      avg_duration_delta_pct: null,
    })

    for (const labelKey of ["aComparison.metricAvgDuration", "aComparison.metricP95Duration"]) {
      expect(row(metrics, labelKey)).toMatchObject({ after: "n/a", delta: { value: null } })
    }
    expect(JSON.stringify(metrics)).not.toContain("0ms")
  })

  it("shows the element incident rate only when the comparison was scoped to an element", () => {
    expect(
      row(
        buildComparisonMetrics(t, kpis(), kpis(), delta),
        "aComparison.metricElementIncidentRate",
      ),
    ).toBeUndefined()

    const scoped = kpis({ element_incident_count: 2, element_incident_rate_pct: 5 })
    expect(
      row(
        buildComparisonMetrics(
          t,
          scoped,
          kpis({ element_incident_count: 0, element_incident_rate_pct: 0 }),
          {
            ...delta,
            element_incident_rate_delta_pp: -5,
          },
        ),
        "aComparison.metricElementIncidentRate",
      ),
    ).toMatchObject({ before: "5.0%", after: "0.0%", delta: { value: -5, unit: "pp" } })
  })
})

describe("deltaFacts", () => {
  it("names starts per day and leaves a never-measured delta null — never a 0", () => {
    expect(deltaFacts(delta, false)).toEqual({
      startedPerDayDeltaPct: 10,
      incidentRateDeltaPp: -2,
      elementIncidentRateDeltaPp: null,
      avgDurationDeltaPct: 5,
      p95DurationDeltaPct: null,
      suppressed: false,
    })
  })
})
