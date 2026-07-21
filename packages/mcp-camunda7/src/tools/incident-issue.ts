import { formatIncidentIssueInput } from "@miragon-ai/client-camunda7/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  getIncident,
  getProcessDefinition,
  getProcessInstance,
  getStacktrace,
} from "@miragon-ai/client-camunda7/sdk"
import type {
  IncidentDto,
  ProcessDefinitionDto,
  ProcessInstanceDto,
} from "@miragon-ai/client-camunda7/types"
import type { MCPServer } from "mcp-use/server"
import { z } from "zod"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { buildInstanceCockpitUrl, type EngineLink } from "../lib/cockpit-url.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export interface IncidentIssueConfig {
  /**
   * Optional `owner/repo` of a GitHub repository. Purely a convenience for
   * GitHub customers (enables `prefilledUrl` + a default target) — the ticket
   * draft itself is tracker-agnostic and never filed by this server.
   */
  repository?: string
}

/**
 * A tracker-agnostic ticket draft. `title` + markdown `body` + `labels` work
 * as-is in GitHub, Jira, and most issue trackers; the draft is presented in
 * the chat for review and reuse — WHERE it goes (if anywhere) is the user's
 * decision, via whatever integration their host exposes.
 */
export interface IncidentIssuePayload {
  title: string
  body: string
  labels: string[]
  /**
   * GitHub convenience: repository in `owner/repo` form when one is
   * configured/overridden, else `null`. Irrelevant for non-GitHub trackers.
   */
  suggestedRepository: string | null
  /**
   * GitHub convenience: browser URL to GitHub's "new issue" page with
   * title/body/labels prefilled via query params — one-click submission
   * without any integration. `null` if no repository configured. URL length
   * is capped at GitHub's ~8KB limit.
   */
  prefilledUrl: string | null
  nextStep: string
}

interface BuildIssueInput {
  incident: IncidentDto
  processInstance?: ProcessInstanceDto | null
  processDefinition?: ProcessDefinitionDto | null
  /** Raw exception stacktrace (typically `getStacktrace` for the failed job). */
  stacktrace?: string | null
  /** Resolved-engine link context for the cockpit deep link (see `lib/cockpit-url.ts`). */
  engine: EngineLink
  repository: string | null
}

const ISSUE_LABELS = ["bug", "incident"]

/**
 * Pure formatter — no I/O. Produces a structured bug-report layout
 * (description, reproduction, expected/actual, engine context) that reads
 * well in any tracker; the section structure follows the classic bug-report
 * template. Kept side-effect-free so it can be unit-tested without mocking
 * the SDK.
 */
