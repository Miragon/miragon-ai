import { useMemo, useState } from "react"
import { HostModelContext } from "@miragon/mcp-toolkit-ui/app"
import { Alert, AlertDescription, useToolMutation } from "@miragon/mcp-toolkit-ui"
import {
  SectionHeading,
  truncate,
  useDetailView,
  useResetOnChange,
} from "@miragon-ai/widget-shell/widgets"

import type { IncidentDetailData } from "../view-models.js"

import { CAMUNDA7_INCIDENT_DETAIL_DATA } from "../tool-names.js"
import { BpmnDiagram, type BpmnHighlight } from "./bpmn-diagram.js"
import { ConfirmDialog } from "./confirm-dialog.js"
import { DetailPage } from "./detail-page.js"
import { FailureTab } from "./incident-detail/failure-tab.js"
import { IncidentDetailHeader } from "./incident-detail/header.js"
import { InstanceTab } from "./incident-detail/instance-tab.js"
import { IncidentKpis } from "./incident-detail/kpis.js"
import { refreshCockpitData } from "./refresh.js"
import { PagedHistoryView } from "./history-timeline.js"
import { useT } from "../messages/use-t.js"

export type { IncidentDetailData }

function modelSummary(data: IncidentDetailData, resolved: boolean): string {
  const incidentMessage = data.incidentMessage ?? data.job?.exceptionMessage
  return [
    `Viewing CIB Seven incident ${data.incidentId} (type ${data.incidentType}` +
      `${resolved ? ", marked resolved in this session" : ""}) at activity ` +
      `${data.activityName ?? data.activityId} (${data.activityId}) on process instance ` +
      `${data.processInstanceId} of ${data.processDefinitionName ?? data.processDefinitionKey}` +
      `${data.processDefinitionVersion !== null ? ` v${data.processDefinitionVersion}` : ""}, ` +
      `engine ${data.engineId ?? "default"}.`,
    `Message: ${incidentMessage ? `"${truncate(incidentMessage, 160)}"` : "(none reported)"}.`,
    `Act via camunda7_resolve_incident / camunda7_set_job_retries` +
      `${data.job ? ` (job ${data.job.id}, ${data.job.retries} retries left)` : ""}; ` +
      `full instance context via camunda7_show_instance_detail.`,
  ].join(" ")
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
  const retryMutation = useToolMutation("camunda7_set_job_retries")
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

  const highlights = useMemo<BpmnHighlight[]>(
    () => [{ kind: "incident", activityIds: data ? [data.activityId] : [] }],
    [data?.activityId],
  )

  if (!data) return guard

  // Mutations must target the exact engine this incident was fetched from (the
  // prop in the cockpit, the server-resolved id standalone) — never the session
  // default, which can differ if the sticky select raced or failed.
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
    if (!data?.job) return
    retryMutation.mutate(
      { jobId: data.job.id, retries: 1, engine: engineId },
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
              onResolve={() => {
                resolveMutation.reset()
                setConfirmResolve(true)
              }}
              resolving={resolveMutation.isPending}
              onRetry={handleRetry}
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
      <HostModelContext content={modelSummary(data, resolved)}>{null}</HostModelContext>

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
