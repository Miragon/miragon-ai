import { z } from 'zod';
import type { AppToolConfig, ToolHandlerExtra } from 'sunpeak/mcp';
import { getClickHouseClient } from '../lib/clickhouse.js';
import { escapeString } from '@camunda7-mcp/analytics-server/clickhouse-client';

export const tool: AppToolConfig = {
  resource: 'incident-panel',
  title: 'Open Incidents by Process Definition',
  description: 'Show all open incidents grouped by process definition with error details and retry capability',
  annotations: { readOnlyHint: false },
};

export const schema = {
  processDefinitionKey: z.string().optional().describe('Filter by process definition key'),
  incidentType: z.string().optional().describe('Filter by incident type (e.g. failedJob)'),
};

type Args = z.infer<z.ZodObject<typeof schema>>;

interface IncidentRow {
  id: string;
  process_definition_key: string;
  process_definition_id: string;
  process_instance_id: string;
  incident_type: string;
  activity_id: string;
  incident_message: string | null;
  create_time: string;
  configuration: string | null;
}

export default async function (args: Args, _extra: ToolHandlerExtra) {
  const ch = getClickHouseClient();

  const conditions: string[] = ['end_time IS NULL'];

  if (args.processDefinitionKey) {
    conditions.push(`process_definition_key = ${escapeString(args.processDefinitionKey)}`);
  }
  if (args.incidentType) {
    conditions.push(`incident_type = ${escapeString(args.incidentType)}`);
  }

  const sql = `
SELECT
    id,
    process_definition_key,
    process_definition_id,
    process_instance_id,
    incident_type,
    activity_id,
    incident_message,
    create_time,
    configuration
FROM camunda_history.camunda_incidents FINAL
WHERE ${conditions.join(' AND ')}
ORDER BY process_definition_key, create_time DESC
LIMIT 200`;

  const rows = await ch.query<IncidentRow>(sql);

  // Group by process definition key
  const byDefinition = new Map<string, IncidentRow[]>();
  for (const row of rows) {
    const key = row.process_definition_key;
    const group = byDefinition.get(key) ?? [];
    group.push(row);
    byDefinition.set(key, group);
  }

  const definitions = [...byDefinition.entries()]
    .sort((a, b) => b[1].length - a[1].length) // most incidents first
    .map(([key, group]) => ({
      processDefinitionKey: key,
      incidentCount: group.length,
      latestIncident: group[0].create_time,
      incidents: group.map((r) => ({
        id: r.id,
        processDefinitionId: r.process_definition_id,
        processInstanceId: r.process_instance_id,
        incidentType: r.incident_type,
        activityId: r.activity_id,
        incidentMessage: r.incident_message ?? null,
        incidentTimestamp: r.create_time,
        configuration: r.configuration ?? null,
      })),
    }));

  return {
    structuredContent: {
      totalCount: rows.length,
      definitions,
    },
  };
}
