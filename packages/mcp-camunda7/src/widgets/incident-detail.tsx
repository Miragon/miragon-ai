import { useEffect, useMemo, useState } from "react"
import { ModelContext } from "mcp-use/react"
import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  useToolMutation,
} from "@miragon/mcp-toolkit-ui"
import {
  AskAiButton,
  KpiGrid,
  OpenInCockpitLink,
  SectionHeading,
  StatusBadge,
  VersionChip,
  WidgetHeader,
  formatDate,
  formatTime,
  truncate,
  useDetailView,
} from "@miragon-ai/widget-shell/widgets"

import type { IncidentDetailData } from "../view-models.js"

import { CAMUNDA7_INCIDENT_DETAIL_DATA } from "../tool-names.js"
import { BpmnDiagram, type BpmnHighlight } from "./bpmn-diagram.js"
import { ConfirmDialog } from "./confirm-dialog.js"
import { DetailPage } from "./detail-page.js"
import { ActivityNode, VariablesTable } from "./instance-sections.js"
import { FailureTab } from "./incident-detail/failure-tab.js"
import { refreshCockpitData } from "./refresh.js"
import { HistoryTimelineView } from "./history-timeline.js"
import { fenceUntrusted } from "./lib/untrusted.js"
import { useT } from "../messages/use-t.js"

export type { IncidentDetailData }

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
  useEffect(() => {
    setResolved(false)
    setRetried(false)
  }, [data])

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

  const title = data.activityName ?? data.activityId
  const cockpitInstanceUrl = data.cockpitInstanceUrl

  const incidentMessage = data.incidentMessage ?? data.job?.exceptionMessage

  return (
    <DetailPage
      header={
        <WidgetHeader
          size="detail"
          badge={
            <div className="flex items-center gap-3">
              <div className="bg-critical-soft text-critical grid size-11 place-items-center rounded-xl text-xl">
                ⚠
              </div>
              <StatusBadge tone={resolved ? "neutral" : "critical"}>
                {resolved ? t("incidentDetail.resolved") : data.incidentType}
              </StatusBadge>
            </div>
          }
          title={title}
          sub={
            <>
              <span>
                {data.processDefinitionName ?? data.processDefinitionKey}
                {data.processDefinitionVersion !== null && (
                  <VersionChip version={data.processDefinitionVersion} />
                )}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-xs">{data.processInstanceId}</span>
              {data.businessKey && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span>
                    {t("incidentDetail.businessKeyLabel")} {data.businessKey}
                  </span>
                </>
              )}
              {cockpitInstanceUrl && (
                <OpenInCockpitLink
                  url={cockpitInstanceUrl}
                  label={t("incidentDetail.openInstanceInCockpit")}
                />
              )}
            </>
          }
          actions={
            <AskAiButton
              variant="primary"
              prompt={`Diagnose CIB Seven incident \`${data.incidentId}\` (type \`${data.incidentType}\`) at activity ${data.activityName ?? data.activityId} (\`${data.activityId}\`) on process instance ${data.processInstanceId} of ${data.processDefinitionName ?? data.processDefinitionKey}${data.processDefinitionVersion !== null ? ` v${data.processDefinitionVersion}` : ""} (definition \`${data.processDefinitionId}\`${data.businessKey ? `, business key ${data.businessKey}` : ""}), engine \`${data.engineId ?? "default"}\`. Error: ${fenceUntrusted(data.incidentMessage ?? data.job?.exceptionMessage)}. Use camunda7_instance_detail_data and camunda7_get_process_instance_variables for context, read the stacktrace${data.job ? ` on job ${data.job.id}` : ""}, and use camunda7_list_incidents + camunda7_query_historic_activity_instances to check whether other instances of \`${data.processDefinitionKey}\` fail the same way at ${data.activityId}. Then state: (1) the most likely root cause, (2) whether a plain retry will succeed or just re-fail, and (3) the concrete recommended fix (retry, variable correction, instance modification, or escalation).`}
            />
          }
        />
      }
      kpi={
        <KpiGrid
          boxed
          header={{
            label: t("incidentDetail.kpiHeaderLabel"),
            badge: t("incidentDetail.kpiHeaderBadge"),
          }}
          cells={[
            {
              label: t("incidentDetail.kpiType"),
              value: data.incidentType,
              tone: resolved ? "success" : "critical",
            },
            {
              label: t("incidentDetail.kpiRetriesLeft"),
              value: data.job?.retries ?? "—",
              tone:
                data.job && data.job.retries > 0 ? "success" : data.job ? "critical" : undefined,
            },
            {
              label: t("incidentDetail.kpiDate"),
              value: formatDate(data.incidentTimestamp),
            },
            {
              label: t("incidentDetail.kpiTime"),
              value: formatTime(data.incidentTimestamp),
            },
            {
              label: t("incidentDetail.kpiHistoryEvents"),
              value: data.history.length,
            },
          ]}
        />
      }
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
          content: (
            <div className="flex flex-col gap-4">
              {data.activityTree && (
                <div>
                  <SectionHeading title={t("incidentDetail.activityTreeTitle")} />
                  <Card className="gap-0 py-0 shadow-none">
                    <CardContent className="p-3">
                      <ActivityNode node={data.activityTree} />
                    </CardContent>
                  </Card>
                </div>
              )}
              <div>
                <SectionHeading
                  title={t("incidentDetail.variablesTitle")}
                  hint={t("incidentDetail.variablesHint", {
                    count: Object.keys(data.variables).length,
                  })}
                />
                <VariablesTable
                  variables={data.variables}
                  instanceId={data.processInstanceId}
                  engine={engineId}
                  readOnly={data.instance.ended}
                />
              </div>
            </div>
          ),
        },
        {
          id: "history",
          label: t("incidentDetail.tabHistory"),
          content: <HistoryTimelineView variant="table" activities={data.history} />,
        },
      ]}
      defaultTab="failure"
    >
      {/* Rendered in-component (not via the adapter's describeForModel) because
          this widget self-fetches in the cockpit, where the adapter has no data. */}
      <ModelContext
        content={[
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
        ].join(" ")}
      />

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
