import { describe, expect, it } from "vitest"
import type { ClickHouseClient } from "../clickhouse.js"
import { clusterCompare } from "./cluster-compare.js"

function recordingClient(responses: unknown[][]): {
  client: ClickHouseClient
  sql: string[]
} {
  const sql: string[] = []
  let i = 0
  const client: ClickHouseClient = {
    query<T>(s: string): Promise<T[]> {
      sql.push(s)
      const next = responses[i++] ?? []
      return Promise.resolve(next as T[])
    },
  }
  return { client, sql }
}

describe("clusterCompare", () => {
  it("produces before/after KPIs with incident rate and delta", async () => {
    const { client } = recordingClient([
      [
        {
          period: "before",
          instance_count: 100,
          completed_count: 95,
          failed_count: 5,
          failure_rate_pct: 5.0,
          avg_duration_sec: 120,
          p95_duration_sec: 300,
          window_from: "2026-04-01 00:00:00",
          window_to: "2026-04-07 23:59:59",
        },
        {
          period: "after",
          instance_count: 150,
          completed_count: 135,
          failed_count: 15,
          failure_rate_pct: 10.0,
          avg_duration_sec: 180,
          p95_duration_sec: 450,
          window_from: "2026-04-08 00:00:00",
          window_to: "2026-04-14 23:59:59",
        },
      ],
      [
        { period: "before", incident_count: 2 },
        { period: "after", incident_count: 12 },
      ],
    ])

    const result = await clusterCompare(client, {
      processDefinitionKey: "invoice-approval",
      deploymentTimestamp: "2026-04-08T00:00:00Z",
      windowBeforeDays: 7,
      windowAfterDays: 7,
      minBucketSize: 10,
    })

    expect(result.kpis).toHaveLength(2)
    expect(result.kpis[0].instance_count).toBe(100)
    expect(result.kpis[0].incident_rate_pct).toBe(2)
    expect(result.kpis[1].incident_rate_pct).toBe(8)
    expect(result.delta.instance_count_delta_pct).toBe(50)
    expect(result.delta.failure_rate_delta_pp).toBe(5)
    expect(result.delta.p95_duration_delta_pct).toBe(50)
    expect(result.suppressed).toBe(false)
  })

  it("flags suppressed when either window is below minBucketSize", async () => {
    const { client } = recordingClient([
      [
        {
          period: "before",
          instance_count: 8,
          completed_count: 8,
          failed_count: 0,
          failure_rate_pct: 0,
          avg_duration_sec: 100,
          p95_duration_sec: 200,
          window_from: "",
          window_to: "",
        },
        {
          period: "after",
          instance_count: 50,
          completed_count: 48,
          failed_count: 2,
          failure_rate_pct: 4,
          avg_duration_sec: 110,
          p95_duration_sec: 210,
          window_from: "",
          window_to: "",
        },
      ],
      [],
    ])
    const result = await clusterCompare(client, {
      deploymentTimestamp: "2026-04-08T00:00:00Z",
      windowBeforeDays: 7,
      windowAfterDays: 7,
      minBucketSize: 10,
    })
    expect(result.suppressed).toBe(true)
  })

  it("returns null delta when a pre-value is zero (avoid div-by-zero)", async () => {
    const { client } = recordingClient([
      [
        {
          period: "after",
          instance_count: 50,
          completed_count: 50,
          failed_count: 0,
          failure_rate_pct: 0,
          avg_duration_sec: 100,
          p95_duration_sec: 200,
          window_from: "",
          window_to: "",
        },
      ],
      [],
    ])
    const result = await clusterCompare(client, {
      deploymentTimestamp: "2026-04-08T00:00:00Z",
      windowBeforeDays: 7,
      windowAfterDays: 7,
      minBucketSize: 1,
    })
    expect(result.delta.instance_count_delta_pct).toBeNull()
    expect(result.delta.avg_duration_delta_pct).toBeNull()
    expect(result.kpis[0].instance_count).toBe(0)
    expect(result.kpis[1].instance_count).toBe(50)
  })

  it("escapes deployment timestamp, processDefinitionKey, and elementId", async () => {
    const { client, sql } = recordingClient([[], []])
    await clusterCompare(client, {
      processDefinitionKey: "x' OR '1'='1",
      elementId: "y'; DROP--",
      deploymentTimestamp: "2026' OR '1'='1",
      windowBeforeDays: 7,
      windowAfterDays: 7,
      minBucketSize: 10,
    })
    expect(sql[0]).toContain("'2026\\' OR \\'1\\'=\\'1'")
    expect(sql[0]).toContain("'x\\' OR \\'1\\'=\\'1'")
    expect(sql[1]).toContain("'y\\'; DROP--'")
  })

  it("clamps window sizes and minBucketSize to safe minimums", async () => {
    const { client, sql } = recordingClient([[], []])
    const result = await clusterCompare(client, {
      deploymentTimestamp: "2026-04-08",
      windowBeforeDays: 0,
      windowAfterDays: 0,
      minBucketSize: 0,
    })
    expect(result.minBucketSize).toBe(1)
    expect(result.windowDays.before).toBe(1)
    expect(result.windowDays.after).toBe(1)
    expect(sql[0]).toContain("INTERVAL 1 DAY")
  })
})
