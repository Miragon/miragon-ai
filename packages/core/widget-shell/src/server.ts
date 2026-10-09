/**
 * Server-side surface of the widget shell (`@miragon-ai/widget-shell/server`):
 * the eager view builders for `*_show_*` tools plus the shared error wrapper for
 * raw `server.tool()` registrations. Both were extracted into the toolkit core
 * in 0.4.0; this barrel keeps the stable `/server` import path so the
 * camunda7/analytics widget tools don't have to churn their imports.
 */
import {
  buildComposedView as buildComposedViewCore,
  buildSingleWidgetView as buildSingleWidgetViewCore,
  type ComposedViewInput,
  type SingleWidgetViewInput,
} from "@miragon/mcp-toolkit-core"

export type {
  ComposedViewEntry,
  ComposedViewInput,
  SingleWidgetViewInput,
} from "@miragon/mcp-toolkit-core"
export { withToolErrors } from "@miragon/mcp-toolkit-core/tools"
export { createShellPlugin, shellDefinition } from "./shell-catalogue.js"
export {
  ANONYMOUS_PROFILE_KEY,
  resolveAuthUserId,
  resolveProfileKey,
  withoutDefaults,
  type ProfileSlice,
  type ProfileSource,
} from "./profile.js"
export {
  getMcpRequestInfo,
  installMcpRequestContext,
  runWithMcpRequestInfo,
  type McpMiddlewareHost,
  type McpRequestInfo,
} from "./request-context.js"
export { OAUTH_ENV_VARS, oauthFromEnv, type OAuthFromEnvOptions } from "./oauth-env.js"
export {
  installToolCallLogging,
  resolvePort,
  swallowDevCliViewsPrime,
  type ResolvePortOptions,
  type ToolCallMiddlewareHost,
} from "./host-boot.js"
export {
  installHealthEndpoints,
  type HealthOptions,
  type HealthReport,
  type HealthStatus,
  type HttpRouteHost,
  type ReadinessCheck,
} from "./health.js"
export {
  installMetrics,
  type HttpMiddlewareContext,
  type HttpMiddlewareHost,
  type MetricsHost,
  type MetricsOptions,
} from "./metrics.js"
export {
  DEFAULT_MAX_BODY_BYTES,
  HTTP_EDGE_ENV_VARS,
  installHttpEdgeGuard,
  resolveHttpEdgePolicy,
  type AllowList,
  type EdgeGuardContext,
  type EdgeGuardHost,
  type EdgeGuardOptions,
  type HttpEdgePolicy,
} from "./http-edge.js"
export {
  createBodyLimitedListener,
  type BodyLimitedListener,
  type BodyLimitedListenerOptions,
  type FetchTarget,
} from "./node-listener.js"
export {
  createComposedServer,
  DEFAULT_DRAIN_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  type BootComposition,
  type ComposedServer,
  type ComposedServerInfo,
  type ComposedServerOptions,
  type ComposedServerRuntime,
  type ListenOptions,
  type RunningServer,
} from "./composed-server.js"
export {
  LOCALES,
  PROFILE_SCHEMA_VERSION,
  THEMES,
  type Locale,
  type ThemePref,
} from "./profile-constants.js"
export {
  defaultProfileRecord,
  profileRecordSchema,
  type ProfileRecord,
  type ProfileRecordSaveInput,
} from "./profile-record.js"
export { parseStoredProfile } from "./profile-migrations.js"
export {
  createFileSystemProfileStore,
  createInMemoryProfileStore,
  mergeProfile,
  mergeStoredProfile,
  type MergedProfile,
  type ProfileSaveOptions,
  type ProfileStore,
} from "./profile-store.js"
export { readProfileAdvisory } from "./profile-advisory.js"
export { createPostgresProfileStore, PROFILE_STORE_MIGRATIONS } from "./profile-store-postgres.js"
export {
  createPostgresDashboardStore,
  DASHBOARD_STORE_MIGRATIONS,
} from "./dashboard-store-postgres.js"
export { createSql, postgresReadinessCheck, runMigrations, type Migration } from "./postgres.js"
export { appOnly, showToolBinding, strictToolInput } from "./widget-tool-bindings.js"
export {
  composeModules,
  frameworkWritesAllowed,
  type ActiveModuleRef,
  type ComposableModule,
  type EffectiveToolset,
  type ModuleComposition,
  type ResolveBootOptions,
  type ResolvedBoot,
} from "./composition.js"
export {
  announcePersistence,
  persistenceFromEnv,
  profileStoreFromEnv,
  type PersistenceBackend,
  type PersistenceSelection,
} from "./profile-store-env.js"
export {
  createToolsetVocabulary,
  type EffectiveSelection,
  type ToolsetSource,
  type ToolsetVocabulary,
} from "./toolsets.js"
export {
  createLocalizeFor,
  resolveProfileLocale,
  type ServerT,
  type Translator,
} from "./server-locale.js"
export {
  mergeRawSlice,
  parseModuleSlice,
  requireProfileKey,
  saveModuleSlice,
} from "./profile-slice.js"
export { catalogueSyncIssues } from "./catalogue-sync.js"

/**
 * mcp-use's raw `server.tool()` callback expects a result with an implicit
 * string index signature, which TypeScript synthesizes for anonymous object
 * types but NOT for the toolkit's named `ViewToolResult` interface. Re-annotate
 * the builders' return as that anonymous shape (the runtime value is the
 * toolkit's, unchanged) so the eager `*_show_*` handlers stay assignable.
 */
type ViewResult = {
  content: { type: "text"; text: string }[]
  structuredContent: Record<string, unknown>
}

export const buildSingleWidgetView = (input: SingleWidgetViewInput): ViewResult =>
  buildSingleWidgetViewCore(input)

export const buildComposedView = (input: ComposedViewInput): ViewResult =>
  buildComposedViewCore(input)

/**
 * Plain (no-UI) tool result for an app-only `*_data` feed: the JSON payload as
 * text AND as structuredContent, deliberately free of widget `_meta` keys — a
 * widget-tool result (`ui.resourceUri`) would be rendered by the host instead
 * of being returned to the in-widget `callTool()` (architecture invariant 5).
 * The single shared implementation for every module's data feeds.
 */
export const buildDataFeedResult = (data: Record<string, unknown>): ViewResult => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  structuredContent: data,
})