export function buildIncidentIssuePayload(input: BuildIssueInput): IncidentIssuePayload {
  const { incident, processInstance, processDefinition, stacktrace, engine, repository } = input
  const incidentType = incident.incidentType ?? "unknown"
  const definitionKey = processDefinition?.key ?? "unknown-process"
  const title = `[Bug]: Engine incident (${incidentType}) in ${definitionKey}`
  const condensedStack = stacktrace ? condenseStacktrace(stacktrace) : null

  const instanceId = incident.processInstanceId ?? processInstance?.id
  const cockpitLink =
    processDefinition?.key && instanceId
      ? buildInstanceCockpitUrl(
          engine,
          {
            key: processDefinition.key,
            version: processDefinition.version ?? null,
            definitionId: incident.processDefinitionId ?? null,
            instanceId,
          },
          { tab: "incidents" },
        )
      : null

  const body = [
    "### Description",
    "",
    `Engine incident \`${incidentType}\` was raised on activity \`${
      incident.failedActivityId ?? incident.activityId ?? "unknown"
    }\` of process \`${definitionKey}\`.`,
    "",
    incident.incidentMessage
      ? `Engine message:\n\n\`\`\`\n${incident.incidentMessage}\n\`\`\``
      : "_No incident message reported by the engine._",
    "",
    "### Steps to Reproduce",
    "",
    "1. Start an instance of the affected process definition (see below).",
    "2. Reach the failed activity with the same input variables that produced this incident.",
    "3. Observe the incident in the engine.",
    "",
    "### Expected Behaviour",
    "",
    "The activity completes without raising an incident.",
    "",
    "### Actual Behaviour",
    "",
    `An incident of type \`${incidentType}\` is raised.`,
    "",
    condensedStack
      ? `Stacktrace (condensed — framework/JDK frames removed):\n\n\`\`\`\n${condensedStack}\n\`\`\``
      : "_No stacktrace available._",
    "",
    "### Engine context",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Incident ID | \`${incident.id ?? "unknown"}\` |`,
    `| Incident type | \`${incidentType}\` |`,
    `| Activity ID | \`${incident.failedActivityId ?? incident.activityId ?? "unknown"}\` |`,
    `| Process definition key | \`${definitionKey}\` |`,
    `| Process definition ID | \`${incident.processDefinitionId ?? "unknown"}\` |`,
    `| Process instance ID | \`${incident.processInstanceId ?? "unknown"}\` |`,
    `| Tenant | \`${incident.tenantId ?? "—"}\` |`,
    `| Timestamp | \`${incident.incidentTimestamp ?? "unknown"}\` |`,
    `| Root cause incident ID | \`${incident.rootCauseIncidentId ?? "—"}\` |`,
    "",
    "### Affected Module",
    "",
    "camunda7",
    "",
    "### Process Engine",
    "",
    engine.provider.branding.displayName,
    "",
    cockpitLink ? `### Cockpit\n\n${cockpitLink}\n` : "",
    "_Drafted via the `camunda7_format_incident_issue` MCP tool._",
  ]
    .filter((line) => line !== "")
    .join("\n")

  const prefilledUrl = repository
    ? buildPrefilledIssueUrl(repository, title, body, ISSUE_LABELS)
    : null

  return {
    title,
    body,
    labels: ISSUE_LABELS,
    suggestedRepository: repository,
    prefilledUrl,
    nextStep: repository
      ? `Present this draft to the user in the chat (title, full body, labels) for review and reuse. Do NOT file it anywhere on your own — the user decides where it goes. If they ask to file it, use whatever issue-tracker capability is available; for GitHub, repository "${repository}" is preconfigured and prefilledUrl offers one-click submission without any integration.`
      : "Present this draft to the user in the chat (title, full body, labels) for review and reuse. Do NOT file it anywhere on your own — the user decides where it goes (their issue tracker, e-mail, or nowhere). Only file it if the user explicitly asks, using whatever issue-tracker capability is available.",
  }
}

/**
 * GitHub's "new issue" web form accepts `title`, `body`, and `labels` as query
 * params, letting a user submit a fully-prefilled issue with a single click.
 * URL length is capped at ~8KB by GitHub; if we'd exceed that, we truncate the
 * body and append a notice — the body is still in the tool result for manual
 * paste, this URL is purely the convenience path.
 */
const GITHUB_URL_BUDGET = 7500
function buildPrefilledIssueUrl(
  repository: string,
  title: string,
  body: string,
  labels: string[],
): string {
  const base = `https://github.com/${repository}/issues/new`
  const labelsParam = labels.join(",")
  const fixedOverhead =
    base.length +
    "?title=".length +
    encodeURIComponent(title).length +
    "&labels=".length +
    encodeURIComponent(labelsParam).length +
    "&body=".length
  const bodyBudget = GITHUB_URL_BUDGET - fixedOverhead
  let bodyForUrl = body
  if (encodeURIComponent(bodyForUrl).length > bodyBudget) {
    const truncationNotice = "\n\n_…body truncated for URL length; full body in the tool result._"
    while (
      encodeURIComponent(bodyForUrl + truncationNotice).length > bodyBudget &&
      bodyForUrl.length > 0
    ) {
      bodyForUrl = bodyForUrl.slice(0, -200)
    }
    bodyForUrl = bodyForUrl + truncationNotice
  }
  const params = new URLSearchParams({ title, body: bodyForUrl, labels: labelsParam })
  return `${base}?${params.toString()}`
}

