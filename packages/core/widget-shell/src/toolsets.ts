/**
 * The shared skeleton of every module's toolset vocabulary: a declared name
 * list, a typed guard, and the ONE rule for the
 * `MCP_ACTIVE_MODULES=<module>:<toolset>` suffix — `undefined` (no toolset
 * configured) exposes everything, an unknown name warns and degrades to the
 * module's most restrictive toolset (fail closed): a typo'd suffix always
 * meant to restrict, so restricting harder is the only safe reading.
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
   * — expose everything, silently), an unknown name warns and resolves to the
   * fallback toolset (fail closed, loudly), a known name resolves to itself.
   */
  resolve(toolset: string | undefined): T | undefined
}

export function createToolsetVocabulary<T extends string>(
  moduleName: string,
  names: readonly T[],
  /**
   * The toolset unknown names degrade to — the module's most restrictive one.
   * A `<module>:<toolset>` suffix is always an attempt to restrict, so a typo
   * must never grant more than the strictest set it could have meant.
   */
  fallback: NoInfer<T>,
): ToolsetVocabulary<T> {
  const isKnown = (value: string): value is T => (names as readonly string[]).includes(value)
  return {
    names,
    isKnown,
    resolve(toolset) {
      if (toolset === undefined) return undefined
      if (!isKnown(toolset)) {
        console.warn(
          `[${moduleName}] Unknown toolset "${toolset}" — falling back to "${fallback}". ` +
            `Known toolsets: ${names.join(", ")}`,
        )
        return fallback
      }
      return toolset
    },
  }
}
