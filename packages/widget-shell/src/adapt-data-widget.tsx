/**
 * Re-exports the toolkit's data-widget adapter, extracted into
 * `@miragon/mcp-toolkit-ui` in 0.4.0. Kept as the stable
 * `@miragon-ai/widget-shell/ui` entry so the widget registries that adapt
 * single-data components don't have to repoint their imports.
 */
export { adaptDataWidget, type DescribeForModel } from "@miragon/mcp-toolkit-ui/app"
