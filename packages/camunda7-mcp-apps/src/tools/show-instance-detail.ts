import { z } from 'zod';
import type { AppToolConfig } from 'sunpeak';
import { getAdapter } from '../lib/adapter.js';

export const tool: AppToolConfig = {
  resource: 'instance-detail',
  title: 'Process Instance Detail',
  description: 'Show detailed view of a single process instance with variables and activity tree',
};

export const schema = {
  processInstanceId: z.string().describe('The process instance ID to inspect'),
};

type Args = z.infer<z.ZodObject<typeof schema>>;

export default async function (args: Args) {
  const adapter = getAdapter();

  const [instance, activityTree, variables] = await Promise.all([
    adapter.getProcessInstance(args.processInstanceId),
    adapter.getActivityInstanceTree(args.processInstanceId).catch(() => null),
    adapter.getVariables('process-instance', args.processInstanceId).catch(() => ({})),
  ]);

  let bpmnXml: string | null = null;
  try {
    bpmnXml = await adapter.getProcessDefinitionXml(instance.definitionId);
  } catch {
    // BPMN XML may not be available
  }

  return {
    structuredContent: {
      instance,
      activityTree,
      variables,
      bpmnXml,
    },
  };
}
