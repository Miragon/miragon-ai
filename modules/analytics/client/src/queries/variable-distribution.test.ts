import { describe, expect, it } from "vitest"
import type { ClickHouseClient } from "../clickhouse.js"
import { variableDistribution } from "./variable-distribution.js"

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

describe("variableDistribution", () => {
  it("reports zeroed result when no instances observed without issuing a distribution query", async () => {
    const { client, sql } = recordingClient([
      [{ detected_type: "", total_instances: 0, null_instances: 0 }],
    ])
    const result = await variableDistribution(client, {
      variableName: "amount",
      period: "7d",
      minBucketSize: 10,
      numericBuckets: 10,
      topK: 20,
    })
    expect(result.observationCount).toBe(0)
    expect(result.buckets).toEqual([])
    expect(result.kind).toBe("unknown")
    expect(sql).toHaveLength(1)
  })

  it("classifies numeric types and enforces minBucketSize suppression on numeric buckets", async () => {
    const { client } = recordingClient([
      [{ detected_type: "Long", total_instances: 100, null_instances: 2 }],
      [
        { lower_bound: 0, upper_bound: 10, count: 50 },
        { lower_bound: 10, upper_bound: 20, count: 48 },
        { lower_bound: 20, upper_bound: 30, count: 2 },
      ],
    ])
    const result = await variableDistribution(client, {
      variableName: "amount",
      period: "7d",
      minBucketSize: 10,
      numericBuckets: 3,
      topK: 20,
    })
    expect(result.kind).toBe("numeric")
    expect(result.buckets).toHaveLength(2)
    expect(result.suppressedBuckets).toBe(1)
    expect(result.nullCount).toBe(2)
  })

  it("produces top-K string buckets with distinct-value suppression count", async () => {
    const { client, sql } = recordingClient([
      [{ detected_type: "string", total_instances: 50, null_instances: 0 }],
      [
        { value: "DE", count: 30 },
        { value: "AT", count: 15 },
      ],
      [{ distinct_values: 12 }],
    ])
    const result = await variableDistribution(client, {
      variableName: "country",
      period: "30d",
      minBucketSize: 10,
      numericBuckets: 10,
      topK: 5,
    })
    expect(result.kind).toBe("string")
    expect(result.buckets.map((b) => b.label)).toEqual(["DE", "AT"])
    expect(result.suppressedBuckets).toBe(10)
    expect(sql[1]).toContain("LIMIT 5")
  })

  it("escapes variable name and process definition key to prevent SQL injection", async () => {
    const { client, sql } = recordingClient([
      [{ detected_type: "", total_instances: 0, null_instances: 0 }],
    ])
    await variableDistribution(client, {
      variableName: "a'; DROP TABLE x; --",
      processDefinitionKey: "b' OR '1'='1",
      period: "7d",
      minBucketSize: 10,
      numericBuckets: 10,
      topK: 20,
    })
    expect(sql[0]).toContain("'a\\'; DROP TABLE x; --'")
    expect(sql[0]).toContain("'b\\' OR \\'1\\'=\\'1'")
    expect(sql[0]).not.toMatch(/DROP TABLE x; --\s*$/)
  })

  it("clamps minBucketSize, numericBuckets, and topK to safe minimums", async () => {
    const { client, sql } = recordingClient([
      [{ detected_type: "long", total_instances: 100, null_instances: 0 }],
      [{ lower_bound: 0, upper_bound: 1, count: 100 }],
    ])
    const result = await variableDistribution(client, {
      variableName: "x",
      period: "7d",
      minBucketSize: 0,
      numericBuckets: 1,
      topK: 0,
    })
    expect(result.minBucketSize).toBe(1)
    expect(sql[1]).toContain("histogram(2)")
  })
})
