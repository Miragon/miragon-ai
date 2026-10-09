import type { createToolRegistrar, ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import type { z } from "zod"
import { createToolsetVocabulary } from "@miragon-ai/widget-shell/server"
import type { EngineRegistry } from "./resolve-engine.js"
import {
  CAMUNDA7_SAVE_USER_PROFILE,
  CAMUNDA7_WIDGET_ACTIONS,
  type Camunda7WidgetAction,
} from "../tool-names.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>
type ZodRawShape = Record<string, z.ZodType>

/**
 * Named tool subsets a deployment picks via `MCP_ACTIVE_MODULES`, e.g.
 * `camunda7:read-only`. The selection FAILS CLOSED — nothing resolves to
 * "every tool":
 *
 *   - no suffix → `read-only` on an unauthenticated boot, `operations` when
 *     the composition root installed OAuth;
 *   - an empty or unknown suffix → warns and degrades to `read-only`;
 *   - `admin` (the only toolset with the {@link ADMIN_ONLY_TOOLS}) is reached
 *     only by naming it.
 *
 * The rule itself is the shared `createToolsetVocabulary` (the composition
 * resolves ONE concrete toolset per boot and threads it into the plugin
 * config); the names and the filter semantics below stay module-owned.
 */
export const CAMUNDA7_TOOLSETS = ["read-only", "operations", "admin"] as const
export type Camunda7Toolset = (typeof CAMUNDA7_TOOLSETS)[number]

/**
 * camunda7's toolset vocabulary — declared on `camunda7Module.toolsets`, so
 * the composition root resolves the effective toolset with it. `read-only` is
 * the floor (no durable write), `operations` the standard non-admin toolset
 * an authenticated boot gets without a suffix.
 */
export const camunda7Toolsets = createToolsetVocabulary(
  "camunda7",
  CAMUNDA7_TOOLSETS,
  "read-only",
  {
    authenticatedDefault: "operations",
  },
)

/**
 * Normalize a configured toolset to a concrete one: a known name is itself,
 * an unknown one warns and degrades to `read-only`, and a MISSING one is
 * `read-only` too — the composition root always passes a concrete name, so
 * only a direct `createPlugin` caller omits it, and it gets the floor, never
 * everything. The plugin resolves once and threads the typed result through
 * every gate (registrar filter, widget actions, profile writes).
 */
export function resolveCamunda7Toolset(toolset?: string): Camunda7Toolset {
  return camunda7Toolsets.resolve(toolset)
}

/**
 * Tools that are only exposed in the `admin` toolset, regardless of their
 * annotations. This is the one explicit list in the toolset rule: everything
 * irreversible (delete/modify/batch), engine-content-changing (deployments —
 * which also run code inside the engine JVM, see `CAMUNDA_ALLOW_DEPLOYMENTS`),
 * operator-of-operators territory (migrations, suspension toggles),
 * engine-wide broadcasts (`camunda7_throw_signal` reaches every matching
 * catch event in every instance and starts instances through signal start
 * events), and the external-task WORKER protocol (fetch-and-lock withholds
 * tasks from the production workers until the lock expires; complete/failure
 * act on a task as if the worker had).
 *
 * `camunda7_create_migration_plan` is engine-read-only, but a migration plan
 * is useless without `camunda7_migrate_process_instances_async` — the pair
 * stays together in `admin`. The same holds for `camunda7_get_batch`: it
 * follows the batch ids only the admin batch tools hand out.
 */
const ADMIN_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "camunda7_delete_process_instance",
  "camunda7_modify_process_instance",
  "camunda7_set_process_instance_suspension",
  "camunda7_create_deployment",
  "camunda7_create_migration_plan",
  "camunda7_migrate_process_instances_async",
  "camunda7_set_job_retries_batch",
  "camunda7_get_batch",
  "camunda7_throw_signal",
  "camunda7_fetch_and_lock",
  "camunda7_complete_external_task",
  "camunda7_handle_external_task_failure",
])

/**
 * The admin-only tool names, public for guard tests in composing servers
 * (e.g. "a boot without an explicit `camunda7:admin` never lists any of
 * these"). Derived from {@link ADMIN_ONLY_TOOLS} — that set stays the single
 * source.
 */
export const CAMUNDA7_ADMIN_ONLY_TOOLS: readonly string[] = Object.freeze([...ADMIN_ONLY_TOOLS])

/**
 * The toolset rule, applied per registrar tool (widget tools and `*_data`
 * feeds are read-only views and are not filtered):
 *
 *   1. Tools in {@link ADMIN_ONLY_TOOLS} exist only in `admin`.
 *   2. Tools with `annotations.readOnlyHint: true` exist in every toolset —
 *      and `read-only` lists NOTHING else (no exemptions: a read that must be
 *      discoverable there is its own `readOnlyHint` tool, e.g.
 *      `camunda7_list_engines` next to the write `camunda7_select_engine`).
 *   3. Everything else (engine writes: start/complete/claim/retries/…)
 *      exists in `operations` and `admin`.
 */
export function isToolInToolset(
  config: Pick<ToolConfig<EngineRegistry>, "name" | "annotations">,
  toolset: Camunda7Toolset,
): boolean {
  if (toolset === "admin") return true
  if (ADMIN_ONLY_TOOLS.has(config.name)) return false
  if (toolset === "operations") return true
  // read-only
  return config.annotations?.readOnlyHint === true
}

/**
 * The ONE durable-profile-write decision: whether `camunda7_save_user_profile`
 * exists in `toolset` — the registrar rule applied to the save tool (a write,
 * not admin-only → every toolset above the read-only floor).
 * `camunda7_select_engine` writes the same profile field and is a registrar
 * write, so the filter applies exactly this decision to it; the settings panel
 * reports it as `canSave`.
 */
export function allowsProfileSave(toolset: Camunda7Toolset): boolean {
  return isToolInToolset({ name: CAMUNDA7_SAVE_USER_PROFILE }, toolset)
}

/**
 * The in-widget writes ({@link CAMUNDA7_WIDGET_ACTIONS}) this deployment's
 * toolset registers — what the widgets render their action buttons from, so a
 * button and the tool surface can never disagree (the widget twin of the
 * settings panel's `canSave`). Every entry is an engine write, so the rule
 * needs no annotations — `isToolInToolset` only consults `readOnlyHint`,
 * which a write never carries.
 */
export function allowedWidgetActions(toolset: Camunda7Toolset): Camunda7WidgetAction[] {
  return CAMUNDA7_WIDGET_ACTIONS.filter((name) => isToolInToolset({ name }, toolset))
}

/**
 * Wraps a tool registrar so that only tools matching `toolset` reach the
 * server. The toolset is already concrete (resolved once by the plugin), so
 * there is no pass-through branch: every registration is filtered.
 */
export function withToolsetFilter(register: Register, toolset: Camunda7Toolset): Register {
  const filtered = <TShape extends ZodRawShape>(config: ToolConfig<EngineRegistry, TShape>) => {
    if (isToolInToolset(config, toolset)) register(config)
  }
  return Object.assign(filtered, { getRegisteredTools: () => register.getRegisteredTools() })
}
