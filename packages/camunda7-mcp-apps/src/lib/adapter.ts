import { createEngineAdapter, type EngineAdapter } from '@camunda7-mcp/engine-adapter';

let adapter: EngineAdapter | null = null;

export function getAdapter(): EngineAdapter {
  if (!adapter) {
    adapter = createEngineAdapter({
      engineType: (process.env.ENGINE_TYPE as 'camunda7' | 'cibseven' | 'operaton') ?? 'cibseven',
      baseUrl: process.env.ENGINE_BASE_URL ?? 'http://localhost:8080/engine-rest',
      authType: (process.env.ENGINE_AUTH_TYPE as 'basic' | 'bearer' | 'none') ?? 'basic',
      username: process.env.ENGINE_USERNAME,
      password: process.env.ENGINE_PASSWORD,
      token: process.env.ENGINE_TOKEN,
    });
  }
  return adapter;
}
