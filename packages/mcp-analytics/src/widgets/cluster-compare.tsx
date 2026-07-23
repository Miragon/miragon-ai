import { Badge } from "@miragon/mcp-toolkit-ui"
import type { ClusterCompareResult } from "@miragon-ai/client-analytics"
import { AskAiButton, formatTimestamp } from "@miragon-ai/widget-shell/widgets"
import { useT } from "../messages/use-t.js"
import {
  ComparisonCard,
  ComparisonEmptyState,
  buildComparisonMetrics,
  describeDeltas,
} from "./comparison-shared.js"

export type ClusterCompareData = ClusterCompareResult | null

export function ClusterCompareWidget({ data }: { data: ClusterCompareData }) {
  const t = useT()
  if (!data) return <ComparisonEmptyState>{t("aClusterCompare.noData")}</ComparisonEmptyState>

  const before = data.kpis.find((k) => k.period === "before")
  const after = data.kpis.find((k) => k.period === "after")
  if (!before || !after) {
    return <ComparisonEmptyState>{t("aClusterCompare.incompleteData")}</ComparisonEmptyState>
  }

  const metrics = buildComparisonMetrics(t, before, after, data.delta)

  const processScope = data.processDefinitionKey
    ? `, scoped to process ${data.processDefinitionKey}`
    : ""
  const elementScope = data.elementId ? `, scoped to BPMN element ${data.elementId}` : ""
  const interpretPrompt = `Interpret the pre/post deployment comparison around ${data.deploymentTimestamp} (-${data.windowDays.before}d baseline vs +${data.windowDays.after}d after)${processScope}${elementScope}. The on-screen deltas are: ${describeDeltas(data.delta)}. First call analytics_cluster_compare(deploymentTimestamp="${data.deploymentTimestamp}", windowBeforeDays=${data.windowDays.before}, windowAfterDays=${data.windowDays.after}${data.processDefinitionKey ? `, processDefinitionKey="${data.processDefinitionKey}"` : ""}) to confirm the numbers and the 'suppressed' flag, then call analytics_element_bottleneck to find which activity drives any regression. Tell me in 3-4 sentences: did the deployment cause a genuine regression or is it noise / low sample size, which metric (and element, if any) is responsible, and the single recommended next action (roll back the deployment, hold further rollouts, or accept).`

  return (
    <ComparisonCard
      title={t("aClusterCompare.title")}
      tableLabel={t("aClusterCompare.tableLabel")}
      beforeLabel={t("aClusterCompare.beforeLabel")}
      afterLabel={t("aClusterCompare.afterLabel")}
      metrics={metrics}
      actions={<AskAiButton prompt={interpretPrompt} variant="primary" />}
      badges={
        <>
          <Badge variant="secondary">
            {t("aClusterCompare.deployBadge", {
              timestamp: formatTimestamp(data.deploymentTimestamp),
            })}
          </Badge>
          <Badge variant="outline">
            {t("aClusterCompare.windowBadge", {
              before: data.windowDays.before,
              after: data.windowDays.after,
            })}
          </Badge>
          {data.processDefinitionKey && <Badge>{data.processDefinitionKey}</Badge>}
          {data.elementId && (
            <Badge variant="outline">
              {t("aClusterCompare.elementBadge", { elementId: data.elementId })}
            </Badge>
          )}
          {data.suppressed && (
            <Badge variant="destructive">
              {t("aClusterCompare.insufficientSignal", { minBucketSize: data.minBucketSize })}
            </Badge>
          )}
        </>
      }
    />
  )
}
