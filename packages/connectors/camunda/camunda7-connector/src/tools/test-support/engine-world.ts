/**
 * A small, deterministic engine for the fake engine (`fake-engine.ts`): one
 * process key (`order`, versions 1 and 2), one running instance (`pi-1` on
 * v1, a token at `charge`), one open incident with its failed job. Every
 * builder renders successfully against it, so a test can break exactly ONE
 * route (`withFailure`) and watch what the builder does with it.
 */
import type { FakeReply, RecordedRequest } from "./fake-engine.js"

export const WORLD = {
  key: "order",
  latestDefinitionId: "order:2:d2",
  instanceDefinitionId: "order:1:d1",
  instanceId: "pi-1",
  incidentId: "inc-1",
  jobId: "job-1",
  activityId: "charge",
} as const

export const WORLD_XML =
  '<?xml version="1.0"?><definitions><process id="order"><serviceTask id="charge" name="Charge card"/></process></definitions>'

const definition = (version: 1 | 2) => ({
  id: `order:${version}:d${version}`,
  key: WORLD.key,
  name: "Order",
  version,
})

const incident = {
  id: WORLD.incidentId,
  processDefinitionId: WORLD.instanceDefinitionId,
  processInstanceId: WORLD.instanceId,
  executionId: WORLD.instanceId,
  activityId: WORLD.activityId,
  failedActivityId: WORLD.activityId,
  incidentType: "failedJob",
  incidentMessage: "card declined",
  incidentTimestamp: "2026-10-10T08:00:00.000+0200",
  configuration: WORLD.jobId,
}

const ROUTES: Record<string, unknown> = {
  "/process-definition": [definition(2)],
  [`/process-definition/key/${WORLD.key}`]: definition(2),
  [`/process-definition/key/${WORLD.key}/xml`]: { id: definition(2).id, bpmn20Xml: WORLD_XML },
  "/process-definition/statistics": [1, 2].map((v) => ({
    id: definition(v as 1 | 2).id,
    instances: v,
    failedJobs: v === 1 ? 1 : 0,
    incidents: v === 1 ? [{ incidentType: "failedJob", incidentCount: 1 }] : [],
    definition: definition(v as 1 | 2),
  })),
  [`/process-instance/${WORLD.instanceId}`]: {
    id: WORLD.instanceId,
    definitionId: WORLD.instanceDefinitionId,
    businessKey: "B-1",
    suspended: false,
    ended: false,
  },
  [`/process-instance/${WORLD.instanceId}/activity-instances`]: {
    id: WORLD.instanceId,
    activityId: WORLD.key,
    childActivityInstances: [
      {
        id: "ai-1",
        activityId: WORLD.activityId,
        childActivityInstances: [],
        childTransitionInstances: [],
      },
    ],
    childTransitionInstances: [],
  },
  [`/process-instance/${WORLD.instanceId}/variables`]: {
    amount: { type: "Integer", value: 3, valueInfo: {} },
  },
  "/process-instance": [
    {
      id: WORLD.instanceId,
      definitionId: WORLD.instanceDefinitionId,
      businessKey: "B-1",
      suspended: false,
    },
  ],
  "/incident": [incident],
  [`/incident/${WORLD.incidentId}`]: incident,
  "/job": [
    {
      id: WORLD.jobId,
      processInstanceId: WORLD.instanceId,
      processDefinitionId: WORLD.instanceDefinitionId,
      processDefinitionKey: WORLD.key,
      failedActivityId: WORLD.activityId,
      retries: 0,
      exceptionMessage: "card declined",
      suspended: false,
      priority: 0,
    },
  ],
  "/history/process-instance": [{ id: WORLD.instanceId, processDefinitionKey: WORLD.key }],
  "/history/activity-instance": [{ id: "h-1", activityId: "start", activityType: "startEvent" }],
}

/** A definition's diagram, by id. */
const XML_BY_ID = /^\/process-definition\/(order:\d:d\d)\/xml$/
/** A definition, by id. */
const DEFINITION_BY_ID = /^\/process-definition\/order:(\d):d\d$/
/** A version's activity statistics. */
const ACTIVITY_STATS = /^\/process-definition\/order:(\d):d\d\/statistics$/

/** The healthy engine's reply to `request`. Unmapped lists answer `[]`, counts `{count: 1}`. */
export function worldReply(request: RecordedRequest): FakeReply {
  const { path } = request
  if (path.endsWith("/count")) return { body: { count: 1 } }
  if (path in ROUTES) return { body: ROUTES[path] }
  const xml = XML_BY_ID.exec(path)
  if (xml) return { body: { id: xml[1], bpmn20Xml: WORLD_XML } }
  const stats = ACTIVITY_STATS.exec(path)
  if (stats) {
    const v1 = stats[1] === "1"
    return {
      body: [
        {
          id: WORLD.activityId,
          instances: 1,
          failedJobs: v1 ? 1 : 0,
          incidents: v1 ? [{ incidentType: "failedJob", incidentCount: 1 }] : [],
        },
      ],
    }
  }
  const def = DEFINITION_BY_ID.exec(path)
  if (def) return { body: definition(Number(def[1]) as 1 | 2) }
  if (path === `/job/${WORLD.jobId}/stacktrace`) {
    return { contentType: "text/plain", body: "java.lang.IllegalStateException: card declined" }
  }
  return { body: [] }
}

/** The healthy engine, except `route` (`"<METHOD> <path>"`) answers `reply`. */
export function withFailure(
  route: string,
  reply: FakeReply = { status: 500, body: { type: "ProcessEngineException", message: "boom" } },
): (request: RecordedRequest) => FakeReply {
  return (request) => (`${request.method} ${request.path}` === route ? reply : worldReply(request))
}
