import { z } from 'zod';
import type { AppToolConfig, ToolHandlerExtra } from 'sunpeak/mcp';
import { getClickHouseClient } from '../lib/clickhouse.js';
import { escapeString } from '@camunda7-mcp/analytics-server/clickhouse-client';

export const tool: AppToolConfig = {
  resource: 'history-timeline',
  title: 'History Timeline',
  description: 'Show activity timeline for a completed or running process instance',
};

export const schema = {
  processInstanceId: z.string().describe('The process instance ID'),
};

type Args = z.infer<z.ZodObject<typeof schema>>;

export default async function (args: Args, _extra: ToolHandlerExtra) {
  const ch = getClickHouseClient();
  const pid = escapeString(args.processInstanceId);

  const [activityRows, instanceRows] = await Promise.all([
    ch.query<Record<string, unknown>>(`
SELECT
    id,
    activity_id,
    activity_name,
    activity_type,
    start_time,
    end_time,
    duration_in_millis,
    assignee,
    task_id,
    canceled
FROM camunda_history.camunda_activity_instances
WHERE process_instance_id = ${pid}
ORDER BY start_time ASC`),

    ch.query<Record<string, unknown>>(`
SELECT
    id,
    process_definition_key,
    process_definition_name,
    start_time,
    end_time,
    duration_in_millis,
    state
FROM camunda_history.camunda_process_instances
WHERE id = ${pid}
LIMIT 1`),
  ]);

  const inst = instanceRows[0] ?? null;
  const processInstance = inst ? {
    id: inst.id as string,
    processDefinitionKey: inst.process_definition_key as string,
    processDefinitionName: (inst.process_definition_name as string) ?? null,
    startTime: inst.start_time as string,
    endTime: (inst.end_time as string) ?? null,
    durationInMillis: inst.duration_in_millis != null ? Number(inst.duration_in_millis) : null,
    state: inst.state as string,
  } : null;

  const activities = activityRows.map((a) => ({
    id: a.id as string,
    activityId: a.activity_id as string,
    activityName: (a.activity_name as string) ?? null,
    activityType: a.activity_type as string,
    startTime: a.start_time as string,
    endTime: (a.end_time as string) ?? null,
    durationInMillis: a.duration_in_millis != null ? Number(a.duration_in_millis) : null,
    assignee: (a.assignee as string) ?? null,
    taskId: (a.task_id as string) ?? null,
    canceled: a.canceled === true || a.canceled === 1,
  }));

  return {
    structuredContent: {
      processInstance,
      activities,
      totalActivities: activities.length,
    },
  };
}
