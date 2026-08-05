import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import { camunda7Widgets } from "@miragon-ai/mcp-camunda7/widgets"
import { analyticsWidgets } from "@miragon-ai/mcp-analytics/widgets"
import { notesWidgets } from "@acme/mcp-notes/widgets"
import { GenericDataTableWidget, GenericKpiGridWidget } from "@miragon-ai/widget-shell/widgets"

/**
 * The host bundle map — link 3 of the four-link widget chain, and one of the
 * four places a new module must be added to (README "Adding your own module";
 * start at MODULES in `src/setup.ts`). A forgotten spread here is SILENT:
 * the module's tools work but every widget renders as an empty slot.
 * `test/widget-registry.test.ts` guards this against all composed module
 * catalogues.
 */
export const widgetRegistry = {
  ...camunda7Widgets,
  ...analyticsWidgets,
  ...notesWidgets,
  // Generic shell widgets — the render-view/builder composition targets any
  // module can feed via props.dataKey (catalogue: @miragon-ai/widget-shell/server).
  "shell:kpi-grid": GenericKpiGridWidget,
  "shell:data-table": GenericDataTableWidget,
} satisfies Record<string, WidgetComponent>
