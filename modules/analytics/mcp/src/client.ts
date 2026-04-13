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
        throw new Error(
          `ClickHouse request to ${queryUrl} (user=${username}) failed: ${detail}`,
        )
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
