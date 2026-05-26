export interface ClickHouseConfig {
  url: string
  username: string
  password: string
  database: string
}

export interface ClickHouseClient {
  query<T = Record<string, unknown>>(sql: string): Promise<T[]>
}

export function createClickHouseClient(config: ClickHouseConfig): ClickHouseClient {
  const { url, username, password, database } = config

  return {
    async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
      const queryUrl = `${url}/?database=${encodeURIComponent(
        database,
      )}&default_format=JSONEachRow&readonly=1`

      let response: Response
      try {
        response = await fetch(queryUrl, {
          method: "POST",
          headers: {
            "X-ClickHouse-User": username,
            "X-ClickHouse-Key": password,
            "Content-Type": "text/plain",
          },
          body: sql,
        })
      } catch (err) {
        const cause = (err as { cause?: { code?: string; message?: string } }).cause
        const detail = `${cause?.code ?? ""} ${cause?.message ?? (err as Error).message}`.trim()
        throw new Error(`ClickHouse request to ${queryUrl} (user=${username}) failed: ${detail}`)
      }

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`ClickHouse query failed (${response.status}): ${errorText}`)
      }

      const body = await response.text()
      if (!body.trim()) return []

      return body
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as T)
    },
  }
}

/** Escape a string value for safe use in ClickHouse SQL. */
export function escapeString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
}

export type EngineFilterInput = string | string[] | undefined

/**
 * Builds a `engine_id = ...` / `engine_id IN (...)` SQL fragment from the
 * optional analytics-tool input. Returns `undefined` when no filter is set so
 * the call site can leave the WHERE clause untouched and aggregate across all
 * engines.
 *
 * Pass `alias` (e.g. `"p"`) when the column needs a table prefix in a JOIN
 * query.
 */
export function engineFilter(engineId: EngineFilterInput, alias = ""): string | undefined {
  if (engineId === undefined || engineId === null) return undefined
  const prefix = alias ? `${alias}.` : ""
  if (Array.isArray(engineId)) {
    if (engineId.length === 0) return undefined
    return `${prefix}engine_id IN (${engineId.map(escapeString).join(", ")})`
  }
  if (engineId.length === 0) return undefined
  return `${prefix}engine_id = ${escapeString(engineId)}`
}
