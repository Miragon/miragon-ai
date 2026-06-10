/**
 * Server-side surface of the widget shell (`@miragon-ai/widget-shell/server`):
 * eager view builders for `*_show_*` tools plus the shared error wrapper for
 * raw `server.tool()` registrations.
 */
export {
  buildComposedView,
  buildSingleWidgetView,
  type ComposedViewEntry,
  type ComposedViewInput,
  type SingleWidgetViewInput,
} from "./build-single-widget-view.js"
export { withToolErrors } from "./with-tool-errors.js"
