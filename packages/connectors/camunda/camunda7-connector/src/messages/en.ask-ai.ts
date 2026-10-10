/**
 * The Ask-AI hand-off intents (#338): the SHORT task each widget hands to the
 * agent as the user's message. Static text on purpose — no parameters, no data,
 * no tool names: ids, on-screen numbers, engine text and the deployment's
 * tools are added by `askAiPrompt` (ids inlined only when id-shaped, engine
 * text fenced as untrusted data, tools filtered by the live surface). Generic
 * playbooks (engine pinning, the guarded remediation) live in the module's
 * server instructions, not here.
 */
export const enAskAi = {
  "askAi.jobs.triage":
    "Triage the failed jobs: group them by cause, name the likely root cause per group and recommend one action each. Recommend only — change nothing.",
  "askAi.jobs.explainFailure":
    "Explain why this job failed: what broke, whether it is transient or deterministic, and a verdict — SAFE TO RETRY or WILL RE-FAIL. Change nothing.",
  "askAi.jobs.draftTicket":
    "Draft an incident ticket for this failed job: find its incident, build the draft and show it to me for review. Do not file it anywhere.",
  "askAi.health.triage":
    "Assess this engine's health: rank the incident clusters by impact, name the most urgent problem in business terms, its likely root cause and the first step to fix it. Change nothing without my confirmation.",
  "askAi.health.diagnoseUnreachable":
    "The engine health check failed. Diagnose why the engine is not reachable — down, wrong base URL, authentication or network — and name the next step. Change nothing.",
  "askAi.cluster.fix":
    "Help me fix this incident cluster in plain language: confirm the root cause, then propose a fix scoped to exactly this cluster. Show me the plan and the affected count; execute nothing until I confirm.",
  "askAi.cluster.diagnose":
    "Diagnose this incident cluster in plain language: confirm the root cause and whether a retry would help. This deployment cannot change the engine — draft a ticket if it needs a fix.",
  "askAi.cluster.diagnoseLabel": "Diagnose",
  "askAi.history.explainInstance":
    "Explain where this process instance spent its time: the single longest step, wait time versus work, and whether this run is an outlier.",
  "askAi.history.explainActivity":
    "Explain why this step took so long: wait time or work, and whether the duration is typical for it. Change nothing.",
  "askAi.fleet.overview":
    "Give me an overview across these engines: where the most work and the most trouble sit, any job backlog or silent engine, and where to start. Recommend only.",
  "askAi.fleet.failures":
    "Analyze the failures across these engines: the dominant failure cluster, whether it is isolated or systemic, and the highest-leverage fix.",
  "askAi.fleet.performance":
    "Give me a process-performance overview across these engines: the worst-performing processes and the main bottleneck. Rank processes, not engines.",
  "askAi.instances.rootCause":
    "Find the root cause of this instance's incident, check whether other instances of the process fail the same way, and recommend a fix — for this instance or the whole cluster.",
  "askAi.instances.triageProcess":
    "Triage this process's running instances: group the incidents by failing activity and type, name the dominant failure and how many instances a retry would fix versus a data or model fix. Recommend only.",
  "askAi.instances.triageEngine":
    "Triage the running instances on this engine across all processes: group the failures by process, activity and type, and give me a prioritized triage per process. Recommend only.",
  "askAi.instance.explainTimeline":
    "Explain this instance's execution timeline: where the token spent the most time, where it is stuck, and whether the path matches the happy path. Change nothing.",
  "askAi.instance.checkVariables":
    "Explain and sanity-check this instance's variables: flag values that look missing, malformed or inconsistent and could explain its incidents. Propose corrections; set nothing without my confirmation.",
  "askAi.instance.diagnose":
    "Diagnose this process instance: why the token is stuck, the root cause of each open incident, whether other instances fail the same way, and the single best fix. Present the plan; execute nothing.",
  "askAi.incident.diagnose":
    "Diagnose this incident: the likely root cause, whether a plain retry will succeed, and the recommended fix — retry, data correction, instance modification or escalation.",
  "askAi.incident.explainError":
    "Explain this incident's error in plain language: what it means, the likely cause, and whether it is transient (safe to retry) or deterministic (will re-fail). Change nothing.",
  "askAi.incident.draftTicket":
    "Draft an incident ticket for this incident and show me the draft — title, body, labels — for review. Do not file it anywhere.",
  "askAi.process.triage":
    "Triage this process definition's health: cluster its incidents by root cause, separate symptoms from sources, and recommend a fix per cluster. Diagnosis only.",
  "askAi.process.healthCheck":
    "Check the health of this process definition: healthy or degraded, the worst activities, the dominant incident message, the most likely root cause and one next step. Change nothing.",
  "askAi.bpmn.explainState":
    "Explain this instance's state on the diagram: which elements block progress, what each incident means, whether the failed-job hotspots point to a systemic fault, and the next actions in priority order.",
  "askAi.landscape.triage":
    "Triage the process landscape on this engine: rank the affected processes by severity, name the most urgent one, its likely root cause and the first remediation step.",
  "askAi.incidents.processRootCause":
    "Find the root cause of this process's open incidents: do the failing activities share one cause, is it transient, a data or configuration problem or a broken model, and which fix do you recommend. Change nothing without my confirmation.",
  "askAi.incidents.triage":
    "Triage all open incidents on this engine: cluster them by error and failing activity, rank the clusters by impact, name the most likely systemic root cause and the next step per top cluster. Change nothing yet.",
  "askAi.incidents.triageFiltered":
    "Triage the open incidents this view is filtered to: cluster them by error and failing activity, rank the clusters by impact, name the most likely root cause and the next step per top cluster. Change nothing yet.",
} satisfies Record<string, string>

export type Camunda7AskAiKey = keyof typeof enAskAi
