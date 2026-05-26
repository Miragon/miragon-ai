import {
  engineFilter,
  escapeString,
  type ClickHouseClient,
  type EngineFilterInput,
} from "../clickhouse.js"

export type VariableDistributionKind = "numeric" | "string" | "boolean" | "unknown"

export interface VariableBucket {
  label: string
  count: number
  lowerBound?: number
  upperBound?: number
  value?: string | number | boolean
}

export interface VariableDistributionResult {
  variableName: string
  processDefinitionKey: string | null
  period: string
  kind: VariableDistributionKind
  observationCount: number
  nullCount: number
  minBucketSize: number
  suppressedBuckets: number
  buckets: VariableBucket[]
}

const INTERVALS = { "1d": "1 DAY", "7d": "7 DAY", "30d": "30 DAY", "90d": "90 DAY" } as const

interface TypeRow {
  detected_type: string
  total_instances: number
  null_instances: number
}

/**
 * Bucketized distribution of a process variable across its final value per instance.
 *
 * One observation per process instance = the value at the highest revision. Buckets smaller
 * than `minBucketSize` are suppressed so low-frequency values (often PII-adjacent, e.g. rare
 * customerIds) never leave ClickHouse.
 */
export async function variableDistribution(
  ch: ClickHouseClient,
  params: {
    variableName: string
    processDefinitionKey?: string
    period: keyof typeof INTERVALS
    minBucketSize: number
    numericBuckets: number
    topK: number
    engineId?: EngineFilterInput
  },
): Promise<VariableDistributionResult> {
  const interval = INTERVALS[params.period]
  const name = escapeString(params.variableName)
  const minBucket = Math.max(1, Math.floor(params.minBucketSize))
  const numericBuckets = Math.max(2, Math.floor(params.numericBuckets))
  const topK = Math.max(1, Math.floor(params.topK))
  const keyFilter = params.processDefinitionKey
    ? `AND process_definition_key = ${escapeString(params.processDefinitionKey)}`
    : ""
  const ef = engineFilter(params.engineId)
  const engineClause = ef ? `AND ${ef}` : ""

  // Final value per instance = latest revision. We carry all typed value columns through
  // argMax so we don't care which one holds the real value until we know the type.
  const finalCte = `
WITH final_values AS (
    SELECT
        process_instance_id,
        argMax(variable_type, revision) AS vtype,
        argMax(text_value, revision) AS tv,
        argMax(long_value, revision) AS lv,
        argMax(double_value, revision) AS dv
    FROM camunda_history.camunda_variable_updates
    WHERE variable_name = ${name}
        AND timestamp >= now() - INTERVAL ${interval}
        ${keyFilter}
        ${engineClause}
    GROUP BY process_instance_id
)`

  const typeSql = `${finalCte}
SELECT
    (
        SELECT vtype FROM final_values WHERE vtype IS NOT NULL GROUP BY vtype ORDER BY count() DESC LIMIT 1
    ) AS detected_type,
    count() AS total_instances,
    countIf(tv IS NULL AND lv IS NULL AND dv IS NULL) AS null_instances
FROM final_values`

  const typeRows = await ch.query<TypeRow>(typeSql)
  const detectedRaw = typeRows[0]?.detected_type ?? ""
  const total = Number(typeRows[0]?.total_instances ?? 0)
  const nulls = Number(typeRows[0]?.null_instances ?? 0)
  const kind = classify(detectedRaw)

  const base: VariableDistributionResult = {
    variableName: params.variableName,
    processDefinitionKey: params.processDefinitionKey ?? null,
    period: params.period,
    kind,
    observationCount: total,
    nullCount: nulls,
    minBucketSize: minBucket,
    suppressedBuckets: 0,
    buckets: [],
  }

  if (total === 0) return base

  if (kind === "numeric") {
    return numericDistribution(ch, finalCte, base, numericBuckets, minBucket)
  }
  if (kind === "boolean") {
    return booleanDistribution(ch, finalCte, base, minBucket)
  }
  if (kind === "string") {
    return stringDistribution(ch, finalCte, base, topK, minBucket)
  }
  return base
}

