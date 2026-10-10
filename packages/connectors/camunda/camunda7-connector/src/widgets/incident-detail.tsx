import { useMemo } from "react"
import { HostModelContext } from "@miragon/mcp-toolkit-ui/app"
import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import { SectionHeading, useDetailView } from "@miragon-ai/widget-shell/widgets"

import type { IncidentDetailData, IncidentRecovery } from "../view-models.js"

import { CAMUNDA7_INCIDENT_DETAIL_DATA } from "../tool-names.js"
import { BpmnDiagram, type BpmnHighlight } from "./bpmn-diagram.js"
import { DetailPage } from "./detail-page.js"
import { FailureTab } from "./incident-detail/failure-tab.js"
import { recoveryOf } from "./lib/incident-recovery.js"
import { IncidentDetailHeader } from "./incident-detail/header.js"
import { InstanceTab } from "./incident-detail/instance-tab.js"
import { IncidentKpis } from "./incident-detail/kpis.js"
import { EngineActionDialog } from "./lib/engine-action-dialog.js"
import {
  useIncidentRecovery,
  type IncidentRecoveryState,
  type RecoverableIncident,
} from "./process-incidents/use-incident-recovery.js"
import { scopingDefinitionKey, useHandOff, type ViewContext } from "./lib/hand-off.js"
import { PagedHistoryView } from "./history-timeline.js"
import { useT } from "../messages/use-t.js"

export type { IncidentDetailData }

/** The detail's recovery — an old stored payload falls back to its type and job. */
function detailRecovery(data: IncidentDetailData): IncidentRecovery {
  return recoveryOf(data, data.job?.id)
}

/**
 * The retry tool that clears this incident (built-in types refuse resolve),
 * or null for a custom or propagated one — from the feed's `recovery`.
 */
function retryToolFor(data: IncidentDetailData) {
  const { action } = detailRecovery(data)
  if (action === "retry-job") return "camunda7_set_job_retries" as const
  if (action === "retry-external-task") return "camunda7_set_external_task_retries" as const
  return null
}

/** The incident as the shared recovery reads it — with the feed's (or the old payload's) remedy. */
function recoverable(data: IncidentDetailData): RecoverableIncident {
  return {
    id: data.incidentId,
    incidentType: data.incidentType,
    processInstanceId: data.processInstanceId,
    recovery: detailRecovery(data),
  }
}

/**
 * The incident feed's scope — in the cockpit from the props; standalone from
 * the handed-in data's echo, so a refetch reads the incident and engine the
 * show tool answered for (never the caller's default engine).
 */
function incidentFeed(
  initialData: IncidentDetailData | null,
  incidentId: string | undefined,
  engine: string | undefined,
) {
  const id = incidentId ?? initialData?.incidentId
  const feedEngine = engine ?? initialData?.engineId
  return {
    key: ["camunda7:incident-detail", feedEngine ?? null, id ?? null],
    args: { incidentId: id, engine: feedEngine },
    ready: !!id,
  }
}

/** The failure tab's remedy controls: the one write that clears THIS incident, and its state. */
function remedyProps(recovery: IncidentRecoveryState, incident: RecoverableIncident) {
  const remedy = recovery.actionFor(incident)
  const act = () => recovery.act(incident)
  const pending = recovery.isPending(incident)
  const cleared = recovery.isDone(incident)
  const resolves = incident.recovery?.action === "resolve"
  return {
    resolved: cleared && resolves,
    retried: cleared && !resolves,
    onResolve: remedy === "resolve" ? act : undefined,
    resolving: remedy === "resolve" && pending,
    onRetry: remedy === "retry" ? act : undefined,
    retrying: remedy === "retry" && pending,
    retryError: remedy === "retry" ? recovery.errorOf(incident) : null,
  }
}

/** The writes that clear an incident — only the one that fits its type is ever named. */
const REMEDY_TOOLS = new Set<string>([
  "camunda7_resolve_incident",
  "camunda7_set_job_retries",
  "camunda7_set_external_task_retries",
])

/**
 * The incident the operator is looking at. Only the remedy that clears THIS
 * incident is named (the engine refuses to resolve the built-in types), none
 * once it was cleared in this session — and the surface keeps it only where
 * the deployment registers it. The ticket draft takes the `incidentId` on
 * every toolset, the read-only floor included. Engine text is quoted, never
 * inlined.
 */
