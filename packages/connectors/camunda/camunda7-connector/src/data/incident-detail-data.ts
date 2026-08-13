import type { Client } from "@miragon-ai/camunda7-client"
import type {
  ActivityTree,
  IncidentDetailData,
  IncidentDetailJob,
  VariableValue,
} from "../view-models.js"
import {
  getActivityInstanceTree,
  getHistoricActivityInstancesCount,
  getIncident,
  getJobs,
  getProcessDefinitionBpmn20Xml,
  getProcessDefinitions,
  getProcessInstance,
  getProcessInstanceVariables,
  getStacktrace,
} from "@miragon-ai/camunda7-client/sdk"

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

/**
 * Delegated incidents (sub-process failure propagated to the parent) have
 * null `configuration`/`incidentMessage`. The real failure data lives on
 * the root cause — fetch it and use it as the failure source.
 */
async function fetchRootCauseIncident(
  client: Client,
  rawIncident: RawIncident,
): Promise<RawIncident | null> {
  const rootId = rawIncident.rootCauseIncidentId
  return rootId && rootId !== rawIncident.id
    ? await getIncident({ client, path: { id: rootId } }).catch(() => null)
    : null
}

type IncidentContext = [
  rawInstance: RawProcessInstance | null,
  activityTree: unknown,
  variables: unknown,
  xmlResponse: { bpmn20Xml?: string } | null,
  historyCount: { count?: number } | null,
  definitionMeta: RawDefinition | null,
  job: IncidentDetailJob | null,
]

function fetchIncidentContext(client: Client, incident: IncidentRecord): Promise<IncidentContext> {
  const { processInstanceId, processDefinitionId, jobId } = incident
  return Promise.all([
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
    // The History tab pages the rows itself (registrar history query); the
    // payload only carries the honest total for the KPI. Degrades to null
    // when history is disabled on the engine.
    processInstanceId
      ? (getHistoricActivityInstancesCount({ client, query: { processInstanceId } }).catch(
          () => null,
        ) as Promise<{ count?: number } | null>)
      : Promise.resolve(null),
    fetchDefinitionMeta(client, processDefinitionId),
    jobId ? fetchJob(client, jobId) : Promise.resolve(null),
  ])
}

function deriveDefinitionInfo(
  definitionMeta: RawDefinition | null,
  processDefinitionId: string,
): {
  processDefinitionKey: string
  processDefinitionVersion: number | null
  processDefinitionName: string | null
} {
  const processDefinitionKey = processDefinitionId
    ? processDefinitionKeyFromId(processDefinitionId)
    : ""
  const processDefinitionVersion =
    typeof definitionMeta?.version === "number" ? definitionMeta.version : null
  return {
    processDefinitionKey,
    processDefinitionVersion,
    processDefinitionName: definitionMeta?.name ?? null,
  }
}

function deriveCockpitInstanceUrl(
  options: BuildOptions,
  incident: IncidentRecord,
  processDefinitionKey: string,
  processDefinitionVersion: number | null,
): string | null {
  const { processInstanceId, processDefinitionId } = incident
  return processInstanceId && processDefinitionKey
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
}

function toInstanceSummary(
  rawInstance: RawProcessInstance | null,
  incident: IncidentRecord,
): IncidentDetailData["instance"] {
  return {
    id: rawInstance?.id ?? incident.processInstanceId,
    definitionId: rawInstance?.definitionId ?? incident.processDefinitionId,
    businessKey: rawInstance?.businessKey ?? null,
    suspended: rawInstance?.suspended === true,
    ended: rawInstance?.ended === true,
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

  const rawRootCause = await fetchRootCauseIncident(client, rawIncident)

  const incident = normalizeIncident(rawIncident, options.incidentId, rawRootCause ?? rawIncident)
  const { processInstanceId, processDefinitionId, activityId } = incident

  const [rawInstance, activityTree, variables, xmlResponse, historyCount, definitionMeta, job] =
    await fetchIncidentContext(client, incident)

  const bpmnXml = xmlResponse?.bpmn20Xml ?? null
  const activityNames = bpmnXml ? extractActivityNames(bpmnXml) : {}

  const { processDefinitionKey, processDefinitionVersion, processDefinitionName } =
    deriveDefinitionInfo(definitionMeta, processDefinitionId)

  const cockpitInstanceUrl = deriveCockpitInstanceUrl(
    options,
    incident,
    processDefinitionKey,
    processDefinitionVersion,
  )

  return {
    incidentId: incident.id,
    incidentType: incident.incidentType,
    incidentMessage: incident.incidentMessage,
    incidentTimestamp: incident.incidentTimestamp,
    activityId,
    activityName: activityNames[activityId] ?? null,

    processDefinitionKey,
    processDefinitionId,
    processDefinitionName,
    processDefinitionVersion,
    processInstanceId,
    businessKey: rawInstance?.businessKey ?? null,
    cockpitInstanceUrl,

    bpmnXml,

    job,

    instance: toInstanceSummary(rawInstance, incident),
    activityTree: activityTree as ActivityTree | null,
    variables: variables as Record<string, VariableValue>,

    historyTotalCount: typeof historyCount?.count === "number" ? historyCount.count : null,
  }
}