function classify(rawType: string): VariableDistributionKind {
  const t = rawType.toLowerCase()
  if (t === "integer" || t === "long" || t === "double" || t === "short" || t === "float") {
    return "numeric"
  }
  if (t === "string") return "string"
  if (t === "boolean") return "boolean"
  return "unknown"
}

async function numericDistribution(
  ch: ClickHouseClient,
  cte: string,
  base: VariableDistributionResult,
  numericBuckets: number,
  minBucket: number,
): Promise<VariableDistributionResult> {
  const sql = `${cte},
typed AS (
    SELECT toFloat64(ifNull(dv, toFloat64OrNull(toString(lv)))) AS x
    FROM final_values
    WHERE dv IS NOT NULL OR lv IS NOT NULL
)
SELECT
    arrayJoin(histogram(${numericBuckets})(x)) AS h,
    h.1 AS lower_bound,
    h.2 AS upper_bound,
    h.3 AS count
FROM typed`

  interface HistRow {
    lower_bound: number
    upper_bound: number
    count: number
  }
  const rows = await ch.query<HistRow>(sql)
  const raw = rows.map((r) => ({
    lowerBound: Number(r.lower_bound),
    upperBound: Number(r.upper_bound),
    count: Math.round(Number(r.count)),
  }))
  const kept = raw.filter((r) => r.count >= minBucket)
  return {
    ...base,
    suppressedBuckets: raw.length - kept.length,
    buckets: kept.map((r) => ({
      label: `${formatNum(r.lowerBound)}–${formatNum(r.upperBound)}`,
      count: r.count,
      lowerBound: r.lowerBound,
      upperBound: r.upperBound,
    })),
  }
}

async function booleanDistribution(
  ch: ClickHouseClient,
  cte: string,
  base: VariableDistributionResult,
  minBucket: number,
): Promise<VariableDistributionResult> {
  const sql = `${cte}
SELECT
    lower(tv) AS value,
    count() AS count
FROM final_values
WHERE tv IS NOT NULL AND tv != ''
GROUP BY value
ORDER BY count DESC`

  interface BoolRow {
    value: string
    count: number
  }
  const rows = await ch.query<BoolRow>(sql)
  const kept: BoolRow[] = []
  let suppressed = 0
  for (const r of rows) {
    if (Number(r.count) >= minBucket) kept.push(r)
    else suppressed++
  }
  return {
    ...base,
    suppressedBuckets: suppressed,
    buckets: kept.map((r) => ({
      label: r.value,
      count: Number(r.count),
      value: r.value === "true",
    })),
  }
}

async function stringDistribution(
  ch: ClickHouseClient,
  cte: string,
  base: VariableDistributionResult,
  topK: number,
  minBucket: number,
): Promise<VariableDistributionResult> {
  // Top-K by frequency, filtered by minBucketSize. We also count how many values fell
  // below the threshold so the caller knows the long-tail existed without seeing it.
  const sql = `${cte}
SELECT tv AS value, count() AS count
FROM final_values
WHERE tv IS NOT NULL AND tv != ''
GROUP BY tv
ORDER BY count DESC
LIMIT ${topK}`

  const totalsSql = `${cte}
SELECT countDistinct(tv) AS distinct_values
FROM final_values
WHERE tv IS NOT NULL AND tv != ''`

  interface StringRow {
    value: string
    count: number
  }
  const [rows, totals] = await Promise.all([
    ch.query<StringRow>(sql),
    ch.query<{ distinct_values: number }>(totalsSql),
  ])
  const kept = rows.filter((r) => Number(r.count) >= minBucket)
  const totalDistinct = Number(totals[0]?.distinct_values ?? 0)
  return {
    ...base,
    // Values below the min-bucket threshold + values past the top-K truncation both count as suppressed.
    suppressedBuckets: Math.max(0, totalDistinct - kept.length),
    buckets: kept.map((r) => ({
      label: r.value,
      count: Number(r.count),
      value: r.value,
    })),
  }
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (Math.abs(n) >= 1000 || (Math.abs(n) < 0.01 && n !== 0)) return n.toExponential(2)
  return n
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.[0-9])0$/, "$1")
}
