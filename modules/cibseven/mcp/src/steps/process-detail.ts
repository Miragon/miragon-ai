import type { Client, ProcessDetailActivity, ProcessDetailData } from "@miragon-ai/client-cibseven"
import {
  getActivityStatistics,
  getProcessDefinitions,
  getProcessDefinitionBpmn20Xml,
  getProcessDefinitionStatistics,
} from "@miragon-ai/client-cibseven/generated/sdk.gen"

import { buildProcessCockpitUrl } from "../lib/cockpit-url.js"
import { countBpmnActivities, extractActivityNames } from "../lib/bpmn-parse.js"

interface DefinitionInfo {
  id: string
  key: string
  name: string | null
  version: number | null
}

interface DefinitionStatsRow {
  id?: string | null
  instances?: number | null
  failedJobs?: number | null
  incidents?: Array<{ incidentCount?: number | null }> | null
  definition?: {
    id?: string | null
    key?: string | null
    name?: string | null
    version?: number | null
  } | null
}

interface ActivityStatsRow {
  id?: string | null
  instances?: number | null
  failedJobs?: number | null
  incidents?: Array<{ incidentCount?: number | null }> | null
}

async function fetchDefinitionInfo(
  client: Client,
  key: string,
): Promise<{ info: DefinitionInfo | null; runningInstances: number | null }> {
  // Cluster-wide statistics carries running instances + name/version per
  // definition in a single round-trip. Same trick used by the incident builder.
  const stats = (await getProcessDefinitionStatistics({
    client,
    query: {},
  }).catch(() => [])) as unknown as DefinitionStatsRow[]

  let best: { info: DefinitionInfo; instances: number | null } | null = null
  for (const row of Array.isArray(stats) ? stats : []) {
    const def = row.definition
    if (!def?.key || def.key !== key) continue
    const candidate: DefinitionInfo = {
      id: def.id ?? "",
      key: def.key,
      name: def.name ?? null,
      version: typeof def.version === "number" ? def.version : null,
    }
    if (
      !best ||
      (candidate.version !== null &&
        (best.info.version === null || candidate.version > best.info.version))
    ) {
      best = { info: candidate, instances: row.instances ?? null }
    }
  }
  if (best) return { info: best.info, runningInstances: best.instances }

  // Fallback: the definition has no running instances (or stats are unavailable)
  // — fetch via /process-definition.
  const defs = (await getProcessDefinitions({
    client,
    query: { keysIn: key, latestVersion: true },
  }).catch(() => [])) as unknown as Array<{
    id?: string
    key?: string
    name?: string | null
    version?: number
  }>
  const d = (Array.isArray(defs) ? defs : [])[0]
  if (!d?.key) return { info: null, runningInstances: null }
  return {
    info: {
      id: d.id ?? "",
      key: d.key,
      name: d.name ?? null,
      version: typeof d.version === "number" ? d.version : null,
    },
    runningInstances: 0,
  }
}

interface BuildOptions {
  baseUrl: string
  cockpitUrl?: string
  processDefinitionKey: string
}

export async function buildProcessDetailData(
  client: Client,
  options: BuildOptions,
): Promise<ProcessDetailData> {
  const { info, runningInstances } = await fetchDefinitionInfo(client, options.processDefinitionKey)
  const processDefinitionId = info?.id ?? null

  const [activityStats, xmlResponse] = await Promise.all([
    processDefinitionId
      ? (getActivityStatistics({
          client,
          path: { id: processDefinitionId },
          query: { failedJobs: true, incidents: true },
        }).catch(() => []) as Promise<unknown>)
      : Promise.resolve([]),
    processDefinitionId
      ? (getProcessDefinitionBpmn20Xml({
          client,
          path: { id: processDefinitionId },
        }).catch(() => null) as Promise<{ bpmn20Xml?: string } | null>)
      : Promise.resolve(null),
  ])

  const bpmnXml = xmlResponse?.bpmn20Xml ?? null
  const activityNames = bpmnXml ? extractActivityNames(bpmnXml) : {}
  const totalActivityCount = bpmnXml ? countBpmnActivities(bpmnXml) : null

  const rows = (Array.isArray(activityStats) ? activityStats : []) as ActivityStatsRow[]

  let openIncidents = 0
  let failedJobs = 0
  const activities: ProcessDetailActivity[] = []
  for (const row of rows) {
    const activityId = row.id ?? ""
    if (!activityId) continue
    const incidentCount = (row.incidents ?? []).reduce((sum, i) => sum + (i.incidentCount ?? 0), 0)
    const activityFailedJobs = row.failedJobs ?? 0
    openIncidents += incidentCount
    failedJobs += activityFailedJobs
    if (incidentCount === 0 && activityFailedJobs === 0) continue
    activities.push({
      activityId,
      activityName: activityNames[activityId] ?? null,
      incidentCount,
      failedJobs: activityFailedJobs,
    })
  }
  activities.sort((a, b) => b.incidentCount - a.incidentCount)

  return {
    processDefinitionKey: options.processDefinitionKey,
    processDefinitionName: info?.name ?? null,
    version: info?.version ?? null,
    bpmnXml,
    cockpitUrl: buildProcessCockpitUrl(
      options.cockpitUrl,
      options.baseUrl,
      options.processDefinitionKey,
    ),
    runningInstances,
    openIncidents,
    failedJobs,
    totalActivityCount,
    affectedActivityCount: activities.length,
    activities,
  }
}
