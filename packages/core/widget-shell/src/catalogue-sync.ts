/**
 * Widget-catalogue drift check (architecture invariant 3, links 1↔2), shared
 * by every module's `catalogue-sync.test.ts`: every component in the module's
 * widget map must be catalogued in its `definition.widgets` and vice versa. A
 * widget missing from the catalogue is invisible to
 * `render-view`/`get-builder-catalogue`; a catalogue entry without a
 * registered component renders an empty slot — both silently.
 *
 * Pure and framework-free on purpose (no vitest import): tests assert
 * `expect(catalogueSyncIssues(definition, widgets)).toEqual([])`, so a failure
 * lists every drifted id at once.
 */
export function catalogueSyncIssues(
  definition: { widgets: ReadonlyArray<{ id: string }> },
  components: Record<string, unknown>,
): string[] {
  const issues: string[] = []
  const catalogued = definition.widgets.map((w) => w.id)
  const registered = new Set(Object.keys(components))

  const seen = new Set<string>()
  for (const id of catalogued) {
    if (seen.has(id)) issues.push(`duplicate catalogue entry: ${id}`)
    seen.add(id)
    if (!registered.has(id)) issues.push(`catalogued but no component registered: ${id}`)
  }
  for (const id of registered) {
    if (!seen.has(id)) issues.push(`component registered but not catalogued: ${id}`)
  }
  return issues
}
