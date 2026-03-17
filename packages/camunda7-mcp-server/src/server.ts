import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createEngineAdapter } from '@camunda7-mcp/engine-adapter';
import type { ServerConfig } from './config.js';
import { registerAllTools } from './tools/index.js';
import { registerClickHouseTools } from './tools/clickhouse-tools.js';
import { createClickHouseClient } from './clickhouse-client.js';

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer({
    name: 'camunda7-mcp-server',
    version: '0.1.0',
  });

  const adapter = createEngineAdapter({
    engineType: config.engineType,
    baseUrl: config.baseUrl,
    authType: config.authType,
    username: config.username,
    password: config.password,
    token: config.token,
  });

  registerAllTools(server, adapter);

  if (config.clickhouseEnabled) {
    const chClient = createClickHouseClient({
      url: config.clickhouseUrl,
      user: config.clickhouseUser,
      password: config.clickhousePassword,
      database: config.clickhouseDatabase,
    });
    registerClickHouseTools(server, chClient);
  }

  return server;
}
