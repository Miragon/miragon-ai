import type { AppConfig, AppConfigEntry, AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"
import type { ToolsetSource, ToolsetVocabulary } from "./toolsets.js"

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
  /**
   * The module's toolset vocabulary (`createToolsetVocabulary`). Declaring it
   * opts the module into the `module:toolset` suffix: the composition resolves
   * ONE concrete toolset per boot — the suffix, or the auth-dependent default,
   * never "everything" — and threads it into `config.toolset`. Absent = the
   * module has no toolsets.
   */
  toolsets?: ToolsetVocabulary<string>
  /**
   * @deprecated Declare {@link ComposableModule.toolsets} instead. `true`
   * without a vocabulary passes the raw suffix through unresolved and leaves an
   * absent suffix to the module (with a boot warning).
   */
  supportsToolsets?: boolean
  /** Optional boot-time hints (returned, and logged by the root) for active deployments. */
  bootWarnings?(env: NodeJS.ProcessEnv): string[]
  /** Validates the raw config and builds the plugin; receives the shared resources. */
  createPlugin(config: Record<string, unknown>, shared: TShared): AppPlugin<MCPServer>
}

export interface ActiveModuleRef {
  name: string
  /**
   * The raw toolset suffix from the `module:toolset` syntax, e.g.
   * `camunda7:read-only` — trimmed, and kept even when EMPTY (`camunda7:` →
   * `""`), so an empty suffix fails closed like an unknown one instead of
   * reading as "no suffix". Absent = no suffix: the auth-dependent default.
   */
  toolset?: string
}

/** The toolset one active module runs with — one entry of the boot log. */
export interface EffectiveToolset {
  module: string
  /** The concrete toolset; absent for a module without toolsets. */
  toolset?: string
  /**
   * Why: the suffix named it, the auth-dependent default applied, an empty or
   * unknown suffix fell back to the floor — `legacy` for a deprecated
   * `supportsToolsets` pass-through the module resolves itself, or `none` for
   * a module without toolsets.
   */
  source: ToolsetSource | "legacy" | "none"
  /**
   * Whether the toolset permits durable writes. A module without toolsets
   * declares no restriction (`true`); a `legacy` pass-through is unknowable
   * here and counts as restricted (`false`).
   */
  durableWrites: boolean
}

/** One boot's module selection, resolved ONCE by the composition root. */
export interface ResolvedBoot {
  /** Whether the root installed OAuth (a caller identity exists). */
  authenticated: boolean
  /** The active modules' mcp-use config entries, each carrying its effective toolset. */
  entries: AppConfigEntry[]
  toolsets: EffectiveToolset[]
}