/**
 * Reduces a Java stacktrace to the actionable parts:
 *   - the first exception line (`com.foo.Bar: message`)
 *   - up to N frames per exception, prioritising user code over framework internals
 *   - all `Caused by:` chain heads (each capped the same way)
 *
 * Frames matching common framework/proxy/JDK packages are dropped *unless* doing
 * so would leave the section empty (then we keep them so context isn't lost).
 * Always ends with a "trimmed N lines" note when anything was dropped.
 */
const FRAMEWORK_FRAME_PATTERNS = [
  /^\s*at (java|javax|jakarta|jdk|sun|com\.sun)\./,
  /^\s*at org\.springframework\./,
  /^\s*at org\.apache\.(catalina|tomcat|coyote)\./,
  /^\s*at org\.eclipse\.jetty\./,
  /^\s*at io\.netty\./,
  /^\s*at reactor\./,
  /^\s*at org\.junit\./,
  /^\s*at \w+\$\$EnhancerByCGLIB\$\$|^\s*at .*\$\$Lambda\$/,
  /^\s*at org\.camunda\.|^\s*at org\.cibseven\./,
]
const FRAMES_PER_EXCEPTION = 8

function isFrame(line: string): boolean {
  return /^\s*at /.test(line)
}

function isFrameworkFrame(line: string): boolean {
  return FRAMEWORK_FRAME_PATTERNS.some((re) => re.test(line))
}

function pickFrames(frames: string[]): string[] {
  const userFrames = frames.filter((f) => !isFrameworkFrame(f))
  const picked = userFrames.length > 0 ? userFrames : frames
  return picked.slice(0, FRAMES_PER_EXCEPTION)
}

export function condenseStacktrace(raw: string): string {
  const lines = raw.split(/\r?\n/)
  const sections: { head: string; frames: string[] }[] = []
  let current: { head: string; frames: string[] } | null = null

  for (const line of lines) {
    if (!line.trim()) continue
    const isCausedBy = /^\s*Caused by:/.test(line)
    const isSuppressed = /^\s*Suppressed:/.test(line)
    if (!current || isCausedBy || isSuppressed) {
      if (isFrame(line) && current) {
        current.frames.push(line)
      } else {
        current = { head: line, frames: [] }
        sections.push(current)
      }
      continue
    }
    if (isFrame(line)) current.frames.push(line)
    // Non-frame, non-section-head lines (e.g. "... 42 more") are dropped.
  }

  const out: string[] = []
  let droppedFrames = 0
  for (const section of sections) {
    out.push(section.head)
    const kept = pickFrames(section.frames)
    out.push(...kept)
    droppedFrames += section.frames.length - kept.length
  }
  if (droppedFrames > 0) {
    out.push(`\t... ${droppedFrames} framework/internal frames trimmed`)
  }
  return out.join("\n")
}

