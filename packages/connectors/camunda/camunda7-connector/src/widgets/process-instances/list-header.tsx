import {
  HandOffButton,
  LivePill,
  WidgetHeader,
  formatNumber,
} from "@miragon-ai/widget-shell/widgets"
import { useHandOff, type HandOff } from "../lib/hand-off.js"
import { useT } from "../../messages/use-t.js"
import { instancesFilterFacts, type InstancesListFilters } from "./hand-offs.js"

/**
 * Triage of the running instances — of one definition (scoped list) or of the
 * whole engine. The count is the filtered set's, stated with its filters. The
 * process name is the deployer's text and the business-key filter the
 * operator's — both quoted.
 */
export function triageInstancesHandOff({
  scopedKey,
  processName,
  total,
  engine,
  filters,
}: {
  scopedKey: string | null
  processName: string | null
  total: number
  engine: string | undefined
  filters: InstancesListFilters
}): HandOff {
  const facts = { matchingInstances: total, ...instancesFilterFacts(filters) }
  const businessKeyLike = { label: "businessKeyLike", text: filters.businessKeyLike }
  return scopedKey
    ? {
        intent: "askAi.instances.triageProcess",
        ids: { engine, processDefinitionKey: scopedKey },
        facts,
        untrusted: [{ label: "processName", text: processName }, businessKeyLike],
        tools: [
          "camunda7_list_incidents",
          "camunda7_query_historic_incidents",
          "camunda7_query_historic_activity_instances",
        ],
      }
    : {
        intent: "askAi.instances.triageEngine",
        ids: { engine },
        facts,
        untrusted: [businessKeyLike],
        tools: ["camunda7_list_incidents", "camunda7_query_historic_incidents"],
      }
}

export function InstancesHeader({
  title,
  processName,
  scopedKey,
  total,
  engine,
  filters,
}: {
  title: string
  /** The definition's name — null when it has none (or the list is engine-wide). */
  processName: string | null
  /** The list's definition scope — null in the engine-wide list. */
  scopedKey: string | null
  total: number
  /** The engine the list was fetched from — undefined when the default routed it. */
  engine: string | undefined
  /** The filters `total` covers. */
  filters: InstancesListFilters
}) {
  const t = useT()
  const { ask } = useHandOff()
  return (
    <WidgetHeader
      title={title}
      sub={
        <>
          <LivePill tone="info">
            {t("processInstances.runningCount", { count: formatNumber(total) })}
          </LivePill>
          {scopedKey && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-xs">{scopedKey}</span>
            </>
          )}
        </>
      }
      actions={
        <HandOffButton
          action="assess"
          variant="primary"
          prompt={ask(triageInstancesHandOff({ scopedKey, processName, total, engine, filters }))}
        />
      }
    />
  )
}
