import { Alert, AlertDescription, Badge } from "@miragon/mcp-toolkit-ui"
import {
  AskAiButton,
  DrillButton,
  KpiGrid,
  WidgetHeader,
  WidgetShell,
} from "@miragon-ai/widget-shell/widgets"
import { ModelContext } from "mcp-use/react"
import type { ClusterDetailData } from "../view-models.js"
import { useNav } from "./navigation.js"
import { CAMUNDA7_CLUSTER_DETAIL_DATA } from "../tool-names.js"
import { useViewData } from "./use-view-data.js"
import { remediatePrompt } from "./remediation.js"

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

/**
 * Grounding line: the agent knows exactly which failure cluster the operator
 * is inspecting, so "fix this" or "why?" needs no restating of scope.
 */
function describeCluster(data: ClusterDetailData): string {
  return (
    `The operator is inspecting ONE failure cluster on engine "${data.engineId}": activity ` +
    `"${data.activityId}" failing as ${data.incidentType} — ${data.incidentCount} incidents ` +
    `(${data.lastHourCount} in the last hour, ${data.last24hCount} in 24h), first seen ` +
    `${data.firstSeen ?? "unknown"}, latest ${data.latestIncident ?? "unknown"}, across process ` +
    `definition(s) ${data.processDefinitionKeys.join(", ") || "unknown"}. Sample message: ` +
    `${data.representativeMessage ?? "(none)"}. The list shows the affected instances with their ` +
    `business keys. Use camunda7_list_incidents / camunda7_get_process_instance to go deeper; ` +
    `propose remediation only scoped to this cluster and never execute without confirmation.`
  )
}

/**
 * Drill-in for ONE failure cluster — the middle layer between the engine
 * overview's cluster list and the single-incident detail. Shows the affected
 * instances business-key-first (the operator's "order number"), the full
 * sample message, and the time profile; remediation stays a guarded handoff
 * to the agent (same prompt as the overview's "Fix").
 */
export function ClusterDetailView({
  data: initialData = null,
  engine,
  activityId,
  incidentType,
  messageSignature,
}: {
  data?: ClusterDetailData | null
  engine?: string
  activityId?: string
  incidentType?: string
  messageSignature?: string
}) {
  const go = useNav()
  // Unlike the engine-health feed, this feed REQUIRES the cluster identity —
  // gate the self-fetch on it (the show tool path passes data instead).
  const ready = !!(activityId && incidentType)
  const { data, loading, error } = useViewData<ClusterDetailData>(
    initialData,
    [
      "camunda7:cluster-detail",
      engine ?? null,
      activityId ?? null,
      incidentType ?? null,
      messageSignature ?? null,
    ],
    CAMUNDA7_CLUSTER_DETAIL_DATA,
    { engine, activityId, incidentType, messageSignature },
    ready,
  )

  if (!data) {
    if (error) {
      return (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )
    }
    return (
      <div className="text-muted-foreground p-2 text-sm">
        {loading ? "Loading…" : "No data available"}
      </div>
    )
  }

  const engineId = engine ?? data.engineId

  return (
    <>
      <ModelContext content={describeCluster(data)} />
      <WidgetHeader
        icon="⚠"
        iconTone="critical"
        title={data.activityId}
        sub={
          <span>
            <Badge variant="secondary">{data.incidentType}</Badge>
            <span className="ml-2">
              {data.incidentCount} affected · across{" "}
              {data.processDefinitionKeys.join(", ") || "(unknown)"}
            </span>
          </span>
        }
        actions={
          <AskAiButton
            variant="primary"
            label="Fix"
            prompt={remediatePrompt(
              {
                activityId: data.activityId,
                incidentType: data.incidentType,
                incidentCount: data.incidentCount,
                last24hCount: data.last24hCount,
                processDefinitionKeys: data.processDefinitionKeys,
                representativeMessage: data.representativeMessage,
              },
              engineId,
            )}
          />
        }
      />

      <KpiGrid
        boxed
        cells={[
          { label: "Affected", value: data.incidentCount, tone: "critical" },
          {
            label: "New in last hour",
            value: data.lastHourCount,
            tone: data.lastHourCount > 0 ? "critical" : undefined,
          },
          {
            label: "New in 24h",
            value: data.last24hCount,
            tone: data.last24hCount > 0 ? "warning" : undefined,
          },
          { label: "First seen", value: formatTimestamp(data.firstSeen) },
        ]}
      />

      {data.representativeMessage && (
        <details className="text-sm" open={data.representativeMessage.length <= 160}>
          <summary className="text-muted-foreground cursor-pointer font-medium">
            Failure message
          </summary>
          <pre className="bg-muted mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded p-2 text-xs">
            {data.representativeMessage}
          </pre>
        </details>
      )}

      <section aria-label="Affected instances" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          Affected instances
          {data.totalMatching > data.incidents.length
            ? ` (showing ${data.incidents.length} of ${data.totalMatching})`
            : ""}
        </h3>
        {data.incidents.map((row) => (
          <div
            key={row.incidentId || row.processInstanceId}
            className="border-border flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0">
              {/* Business key first — the operator's order number, not an engine UUID. */}
              <p className="truncate text-sm font-medium">
                {row.businessKey ?? `Instance ${row.processInstanceId.slice(0, 8)}…`}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {row.processDefinitionKey} · {formatTimestamp(row.incidentTimestamp)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <DrillButton
                onDrill={() =>
                  go({ type: "instance-detail", processInstanceId: row.processInstanceId })
                }
                ariaLabel={`Open instance ${row.businessKey ?? row.processInstanceId}`}
              >
                Instance
              </DrillButton>
              <DrillButton
                onDrill={() => go({ type: "incident-detail", incidentId: row.incidentId })}
                ariaLabel={`Open incident detail for ${row.businessKey ?? row.processInstanceId}`}
              >
                Incident
              </DrillButton>
            </div>
          </div>
        ))}
        {data.incidents.length === 0 && (
          <p className="text-muted-foreground py-2 text-sm">
            No matching incidents — the cluster may have been resolved in the meantime.
          </p>
        )}
      </section>
    </>
  )
}

export function ClusterDetailWidget({
  data,
  engine,
  activityId,
  incidentType,
  messageSignature,
}: {
  data: ClusterDetailData | null
  engine?: string
  activityId?: string
  incidentType?: string
  messageSignature?: string
}) {
  return (
    <WidgetShell>
      <ClusterDetailView
        data={data}
        engine={engine}
        activityId={activityId}
        incidentType={incidentType}
        messageSignature={messageSignature}
      />
    </WidgetShell>
  )
}
