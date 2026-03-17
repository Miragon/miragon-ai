import type { AuthInfo } from 'sunpeak/mcp';
import type { IncomingMessage } from 'node:http';

export async function auth(req: IncomingMessage): Promise<AuthInfo> {
  const token = req.headers['authorization']?.split(' ')[1] ?? 'anonymous';
  return { token, clientId: 'camunda7-mcp-apps', scopes: ['read', 'write'] };
}

export const server = {
  name: 'camunda7-mcp-apps',
  version: '0.1.0',
};
