// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import * as widgets from "./index.js"

/**
 * The `/widgets` entry a connector builds its views from: the table frame and
 * its helpers, the settings controls, the heatmap, the name-before-id cell and
 * the one severity ladder are reachable from it,
 * not only from their own modules (a piece missing here is a piece no
 * connector can import). The types travel with them (`ListTableColumn`,
 * `ListTableGroup`, `ColumnSort`), checked by `pnpm typecheck` in the
 * connectors that use them.
 */
describe("the /widgets entry", () => {
  it.each([
    "ListTable",
    "COLUMN_BREAKPOINTS",
    "Th",
    "Td",
    "TableEmptyState",
    "SettingsCard",
    "SettingsField",
    "SettingsInput",
    "NativeSelect",
    "BpmnHeatmapWidget",
    "HeatValuesTable",
    "NamedId",
    "countTone",
    "severityTone",
  ])("exports %s", (name) => {
    expect(widgets).toHaveProperty(name)
    expect(widgets[name as keyof typeof widgets]).toBeDefined()
  })
})
