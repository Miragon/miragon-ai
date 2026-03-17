import type { AuthInfo } from 'sunpeak';
import type { IncomingMessage } from 'node:http';

export async function auth(req: IncomingMessage): Promise<AuthInfo | null> {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return null;
  return { token, clientId: 'camunda7-mcp-apps', scopes: ['read', 'write'] };
}

export const server = {
  name: 'camunda7-mcp-apps',
  version: '0.1.0',
};
