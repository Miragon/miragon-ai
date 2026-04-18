import { describe, expect, it } from "vitest"
import type { ClickHouseClient } from "../clickhouse.js"
import { elementBottleneck } from "./element.js"

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

describe("elementBottleneck", () => {
  it("returns ranked activities with combined duration + wait bottleneck score and reports suppressed count", async () => {
    const { client, sql } = recordingClient([
      [
        {
          activity_id: "approve",
          activity_name: "Approve",
          activity_type: "userTask",
          execution_count: 123,
          avg_duration_sec: 4,
          p95_duration_sec: 12,
          total_time_sec: 500,
          avg_wait_sec: 2,
          total_wait_sec: 100,
          incident_count: 1,
          incident_rate_pct: 0.8,
          bottleneck_score_sec: 600,
        },
      ],
      [{ total_activities: 4 }],
    ])

    const result = await elementBottleneck(client, {
      processDefinitionKey: "invoice-approval",
      period: "30d",
      minBucketSize: 10,
      limit: 20,
    })

    expect(result.activities).toHaveLength(1)
    expect(result.activities[0].bottleneck_score_sec).toBe(600)
    expect(result.minBucketSize).toBe(10)
    expect(result.suppressedActivities).toBe(3)

    expect(sql[0]).toContain("HAVING count() >= 10")
    expect(sql[0]).toContain("'invoice-approval'")
    expect(sql[0]).toContain("INTERVAL 30 DAY")
    expect(sql[0]).toContain("bottleneck_score_sec DESC")
  })

  it("uses lagInFrame to compute wait time between consecutive activities", async () => {
    const { client, sql } = recordingClient([[], [{ total_activities: 0 }]])

    await elementBottleneck(client, {
      processDefinitionKey: "x",
      period: "1d",
      minBucketSize: 5,
      limit: 10,
    })

    expect(sql[0]).toContain("lagInFrame(end_time)")
    expect(sql[0]).toContain("PARTITION BY process_instance_id")
  })
})
