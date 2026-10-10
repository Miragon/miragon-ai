import { formatIncidentIssueInput } from "@miragon-ai/camunda7-client/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  fetchExternalTaskErrorDetails,
  fetchJobStacktrace,
  incidentRecovery,
  type Client,
} from "@miragon-ai/camunda7-client"
import {
  getIncident,
  getProcessDefinition,
  getProcessInstance,
} from "@miragon-ai/camunda7-client/sdk"
import type {
  IncidentDto,
  ProcessDefinitionDto,
  ProcessInstanceDto,
} from "@miragon-ai/camunda7-client/types"
import type { MCPServer } from "mcp-use"
import { z } from "zod"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { buildInstanceCockpitUrl, type EngineLink } from "../lib/cockpit-url.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export interface IncidentIssueConfig {
  /**
   * The ONE GitHub repository (`owner/repo`) drafts target — operator config
   * (`CAMUNDA_INCIDENT_ISSUE_REPO`), never a tool or prompt argument: the
   * prefilled URL carries the whole draft, so a model-chosen target (steered
   * by injected incident text) would publish diagnostics anywhere. Without it
   * there is no prefilled URL; the draft itself is tracker-agnostic and never
   * filed by this server.
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
   * GitHub convenience: the configured repository (`owner/repo`), else
   * `null`. Irrelevant for non-GitHub trackers.
   */
  suggestedRepository: string | null
  /**
   * GitHub convenience: browser URL to the configured repository's "new
   * issue" page with title/body/labels prefilled via query params — one-click
   * submission without any integration. `null` without a configured
   * repository. Its body leaves out the internal cockpit link, and its length
   * is capped at GitHub's ~8KB limit.
   */
  prefilledUrl: string | null
  nextStep: string
}

interface BuildIssueInput {
  incident: IncidentDto
  processInstance?: ProcessInstanceDto | null
  processDefinition?: ProcessDefinitionDto | null
  /** Raw failure text: the failed job's stacktrace or the worker's error details. */
  stacktrace?: string | null
  /** Why the stacktrace could not be loaded — said in the draft instead of "none available". */
  stacktraceError?: string | null
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
  const { incident, processDefinition, stacktrace, stacktraceError, repository } = input
  const incidentType = incident.incidentType ?? "unknown"
  const definitionKey = processDefinition?.key ?? "unknown-process"
  const title = `[Bug]: Engine incident (${incidentType}) in ${definitionKey}`
  const condensedStack = stacktrace ? boundFailureText(condenseStacktrace(stacktrace)) : null
  const cockpitLink = buildIssueCockpitLink(input)

  const context: IssueBodyContext = {
    incidentType,
    definitionKey,
    condensedStack,
    stacktraceError: stacktraceError ?? null,
    cockpitLink,
  }
  const body = buildIssueBody(input, context)

