/**
 * The shared skeleton of every module's toolset vocabulary: a declared name
 * list, a typed guard, and the ONE fail-closed rule for the
 * `MCP_ACTIVE_MODULES=<module>:<toolset>` suffix:
 *
 * - no suffix → the auth-dependent DEFAULT: the module's most restrictive
 *   toolset (the fallback) on an unauthenticated boot, its standard non-admin
 *   toolset (`authenticatedDefault`) when the root installed OAuth;
 * - an empty or unknown suffix → warns and degrades to the fallback: a suffix
 *   always meant to restrict, so restricting harder is the only safe reading;
 * - a known name → itself.
 *
 * Nothing ever resolves to "everything": a module's widest toolset (e.g.
 * camunda7's `admin`) is reachable only by naming it.
 *
 * The vocabulary itself (which names exist, what each one filters) stays
 * module-owned: peers own their names, only the semantics are shared. A module
 * builds its filter/durable-write decisions on top of `resolve` — never on an
 * ad-hoc `toolset === "read-only"` compare, which fails open for every other
 * name without the warning.
 */
export interface ToolsetVocabulary<T extends string> {
  /** The owning module's name — the prefix of every warning. */
  module: string
  names: readonly T[]
  /**
   * The most restrictive toolset — the module's READ-ONLY FLOOR: it permits no
   * durable write. Empty/unknown suffixes, unauthenticated boots and direct
   * callers that pass no toolset all land here.
   */
  fallback: T
  /** The no-suffix default under OAuth — the module's standard non-admin toolset. */
  authenticatedDefault: T
  isKnown(value: string): value is T
  /**
   * Normalize a configured toolset on the MODULE side: a known name resolves to
   * itself, an unknown one warns and resolves to the fallback, and a missing one
   * resolves to the fallback silently. The composition root hands every module
   * a concrete name ({@link ToolsetVocabulary.effective}), so a missing toolset
   * only reaches here from a direct `createPlugin` caller — which therefore
   * gets the floor, never everything.
   */
  resolve(toolset: string | undefined): T
  /**
   * The COMPOSITION side: the toolset a module runs with, given its
   * `module:toolset` suffix (`undefined` = no suffix, `""` = present but empty)
   * and whether the root installed OAuth. Warns on an empty or unknown suffix.
   */
  effective(suffix: string | undefined, options: { authenticated: boolean }): EffectiveSelection<T>
  /** Whether the toolset permits durable writes — every toolset above the read-only floor. */
  allowsDurableWrites(toolset: T): boolean
}

/** Where an effective toolset came from — the reason the boot log names. */
export type ToolsetSource = "suffix" | "default" | "fallback"

export interface EffectiveSelection<T extends string> {
  toolset: T
  source: ToolsetSource
}

export function createToolsetVocabulary<T extends string>(
  moduleName: string,
  names: readonly T[],
  /**
   * The module's most restrictive toolset — the read-only floor (no durable
   * writes). A `<module>:<toolset>` suffix is always an attempt to restrict, so
   * a typo must never grant more than the strictest set it could have meant,
   * and an unauthenticated boot without a suffix gets exactly this.
   */
  fallback: NoInfer<T>,
  options: {
    /**
     * The no-suffix default when the root installed OAuth — the module's
     * standard non-admin toolset. Omitted = the fallback (a module whose only
     * toolset is its floor).
     */
    authenticatedDefault?: NoInfer<T>
  } = {},
): ToolsetVocabulary<T> {
  const { authenticatedDefault = fallback } = options
  const isKnown = (value: string): value is T => (names as readonly string[]).includes(value)
  const degrade = (reason: string): T => {
    console.warn(
      `[${moduleName}] ${reason} — falling back to "${fallback}". Known toolsets: ${names.join(", ")}`,
    )
    return fallback
  }
  return {
    module: moduleName,
    names,
    fallback,
    authenticatedDefault,
    isKnown,
    resolve(toolset) {
      if (toolset === undefined) return fallback
      return isKnown(toolset) ? toolset : degrade(`Unknown toolset "${toolset}"`)
    },
    effective(suffix, { authenticated }) {
      if (suffix === undefined) {
        return { toolset: authenticated ? authenticatedDefault : fallback, source: "default" }
      }
      const name = suffix.trim()
      if (isKnown(name)) return { toolset: name, source: "suffix" }
      const reason = name === "" ? "Empty toolset suffix" : `Unknown toolset "${name}"`
      return { toolset: degrade(reason), source: "fallback" }
    },
    allowsDurableWrites(toolset) {
      return toolset !== fallback
    },
  }
}
