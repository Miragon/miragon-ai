import { normalizeLayout, type LayoutConfig, type RowDef } from "@miragon/mcp-toolkit-core"
import { SHELL_SETTINGS_WIDGET } from "../shell-settings-contract.js"

/**
 * The convention that marks a module's settings section: the `<module>:settings`
 * widget id it catalogues for its own section.
 */
const SETTINGS_SECTION_SUFFIX = ":settings"

/**
 * The settings page, assembled from what the host actually composed: the
 * shell's language section first, then one row per `<module>:settings`
 * widget in the host registry, in registration order (the composition root's
 * module order).
 *
 * This is the host-extension point of the page. A module contributes its
 * section by catalogueing it as `<module>:settings` and having its widget map
 * spread into the host bundle's registry (link 3 of the widget chain) — no
 * edit anywhere else, so a custom module composed from the published packages
 * is a first-class citizen of the page.
 *
 * Section ids stay raw strings on purpose (tier-2 cross-module reference):
 * the host registry resolves them at runtime and {@link filterLayoutToWidgets}
 * drops whatever resolves nowhere. A module that IS bundled but inactive at
 * runtime (`MCP_ACTIVE_MODULES`) still contributes its id; its section widget
 * hides itself once its feed answers "unknown tool".
 */
export function settingsLayout(widgetIds: readonly string[] = []): LayoutConfig {
  const sections = widgetIds.filter(
    (id) => id !== SHELL_SETTINGS_WIDGET && id.endsWith(SETTINGS_SECTION_SUFFIX),
  )
  // Deduped: callers may merge several registries into the id list.
  return [SHELL_SETTINGS_WIDGET, ...new Set(sections)].map((widget) => ({
    row: [{ widget, props: {} }],
  }))
}

/**
 * Drop layout cells whose widget id resolves to no component in `widgets`
 * (cross-module ids in a host that does not bundle that module), then drop
 * emptied rows — the tier-2 degradation for composed views: a missing
 * module's section simply disappears instead of rendering an unknown-widget
 * error.
 */
export function filterLayoutToWidgets(
  layout: LayoutConfig,
  widgets: Record<string, unknown>,
): LayoutConfig {
  const filterRows = (rows: RowDef[]): RowDef[] =>
    rows
      .map((r) => ({ ...r, row: r.row.filter((cell) => cell.widget in widgets) }))
      .filter((r) => r.row.length > 0)
  const normalized = normalizeLayout(layout)
  return "tabs" in normalized
    ? { tabs: normalized.tabs.map((tab) => ({ ...tab, rows: filterRows(tab.rows) })) }
    : { rows: filterRows(normalized.rows) }
}
