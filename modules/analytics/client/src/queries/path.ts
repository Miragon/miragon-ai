import { escapeString, type ClickHouseClient } from "../clickhouse.js"

export interface PathFrequencyRow {
  path: string[]
  frequency: number
  avg_duration_sec: number | null
  p95_duration_sec: number | null
}

export interface PathEdgeRow {
  source: string
  target: string
  flow: number
}

export interface PathFrequencyResult {
  paths: PathFrequencyRow[]
  edges: PathEdgeRow[]
  minBucketSize: number
  suppressedPaths: number
  suppressedEdges: number
  version: number | null
}

const INTERVALS = { "1d": "1 DAY", "7d": "7 DAY", "30d": "30 DAY", "90d": "90 DAY" } as const

export async function pathFrequency(
  ch: ClickHouseClient,
  params: {
    processDefinitionKey: string
    period: keyof typeof INTERVALS
    minBucketSize: number
    limit: number
    version?: number
  },
): Promise<PathFrequencyResult> {
  const interval = INTERVALS[params.period]
  const key = escapeString(params.processDefinitionKey)
  const minBucket = Math.max(1, Math.floor(params.minBucketSize))
  const limit = Math.max(1, Math.floor(params.limit))
  const version =
    params.version !== undefined && params.version > 0 ? Math.floor(params.version) : null
  // Camunda's process_definition_id format is `key:version:uuid`. Filtering with
  // a LIKE prefix is the canonical way to scope to one version because the
  // ClickHouse schema does not store version as its own column.
  const versionFilter = version
    ? `AND process_definition_id LIKE ${escapeString(`${params.processDefinitionKey}:${version}:%`)}`
    : ""

  // Activities ordered by start_time per process_instance become the path signature.
  // Min-bucket-size is enforced server-side so rare paths never leave ClickHouse.
  const perInstanceCte = `
WITH per_instance AS (
    SELECT
        process_instance_id,
        arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((start_time, activity_id)))) AS path,
        max(end_time) AS instance_end,
        min(start_time) AS instance_start
    FROM camunda_history.camunda_activity_instances
    WHERE process_definition_key = ${key}
        AND start_time >= now() - INTERVAL ${interval}
        AND activity_id != ''
        ${versionFilter}
    GROUP BY process_instance_id
)`

  const pathsSql = `${perInstanceCte}
SELECT
    path,
    count() AS frequency,
    round(avg(dateDiff('millisecond', instance_start, instance_end)) / 1000, 1) AS avg_duration_sec,
    round(quantile(0.95)(dateDiff('millisecond', instance_start, instance_end)) / 1000, 1) AS p95_duration_sec
FROM per_instance
GROUP BY path
HAVING count() >= ${minBucket}
ORDER BY frequency DESC
LIMIT ${limit}`

  const edgesSql = `${perInstanceCte},
path_edges AS (
    SELECT
        arrayMap(i -> (path[i], path[i + 1]), range(1, length(path))) AS pairs
    FROM per_instance
    WHERE length(path) >= 2
)
SELECT
    pair.1 AS source,
    pair.2 AS target,
    count() AS flow
FROM path_edges
ARRAY JOIN pairs AS pair
GROUP BY source, target
HAVING count() >= ${minBucket}
ORDER BY flow DESC`

  const pathsTotalSql = `${perInstanceCte}
SELECT count() AS total_paths
FROM (
    SELECT path
    FROM per_instance
    GROUP BY path
)`

  const edgesTotalSql = `${perInstanceCte},
path_edges AS (
    SELECT
        arrayMap(i -> (path[i], path[i + 1]), range(1, length(path))) AS pairs
    FROM per_instance
    WHERE length(path) >= 2
)
SELECT count() AS total_edges
FROM (
    SELECT pair.1 AS source, pair.2 AS target
    FROM path_edges
    ARRAY JOIN pairs AS pair
    GROUP BY source, target
)`

  const [paths, edges, pathsTotal, edgesTotal] = await Promise.all([
    ch.query<PathFrequencyRow>(pathsSql),
    ch.query<PathEdgeRow>(edgesSql),
    ch.query<{ total_paths: number }>(pathsTotalSql),
    ch.query<{ total_edges: number }>(edgesTotalSql),
  ])

  return {
    paths,
    edges,
    minBucketSize: minBucket,
    suppressedPaths: Math.max(0, (pathsTotal[0]?.total_paths ?? 0) - paths.length),
    suppressedEdges: Math.max(0, (edgesTotal[0]?.total_edges ?? 0) - edges.length),
    version,
  }
}
