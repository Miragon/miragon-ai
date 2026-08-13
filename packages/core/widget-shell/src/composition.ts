import type { AppConfig, AppConfigEntry, AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"

/**
 * The composition-root machinery every server (the stock app AND a customer's
 * composed server) previously copied: module selection via
 * `MCP_ACTIVE_MODULES` (with the `module:toolset` suffix), the env-typo
 * warner, boot warnings, and the mcp-use `AppConfig`/plugin assembly.
 *
 * The module PORT SHAPE lives here ({@link ComposableModule}); what stays
 * app-owned by design is its instantiation: each composition root declares its
 * own shared-resources type (`ComposableModule<MyShared>`), its module list,
 * and the cross-module wiring — which module's capability reaches which other
 * module is configuration knowledge, never a module-to-module import.
 * Modules keep conforming STRUCTURALLY and never import this type.
 */
export interface ComposableModule<TShared> {
  /** Module key used in `MCP_ACTIVE_MODULES` and as the `activeApps` entry name. */
  name: string
  /** Pure env → raw-config mapping; must not read `process.env` or perform I/O side effects beyond config sources. */
  configFromEnv(env: NodeJS.ProcessEnv): Record<string, unknown>
  /** Env vars this module reads — composed into the root's unknown-var typo warner. */
  knownEnvVars: readonly string[]
  /** Whether the module understands the `module:toolset` suffix syntax. */
  supportsToolsets: boolean
  /** Optional boot-time hints (returned, and logged by the root) for active deployments. */
  bootWarnings?(env: NodeJS.ProcessEnv): string[]
  /** Validates the raw config and builds the plugin; receives the shared resources. */
  createPlugin(config: Record<string, unknown>, shared: TShared): AppPlugin<MCPServer>
}

export interface ActiveModuleRef {
  name: string
  /**
   * Optional toolset suffix from the `module:toolset` syntax, e.g.
   * `camunda7:read-only`. Validated by the module itself (unknown toolsets
   * warn + expose all tools — fail-open, consistent with the unknown-module
   * handling here).
   */
  toolset?: string
}

/**
 * All members are `this`-free closures (function properties, not methods), so
 * composition roots may destructure or re-export them directly
 * (`export const warnUnknownEnvVars = composition.warnUnknownEnvVars`).
 */
export interface ModuleComposition<TShared> {
  /** Every known env var: the root's own plus each module's slice. */
  knownEnvVars: ReadonlySet<string>
  /** The `MCP_ACTIVE_MODULES` selection (unset/`all` = every module); unknown names warn and are skipped. */
  activeModules: (env?: NodeJS.ProcessEnv) => ActiveModuleRef[]
  /** The active modules' mcp-use config entries, toolset suffix threaded into each config. */
  appEntries: (env?: NodeJS.ProcessEnv) => AppConfigEntry[]
  appConfig: (env?: NodeJS.ProcessEnv) => AppConfig
  /** Instantiate the active modules' plugins with the root's shared resources. */
  pluginsFor: (entries: AppConfigEntry[], shared: TShared) => AppPlugin<MCPServer>[]
  /** Report unknown env vars under any watched prefix; returns the offenders. */
  warnUnknownEnvVars: (env?: NodeJS.ProcessEnv, extraKnown?: Iterable<string>) => string[]
  /** Collect + log the active modules' boot-time hints. */
  emitBootWarnings: (env?: NodeJS.ProcessEnv) => string[]
}

export function composeModules<TShared>(options: {
  /** Log prefix for every warning, e.g. `miragon-ai`. */
  label: string
  modules: readonly ComposableModule<TShared>[]
  /** The root's own env vars (module vars come from each module's `knownEnvVars`). */
  appEnvVars?: readonly string[]
  /**
   * Prefixes owned by dependencies, exempt from the typo warner
   * (mcp-use itself + the dev inspector by default).
   */
  foreignEnvPrefixes?: readonly string[]
  /** Optional pointer appended to the unknown-var warning, e.g. `see docs/operations.md`. */
  envVarHint?: string
}): ModuleComposition<TShared> {
  const {
    label,
    modules,
    appEnvVars = [],
    foreignEnvPrefixes = ["MCP_USE_", "MCP_INSPECTOR_"],
    envVarHint,
  } = options

  const registry: Record<string, ComposableModule<TShared>> = Object.fromEntries(
    modules.map((m) => [m.name, m]),
  )
  const knownEnvVars = new Set([...appEnvVars, ...modules.flatMap((m) => [...m.knownEnvVars])])

  // Watched prefixes derive from every known var (NOTES_TITLE contributes
  // NOTES_, PROMETHEUS_URL contributes PROMETHEUS_, …) so custom modules get
  // the same typo coverage as the CAMUNDA_/MCP_ families — a hardcoded prefix
  // list would silently exempt every non-Camunda module.
  const watchedPrefixes = [
    ...new Set(
      [...knownEnvVars]
        .map((name) => name.slice(0, name.indexOf("_") + 1))
        .filter((prefix) => prefix.length > 1),
    ),
  ]

  const activeModules = (env: NodeJS.ProcessEnv = process.env): ActiveModuleRef[] => {
    const envValue = env.MCP_ACTIVE_MODULES?.trim()

    if (!envValue || envValue === "all") {
      return modules.map(({ name }) => ({ name }))
    }

    return envValue
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry): ActiveModuleRef => {
        const [name, toolset] = entry.split(":", 2)
        return toolset ? { name, toolset } : { name }
      })
      .filter(({ name }) => {
        if (!registry[name]) {
          console.warn(`[${label}] Unknown module "${name}" in MCP_ACTIVE_MODULES — skipping`)
          return false
        }
        return true
      })
  }

  const appEntries = (env: NodeJS.ProcessEnv = process.env): AppConfigEntry[] =>
    activeModules(env).map(({ name, toolset }) => {
      if (toolset && !registry[name].supportsToolsets) {
        console.warn(
          `[${label}] Module "${name}" has no toolsets — ignoring ":${toolset}" and exposing all tools`,
        )
        toolset = undefined
      }
      return {
        app: name,
        config: {
          ...registry[name].configFromEnv(env),
          ...(toolset ? { toolset } : {}),
        },
      }
    })

  return {
    knownEnvVars,
    activeModules,
    appEntries,
    appConfig(env) {
      return { activeApps: appEntries(env), pipelines: {} }
    },
    pluginsFor(entries, shared) {
      return entries
        .filter((entry) => registry[entry.app])
        .map((entry) => registry[entry.app].createPlugin(entry.config, shared))
    },
    warnUnknownEnvVars(env = process.env, extraKnown = []) {
      const known = new Set([...knownEnvVars, ...extraKnown])
      const unknown = Object.keys(env).filter(
        (name) =>
          watchedPrefixes.some((prefix) => name.startsWith(prefix)) &&
          !known.has(name) &&
          !foreignEnvPrefixes.some((prefix) => name.startsWith(prefix)),
      )
      for (const name of unknown) {
        console.warn(
          `[${label}] Unknown environment variable "${name}" — the server does not read it; ` +
            `check for a typo${envVarHint ? ` (${envVarHint})` : ""}.`,
        )
      }
      return unknown
    },
    emitBootWarnings(env = process.env) {
      // Deliberately separate from `configFromEnv` (which runs twice per boot
      // — plugins + app config — and stays side-effect free).
      const warnings = activeModules(env).flatMap(
        ({ name }) => registry[name].bootWarnings?.(env) ?? [],
      )
      for (const warning of warnings) {
        console.warn(`[${label}] ${warning}`)
      }
      return warnings
    },
  }
}
