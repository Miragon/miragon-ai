import type { createToolRegistrar, ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import type { z } from "zod"
import { createToolsetVocabulary } from "@miragon-ai/widget-shell/server"
import type { EngineRegistry } from "./resolve-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>
type ZodRawShape = Record<string, z.ZodType>

/**
 * Named tool subsets a deployment can pick via `MCP_ACTIVE_MODULES`, e.g.
 * `camunda7:read-only`. No suffix means "all tools" (unchanged default).
 * The vocabulary skeleton (typed guard + the fail-closed rule for unknown
 * names) is the shared `createToolsetVocabulary`; the names and the filter
 * semantics below stay module-owned.
 */
export const CAMUNDA7_TOOLSETS = ["read-only", "operations", "admin"] as const
export type Camunda7Toolset = (typeof CAMUNDA7_TOOLSETS)[number]

const vocabulary = createToolsetVocabulary("camunda7", CAMUNDA7_TOOLSETS, "read-only")

/**
 * Normalize a configured toolset for gating decisions outside the registrar
 * (e.g. `camunda7_save_user_profile`'s `canSave`): `undefined` means "no
 * toolset — everything allowed", unknown names warn and degrade to
 * `read-only`. Every self-gating write goes through this, never through an
 * ad-hoc name compare.
 */
export function resolveCamunda7Toolset(toolset?: string): Camunda7Toolset | undefined {
  return vocabulary.resolve(toolset)
}

/**
 * Tools that are only exposed in the `admin` toolset, regardless of their
 * annotations. This is the one explicit list in the toolset rule: everything
 * irreversible (delete/modify/batch), engine-content-changing (deployments),
 * or operator-of-operators territory (migrations, suspension toggles).
 *
 * `camunda7_create_migration_plan` is engine-read-only, but a migration plan
 * is useless without `camunda7_migrate_process_instances_async` — the pair
 * stays together in `admin`.
 */
const ADMIN_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "camunda7_delete_process_instance",
  "camunda7_modify_process_instance",
  "camunda7_set_process_instance_suspension",
  "camunda7_create_deployment",
  "camunda7_create_migration_plan",
  "camunda7_migrate_process_instances_async",
  "camunda7_set_job_retries_batch",
])

/**
 * Tools included in every toolset even though they are not engine-read-only.
 * `camunda7_engine` (action "select") only mutates this MCP session's sticky
 * engine selection — never engine state — and without it a read-only
 * multi-engine deployment could not route its queries.
 */
const SESSION_INFRASTRUCTURE_TOOLS: ReadonlySet<string> = new Set(["camunda7_engine"])

/**
 * The toolset rule, applied per registrar tool (widget tools and `*_data`
 * feeds are read-only views and are not filtered):
 *
 *   1. Tools in {@link ADMIN_ONLY_TOOLS} exist only in `admin`.
 *   2. Tools with `annotations.readOnlyHint: true` — plus the session
 *      infrastructure tools — exist in every toolset.
 *   3. Everything else (engine writes: start/complete/claim/retries/…)
 *      exists in `operations` and `admin`.
 *
 * `admin` (and no toolset at all) therefore exposes every tool.
 */
export function isToolInToolset(
  config: Pick<ToolConfig<EngineRegistry>, "name" | "annotations">,
  toolset: Camunda7Toolset,
): boolean {
  if (toolset === "admin") return true
  if (ADMIN_ONLY_TOOLS.has(config.name)) return false
  if (toolset === "operations") return true
  // read-only
  return config.annotations?.readOnlyHint === true || SESSION_INFRASTRUCTURE_TOOLS.has(config.name)
}

/**
 * Wraps a tool registrar so that only tools matching `toolset` reach the
 * server. `undefined` (no toolset configured) registers everything; an unknown
 * toolset name warns and degrades to `read-only` — a typo'd suffix always
 * meant to restrict, so it must never expose the admin tools.
 */
export function withToolsetFilter(register: Register, toolset?: string): Register {
  // `resolve` implements the shared rule: no toolset stays silent and exposes
  // everything, an unknown name warns and fails closed to `read-only`.
  const known = vocabulary.resolve(toolset)
  if (known === undefined) return register
  const filtered = <TShape extends ZodRawShape>(config: ToolConfig<EngineRegistry, TShape>) => {
    if (isToolInToolset(config, known)) register(config)
  }
  return Object.assign(filtered, { getRegisteredTools: () => register.getRegisteredTools() })
}
