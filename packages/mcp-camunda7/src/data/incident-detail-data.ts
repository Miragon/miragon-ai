import type { Client } from "@miragon-ai/client-camunda7"
import type {
  ActivityTree,
  IncidentDetailData,
  IncidentDetailHistoryEntry,
  IncidentDetailJob,
  VariableValue,
} from "../view-models.js"
import {
  getActivityInstanceTree,
  getHistoricActivityInstances,
  getIncident,
  getJobs,
  getProcessDefinitionBpmn20Xml,
  getProcessDefinitions,
  getProcessInstance,
  getProcessInstanceVariables,
  getStacktrace,
} from "@miragon-ai/client-camunda7/sdk"

import { buildInstanceCockpitUrl } from "../lib/cockpit-url.js"
import type { EngineProvider } from "../engine-provider.js"
import { extractActivityNames } from "../lib/bpmn-parse.js"
import { processDefinitionKeyFromId } from "./incident-panel-data.js"

interface BuildOptions {
  baseUrl: string
  cockpitUrl?: string
  provider: EngineProvider
  incidentId: string
}

interface IncidentRecord {
  id: string
  processDefinitionId: string
  processInstanceId: string
  activityId: string
  jobId: string | null
  incidentType: string
  incidentMessage: string | null
  incidentTimestamp: string
}

interface RawIncident {
  id?: string | null
  processDefinitionId?: string | null
  processInstanceId?: string | null
  activityId?: string | null
  failedActivityId?: string | null
  /**
   * Camunda 7 packs the failure target into `configuration` instead of a typed
   * field. For `failedJob` incidents this is the job id; for other types
   * (e.g. `failedExternalTask`) it points at a different resource and must
   * not be treated as a job id.
   */
  configuration?: string | null
  /**
   * Set when this incident is a delegated propagation from a sub-process.
   * The actual failure (job, message, stacktrace) lives on the root cause —
   * the delegated incident itself carries `null` for `configuration` and
   * `incidentMessage`.
   */
  rootCauseIncidentId?: string | null
  incidentType?: string | null
  incidentMessage?: string | null
  incidentTimestamp?: string | null
}

/**
 * Build the incident record. For delegated incidents (Camunda's parent
 * process gets an incident pointing at the sub-process root cause), the
 * `configuration` and `incidentMessage` fields are null on the parent —
 * we have to read them from the root cause to surface the real failure.
 *
 * Activity / process context comes from the original (where the operator
 * navigated) so the BPMN highlight stays in the right diagram.
 */
function normalizeIncident(
  raw: RawIncident,
  fallbackId: string,
  failureSource: RawIncident,
): IncidentRecord {
  const incidentType = raw.incidentType ?? "unknown"
  const jobId =
    incidentType === "failedJob" ? (failureSource.configuration ?? raw.configuration ?? null) : null
  const activityId = raw.failedActivityId ?? raw.activityId ?? ""
  const message =
    failureSource.incidentMessage && failureSource.incidentMessage.length > 0
      ? failureSource.incidentMessage
      : raw.incidentMessage && raw.incidentMessage.length > 0
        ? raw.incidentMessage
        : null
  return {
    id: raw.id ?? fallbackId,
    processDefinitionId: raw.processDefinitionId ?? "",
    processInstanceId: raw.processInstanceId ?? "",
    activityId,
    jobId,
    incidentType,
    incidentMessage: message,
    incidentTimestamp: raw.incidentTimestamp ?? "",
  }
}

interface RawProcessInstance {
  id?: string | null
  definitionId?: string | null
  businessKey?: string | null
  suspended?: boolean | null
  ended?: boolean | null
}

interface RawJob {
  id?: string | null
  retries?: number | null
  exceptionMessage?: string | null
  dueDate?: string | null
}

interface RawHistoricActivity {
  id?: string | null
  activityId?: string | null
  activityName?: string | null
  activityType?: string | null
  startTime?: string | null
  endTime?: string | null
  durationInMillis?: number | null
  canceled?: boolean | null
}

interface RawDefinition {
  id?: string | null
  key?: string | null
  name?: string | null
  version?: number | null
}

async function fetchDefinitionMeta(
  client: Client,
  processDefinitionId: string,
): Promise<RawDefinition | null> {
  if (!processDefinitionId) return null
  const key = processDefinitionKeyFromId(processDefinitionId)
  const defs = (await getProcessDefinitions({
    client,
    query: { keysIn: key, latestVersion: false },
  }).catch(() => [])) as unknown as RawDefinition[]
  if (!Array.isArray(defs)) return null
  // Prefer the exact-id match; fall back to first row for the key.
  return defs.find((d) => d.id === processDefinitionId) ?? defs[0] ?? null
}

async function fetchJob(client: Client, jobId: string): Promise<IncidentDetailJob | null> {
  const [jobsResponse, rawStacktrace] = await Promise.all([
    getJobs({ client, query: { jobId, maxResults: 1 } }).catch(() => []) as Promise<unknown>,
    // The engine returns the stacktrace as `text/plain`, but the shared
    // client is configured with `Accept: application/json` + the default
    // `parseAs: 'json'` — both must be overridden, otherwise the response
    // gets JSON.parsed (throws) and the catch below masks it as null.
    getStacktrace({
      client,
      path: { id: jobId },
      parseAs: "text",
      headers: { Accept: "text/plain" },
    }).catch(() => null) as Promise<unknown>,
  ])

  const jobs = (Array.isArray(jobsResponse) ? jobsResponse : []) as RawJob[]
  const job = jobs[0]
  if (!job) return null

  const stacktrace =
    typeof rawStacktrace === "string" && rawStacktrace.length > 0 ? rawStacktrace : null

  return {
    id: job.id ?? jobId,
    retries: typeof job.retries === "number" ? job.retries : 0,
    exceptionMessage: job.exceptionMessage ?? null,
    stacktrace,
    dueDate: job.dueDate ?? null,
  }
}

