/**
 * The analytics Ask-AI hand-off intents (#338): the SHORT task each widget
 * hands to the agent as the user's message. Static text on purpose — no
 * parameters, no data, no tool names: ids, on-screen numbers, engine text and
 * the deployment's tools are added by `askAiPrompt` (ids inlined only when
 * id-shaped, engine text fenced as untrusted data, tools filtered by the live
 * surface). Generic rules (never compare a rate across engines, `suppressed`
 * means noise) live in the module's server instructions, not here.
 */
export const enAskAi = {
  "askAi.clusterCompare":
    "Interpret this before/after-deployment comparison in 3–4 sentences: a genuine regression or noise, which metric (and element) drives it, and one action — roll back, hold further rollouts or accept.",
  "askAi.engineCompare":
    "Interpret this comparison of one process on two engines in 3–4 sentences: does the second engine genuinely run it worse or is it noise, which metric drives the gap, and one recommended action.",
  "askAi.versionCompare":
    "Interpret this version comparison in 3–4 sentences: a genuine regression of the candidate version or noise, which element drives it, and one action — move running instances back, hold the rollout or accept.",
  "askAi.landscapeCompare":
    "Compare this process between the two engines: show the side-by-side comparison, say which engine runs it better and whether the gap is significant, and one recommended action. Recommend only.",
  "askAi.executionSummary":
    "Assess the process analytics on screen: healthy or degrading, the most likely root cause of any incidents, and the single highest-value next action. Be concise.",
  "askAi.activityBottleneck":
    "Explain why this activity is a bottleneck: long executions or sheer volume, waiting or working given its type, and the most useful next thing to look at. Change nothing.",
  "askAi.failureSummary":
    "Triage the open incidents: group the error patterns by likely common cause, tell a systemic outage from isolated per-process bugs, and rank what to fix first. Confirm against the live state; analysis only.",
  "askAi.failureRate":
    "Explain what drives this process's open incidents: is it a regression (recent periods, or the windows around a deployment), and which activity fails most. Change nothing.",
  "askAi.errorPattern":
    "Root-cause this group of open incidents: read their messages and failing activity, then name the likely cause, whether it is transient or systemic, and the recommended fix. Change nothing.",
} satisfies Record<string, string>

export type AnalyticsAskAiKey = keyof typeof enAskAi
