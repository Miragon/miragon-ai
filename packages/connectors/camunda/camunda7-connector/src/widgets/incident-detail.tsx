import { useMemo, useState } from "react"
import { HostModelContext } from "@miragon/mcp-toolkit-ui/app"
import { Alert, AlertDescription, useToolMutation } from "@miragon/mcp-toolkit-ui"
import { SectionHeading, useDetailView, useResetOnChange } from "@miragon-ai/widget-shell/widgets"

import type { IncidentDetailData, IncidentRecovery } from "../view-models.js"

import { CAMUNDA7_INCIDENT_DETAIL_DATA } from "../tool-names.js"
import { BpmnDiagram, type BpmnHighlight } from "./bpmn-diagram.js"
import { ConfirmDialog } from "./confirm-dialog.js"
import { DetailPage } from "./detail-page.js"
import { FailureTab } from "./incident-detail/failure-tab.js"
import { recoveryOf } from "./lib/incident-recovery.js"
import { IncidentDetailHeader } from "./incident-detail/header.js"
import { InstanceTab } from "./incident-detail/instance-tab.js"
import { IncidentKpis } from "./incident-detail/kpis.js"
import { refreshCockpitData } from "./refresh.js"
import { useCanRun } from "./widget-actions.js"
import { useHandOff, type ViewContext } from "./lib/hand-off.js"
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

/** The retries call that clears a built-in incident; null when it is resolved instead. */
function retryArgs(recovery: IncidentRecovery): Record<string, unknown> | null {
  if (recovery.action === "retry-job") return { jobId: recovery.jobId, retries: 1 }
  if (recovery.action === "retry-external-task") {
    return { externalTaskId: recovery.externalTaskId, retries: 1 }
  }
  return null
}

/**
 * Which remedy this deployment may offer for the incident: the engine refuses
 * to resolve its built-in types (failedJob, failedExternalTask), so those get
 * Retry through their retries tool and only custom incidents get Resolve.
 */
function useRemedies(data: IncidentDetailData | null) {
  const canRun = useCanRun()
  const jobRetryMutation = useToolMutation("camunda7_set_job_retries")
  const externalTaskRetryMutation = useToolMutation("camunda7_set_external_task_retries")
  const retryTool = data ? retryToolFor(data) : null
  return {
    canResolve:
      data !== null &&
      detailRecovery(data).action === "resolve" &&
      canRun("camunda7_resolve_incident"),
    canRetry: retryTool !== null && canRun(retryTool),
    retryMutation:
      retryTool === "camunda7_set_external_task_retries"
        ? externalTaskRetryMutation
        : jobRetryMutation,
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
 * the deployment registers it. Engine text is quoted, never inlined.
 */
export function describeIncident(data: IncidentDetailData, resolved: boolean): ViewContext {
  const remedy = resolved
    ? null
    : detailRecovery(data).action === "resolve"
      ? "camunda7_resolve_incident"
      : retryToolFor(data)
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
      processDefinitionKey: data.processDefinitionKey,
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
  const resolveMutation = useToolMutation("camunda7_resolve_incident")
  const [resolved, setResolved] = useState(false)
  const [retried, setRetried] = useState(false)
  const [confirmResolve, setConfirmResolve] = useState(false)
  const t = useT()
  const { data, guard } = useDetailView<IncidentDetailData>({
    initialData,
    key: ["camunda7:incident-detail", engine ?? null, incidentId ?? null],
    tool: CAMUNDA7_INCIDENT_DETAIL_DATA,
    args: { incidentId, engine },
    ready: !!incidentId,
    loadingText: t("incidentDetail.loading"),
    emptyText: t("incidentDetail.noData"),
  })
  // The optimistic resolved/retried flags only bridge the gap until the feed
  // refetches — fresh server data must win again.
  useResetOnChange(data, () => {
    setResolved(false)
    setRetried(false)
  })

  const { canResolve, canRetry, retryMutation } = useRemedies(data)

  const highlights = useMemo<BpmnHighlight[]>(
    () => [{ kind: "incident", activityIds: data ? [data.activityId] : [] }],
    [data?.activityId],
  )

  if (!data) return guard

  // Mutations must target the exact engine this incident was fetched from (the
  // prop in the cockpit, the server-resolved id standalone) — never the caller's
  // default engine, which can differ if the default-engine save raced or failed.
  const engineId = engine ?? data.engineId

  function handleResolve() {
    if (!data) return
    resolveMutation.mutate(
      { incidentId: data.incidentId, engine: engineId },
      {
        onSuccess: () => {
          setResolved(true)
          setConfirmResolve(false)
          // Refetch the feed so the widget (and cockpit siblings) show the
          // post-resolve server state instead of only the optimistic flag.
          refreshCockpitData()
        },
      },
    )
  }

  function handleRetry() {
    const args = data ? retryArgs(detailRecovery(data)) : null
    if (!args) return
    retryMutation.mutate(
      { ...args, engine: engineId },
      {
        onSuccess: () => {
          setRetried(true)
          refreshCockpitData()
        },
      },
    )
  }

  return (
    <DetailPage
      header={<IncidentDetailHeader data={data} resolved={resolved} />}
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
          content: (
            <FailureTab
              data={data}
              resolved={resolved}
              onResolve={
                canResolve
                  ? () => {
                      resolveMutation.reset()
                      setConfirmResolve(true)
                    }
                  : undefined
              }
              resolving={resolveMutation.isPending}
              onRetry={canRetry ? handleRetry : undefined}
              retrying={retryMutation.isPending}
              retried={retried}
              retryError={retryMutation.error?.message ?? null}
            />
          ),
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

      <ConfirmDialog
        open={confirmResolve}
        onOpenChange={setConfirmResolve}
        title={t("incidentDetail.confirmResolveTitle")}
        description={t("incidentDetail.confirmResolveDescription")}
        confirmLabel={t("incidentFailure.resolveButton")}
        cancelLabel={t("confirmDialog.cancel")}
        pendingLabel={t("confirmDialog.working")}
        pending={resolveMutation.isPending}
        error={resolveMutation.error?.message ?? null}
        onConfirm={handleResolve}
      />
    </DetailPage>
  )
}
