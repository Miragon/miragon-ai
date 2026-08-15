import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import { camunda7Widgets } from "@miragon-ai/camunda7-connector/widgets"
import { analyticsWidgets } from "@miragon-ai/analytics-connector/widgets"
import { notesWidgets } from "@acme/mcp-notes/widgets"
import { GenericDataTableWidget, GenericKpiGridWidget } from "@miragon-ai/widget-shell/widgets"

/**
 * The host bundle map — one of the four places a new module is wired into
 * (start at MODULES in `src/setup.ts`; the `create-module` skill lists all
 * four). A forgotten spread here is SILENT: the module's tools work but every
 * widget renders as an empty slot. `test/widget-registry.test.ts` guards this
 * against all composed module catalogues.
 */
export const widgetRegistry = {
  ...camunda7Widgets,
  ...analyticsWidgets,
  ...notesWidgets,
  // Generic shell widgets — composition targets any module can feed via
  // props.dataKey.
  "shell:kpi-grid": GenericKpiGridWidget,
  "shell:data-table": GenericDataTableWidget,
} satisfies Record<string, WidgetComponent>