  // The URL leaves the network: no internal host in it, whatever the repository.
  const prefilledUrl = repository
    ? buildPrefilledIssueUrl(
        repository,
        title,
        buildIssueBody(input, { ...context, cockpitLink: null }),
        ISSUE_LABELS,
      )
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

/** `failedActivityId` (set for job incidents) wins over the generic `activityId`. */
function incidentActivityId(incident: IncidentDto): string {
  return incident.failedActivityId ?? incident.activityId ?? "unknown"
}

/** Cockpit deep link to the instance's incidents tab — `null` when context is missing. */
function buildIssueCockpitLink(input: BuildIssueInput): string | null {
  const { incident, processInstance, processDefinition, engine } = input
  const instanceId = incident.processInstanceId ?? processInstance?.id
  return processDefinition?.key && instanceId
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
}

interface IssueBodyContext {
  incidentType: string
  definitionKey: string
  condensedStack: string | null
  stacktraceError: string | null
  cockpitLink: string | null
}

/** The draft's stacktrace paragraph: the trace, why it is missing, or that there is none. */
function stacktraceSection({ condensedStack, stacktraceError }: IssueBodyContext): string {
  if (condensedStack) {
    return `Stacktrace (condensed — framework/JDK frames removed):\n\n${codeFence(condensedStack)}`
  }
  return stacktraceError
    ? `_Stacktrace could not be loaded:_ ${codeSpan(stacktraceError)}`
    : "_No stacktrace available._"
}

/** The engine-context table: one row per field, every value in a cell-safe span. */
function engineContextTable(incident: IncidentDto, context: IssueBodyContext): string[] {
  const rows: Array<[string, string]> = [
    ["Incident ID", incident.id ?? "unknown"],
    ["Incident type", context.incidentType],
    ["Activity ID", incidentActivityId(incident)],
    ["Process definition key", context.definitionKey],
    ["Process definition ID", incident.processDefinitionId ?? "unknown"],
    ["Process instance ID", incident.processInstanceId ?? "unknown"],
    ["Tenant", incident.tenantId ?? "—"],
    ["Timestamp", incident.incidentTimestamp ?? "unknown"],
    ["Root cause incident ID", incident.rootCauseIncidentId ?? "—"],
  ]
  return [
    "| Field | Value |",
    "| --- | --- |",
    ...rows.map(([field, value]) => `| ${field} | ${codeSpan(value, { inTable: true })} |`),
  ]
}

/** Markdown body of the draft, section by section (see {@link buildIncidentIssuePayload}). */
function buildIssueBody(input: BuildIssueInput, context: IssueBodyContext): string {
  const { incident, engine } = input
  const { incidentType, definitionKey, cockpitLink } = context
  return [
    "### Description",
    "",
    `Engine incident ${codeSpan(incidentType)} was raised on activity ${codeSpan(
      incidentActivityId(incident),
    )} of process ${codeSpan(definitionKey)}.`,
    "",
    incident.incidentMessage
      ? `Engine message:\n\n${codeFence(incident.incidentMessage)}`
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
    `An incident of type ${codeSpan(incidentType)} is raised.`,
    "",
    stacktraceSection(context),
    "",
    "### Engine context",
    "",
    ...engineContextTable(incident, context),
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
 * Upper bound for the failure text in the draft. A worker's error details are
 * free text of any size (a downstream HTML error page, a whole log), and the
 * draft goes back to the model in full — so a longer text keeps its head
 * (the error) and its tail (the root cause, in a Java trace), with a note.
 */
const MAX_FAILURE_TEXT = 6000
const FAILURE_TEXT_TAIL = 1500

export function boundFailureText(text: string): string {
  if (text.length <= MAX_FAILURE_TEXT) return text
  const head = text.slice(0, MAX_FAILURE_TEXT - FAILURE_TEXT_TAIL)
  const tail = text.slice(-FAILURE_TEXT_TAIL)
  const cut = text.length - head.length - tail.length
  return `${head}\n… [${cut} characters truncated] …\n${tail}`
}

/**
 * A fenced code block the text cannot close: the fence is one backtick longer
 * than the longest backtick run inside (at least three). Engine and worker
 * text is untrusted — a plain ``` inside it would end the block, and the rest
 * would render as markdown in the filed ticket (mentions, links, images).
 */
function codeFence(text: string): string {
  const fence = "`".repeat(Math.max(3, longestBacktickRun(text) + 1))
  return `${fence}\n${text}\n${fence}`
}

function longestBacktickRun(text: string): number {
  let longest = 0
  for (const run of text.matchAll(/`+/g)) longest = Math.max(longest, run[0].length)
  return longest
}

/**
 * An inline code span the value cannot close. Engine values are arbitrary
 * strings — a custom incident type, a tenant id — and a backtick inside a
 * plain `…` span ends it, so the rest would render as live markdown (images,
 * links, mentions) in the filed ticket. The delimiter is one backtick longer
 * than any run inside; line breaks become spaces (a span is one line, and a
 * table row must stay one); in a table cell a `|` is escaped, since GFM
 * splits cells on it even inside a span. A value that starts or ends with a
 * backtick is padded with a space, which CommonMark strips again.
 */
function codeSpan(value: string, { inTable = false }: { inTable?: boolean } = {}): string {
  const oneLine = value.replace(/\r\n?|\n/g, " ")
  const text = inTable ? oneLine.replace(/\|/g, "\\|") : oneLine
  const delimiter = "`".repeat(longestBacktickRun(text) + 1)
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : ""
  return `${delimiter}${pad}${text}${pad}${delimiter}`
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
  // Free text (a worker's error details) has no frames to trim — keep it whole.
  if (!lines.some(isFrame)) return raw.trim()
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

/**
 * The incident's failure text through the engine contract: a failedJob's
 * stacktrace, a failedExternalTask's worker error details. Optional for the
 * draft — but a failed load is reported as such, never as "none available".
 */
async function fetchFailureText(
  client: Client,
  incident: IncidentDto,
): Promise<{ stacktrace: string | null; stacktraceError: string | null }> {
  const recovery = incidentRecovery(incident)
  try {
    const stacktrace =
      recovery.action === "retry-job"
        ? await fetchJobStacktrace(client, recovery.jobId)
        : recovery.action === "retry-external-task"
          ? await fetchExternalTaskErrorDetails(client, recovery.externalTaskId)
          : null
    return { stacktrace, stacktraceError: null }
  } catch (error) {
    return { stacktrace: null, stacktraceError: (error as Error).message }
  }
}

export function registerIncidentIssueTools(register: Register, config: IncidentIssueConfig) {
  register({
    name: "camunda7_format_incident_issue",
    category: "incidents",
    description:
      "Build a structured, tracker-agnostic ticket draft (title, markdown body, labels) from a Camunda 7 / CIB Seven incident. " +
      "Does NOT file anything — present the draft in the chat for review and reuse; the user decides where it goes " +
      "(their issue tracker via whatever integration is available, the prefilled GitHub URL of the configured repository, or copy-paste).",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...formatIncidentIssueInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args, { baseUrl, cockpitUrl, provider }) => {
      // The OpenAPI SDK types describe a `{data, error}` envelope, but the
      // shared client (see `client.ts`) is built with `responseStyle: "data"`
      // + `throwOnError: true` — so at runtime the call returns the raw DTO.
      // The cast matches the convention used in `data/incident-scan.ts`.
      const incident = await getIncident({
        client,
        path: { id: args.incidentId },
      })

      const [processInstance, processDefinition, failure] = await Promise.all([
        incident.processInstanceId
          ? getProcessInstance({
              client,
              path: { id: incident.processInstanceId },
            })
          : Promise.resolve(null),
        incident.processDefinitionId
          ? getProcessDefinition({
              client,
              path: { id: incident.processDefinitionId },
            })
          : Promise.resolve(null),
        fetchFailureText(client, incident),
      ])

      // The operator's repository — never an argument (see IncidentIssueConfig).
      const repository = config.repository ?? null
      return buildIncidentIssuePayload({
        incident,
        processInstance,
        processDefinition,
        ...failure,
        engine: { baseUrl, cockpitUrl, provider },
        repository,
      })
    }),
  })
}

const incidentIssuePromptSchema = z.object({
  incidentId: z.string().describe("The Camunda 7 / CIB Seven incident ID to draft a ticket for"),
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
    async ({ incidentId }) => {
      const target = config.repository
      const githubClause = target
        ? `If they choose GitHub without naming a repository, default to \`${target}\`; without any GitHub integration, offer \`prefilledUrl\` as a one-click link (\`[Create issue on GitHub](<prefilledUrl>)\`).`
        : "If they choose GitHub, ask which `owner/repo` should receive it."
      const text = [
        `You will draft a ticket for Camunda 7 / CIB Seven incident \`${incidentId}\`.`,
        "",
        "Steps:",
        `1. Call the \`camunda7_format_incident_issue\` tool with \`incidentId="${incidentId}"\`.`,
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
