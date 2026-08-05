import type { AppDefinition } from "@miragon/mcp-toolkit-core"

/**
 * The module's widget catalogue — link 2 of the four-link widget chain. Every
 * widget id listed here must have a component in `widgets/index.ts` (guarded
 * by `widgets/catalogue-sync.test.ts`) and an entry in the host app's
 * `widget-registry.ts` (guarded by the server's widget-registry test).
 */
export const definition: AppDefinition = {
  name: "notes",
  steps: [],
  widgets: [
    {
      id: "notes:list",
      description: "The team's operations notes: title, tags, and last update per note.",
      requires: [],
      consumes: ["notes:list"],
      size: "full",
    },
  ],
}

export default definition
