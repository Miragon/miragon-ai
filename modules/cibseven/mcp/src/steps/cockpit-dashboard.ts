import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { Client, CockpitDashboardData } from "@miragon-ai/client-cibseven"
import {
  getProcessDefinitionStatistics,
  getProcessDefinitions,
  getIncidents,
} from "@miragon-ai/client-cibseven/generated/sdk.gen"

interface Camunda7AppConfig {
  client: Client
}

interface IncidentStatDto {
  incidentType?: string | null
  incidentCount?: number | null
}

interface DefinitionDto {
  id?: string | null
  key?: string | null
  name?: string | null
  version?: number | null
}

interface StatRow {
  id?: string | null
  instances?: number
  failedJobs?: number
  incidents?: IncidentStatDto[] | null
  definition?: DefinitionDto
}

/**
 * Loads aggregated statistics for all deployed process definitions.
 * Consumed by `camunda7:cockpit-dashboard`.
 */
export const loadCockpitDashboardStep: PipelineStepDefinition<Camunda7AppConfig> = {
  id: "camunda7:load-cockpit-dashboard",
  dataType: "camunda7:cockpitDashboard",
  requires: [],
  produces: ["camunda7:cockpitDashboardData"],
  execute: async (_context, appConfig) => {
    const client = appConfig.client

    let rows: StatRow[] = []
    try {
      const stats = (await getProcessDefinitionStatistics({
        client,
        query: { failedJobs: true, incidents: true },
      })) as unknown as StatRow[]
      rows = Array.isArray(stats) ? stats : []
    } catch {
      // Fallback: build from plain definitions + incidents
      const [defs, incidents] = await Promise.all([
        getProcessDefinitions({
          client,
          query: { latestVersion: true, maxResults: 100, sortBy: "name", sortOrder: "asc" },
        }),
        getIncidents({ client, query: { maxResults: 500 } }).catch(() => []),
      ])
      const defArray = Array.isArray(defs) ? (defs as DefinitionDto[]) : []
      const incArray = Array.isArray(incidents)
        ? (incidents as Array<{ processDefinitionId?: string }>)
        : []
      const incByDef = new Map<string, number>()
      for (const inc of incArray) {
        const k = inc.processDefinitionId ?? ""
        incByDef.set(k, (incByDef.get(k) ?? 0) + 1)
      }
      rows = defArray.map((d) => ({
        id: d.id,
        instances: 0,
        failedJobs: 0,
        incidents: incByDef.has(d.id ?? "")
          ? [{ incidentType: "failedJob", incidentCount: incByDef.get(d.id ?? "") }]
          : [],
        definition: d,
      }))
    }

    let totalRunning = 0
    let totalFailed = 0
    let totalIncidents = 0

    const definitions = rows.map((row) => {
      const incidents = (row.incidents ?? []).map((i) => ({
        incidentType: i.incidentType ?? "unknown",
        incidentCount: i.incidentCount ?? 0,
      }))
      const incidentSum = incidents.reduce((s, i) => s + i.incidentCount, 0)

      totalRunning += row.instances ?? 0
      totalFailed += row.failedJobs ?? 0
      totalIncidents += incidentSum

      return {
        id: row.definition?.id ?? row.id ?? "",
        key: row.definition?.key ?? "",
        name: row.definition?.name ?? null,
        version: row.definition?.version ?? 0,
        instances: row.instances ?? 0,
        failedJobs: row.failedJobs ?? 0,
        incidents,
      }
    })

    // Sort: definitions with issues first, then by instance count
    definitions.sort((a, b) => {
      const aIssues = a.failedJobs + a.incidents.reduce((s, i) => s + i.incidentCount, 0)
      const bIssues = b.failedJobs + b.incidents.reduce((s, i) => s + i.incidentCount, 0)
      if (aIssues !== bIssues) return bIssues - aIssues
      return b.instances - a.instances
    })

    const data: CockpitDashboardData = {
      summary: {
        totalDefinitions: definitions.length,
        totalRunningInstances: totalRunning,
        totalFailedJobs: totalFailed,
        totalIncidents,
      },
      definitions,
    }

    return {
      data,
      keys: { "camunda7:cockpitDashboardData": data },
      _app: "camunda7",
      _step: "load-cockpit-dashboard",
    }
  },
}
