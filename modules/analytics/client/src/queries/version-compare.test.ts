import { describe, expect, it } from "vitest"
import type { ClickHouseClient } from "../clickhouse.js"
import { versionCompare } from "./version-compare.js"

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

describe("versionCompare", () => {
  it("produces v1/v2 KPIs with incident rate and delta", async () => {
    const { client } = recordingClient([
      [
        {
          bucket: "versionA",
          instance_count: 100,
          completed_count: 95,
          failed_count: 5,
          failure_rate_pct: 5.0,
          avg_duration_sec: 120,
          p95_duration_sec: 300,
        },
        {
          bucket: "versionB",
          instance_count: 150,
          completed_count: 135,
          failed_count: 15,
          failure_rate_pct: 10.0,
          avg_duration_sec: 180,
          p95_duration_sec: 450,
        },
      ],
      [
        { bucket: "versionA", incident_count: 2 },
        { bucket: "versionB", incident_count: 12 },
      ],
    ])

    const result = await versionCompare(client, {
      processDefinitionKey: "miraveloLeasing",
      versionA: 1,
      versionB: 2,
      windowDays: 30,
      minBucketSize: 10,
    })

    expect(result.kpis).toHaveLength(2)
    expect(result.kpis[0].version).toBe(1)
    expect(result.kpis[0].bucket).toBe("versionA")
    expect(result.kpis[0].instance_count).toBe(100)
    expect(result.kpis[0].incident_rate_pct).toBe(2)
    expect(result.kpis[1].version).toBe(2)
    expect(result.kpis[1].incident_rate_pct).toBe(8)
    expect(result.delta.instance_count_delta_pct).toBe(50)
    expect(result.delta.failure_rate_delta_pp).toBe(5)
    expect(result.delta.p95_duration_delta_pct).toBe(50)
    expect(result.suppressed).toBe(false)
  })

  it("flags suppressed when either version is below minBucketSize", async () => {
    const { client } = recordingClient([
      [
        {
          bucket: "versionA",
          instance_count: 8,
          completed_count: 8,
          failed_count: 0,
          failure_rate_pct: 0,
          avg_duration_sec: 100,
          p95_duration_sec: 200,
        },
        {
          bucket: "versionB",
          instance_count: 50,
          completed_count: 48,
          failed_count: 2,
          failure_rate_pct: 4,
          avg_duration_sec: 110,
          p95_duration_sec: 210,
        },
      ],
      [],
    ])
    const result = await versionCompare(client, {
      processDefinitionKey: "miraveloLeasing",
      versionA: 1,
      versionB: 2,
      windowDays: 30,
      minBucketSize: 10,
    })
    expect(result.suppressed).toBe(true)
  })

  it("returns null delta when versionA has zero instances (avoid div-by-zero)", async () => {
    const { client } = recordingClient([
      [
        {
          bucket: "versionB",
          instance_count: 50,
          completed_count: 50,
          failed_count: 0,
          failure_rate_pct: 0,
          avg_duration_sec: 100,
          p95_duration_sec: 200,
        },
      ],
      [],
    ])
    const result = await versionCompare(client, {
      processDefinitionKey: "miraveloLeasing",
      versionA: 1,
      versionB: 2,
      windowDays: 30,
      minBucketSize: 1,
    })
    expect(result.delta.instance_count_delta_pct).toBeNull()
    expect(result.delta.avg_duration_delta_pct).toBeNull()
    expect(result.kpis[0].instance_count).toBe(0)
    expect(result.kpis[1].instance_count).toBe(50)
  })

  it("escapes processDefinitionKey, versions, and elementId via LIKE prefix", async () => {
    const { client, sql } = recordingClient([[], []])
    await versionCompare(client, {
      processDefinitionKey: "x' OR '1'='1",
      versionA: 1,
      versionB: 2,
      elementId: "y'; DROP--",
      windowDays: 30,
      minBucketSize: 10,
    })
    // The key escapes both the LIKE prefixes and the equality filter
    expect(sql[0]).toContain("'x\\' OR \\'1\\'=\\'1:1:%'")
    expect(sql[0]).toContain("'x\\' OR \\'1\\'=\\'1:2:%'")
    expect(sql[1]).toContain("'y\\'; DROP--'")
  })

  it("clamps window size, versions, and minBucketSize to safe minimums", async () => {
    const { client, sql } = recordingClient([[], []])
    const result = await versionCompare(client, {
      processDefinitionKey: "miraveloLeasing",
      versionA: 0,
      versionB: 0,
      windowDays: 0,
      minBucketSize: 0,
    })
    expect(result.minBucketSize).toBe(1)
    expect(result.windowDays).toBe(1)
    expect(result.versionA).toBe(1)
    expect(result.versionB).toBe(1)
    expect(sql[0]).toContain("INTERVAL 1 DAY")
  })
})
