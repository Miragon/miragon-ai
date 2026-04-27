import type { Client } from "@miragon-ai/client-cibseven"
import { formatIncidentIssueInput } from "@miragon-ai/client-cibseven/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  getIncident,
  getProcessDefinition,
  getProcessInstance,
  getStacktrace,
} from "@miragon-ai/client-cibseven/generated/sdk.gen"
import type {
  IncidentDto,
  ProcessDefinitionDto,
  ProcessInstanceDto,
} from "@miragon-ai/client-cibseven/generated/types.gen"
import type { MCPServer } from "mcp-use/server"
import { z } from "zod"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export interface IncidentIssueConfig {
  /** `owner/repo` of the GitHub repository where incidents should be filed. */
  repository?: string
  /** Cockpit base URL for jump-out links in the issue body. */
  cockpitUrl?: string
}

export interface IncidentIssuePayload {
  title: string
  body: string
  labels: string[]
  /** Repository in `owner/repo` form, or `null` if neither config nor override provided one. */
  suggestedRepository: string | null
  /** Tool name on the official GitHub MCP server that should consume this payload. */
  suggestedTool: "create_issue"
  /**
   * Browser URL to GitHub's "new issue" page with title/body/labels prefilled
   * via query params. Lets the user one-click-submit even when no GitHub MCP
   * server / connector is exposed to the agent. `null` if no repository
   * configured. URL length is capped at GitHub's ~8KB limit.
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
  cockpitUrl?: string
  repository: string | null
}

const ISSUE_LABELS = ["bug", "incident"]

/**
 * Pure formatter — no I/O. Mirrors the structure of `.github/ISSUE_TEMPLATE/bug_report.yml`
 * so the resulting issue body fills the same sections a human would. Kept side-effect-free
 * so it can be unit-tested without mocking the SDK.
 */
export function buildIncidentIssuePayload(input: BuildIssueInput): IncidentIssuePayload {
  const { incident, processInstance, processDefinition, stacktrace, cockpitUrl, repository } = input
  const incidentType = incident.incidentType ?? "unknown"
  const definitionKey = processDefinition?.key ?? "unknown-process"
  const title = `[Bug]: Engine incident (${incidentType}) in ${definitionKey}`
  const condensedStack = stacktrace ? condenseStacktrace(stacktrace) : null

  const cockpitLink = buildCockpitInstanceLink({
    cockpitUrl,
    processDefinitionKey: processDefinition?.key,
    processDefinitionVersion: processDefinition?.version,
    processInstanceId: incident.processInstanceId ?? processInstance?.id,
  })

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
    `An incident of type \`${incidentType}\` is raised. See engine context below.`,
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
    "CIB Seven",
    "",
    condensedStack ? `### Stacktrace (condensed)\n\n\`\`\`\n${condensedStack}\n\`\`\`\n` : "",
    cockpitLink ? `### Cockpit\n\n${cockpitLink}\n` : "",
    "_Filed via the `camunda7_format_incident_issue` MCP tool._",
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
    suggestedTool: "create_issue",
    prefilledUrl,
    nextStep: repository
      ? `Pass {title, body, labels, repository: "${repository}"} to the GitHub MCP server's create_issue tool. If no GitHub tool is available, send the user to prefilledUrl for one-click submission.`
      : "No repository configured. Ask the user which `owner/repo` should receive this incident, then call the GitHub MCP server's create_issue tool.",
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

function buildCockpitInstanceLink(args: {
  cockpitUrl?: string
  processDefinitionKey?: string | null
  processDefinitionVersion?: number | null
  processInstanceId?: string | null
}): string | null {
  const { cockpitUrl, processDefinitionKey, processDefinitionVersion, processInstanceId } = args
  if (!cockpitUrl || !processDefinitionKey || !processInstanceId) return null
  const version = processDefinitionVersion ?? "latest"
  const base = cockpitUrl.replace(/\/+$/, "")
  return `${base}/#/seven/auth/process/${processDefinitionKey}/${version}/${processInstanceId}?tab=incidents`
}

export function registerIncidentIssueTools(register: Register, config: IncidentIssueConfig) {
  register({
    name: "camunda7_format_incident_issue",
    description:
      "Build a GitHub-issue payload (title, body, labels, repository) from a Camunda 7 / CIB Seven incident. " +
      "Does NOT create the issue — pass the returned payload to the GitHub MCP server's `create_issue` tool.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: formatIncidentIssueInput.shape,
    handler: async (client, args) => {
      // The OpenAPI SDK types describe a `{data, error}` envelope, but the
      // shared client (see `client.ts`) is built with `responseStyle: "data"`
      // + `throwOnError: true` — so at runtime the call returns the raw DTO.
      // The cast matches the convention used in `incident-panel-data.ts`.
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
        cockpitUrl: config.cockpitUrl,
        repository,
      })
    },
  })
}

const incidentIssuePromptSchema = z.object({
  incidentId: z.string().describe("The Camunda 7 / CIB Seven incident ID to report"),
  repository: z
    .string()
    .optional()
    .describe("Optional `owner/repo` override for the target GitHub repository"),
})

/**
 * Cross-MCP orchestration prompt: tells the host agent to chain
 * `camunda7_format_incident_issue` → official GitHub MCP server's `create_issue`.
 * We don't issue the GitHub call ourselves — auth/scope/secret-scanning are handled
 * by the user's installed GitHub MCP server.
 */
export function registerIncidentIssuePrompt(server: MCPServer, config: IncidentIssueConfig) {
  server.prompt(
    {
      name: "report_incident_to_github",
      description:
        "Report a Camunda 7 / CIB Seven engine incident as a GitHub issue. Works with any GitHub-issue-creating capability the host exposes — the official github/github-mcp-server, Claude Desktop's first-party GitHub connector, or a `gh` CLI bash tool.",
      schema: incidentIssuePromptSchema,
    },
    async ({ incidentId, repository }) => {
      const target = repository ?? config.repository
      const targetClause = target
        ? `Use repository \`${target}\` unless the user explicitly overrides it.`
        : "Ask the user which `owner/repo` should receive the issue if none is specified."
      const text = [
        `You will report Camunda 7 / CIB Seven incident \`${incidentId}\` to GitHub.`,
        "",
        "Steps:",
        `1. Call the \`camunda7_format_incident_issue\` tool with \`incidentId="${incidentId}"\`${
          repository ? ` and \`repository="${repository}"\`` : ""
        }.`,
        "2. Find an available GitHub issue-creation capability among the tools and connectors currently exposed to you. Possible providers (any one is fine): the official `github/github-mcp-server` (tool `create_issue`), Claude Desktop's first-party GitHub connector (often namespaced like `Github:create_issue` or `github_create_issue`), or a generic `gh` CLI bash tool. Pick whichever is actually available — do NOT insist on a specific tool name.",
        "3. Call that capability with the `{title, body, labels}` from step 1 and `suggestedRepository` (split into `owner` and `repo`) as the target repository.",
        `4. ${targetClause}`,
        "5. Confirm to the user with the URL of the created issue.",
        "",
        "If you genuinely cannot find ANY GitHub-issue-creating tool in your current toolset, fall back to `prefilledUrl` from step 1: present it to the user as a clickable link (`[Create issue on GitHub](<prefilledUrl>)`) so they can submit with one click. Do NOT just dump the title/body and tell the user to paste manually when prefilledUrl is set.",
        "",
        "Do NOT modify the title or body — they already match the project's bug-report template. Only set additional fields (e.g. assignees) if the user explicitly asks.",
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
