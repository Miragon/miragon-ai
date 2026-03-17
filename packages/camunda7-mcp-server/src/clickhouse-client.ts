export interface ClickHouseConfig {
  url: string;
  user: string;
  password: string;
  database: string;
}

export interface ClickHouseClient {
  query<T = Record<string, unknown>>(sql: string): Promise<T[]>;
}

export function createClickHouseClient(config: ClickHouseConfig): ClickHouseClient {
  const { url, user, password, database } = config;

  return {
    async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
      const queryUrl = `${url}/?database=${encodeURIComponent(database)}&default_format=JSONEachRow&readonly=1`;

      const response = await fetch(queryUrl, {
        method: 'POST',
        headers: {
          'X-ClickHouse-User': user,
          'X-ClickHouse-Key': password,
          'Content-Type': 'text/plain',
        },
        body: sql,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ClickHouse query failed (${response.status}): ${error}`);
      }

      const text = await response.text();
      if (!text.trim()) return [];

      return text
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as T);
    },
  };
}

/** Escape a string value for safe use in ClickHouse SQL. */
export function escapeString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
