import { adaptDataWidget, type WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import { GenericDataTableWidget, GenericKpiGridWidget } from "./generic-widgets.js"
import { SettingsPageWidget, ShellSettingsWidget } from "./shell-settings.js"
import { SHELL_SETTINGS_PAGE_WIDGET, SHELL_SETTINGS_WIDGET } from "../shell-settings-contract.js"

/**
 * The `shell:*` widgets every host bundle spreads into its registry next to
 * the modules' maps — the components behind `shellDefinition`'s catalogue
 * (`createShellPlugin`), so link 3 of the widget chain is one spread.
 */
export const shellWidgets = {
  "shell:kpi-grid": GenericKpiGridWidget,
  "shell:data-table": GenericDataTableWidget,
  // Both read `shell:settings` data: the section self-fetches it, the page
  // receives it from shell_show_settings and leaves it to the section.
  [SHELL_SETTINGS_WIDGET]: adaptDataWidget(ShellSettingsWidget, "shell:settings"),
  [SHELL_SETTINGS_PAGE_WIDGET]: adaptDataWidget(SettingsPageWidget, "shell:settings"),
} satisfies Record<string, WidgetComponent>
