import type { Client } from "@miragon-ai/client-camunda7"
import type { ProcessDetailActivity, ProcessDetailData } from "../view-models.js"
import {
  getActivityStatistics,
  getProcessDefinitionBpmn20Xml,
} from "@miragon-ai/client-camunda7/sdk"

import { buildProcessCockpitUrl } from "../lib/cockpit-url.js"
import { countBpmnActivities, extractActivityNames } from "../lib/bpmn-parse.js"
import { fetchSingleDefinitionInfo } from "./definition-info.js"

interface ActivityStatsRow {
  id?: string | null
  /** Running token count at the activity (camunda activity statistics). */
  instances?: number | null
  failedJobs?: number | null
  incidents?: Array<{ incidentCount?: number | null }> | null
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
  const { info, runningInstances } = await fetchSingleDefinitionInfo(
    client,
    options.processDefinitionKey,
  )
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
  let affectedActivityCount = 0
  const activities: ProcessDetailActivity[] = []
  for (const row of rows) {
    const activityId = row.id ?? ""
    if (!activityId) continue
    const incidentCount = (row.incidents ?? []).reduce((sum, i) => sum + (i.incidentCount ?? 0), 0)
    const activityFailedJobs = row.failedJobs ?? 0
    const instances = row.instances ?? 0
    openIncidents += incidentCount
    failedJobs += activityFailedJobs
    if (incidentCount > 0 || activityFailedJobs > 0) affectedActivityCount += 1
    // Keep any activity that carries a running token OR a problem — these are the
    // ones the diagram heatmap overlays (token-count + incident/failed-job badges).
    if (instances === 0 && incidentCount === 0 && activityFailedJobs === 0) continue
    activities.push({
      activityId,
      activityName: activityNames[activityId] ?? null,
      instances,
      incidentCount,
      failedJobs: activityFailedJobs,
    })
  }
  // Most-affected first, then busiest, so the activity list reads sensibly.
  activities.sort((a, b) => b.incidentCount - a.incidentCount || b.instances - a.instances)

  return {
    processDefinitionKey: options.processDefinitionKey,
    processDefinitionName: info?.name ?? null,
    version: info?.version ?? null,
    bpmnXml,
    cockpitUrl: buildProcessCockpitUrl(
      options.cockpitUrl,
      options.baseUrl,
      options.processDefinitionKey,
      info?.version ?? null,
    ),
    runningInstances,
    openIncidents,
    failedJobs,
    totalActivityCount,
    affectedActivityCount,
    activities,
  }
}
