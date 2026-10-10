import {
  fetchJobStacktrace,
  incidentRecovery,
  readProcessInstanceVariables,
  type Client,
} from "@miragon-ai/camunda7-client"
import type {
  ActivityTree,
  IncidentDetailData,
  IncidentDetailJob,
  IncidentRecovery,
  VariableValue,
} from "../view-models.js"
import {
  getActivityInstanceTree,
  getHistoricActivityInstancesCount,
  getIncident,
  getJobs,
  getProcessDefinition,
  getProcessDefinitionBpmn20Xml,
  getProcessInstance,
} from "@miragon-ai/camunda7-client/sdk"

import { buildInstanceCockpitUrl } from "../lib/cockpit-url.js"
import type { EngineProvider } from "../engine-provider.js"
import { extractActivityNames } from "../lib/bpmn-parse.js"
import { processDefinitionKeyFromId } from "./definition-info.js"
import { optional, rowsOf } from "./engine-reads.js"

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
  recovery: IncidentRecovery
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
  // A delegated incident carries no configuration: its failure target (job
  // or external task) is the root cause's.
  const recovery = incidentRecovery({
    incidentType,
    configuration: failureSource.configuration ?? raw.configuration,
  })
  const jobId = recovery.action === "retry-job" ? recovery.jobId : null
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
    recovery,
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

/** Name + version of the incident's OWN definition — one id lookup; enrichment (null on failure). */
function fetchDefinitionMeta(
  client: Client,
  processDefinitionId: string,
): Promise<RawDefinition | null> {
  if (!processDefinitionId) return Promise.resolve(null)
  return optional(
    getProcessDefinition({ client, path: { id: processDefinitionId } }) as Promise<RawDefinition>,
  )
}

/**
 * The failing job of a job-backed incident — PRIMARY: a failed read is a tool
 * error, never "this incident has no job". `null` only when the job is gone
 * (the incident was retried meanwhile).
 */
async function fetchJob(client: Client, jobId: string): Promise<IncidentDetailJob | null> {
  const [jobs, rawStacktrace] = await Promise.all([
    getJobs({ client, query: { jobId, maxResults: 1 } }).then((rows) => rowsOf<RawJob>(rows)),
    // Optional enrichment: the failure tab renders without a stacktrace.
    fetchJobStacktrace(client, jobId).catch(() => null),
  ])

  const job = jobs[0]
  if (!job) return null

  return {
    id: job.id ?? jobId,
    retries: typeof job.retries === "number" ? job.retries : 0,
    exceptionMessage: job.exceptionMessage ?? null,
    stacktrace: rawStacktrace,
    dueDate: job.dueDate ?? null,
  }
}

/**
 * Delegated incidents (sub-process failure propagated to the parent) have
 * null `configuration`/`incidentMessage`. The real failure data lives on
 * the root cause — fetch it and use it as the failure source. PRIMARY: it
 * decides which job (and message) the view shows, so a failed read is a tool
 * error, never "this incident has no job".
 */
async function fetchRootCauseIncident(
  client: Client,
  rawIncident: RawIncident,
): Promise<RawIncident | null> {
  const rootId = rawIncident.rootCauseIncidentId
  return rootId && rootId !== rawIncident.id
    ? await getIncident({ client, path: { id: rootId } })
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

/**
 * The incident's context. The instance it belongs to (state, tokens,
 * variables) and its job are PRIMARY — the tabs present them as facts, so a
 * failed read is a tool error, never "not suspended" or "no variables". The
 * diagram, the definition's name and the history total are enrichment (null).
 */
function fetchIncidentContext(client: Client, incident: IncidentRecord): Promise<IncidentContext> {
  const { processInstanceId, processDefinitionId, jobId } = incident
  return Promise.all([
    processInstanceId
      ? (getProcessInstance({
          client,
          path: { id: processInstanceId },
        }) as Promise<RawProcessInstance>)
      : Promise.resolve(null),
    processInstanceId
      ? (getActivityInstanceTree({ client, path: { id: processInstanceId } }) as Promise<unknown>)
      : Promise.resolve(null),
    processInstanceId
      ? (readProcessInstanceVariables(client, processInstanceId) as Promise<unknown>)
      : Promise.resolve({}),
    processDefinitionId
      ? (optional(
          getProcessDefinitionBpmn20Xml({ client, path: { id: processDefinitionId } }),
        ) as Promise<{
          bpmn20Xml?: string
        } | null>)
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
    recovery: incident.recovery,

    instance: toInstanceSummary(rawInstance, incident),
    activityTree: activityTree as ActivityTree | null,
    variables: variables as Record<string, VariableValue>,

    historyTotalCount: typeof historyCount?.count === "number" ? historyCount.count : null,
  }
}
