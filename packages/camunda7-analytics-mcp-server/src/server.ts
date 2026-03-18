import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnalyticsConfig } from './config.js';
import { createClickHouseClient } from './clickhouse-client.js';
import { registerAllTools } from './tools/index.js';

export function createServer(config: AnalyticsConfig): McpServer {
  const server = new McpServer({
    name: 'camunda7-analytics-mcp-server',
    version: '0.1.0',
  });

  const ch = createClickHouseClient({
    url: config.clickhouseUrl,
    user: config.clickhouseUser,
    password: config.clickhousePassword,
    database: config.clickhouseDatabase,
  });

  registerAllTools(server, ch);

  return server;
}