export function describeIncident(data: IncidentDetailData, resolved: boolean): ViewContext {
  const remedy = resolved
    ? null
    : detailRecovery(data).action === "resolve"
      ? "camunda7_resolve_incident"
      : retryToolFor(data)
  // A key parsed from a bare definition id is that id — stated as what it is.
  const key = scopingDefinitionKey(data.processDefinitionKey, data.processDefinitionId)
  return {
    summary: "The operator is viewing one incident.",
    ids: {
      engine: data.engineId,
      incidentId: data.incidentId,
      processInstanceId: data.processInstanceId,
      jobId: data.job?.id,
    },
    facts: {
      incidentType: data.incidentType,
      processDefinitionKey: key,
      processDefinitionId: key ? undefined : data.processDefinitionId || undefined,
      activityId: data.activityId,
      version: data.processDefinitionVersion,
      retriesLeft: data.job?.retries,
      clearedInThisSession: resolved || undefined,
    },
    untrusted: [
      { label: "incidentMessage", text: data.incidentMessage ?? data.job?.exceptionMessage },
      { label: "activityName", text: data.activityName },
      { label: "processName", text: data.processDefinitionName },
    ],
    tools: [
      "camunda7_show_instance_detail",
      "camunda7_get_job_stacktrace",
      "camunda7_format_incident_issue",
      "camunda7_resolve_incident",
      "camunda7_set_job_retries",
      "camunda7_set_external_task_retries",
    ].filter((tool) => !REMEDY_TOOLS.has(tool) || tool === remedy),
  }
}

function IncidentModelContext({ data, resolved }: { data: IncidentDetailData; resolved: boolean }) {
  const { context } = useHandOff()
  return (
    <HostModelContext content={context(describeIncident(data, resolved))}>{null}</HostModelContext>
  )
}

export function IncidentDetailWidget({
  data: initialData = null,
  incidentId,
  engine,
}: {
  data?: IncidentDetailData | null
  incidentId?: string
  engine?: string
}) {
  const t = useT()
  const { data, guard, notice } = useDetailView<IncidentDetailData>({
    initialData,
    ...incidentFeed(initialData, incidentId, engine),
    tool: CAMUNDA7_INCIDENT_DETAIL_DATA,
    loadingText: t("incidentDetail.loading"),
    emptyText: t("incidentDetail.noData"),
    retryText: t("viewState.retry"),
    refreshErrorText: (message) => t("viewState.refreshError", { message }),
  })
  // Mutations must target the exact engine this incident was fetched from (the
  // prop in the cockpit, the server-resolved id standalone) — never the caller's
  // default engine, which can differ if the default-engine save raced or failed.
  const engineId = engine ?? data?.engineId
  // The remedy's success marks only bridge the gap until the feed refetches —
  // fresh server data must win again. A cleared incident's own view is not
  // refetched (it would be a 404): the marks are what it shows.
  const recovery = useIncidentRecovery(engineId, data)

  const highlights = useMemo<BpmnHighlight[]>(
    () => [{ kind: "incident", activityIds: data ? [data.activityId] : [] }],
    [data?.activityId],
  )

  if (!data) return guard

  const remedy = remedyProps(recovery, recoverable(data))
  const { resolved, retried } = remedy

  return (
    <DetailPage
      header={
        <>
          {notice}
          <IncidentDetailHeader data={data} resolved={resolved} />
        </>
      }
      kpi={<IncidentKpis data={data} resolved={resolved} />}
      diagram={
        <section>
          <SectionHeading
            title={t("incidentDetail.processFlowTitle")}
            hint={t("incidentDetail.processFlowHint", { activity: data.activityId })}
          />
          {data.bpmnXml ? (
            <BpmnDiagram bpmnXml={data.bpmnXml} height={420} highlights={highlights} />
          ) : (
            <Alert>
              <AlertDescription>{t("incidentDetail.noBpmnDiagram")}</AlertDescription>
            </Alert>
          )}
        </section>
      }
      tabs={[
        {
          id: "failure",
          label: t("incidentDetail.tabFailure"),
          content: <FailureTab data={data} {...remedy} />,
        },
        {
          id: "instance",
          label: t("incidentDetail.tabInstance"),
          content: <InstanceTab data={data} engineId={engineId} />,
        },
        {
          id: "history",
          label: t("incidentDetail.tabHistory"),
          /* Mounted on first tab activation — pages the registrar history
             query itself instead of shipping capped rows in the payload. */
          content: (
            <PagedHistoryView
              processInstanceId={data.processInstanceId}
              engine={engineId}
              variant="table"
            />
          ),
        },
      ]}
      defaultTab="failure"
    >
      {/* Rendered in-component (not via the adapter's describeForModel) because
          this widget self-fetches in the cockpit, where the adapter has no data. */}
      <IncidentModelContext data={data} resolved={resolved || retried} />

      <EngineActionDialog action={recovery.resolve} />
    </DetailPage>
  )
}