export function registerIncidentIssueTools(register: Register, config: IncidentIssueConfig) {
  register({
    name: "camunda7_format_incident_issue",
    category: "incidents",
    description:
      "Build a structured, tracker-agnostic ticket draft (title, markdown body, labels) from a Camunda 7 / CIB Seven incident. " +
      "Does NOT file anything — present the draft in the chat for review and reuse; the user decides where it goes " +
      "(their issue tracker via whatever integration is available, the optional prefilled GitHub URL, or copy-paste).",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...formatIncidentIssueInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args, { baseUrl, cockpitUrl, provider }) => {
      // The OpenAPI SDK types describe a `{data, error}` envelope, but the
      // shared client (see `client.ts`) is built with `responseStyle: "data"`
      // + `throwOnError: true` — so at runtime the call returns the raw DTO.
      // The cast matches the convention used in `data/incident-panel-data.ts`.
      const incident = (await getIncident({
        client,
        path: { id: args.incidentId },
      })) as unknown as IncidentDto

      // For `failedJob` incidents, `configuration` holds the failed job ID.
      // The stacktrace endpoint returns 404 for non-job incidents and for jobs
      // without an exception — both are non-fatal here, so swallow.
      const stacktracePromise =
        incident.incidentType === "failedJob" && incident.configuration
          ? (
              getStacktrace({
                client,
                path: { id: incident.configuration },
              }) as unknown as Promise<string>
            ).catch(() => null)
          : Promise.resolve(null)

      const [processInstance, processDefinition, stacktrace] = await Promise.all([
        incident.processInstanceId
          ? (getProcessInstance({
              client,
              path: { id: incident.processInstanceId },
            }) as unknown as Promise<ProcessInstanceDto>)
          : Promise.resolve(null),
        incident.processDefinitionId
          ? (getProcessDefinition({
              client,
              path: { id: incident.processDefinitionId },
            }) as unknown as Promise<ProcessDefinitionDto>)
          : Promise.resolve(null),
        stacktracePromise,
      ])

      const repository = args.repository ?? config.repository ?? null
      return buildIncidentIssuePayload({
        incident,
        processInstance,
        processDefinition,
        stacktrace,
        engine: { baseUrl, cockpitUrl, provider },
        repository,
      })
    }),
  })
}

const incidentIssuePromptSchema = z.object({
  incidentId: z.string().describe("The Camunda 7 / CIB Seven incident ID to draft a ticket for"),
  repository: z
    .string()
    .optional()
    .describe(
      "Optional `owner/repo` — only relevant if the user later chooses to file the draft on GitHub",
    ),
})

/**
 * Drafting prompt: tells the host agent to build a tracker-agnostic ticket
 * draft via `camunda7_format_incident_issue` and present it in the chat. The
 * draft is the deliverable — filing it (GitHub, Jira, anything else) only
 * happens on the user's explicit request, through whatever integration their
 * host exposes. We never file anything ourselves.
 */
export function registerIncidentIssuePrompt(server: MCPServer, config: IncidentIssueConfig) {
  server.prompt(
    {
      name: "draft_incident_ticket",
      description:
        "Draft a structured ticket from a Camunda 7 / CIB Seven engine incident and present it in the chat for review. " +
        "Tracker-agnostic: the user decides where to file it (their issue tracker via any available integration, " +
        "a prefilled GitHub link, or copy-paste) — filing only happens on explicit request.",
      schema: incidentIssuePromptSchema,
    },
    async ({ incidentId, repository }) => {
      const target = repository ?? config.repository
      const githubClause = target
        ? `If they choose GitHub without naming a repository, default to \`${target}\`; without any GitHub integration, offer \`prefilledUrl\` as a one-click link (\`[Create issue on GitHub](<prefilledUrl>)\`).`
        : "If they choose GitHub, ask which `owner/repo` should receive it."
      const text = [
        `You will draft a ticket for Camunda 7 / CIB Seven incident \`${incidentId}\`.`,
        "",
        "Steps:",
        `1. Call the \`camunda7_format_incident_issue\` tool with \`incidentId="${incidentId}"\`${
          repository ? ` and \`repository="${repository}"\`` : ""
        }.`,
        "2. Present the draft to the user in the chat: the title, the full markdown body, and the labels. The draft is the deliverable — it must be reviewable and reusable as-is (copy-paste into any tracker).",
        "3. Ask the user whether and where it should be filed. Do NOT file it anywhere on your own.",
        `4. Only if the user names a destination, use whatever matching capability is exposed to you (a GitHub MCP server / connector, a Jira or other tracker integration, or a CLI tool) — do NOT insist on a specific tool name. ${githubClause}`,
        "5. After filing, confirm to the user with the link/id of the created ticket.",
        "",
        "Do NOT modify the title or body — they follow the bug-report structure. Only set additional fields (e.g. assignees) if the user explicitly asks.",
      ].join("\n")

      return {
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text },
          },
        ],
      }
    },
  )
}
