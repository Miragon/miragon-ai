import { createClickHouseClient, type ClickHouseClient } from '@camunda7-mcp/analytics-server/clickhouse-client';

let client: ClickHouseClient | null = null;

export function getClickHouseClient(): ClickHouseClient {
  if (!client) {
    client = createClickHouseClient({
      url: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123',
      user: process.env.CLICKHOUSE_USER ?? 'camunda',
      password: process.env.CLICKHOUSE_PASSWORD ?? 'camunda123',
      database: process.env.CLICKHOUSE_DATABASE ?? 'camunda_history',
    });
  }
  return client;
}