export interface ResolveBootOptions {
  /**
   * Whether the composition root INSTALLED OAuth on `/mcp`. Only the root
   * knows — never infer it from an env var the root may not honor (a server
   * without OAuth wiring would read a stray `MCP_OAUTH` as authenticated and
   * fail open). Omitted = `false`, the fail-closed reading.
   */
  authenticated?: boolean
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
  /**
   * Resolve the boot ONCE: every toolset-bearing module gets a concrete
   * effective toolset in its config (suffix → itself; empty/unknown → the
   * module's floor, with one warning; none → the floor without OAuth, the
   * module's standard toolset with it). Call it once per boot and derive
   * plugins, `AppConfig` and the boot log from the result.
   */
  resolveBoot: (env?: NodeJS.ProcessEnv, options?: ResolveBootOptions) => ResolvedBoot
  /** `resolveBoot(env, options).entries`. */
  appEntries: (env?: NodeJS.ProcessEnv, options?: ResolveBootOptions) => AppConfigEntry[]
  appConfig: (env?: NodeJS.ProcessEnv, options?: ResolveBootOptions) => AppConfig
  /** Instantiate the active modules' plugins with the root's shared resources. */
  pluginsFor: (entries: AppConfigEntry[], shared: TShared) => AppPlugin<MCPServer>[]
  /** Report unknown env vars under any watched prefix; returns the offenders. */
  warnUnknownEnvVars: (env?: NodeJS.ProcessEnv, extraKnown?: Iterable<string>) => string[]
  /** Collect + log the active modules' boot-time hints. */
  emitBootWarnings: (env?: NodeJS.ProcessEnv) => string[]
  /** Log (console.info) and return the one boot line that states each active module's effective toolset. */
  logEffectiveToolsets: (boot: ResolvedBoot) => string
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
        // Everything after the FIRST colon is the suffix, kept even when empty
        // or when it contains further colons — both are then unknown toolset
        // names and fail closed, instead of reading as "no suffix".
        const colon = entry.indexOf(":")
        if (colon === -1) return { name: entry }
        return { name: entry.slice(0, colon).trim(), toolset: entry.slice(colon + 1).trim() }
      })
      .filter(({ name }) => {
        if (!registry[name]) {
          console.warn(`[${label}] Unknown module "${name}" in MCP_ACTIVE_MODULES — skipping`)
          return false
        }
        return true
      })
  }

  // The one place a suffix becomes a toolset: per module, per boot.
  const effectiveToolset = (
    module: ComposableModule<TShared>,
    suffix: string | undefined,
    authenticated: boolean,
  ): EffectiveToolset => {
    const vocabulary = module.toolsets
    if (vocabulary) {
      const { toolset, source } = vocabulary.effective(suffix, { authenticated })
      return {
        module: module.name,
        toolset,
        source,
        durableWrites: vocabulary.allowsDurableWrites(toolset),
      }
    }
    if (module.supportsToolsets) {
      console.warn(
        `[${label}] Module "${module.name}" declares the deprecated supportsToolsets without a toolsets vocabulary — ` +
          `its suffix is passed through unresolved; declare \`toolsets\` (createToolsetVocabulary) instead`,
      )
      // The composition cannot tell what the raw suffix (or the module's own
      // reading of a missing one) permits, so it must not count as a
      // write-capable module for framework writes: fail closed.
      return {
        module: module.name,
        ...(suffix === undefined ? {} : { toolset: suffix }),
        source: "legacy",
        durableWrites: false,
      }
    }
    if (suffix !== undefined) {
      console.warn(`[${label}] Module "${module.name}" has no toolsets — ignoring ":${suffix}"`)
    }
    return { module: module.name, source: "none", durableWrites: true }
  }

  const resolveBoot = (
    env: NodeJS.ProcessEnv = process.env,
    { authenticated = false }: ResolveBootOptions = {},
  ): ResolvedBoot => {
    const toolsets: EffectiveToolset[] = []
    const entries = activeModules(env).map(({ name, toolset: suffix }): AppConfigEntry => {
      const effective = effectiveToolset(registry[name], suffix, authenticated)
      toolsets.push(effective)
      const { toolset } = effective
      return {
        app: name,
        config: {
          ...registry[name].configFromEnv(env),
          ...(toolset === undefined ? {} : { toolset }),
        },
      }
    })
    return { authenticated, entries, toolsets }
  }

  const appEntries = (env?: NodeJS.ProcessEnv, options?: ResolveBootOptions): AppConfigEntry[] =>
    resolveBoot(env, options).entries

  return {
    knownEnvVars,
    activeModules,
    resolveBoot,
    appEntries,
    appConfig(env, options) {
      return { activeApps: appEntries(env, options), pipelines: {} }
    },
    pluginsFor(entries, shared) {
      return entries
        .filter((entry) => registry[entry.app])
        .map((entry) => registry[entry.app].createPlugin(entry.config, shared))
    },
    warnUnknownEnvVars(env = process.env, extraKnown = []) {
      const known = new Set([...knownEnvVars, ...extraKnown])
      // `<KNOWN_VAR>_*` extensions (DATABASE_URL_FILE, REDIS_URL_2, …) are
      // conventions addressed at OTHER processes — docker secrets, sidecars —
      // never a typo of the var they extend, so they don't warn.
      const extendsKnownVar = (name: string) =>
        [...known].some((knownName) => name.startsWith(`${knownName}_`))
      const unknown = Object.keys(env).filter(
        (name) =>
          watchedPrefixes.some((prefix) => name.startsWith(prefix)) &&
          !known.has(name) &&
          !extendsKnownVar(name) &&
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
      // Deliberately separate from `configFromEnv` (which runs inside
      // `resolveBoot` and stays side-effect free).
      const warnings = activeModules(env).flatMap(
        ({ name }) => registry[name].bootWarnings?.(env) ?? [],
      )
      for (const warning of warnings) {
        console.warn(`[${label}] ${warning}`)
      }
      return warnings
    },
    logEffectiveToolsets(boot) {
      // console.info, deliberately not a boot WARNING: it states the surface
      // on every boot, the restrictive default included.
      const describe = ({ module, toolset, source }: EffectiveToolset): string => {
        if (source === "legacy") {
          const suffix = toolset === undefined ? "" : `:${toolset}`
          return `${module}${suffix} (resolved by the module, deprecated)`
        }
        if (toolset === undefined) return `${module} (no toolsets)`
        if (source === "default") {
          return `${module}:${toolset} (default ${boot.authenticated ? "with" : "without"} OAuth)`
        }
        return `${module}:${toolset} (${source})`
      }
      const modules = boot.toolsets.map(describe).join(", ")
      const line = `[${label}] Toolsets — ${modules || "no active modules"}`
      console.info(line)
      return line
    },
  }
}

/**
 * Whether the server may register FRAMEWORK durable writes — the toolkit
 * builder's `save-dashboard`/`delete-dashboard`, which no module toolset
 * filters. Only with a caller identity (dashboards are keyed by user; without
 * OAuth every record is shared and ownerless) and only when no active module
 * sits on its read-only floor: the most restrictive module wins. A module on
 * the deprecated `supportsToolsets` pass-through counts as restricted too —
 * its surface is unknowable here — so it keeps the dashboard builder off.
 */
export function frameworkWritesAllowed(boot: ResolvedBoot): boolean {
  return boot.authenticated && boot.toolsets.every(({ durableWrites }) => durableWrites)
}
