import type { Client } from "@miragon-ai/camunda7-client"
import { MAX_PAGE_SIZE } from "@miragon-ai/camunda7-client/schemas"
import {
  getHistoricActivityInstances,
  getHistoricActivityInstancesCount,
  getHistoricProcessInstances,
} from "@miragon-ai/camunda7-client/sdk"
import type { HistoryTimelineData } from "../view-models.js"
import type { PagingArgs } from "../feed-contracts.js"
import { countOf, rowsOf } from "./engine-reads.js"

/**
 * One capped page of an instance's activity history, with the exact total
 * from `/history/activity-instance/count` (the widget pages the rest). THE
 * builder behind `camunda7_show_history_timeline` and the
 * `camunda7:load-history-timeline` step. All three reads are primary: a
 * failed count is a tool error, never the page length passed off as a total.
 */
export async function buildHistoryTimelineData(
  client: Client,
  engineId: string,
  args: { processInstanceId: string } & PagingArgs,
): Promise<HistoryTimelineData> {
  const { processInstanceId } = args
  const [activities, totalActivities, instances] = await Promise.all([
    getHistoricActivityInstances({
      client,
      query: {
        processInstanceId,
        sortBy: "startTime",
        sortOrder: "asc",
        firstResult: args.firstResult,
        maxResults: args.maxResults ?? MAX_PAGE_SIZE,
      },
    }).then((rows) => rowsOf<HistoryTimelineData["activities"][number]>(rows)),
    getHistoricActivityInstancesCount({ client, query: { processInstanceId } }).then(countOf),
    getHistoricProcessInstances({ client, query: { processInstanceId, maxResults: 1 } }).then(
      (rows) => rowsOf<NonNullable<HistoryTimelineData["processInstance"]>>(rows),
    ),
  ])
  return {
    processInstance: instances[0] ?? null,
    activities,
    totalActivities,
    engineId,
  }
}
