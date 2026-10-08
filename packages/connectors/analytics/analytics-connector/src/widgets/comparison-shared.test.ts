import { describe, expect, it } from "vitest"
import type { CompareKpiDelta } from "@miragon-ai/analytics-client"
import { translator } from "../messages/index.js"
import type { T } from "../messages/use-t.js"
import { buildComparisonMetrics } from "./comparison-shared.js"

const t: T = (key, params) => translator("en", key, params)

type Kpis = Parameters<typeof buildComparisonMetrics>[1]

const kpis = (over: Partial<Kpis> = {}): Kpis => ({
  instance_count: 40,
  failure_rate_pct: 2.5,
  incident_rate_pct: 5,
  avg_duration_sec: 60,
  p95_duration_sec: 187,
  ...over,
})

const delta: CompareKpiDelta = {
  instance_count_delta_pct: 10,
  failure_rate_delta_pp: 1.5,
  incident_rate_delta_pp: -2,
  avg_duration_delta_pct: 5,
  p95_duration_delta_pct: null,
}

const row = (metrics: ReturnType<typeof buildComparisonMetrics>, labelKey: string) =>
  metrics.find((m) => m.label === t(labelKey))

describe("buildComparisonMetrics", () => {
  it("formats measured rates as percentages and keeps the raw deltas", () => {
    const metrics = buildComparisonMetrics(t, kpis(), kpis({ failure_rate_pct: 4 }), delta)

    expect(row(metrics, "aComparison.metricFailureRate")).toEqual({
      label: t("aComparison.metricFailureRate"),
      before: "2.5%",
      after: "4.0%",
      delta: { value: 1.5, unit: "pp", worseIfUp: true },
    })
    expect(row(metrics, "aComparison.metricIncidentRate")).toMatchObject({
      before: "5.0%",
      delta: { value: -2, unit: "pp" },
    })
    expect(row(metrics, "aComparison.metricInstances")).toMatchObject({
      before: "40",
      delta: { value: 10, unit: "pct", worseIfUp: false },
    })
    expect(row(metrics, "aComparison.metricP95Duration")).toMatchObject({
      before: "3m 7s",
      delta: { value: null },
    })
  })

  it("renders unmeasured rates as n/a with no delta, never as 0.0% (#327)", () => {
    const unmeasured = kpis({ failure_rate_pct: null, incident_rate_pct: null })
    const metrics = buildComparisonMetrics(t, unmeasured, unmeasured, {
      ...delta,
      failure_rate_delta_pp: null,
      incident_rate_delta_pp: null,
    })

    for (const labelKey of ["aComparison.metricFailureRate", "aComparison.metricIncidentRate"]) {
      expect(row(metrics, labelKey)).toMatchObject({
        before: "n/a",
        after: "n/a",
        delta: { value: null },
      })
    }
    expect(JSON.stringify(metrics)).not.toContain("0.0%")
  })
})
