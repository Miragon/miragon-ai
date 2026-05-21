import { describe, expect, it } from "vitest"
import type { ClickHouseClient } from "../clickhouse.js"
import { pathFrequency } from "./path.js"

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

describe("pathFrequency", () => {
  it("enforces minBucketSize via HAVING on both paths and edges, and reports suppressed counts", async () => {
    const { client, sql } = recordingClient([
      [
        {
          path: ["start", "approve", "end"],
          frequency: 42,
          avg_duration_sec: 10,
          p95_duration_sec: 20,
        },
      ],
      [{ source: "start", target: "approve", flow: 42 }],
      [{ total_paths: 5 }],
      [{ total_edges: 3 }],
    ])

    const result = await pathFrequency(client, {
      processDefinitionKey: "invoice-approval",
      period: "7d",
      minBucketSize: 10,
      limit: 20,
    })

    expect(result.paths).toHaveLength(1)
    expect(result.edges).toHaveLength(1)
    expect(result.minBucketSize).toBe(10)
    expect(result.suppressedPaths).toBe(4)
    expect(result.suppressedEdges).toBe(2)

    expect(sql[0]).toContain("HAVING count() >= 10")
    expect(sql[1]).toContain("HAVING count() >= 10")
    expect(sql[0]).toContain("'invoice-approval'")
    expect(sql[0]).toContain("INTERVAL 7 DAY")
  })

  it("clamps minBucketSize to at least 1 and floors fractional inputs", async () => {
    const { client, sql } = recordingClient([[], [], [{ total_paths: 0 }], [{ total_edges: 0 }]])

    const result = await pathFrequency(client, {
      processDefinitionKey: "x",
      period: "1d",
      minBucketSize: 0.9,
      limit: 5,
    })

    expect(result.minBucketSize).toBe(1)
    expect(sql[0]).toContain("HAVING count() >= 1")
  })

  it("escapes the process definition key to block SQL injection", async () => {
    const { client, sql } = recordingClient([[], [], [{ total_paths: 0 }], [{ total_edges: 0 }]])

    await pathFrequency(client, {
      processDefinitionKey: "o'brien",
      period: "7d",
      minBucketSize: 10,
      limit: 20,
    })

    expect(sql[0]).toContain("'o\\'brien'")
    expect(sql[0]).not.toContain("'o'brien'")
  })

  it("scopes to a single version when version is provided", async () => {
    const { client, sql } = recordingClient([[], [], [{ total_paths: 0 }], [{ total_edges: 0 }]])

    const result = await pathFrequency(client, {
      processDefinitionKey: "miraveloLeasing",
      period: "30d",
      minBucketSize: 10,
      limit: 20,
      version: 2,
    })

    expect(result.version).toBe(2)
    expect(sql[0]).toContain("process_definition_id LIKE 'miraveloLeasing:2:%'")
  })

  it("does not inject a version filter when version is omitted", async () => {
    const { client, sql } = recordingClient([[], [], [{ total_paths: 0 }], [{ total_edges: 0 }]])

    const result = await pathFrequency(client, {
      processDefinitionKey: "miraveloLeasing",
      period: "30d",
      minBucketSize: 10,
      limit: 20,
    })

    expect(result.version).toBeNull()
    expect(sql[0]).not.toContain("process_definition_id LIKE")
  })
})