export async function buildIncidentDetailData(
  client: Client,
  options: BuildOptions,
): Promise<IncidentDetailData> {
  const rawIncident = (await getIncident({
    client,
    path: { id: options.incidentId },
  })) as unknown as RawIncident

  // Delegated incidents (sub-process failure propagated to the parent) have
  // null `configuration`/`incidentMessage`. The real failure data lives on
  // the root cause — fetch it and use it as the failure source.
  const rootId = rawIncident.rootCauseIncidentId
  const rawRootCause: RawIncident | null =
    rootId && rootId !== rawIncident.id
      ? ((await getIncident({ client, path: { id: rootId } }).catch(
          () => null,
        )) as unknown as RawIncident | null)
      : null

  const incident = normalizeIncident(rawIncident, options.incidentId, rawRootCause ?? rawIncident)
  const { processInstanceId, processDefinitionId, jobId, activityId } = incident

  const [rawInstance, activityTree, variables, xmlResponse, history, definitionMeta, job] =
    await Promise.all([
      processInstanceId
        ? (getProcessInstance({ client, path: { id: processInstanceId } }).catch(
            () => null,
          ) as Promise<RawProcessInstance | null>)
        : Promise.resolve(null),
      processInstanceId
        ? (getActivityInstanceTree({ client, path: { id: processInstanceId } }).catch(
            () => null,
          ) as Promise<unknown>)
        : Promise.resolve(null),
      processInstanceId
        ? (getProcessInstanceVariables({ client, path: { id: processInstanceId } }).catch(
            () => ({}),
          ) as Promise<unknown>)
        : Promise.resolve({}),
      processDefinitionId
        ? (getProcessDefinitionBpmn20Xml({ client, path: { id: processDefinitionId } }).catch(
            () => null,
          ) as Promise<{ bpmn20Xml?: string } | null>)
        : Promise.resolve(null),
      processInstanceId
        ? (getHistoricActivityInstances({
            client,
            query: {
              processInstanceId,
              sortBy: "startTime",
              sortOrder: "asc",
              maxResults: 200,
            },
          }).catch(() => []) as Promise<unknown>)
        : Promise.resolve([]),
      fetchDefinitionMeta(client, processDefinitionId),
      jobId ? fetchJob(client, jobId) : Promise.resolve(null),
    ])

  const bpmnXml = xmlResponse?.bpmn20Xml ?? null
  const activityNames = bpmnXml ? extractActivityNames(bpmnXml) : {}

  const historyRows = (Array.isArray(history) ? history : []) as RawHistoricActivity[]
  const historyEntries: IncidentDetailHistoryEntry[] = historyRows
    .filter((h) => h.id && h.activityId)
    .map((h) => ({
      id: h.id ?? "",
      activityId: h.activityId ?? "",
      activityName: h.activityName ?? activityNames[h.activityId ?? ""] ?? null,
      activityType: h.activityType ?? "unknown",
      startTime: h.startTime ?? "",
      endTime: h.endTime ?? null,
      durationInMillis: typeof h.durationInMillis === "number" ? h.durationInMillis : null,
      canceled: h.canceled === true,
    }))

  const processDefinitionKey = processDefinitionId
    ? processDefinitionKeyFromId(processDefinitionId)
    : ""
  const processDefinitionVersion =
    typeof definitionMeta?.version === "number" ? definitionMeta.version : null

  const cockpitInstanceUrl =
    processInstanceId && processDefinitionKey
      ? buildInstanceCockpitUrl(
          { baseUrl: options.baseUrl, cockpitUrl: options.cockpitUrl, provider: options.provider },
          {
            key: processDefinitionKey,
            version: processDefinitionVersion,
            definitionId: processDefinitionId,
            instanceId: processInstanceId,
          },
          { tab: "variables" },
        )
      : null

  return {
    incidentId: incident.id,
    incidentType: incident.incidentType,
    incidentMessage: incident.incidentMessage,
    incidentTimestamp: incident.incidentTimestamp,
    activityId,
    activityName: activityNames[activityId] ?? null,

    processDefinitionKey,
    processDefinitionId,
    processDefinitionName: definitionMeta?.name ?? null,
    processDefinitionVersion,
    processInstanceId,
    businessKey: rawInstance?.businessKey ?? null,
    cockpitInstanceUrl,

    bpmnXml,

    job,

    instance: {
      id: rawInstance?.id ?? processInstanceId,
      definitionId: rawInstance?.definitionId ?? processDefinitionId,
      businessKey: rawInstance?.businessKey ?? null,
      suspended: rawInstance?.suspended === true,
      ended: rawInstance?.ended === true,
    },
    activityTree: activityTree as ActivityTree | null,
    variables: variables as Record<string, VariableValue>,

    history: historyEntries,
  }
}
