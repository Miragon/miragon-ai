import { z } from 'zod';
import type { AppToolConfig, ToolHandlerExtra } from 'sunpeak/mcp';
import { getAdapter } from '../lib/adapter.js';

export const tool: AppToolConfig = {
  resource: 'process-list',
  title: 'Process Definition List',
  description: 'Show deployed process definitions with instance counts',
};

export const schema = {
  key: z.string().optional().describe('Filter by process definition key'),
  nameLike: z.string().optional().describe('Filter by name (substring)'),
  latestVersion: z.boolean().optional().default(true).describe('Only latest versions'),
};

type Args = z.infer<z.ZodObject<typeof schema>>;

export default async function (args: Args, _extra: ToolHandlerExtra) {
  const adapter = getAdapter();

  const definitions = await adapter.listProcessDefinitions({
    key: args.key,
    nameLike: args.nameLike,
    latestVersion: args.latestVersion,
    maxResults: 100,
    sortBy: 'name',
    sortOrder: 'asc',
  });

  return {
    structuredContent: {
      definitions,
      totalCount: definitions.length,
    },
  };
}
