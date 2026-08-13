/**
 * The shared skeleton of every module's toolset vocabulary: a declared name
 * list, a typed guard, and the ONE fail-open rule for the
 * `MCP_ACTIVE_MODULES=<module>:<toolset>` suffix — `undefined` (no toolset
 * configured) exposes everything, unknown names warn and expose everything,
 * consistent with the composition root's semantics for unknown modules.
 *
 * The vocabulary itself (which names exist, what each one filters) stays
 * module-owned: peers own their names, only the semantics are shared. A module
 * builds its filter/durable-write decisions on top of `resolve` — never on an
 * ad-hoc `toolset === "read-only"` compare, which fails open for every other
 * name without the warning.
 */
export interface ToolsetVocabulary<T extends string> {
  names: readonly T[]
  isKnown(value: string): value is T
  /**
   * Normalize a configured toolset: `undefined` stays `undefined` (no toolset
   * — expose everything, silently), an unknown name warns and resolves
   * `undefined` (fail open, loudly), a known name resolves to itself.
   */
  resolve(toolset: string | undefined): T | undefined
}

export function createToolsetVocabulary<T extends string>(
  moduleName: string,
  names: readonly T[],
): ToolsetVocabulary<T> {
  const isKnown = (value: string): value is T => (names as readonly string[]).includes(value)
  return {
    names,
    isKnown,
    resolve(toolset) {
      if (toolset === undefined) return undefined
      if (!isKnown(toolset)) {
        console.warn(
          `[${moduleName}] Unknown toolset "${toolset}" — exposing all tools. ` +
            `Known toolsets: ${names.join(", ")}`,
        )
        return undefined
      }
      return toolset
    },
  }
}
