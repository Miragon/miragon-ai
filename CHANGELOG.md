# Changelog

## [0.19.0](https://github.com/Miragon/miragon-ai/compare/v0.18.0...v0.19.0) (2026-10-11)


### ⚠ BREAKING CHANGES

* **camunda7:** EngineHealthData drops `headline`; the verdict is `status` plus `summary`, worded by its reader. IncidentsDashboardData, ProcessIncidentsData and IncidentDetailData require `engineVendor`. The CIB seven provider's display name is "CIB seven". Several camunda7 catalog keys changed: the hand-off labels (`handOff.*`), the former `…One`/`…Other` plural pairs and several messages. The show tools' view titles come from the profile language, or are absent.
* **widget-shell:** The widget-shell tone vocabulary drops `critical` (use `danger`) and `TONE_TEXT` (use `TONE_INK`; numbers stay neutral, and a state is a dot, edge or icon). `WidgetHeader` no longer takes `icon`/`iconTone`. The tone colours live in `@miragon-ai/widget-shell/theme.css`, and the `--critical*` and `--*-foreground` tone tokens are gone from the app and template stylesheets; override `--<tone>`, `--<tone>-soft` and `--<tone>-ink` instead. `formatDuration` renders German units in a German view. The kit peers on `lucide-react` (`^0.562.0 || ^1.0.0`), which a consumer installs and appends to its vite `dedupe` list.
* In @miragon-ai/widget-shell, PagedViewData.error now carries only the page-0 failure; load-more failures move to the new loadMoreError, and retry, refreshing and stale are added. firstPage keeps the previous result of the same list while a new page 0 is in flight or has failed. camunda7:process-definition-flow drops its initialMode prop. camunda7_open_cockpit lists only the caller's engines (allowedEngineIds) and refuses an `engine` outside them with ENGINE_NOT_AVAILABLE instead of opening the picker.
* **widget-shell:** The profile language gains "system" (follow the host locale) and defaults to it, so ProfileRecord.language and the camunda7 UserProfile.language are now LanguagePref. View stylesheets import @miragon-ai/widget-shell/theme.css after tailwindcss, plus an @source for the toolkit's src, instead of @miragon/mcp-toolkit-ui/globals.css, and Geist is no longer shipped. ViewDisplayModeBridge is replaced by ViewHostBridge, and AppShellProviders no longer mounts mcp-use's ThemeProvider. ProfileGate holds the first paint until the profile answers: at most 1.5 s after the host connects, 5 s without a host. BpmnZoomControls sit top-right.
* AskAiButton's `prompt` accepts only an `AskAiPrompt` built by `askAiPrompt` from `@miragon-ai/widget-shell/widgets`: a raw string no longer compiles, and `null` renders no button. `@miragon-ai/camunda7-connector` no longer exports `CAMUNDA7_ENGINELESS_TOOLS`. `camunda7_format_incident_issue` and the `draft_incident_ticket` prompt drop their `repository` argument: drafts target only the configured `CAMUNDA_INCIDENT_ISSUE_REPO`, and without one there is no prefilled URL.
* **analytics:** analytics reads only the server's configured engines: camunda7's engine ids, else ANALYTICS_ENGINE_IDS, else every analytics tool refuses. It refuses any other `engine` id. analytics_engine_health returns `unknown` (a new status) for silent engines and only counts alerts scoped to them. @miragon-ai/analytics-client renames or removes result fields without aliases:
    - dashboard runningCount/failedCount/incidentCount/failureRatePct → runningNow/openIncidentsNow/incidentsCreated/incidentsResolved/incidentRatePct;
    - failureDashboardData.processBreakdown totalInstances/failedCount/incidentCount/failureRatePct → runningNow/deadJobs/openIncidents/incidentRatePct;
    - definitionBreakdown running/failed → runningNow/incidentsCreated;
    - activityBreakdown rows drop activityName and gain processDefinitionKey;
    - analyzePerformance/comparePeriods failed/failure_rate_pct → incident_count/incident_rate_pct, and analyzePerformance drops earliest/latest;
    - compare failed_count/failure_rate_pct and the failure-rate delta are removed, instance_count_delta_pct → started_per_day_delta_pct, and element-scoped incidents move to element_incident_*;
    - failure-dashboard and find-failed rows carry only incident type, process and counts;
    - durations and rates are null when not measured;
    - every engine-filterable result gains `engines`, and findFailedInstances returns { engines, patterns }.
* **camunda7:** camunda7 view payloads change meaning and shape. The definition view, the cockpit landscape and the incidents dashboard count every version of a key. ProcessIncidentsData.version is now diagramVersion; DefinitionStat.version and IncidentsDashboardProcess.version are now latestVersion; IncidentsDashboardProcess.totalActivityCount is gone; per-activity incidentCount is now scannedIncidentCount. Health and cluster counts follow the ClusterCounts shape: incidentCount is nullable, with scannedIncidentCount and a nullable last24hCount. Numbers the server cannot vouch for are null instead of 0: affected activities, the 24h and first-seen facts of a partial scan, siblingsWithIncidents and BpmnViewerData.bpmnXml. InstanceDetailData gains exact incidentCount/openTaskCount. BpmnViewerData gains statsScope and, in instance mode, counts only the instance's own tokens and failed jobs. The process-instance list reports totals over the whole filtered set. Engine failures and unknown ids are tool errors instead of empty views. The pipeline steps throw on failure and stamp engineId. The incidents-dashboard step reads its scope from camunda7:incidentsProcessDefinitionKey instead of camunda7:processDefinitionKey.
* @miragon-ai/widget-shell/server no longer exports `mergeRawSlice` (save a slice with `saveModuleSlice`) or `mergeProfile` (use `mergeStoredProfile(...).record`). `ComposableModule.supportsToolsets` is removed: a module without a `toolsets` vocabulary is a module without toolsets, so its suffix is ignored with a warning and its config never carries a `toolset`. `EffectiveToolset.source` no longer has the `"legacy"` value. Profile records stored below schema v3 are no longer migrated: they are adopted at schema v3, their flat v1/v2 module fields stay inert, and those preferences read as their defaults.
* camunda7_engine is gone: camunda7_list_engines (read-only) lists the engines and the saved default, and camunda7_select_engine saves it. The camunda7 `engine` parameter is advertised as an enum of the configured ids, so an unknown id now fails input validation instead of returning UNKNOWN_ENGINE. camunda7_list_process_definitions and camunda7_list_deployments return the { items, totalCount, hasMore, nextOffset? } envelope instead of a bare array. Every model-visible maxResults is capped at 100, and camunda7_show_history_timeline defaults to 100 (was 500). The model-facing variable reads cut string values over 2000 characters (truncated: true, valueLength); pass variableName to read one variable whole. Writes declare destructiveHint: false explicitly. BootComposition (createComposedServer) requires the composition's `instructions` member, and module snippets are appended to the server instructions. Advertised input schemas drop $schema and the safe-integer bounds.
* camunda7 and analytics tools, including show tools and app-only feeds, now reject unknown input keys with a tool error that lists the valid ones, instead of ignoring them. Parameters were renamed without aliases: camunda7_list_process_definitions, camunda7_show_process_list and camunda7_process_list_data take processDefinitionKey (was key); camunda7_get_deployment takes deploymentId (was id); camunda7_query_historic_task_instances takes assignee (was taskAssignee); camunda7_show_process_instances, camunda7_process_instances_data and the process-instances widget take withIncidents (was withIncidentsOnly; the echoed filters follow); analytics_find_failed_instances and analytics_element_bottleneck take maxResults (was limit, also in the analytics-client params); and the analytics cluster/engine/version compare tools and their show twins take activityId (was elementId; VERSION_ELEMENT_SCOPE_NOTE is now VERSION_ACTIVITY_SCOPE_NOTE). A false boolean filter is no longer forwarded: it is sent as its complementary flag or dropped. A complementary pair that asks for both states or neither is refused. A …Like filter without % now matches a substring instead of the exact value.
* A client-supplied Mcp-Session-Id is no longer a profile key, and a missing request context no longer maps to the shared `anonymous` record. Without MCP_OAUTH there is no caller identity: settings show defaults and saves refuse. MCP_PROFILE_SESSION_TTL_DAYS and REDIS_URL are no longer read. widget-shell drops startProfileSessionCleanup, isExpiredSessionRecord, ProfileStore.cleanupSessions, ProfileAuthContext and McpRequestInfo.sessionId; `anonymousCaller` declares the local caller instead. MCP_OAUTH is parsed strictly by widget-shell's oauthFromEnv, so `oidc`/`oidc-proxy` and the ignored `audience` key now fail the boot as invalid config. camunda7's EngineRegistry.defaultEngineId lookup now receives the tool call's ctx.
* **camunda7:** camunda7_handle_external_task_failure (and the exported handleExternalTaskFailureInput) requires retries; camunda7_set_job_retries_batch and camunda7_migrate_process_instances_async return { batchId, status: "queued", type, totalJobs, … } instead of { success: true, …, batch }; camunda7_complete_task submits the task form (/submit-form) only for a task with form fields, so the engine rejects a completion that violates those fields while omitted fields keep their value, a task without form fields still completes through /complete, and a delegated task is resolved back to its owner and stays open (outcome "resolved"); camunda7_get_task_form fails for an unknown task instead of returning empty fields; variable reads return Json/Xml/Object values serialized (a string plus valueInfo) instead of deserialized; date filters and Date variables refuse non-ISO-8601 input.

### Features

* **analytics:** Lucide hand-offs, brand-tone copy, honest comparisons and a shared vocabulary ([#380](https://github.com/Miragon/miragon-ai/issues/380)) ([6db8405](https://github.com/Miragon/miragon-ai/commit/6db84056379b9b029673c1712744c96fe46ca16d))
* build every Ask-AI hand-off with askAiPrompt — fenced engine text, localized intents, live tool surface ([#373](https://github.com/Miragon/miragon-ai/issues/373)) ([2fe8492](https://github.com/Miragon/miragon-ai/commit/2fe8492773cc0858e71ca4fd0af32a51c4e2200c))
* **camunda7:** Lucide icons, chat hand-offs and brand-tone copy in the camunda7 widgets ([#379](https://github.com/Miragon/miragon-ai/issues/379)) ([f773444](https://github.com/Miragon/miragon-ai/commit/f773444c4d53a5960c76b7a8f4aaef3d78d01845))
* **camunda7:** run every in-widget write through useEngineAction — named confirmations, targeted refresh, seeded standalone views ([#376](https://github.com/Miragon/miragon-ai/issues/376)) ([01bf2fa](https://github.com/Miragon/miragon-ai/commit/01bf2fa74d2ce9d37b1324d5c32999e8916e868b))
* **deps:** bump @miragon/mcp-toolkit-* to 2.6.0 and mcp-use to 2.7.3 ([#362](https://github.com/Miragon/miragon-ai/issues/362)) ([62a8879](https://github.com/Miragon/miragon-ai/commit/62a88791404648228e0af21c13445b0dbe171d42))
* **docs:** align the docs site with the Miragon CI dark theme ([#350](https://github.com/Miragon/miragon-ai/issues/350)) ([#369](https://github.com/Miragon/miragon-ai/issues/369)) ([017fe4d](https://github.com/Miragon/miragon-ai/commit/017fe4dd5ed4cb65603430feb61d47c8403d7d63))
* LLM surface trims — engine enum + server instructions, camunda7_engine split, one pagination contract, historic incidents, labelled health verdicts ([#368](https://github.com/Miragon/miragon-ai/issues/368)) ([11d7d8a](https://github.com/Miragon/miragon-ai/commit/11d7d8a648ca1578322c8b9f3bfa11e16c6fe88b))
* **widget-shell:** lay the Miragon design-system foundation in the kit ([#378](https://github.com/Miragon/miragon-ai/issues/378)) ([242ec19](https://github.com/Miragon/miragon-ai/commit/242ec19bebea74f2fa929fca39dfdfb6071d57ca))


### Bug Fixes

* **analytics:** report only what the metrics measure — unknown health, live gauges, null durations, clamped windows, configured engines ([#372](https://github.com/Miragon/miragon-ai/issues/372)) ([60e20bc](https://github.com/Miragon/miragon-ai/commit/60e20bc302e7828396c3e18a1b91243661754766))
* **camunda7:** honour the engine REST contract in tools, feeds and widgets ([#365](https://github.com/Miragon/miragon-ai/issues/365)) ([c5d5f69](https://github.com/Miragon/miragon-ai/commit/c5d5f696d974b04dc080ffd02d3993792867de94))
* **camunda7:** report honest camunda7 numbers — key-wide views, counts over capped scans, errors over zeros ([#371](https://github.com/Miragon/miragon-ai/issues/371)) ([0bfbabc](https://github.com/Miragon/miragon-ai/commit/0bfbabc456f7a884dee74ab8dab99ab8abc1dbd1))
* **camunda7:** resolve real definition keys in the data builders and echo the incidents-dashboard filters ([#374](https://github.com/Miragon/miragon-ai/issues/374)) ([594ed37](https://github.com/Miragon/miragon-ai/commit/594ed37ca100484e95bb17716798fad6021960bd))
* open the cockpit on its resolved engine, keep paged lists mounted while they fetch, gate the heatmap on analytics and read tenant diagrams by id ([#377](https://github.com/Miragon/miragon-ai/issues/377)) ([2f6f56c](https://github.com/Miragon/miragon-ai/commit/2f6f56ca7e06cf8eb01b6a438acdb81ab8c95b86))
* profile persistence keeps unknown keys, serializes writes and degrades on store outages ([#363](https://github.com/Miragon/miragon-ai/issues/363)) ([e900ac9](https://github.com/Miragon/miragon-ai/commit/e900ac96cebf5ad4b140dda6d73d7b768807285e))
* refuse unknown tool inputs and give the tools the filters their prompts promise ([#367](https://github.com/Miragon/miragon-ai/issues/367)) ([3024da1](https://github.com/Miragon/miragon-ai/commit/3024da114678767c6de3fb4d94b0bdc2d26d47f1))
* resolve caller identity from OAuth only, wired through widget-shell's oauthFromEnv ([#366](https://github.com/Miragon/miragon-ai/issues/366)) ([cdd40a1](https://github.com/Miragon/miragon-ai/commit/cdd40a1daa46b425c578158635780d9517949721))
* **widget-shell:** follow the host — theme, locale, height, fonts, BPMN canvas, fullscreen ([#375](https://github.com/Miragon/miragon-ai/issues/375)) ([eca2918](https://github.com/Miragon/miragon-ai/commit/eca29184b2c29c891e80c9d7a440ed96cf20d8e2))


### Code Refactoring

* remove the pre-production compat paths ([#370](https://github.com/Miragon/miragon-ai/issues/370)) ([29c9f98](https://github.com/Miragon/miragon-ai/commit/29c9f98ca8f06323e2c7164a3a8f46aa10132b69))

## [0.18.0](https://github.com/Miragon/miragon-ai/compare/v0.17.0...v0.18.0) (2026-10-09)


### ⚠ BREAKING CHANGES

* **server:** requests whose Host (or, on non-GET requests, Origin) is not localhost-class, MCP_URL's or allow-listed via MCP_ALLOWED_HOSTS / MCP_ALLOWED_ORIGINS get 403 (`*` disables a check), so a server reached under a public name must set MCP_URL or the allow-lists; request bodies over MCP_MAX_BODY_BYTES (default 4194304) get 413; MCP_OAUTH now requires MCP_URL; and camunda7_engine "list", UserProfileView.availableEngines and CockpitEngineInfo no longer carry the engine REST baseUrl.
* **analytics:** @miragon-ai/analytics-client's VersionCompareKpi failed_count, failure_rate_pct, incident_count and incident_rate_pct (and the two rate deltas) are now `number | null` and always null, and VersionCompareResult gains a required `notes: string[]`. analytics_version_compare and analytics_show_version_compare report these KPIs as unavailable instead of 0; the previous zeros were never measured values.
* toolsets fail closed. Without a suffix in MCP_ACTIVE_MODULES a module no longer gets every tool: unauthenticated boots (no MCP_OAUTH) run each module read-only; with MCP_OAUTH the defaults are camunda7:operations and the new analytics:standard; admin is reached only by naming it; an empty (camunda7:) or unknown suffix falls back to read-only, even under OAuth. camunda7_create_deployment additionally requires CAMUNDA_ALLOW_DEPLOYMENTS=true (deploying is code execution inside the engine JVM). camunda7_throw_signal and the external-task worker protocol (fetch_and_lock, complete_external_task, handle_external_task_failure) are admin-only; the new camunda7_list_external_tasks (read-only) and camunda7_set_external_task_retries (operations) cover reading and recovering external tasks. The dashboard builder and its tools need OAuth and no read-only module. A server behind an auth-terminating gateway looks unauthenticated and must name its toolsets. Restore the previous surface with MCP_ACTIVE_MODULES=camunda7:admin,analytics:standard (+ CAMUNDA_ALLOW_DEPLOYMENTS=true for deployments, MCP_OAUTH for dashboards). Package API: a direct createPlugin call without `toolset` (camunda7 or analytics) now registers the read-only floor, so pass the toolset explicitly (camunda7 also needs `allowDeployments: true` for deployments); createToolsetVocabulary().resolve(undefined) returns the floor instead of undefined, and ToolsetVocabulary gained module/fallback/authenticatedDefault/effective/allowsDurableWrites, so build vocabularies with createToolsetVocabulary; modules declare `toolsets` instead of the deprecated supportsToolsets (which keeps a raw pass-through but blocks the dashboard builder); composed servers boot via composeModules().resolveBoot(env, { authenticated }) and logEffectiveToolsets.

### Features

* fail-closed toolset defaults and opt-in deployments ([#351](https://github.com/Miragon/miragon-ai/issues/351)) ([005cdd9](https://github.com/Miragon/miragon-ai/commit/005cdd9d97d9909348723f91f3a0bfe3cf47f1ec))


### Bug Fixes

* **analytics:** version-compare incident KPIs unavailable instead of 0; label-checked metrics contract ([#356](https://github.com/Miragon/miragon-ai/issues/356)) ([144f410](https://github.com/Miragon/miragon-ai/commit/144f4103e42902266f6adfd03546008afa229e59))
* **camunda7,analytics:** actionable engine errors, upstream timeouts and Prometheus auth ([#357](https://github.com/Miragon/miragon-ai/issues/357)) ([8d1045d](https://github.com/Miragon/miragon-ai/commit/8d1045d7db81f41fcc488ff9839df92b58d9337f))
* **camunda7:** send deployment resources as real multipart parts ([#355](https://github.com/Miragon/miragon-ai/issues/355)) ([dab051c](https://github.com/Miragon/miragon-ai/commit/dab051ca7c0eebec1629e566104a33f5ae5f654b))
* **server:** DNS-rebinding protection, pre-auth body cap, graceful drain and one createApp factory ([#358](https://github.com/Miragon/miragon-ai/issues/358)) ([e1fa024](https://github.com/Miragon/miragon-ai/commit/e1fa0244ee13e416f1c8131277169c4b7de85edb))

## [0.17.0](https://github.com/Miragon/miragon-ai/compare/v0.16.0...v0.17.0) (2026-09-30)


### Features

* **deps:** bump @miragon/mcp-toolkit-* to 2.5.0 and mcp-use to 2.7.1 ([#316](https://github.com/Miragon/miragon-ai/issues/316)) ([ad0edd8](https://github.com/Miragon/miragon-ai/commit/ad0edd857ed2b61c1ad75056cf91fcb3b76077d8))


### Bug Fixes

* bump the npm-dependencies group with 17 updates ([#314](https://github.com/Miragon/miragon-ai/issues/314)) ([f9b9e2e](https://github.com/Miragon/miragon-ai/commit/f9b9e2e53601ac9cf97fc8ce5a964196e96dd7eb))

## [0.16.0](https://github.com/Miragon/miragon-ai/compare/v0.15.0...v0.16.0) (2026-09-23)


### Features

* **camunda7:** hide widget actions and views the deployment does not expose ([#307](https://github.com/Miragon/miragon-ai/issues/307)) ([687f780](https://github.com/Miragon/miragon-ai/commit/687f78088b9c35ad58a1eb91e853c7472d0f7166))

## [0.15.0](https://github.com/Miragon/miragon-ai/compare/v0.14.0...v0.15.0) (2026-09-21)


### Features

* **deps:** publish consumer-shared libraries as ranged peerDependencies ([#305](https://github.com/Miragon/miragon-ai/issues/305)) ([7e48000](https://github.com/Miragon/miragon-ai/commit/7e480009c45ca4a6f7a3b6b7de2321c3602b5488))


### Bug Fixes

* **ci:** cut releases for runtime dependency bumps ([#301](https://github.com/Miragon/miragon-ai/issues/301)) ([387a4dd](https://github.com/Miragon/miragon-ai/commit/387a4dd4a24247fe5843a3ab9e4804d0a2509869))

## [0.14.0](https://github.com/Miragon/miragon-ai/compare/v0.13.0...v0.14.0) (2026-09-10)


### Features

* **server:** health probes and Prometheus metrics next to /mcp ([#290](https://github.com/Miragon/miragon-ai/issues/290)) ([e04a462](https://github.com/Miragon/miragon-ai/commit/e04a462fb0eab7a183288ad803f1ea0febb20925))

## [0.13.0](https://github.com/Miragon/miragon-ai/compare/v0.12.0...v0.13.0) (2026-09-09)


### Features

* **camunda7:** environment-map engine config with two-stage selection ([#276](https://github.com/Miragon/miragon-ai/issues/276)) ([6483480](https://github.com/Miragon/miragon-ai/commit/6483480e31772c8d42c37d4f6bb722d59ed3c6dc))

## [0.12.0](https://github.com/Miragon/miragon-ai/compare/v0.11.0...v0.12.0) (2026-08-17)


### Features

* **widget-shell:** share the Postgres persistence layer with composed servers ([#258](https://github.com/Miragon/miragon-ai/issues/258)) ([c1b3037](https://github.com/Miragon/miragon-ai/commit/c1b30371f4c0c090fd75d17dfcacbb13e550e8b6))

## [0.11.0](https://github.com/Miragon/miragon-ai/compare/v0.10.0...v0.11.0) (2026-08-17)


### Features

* starter-template DX — self-sufficient dev loop, install guards, headless verification ([#256](https://github.com/Miragon/miragon-ai/issues/256)) ([46f5d89](https://github.com/Miragon/miragon-ai/commit/46f5d89cc8cabecb45a9fb51159a31055a733069))

## [0.10.0](https://github.com/Miragon/miragon-ai/compare/v0.9.0...v0.10.0) (2026-08-15)


### Features

* **widget-shell:** share the host app shell and boot helpers with composed servers ([#253](https://github.com/Miragon/miragon-ai/issues/253)) ([8c20434](https://github.com/Miragon/miragon-ai/commit/8c2043464b60320f9a26008144409fc3221907f5))

## [0.9.0](https://github.com/Miragon/miragon-ai/compare/v0.8.0...v0.9.0) (2026-08-14)


### ⚠ BREAKING CHANGES

* **camunda7:** `cockpitViews.settings()` no longer takes zero arguments. Every builder in `cockpitViews` is now typed `(params: ViewParams, ctx?: ViewContext) => LayoutConfig`, so callers pass the route params plus, for the composed settings view, the host's widget ids: `cockpitViews.settings(params, { widgetIds })`. Called without the context it yields camunda7's own section alone.

### Features

* **camunda7:** assemble the settings page from the host widget registry ([#251](https://github.com/Miragon/miragon-ai/issues/251)) ([a4eda7e](https://github.com/Miragon/miragon-ai/commit/a4eda7e90dc4410ea26db44371dbadcfdb34b2a1))

## [0.8.0](https://github.com/Miragon/miragon-ai/compare/v0.7.0...v0.8.0) (2026-08-13)


### ⚠ BREAKING CHANGES

* **repo:** the npm packages @miragon-ai/mcp-camunda7, @miragon-ai/client-camunda7, @miragon-ai/mcp-analytics and @miragon-ai/client-analytics are renamed to @miragon-ai/camunda7-connector, @miragon-ai/camunda7-client, @miragon-ai/analytics-connector and @miragon-ai/analytics-client; the old names stay behind on the registry.

### Code Refactoring

* **repo:** split packages into core/connectors and extract the platform core into widget-shell ([#244](https://github.com/Miragon/miragon-ai/issues/244)) ([f5605d2](https://github.com/Miragon/miragon-ai/commit/f5605d21d0260702d81d525f2554dcfd7ea1ff44))

## [0.7.0](https://github.com/Miragon/miragon-ai/compare/v0.6.0...v0.7.0) (2026-08-12)


### ⚠ BREAKING CHANGES

* **analytics:** `analytics_engine_compare` and `analytics_show_engine_compare` reject calls without `processDefinitionKey`.

### Features

* **analytics:** cross-engine landscape; engine_compare requires a process key ([#242](https://github.com/Miragon/miragon-ai/issues/242)) ([0faf5fb](https://github.com/Miragon/miragon-ai/commit/0faf5fb0649ef779ca667add82b962a7efe731a0))

## [0.6.0](https://github.com/Miragon/miragon-ai/compare/v0.5.1...v0.6.0) (2026-08-11)


### ⚠ BREAKING CHANGES

* MCP_OAUTH providers "oidc"/"oidc-proxy" now fail the boot (upstream removed jwksVerifier/oauthProxy); REDIS_URL session sharing is ignored (the pluggable backend seam is gone); persisted user settings and the sticky engine selection require MCP_OAUTH (stateless HTTP has no session ids).

### Features

* **engine-plugins:** record process metrics via Micrometer ([#226](https://github.com/Miragon/miragon-ai/issues/226)) ([abe2b9c](https://github.com/Miragon/miragon-ai/commit/abe2b9c8b73b7e885934e6729d87a8c3b607872b))
* migrate to @miragon/mcp-toolkit 1.1.0 on mcp-use 2 ([#239](https://github.com/Miragon/miragon-ai/issues/239)) ([538ce47](https://github.com/Miragon/miragon-ai/commit/538ce47ba2ac01929b3411d0e097dcece021df0e))

## [0.5.1](https://github.com/Miragon/miragon-ai/compare/v0.5.0...v0.5.1) (2026-08-07)


### Bug Fixes

* **docker:** keep the pnpm store in the image layer, not a cache mount ([#209](https://github.com/Miragon/miragon-ai/issues/209)) ([d9f6d7a](https://github.com/Miragon/miragon-ai/commit/d9f6d7aae1aa8346305fc6c3c0b36f54b9ee0fa8))

## [0.5.0](https://github.com/Miragon/miragon-ai/compare/v0.4.0...v0.5.0) (2026-08-05)


### Features

* give the composed-server template a loaded .env.example ([#208](https://github.com/Miragon/miragon-ai/issues/208)) ([5fc31fe](https://github.com/Miragon/miragon-ai/commit/5fc31fe4d0a442c93d6d5b82cd10fa85b67408bd))


### Bug Fixes

* **ci:** gate npm publish behind release approval ([#205](https://github.com/Miragon/miragon-ai/issues/205)) ([2a28651](https://github.com/Miragon/miragon-ai/commit/2a286516daf70d933d7fff931e2547db60032ecf))

## [0.4.0](https://github.com/Miragon/miragon-ai/compare/v0.3.0...v0.4.0) (2026-08-05)


### Features

* align the single-engine id with the metrics engine_id label ([#201](https://github.com/Miragon/miragon-ai/issues/201)) ([7188ebc](https://github.com/Miragon/miragon-ai/commit/7188ebc9cccdc3c822dc4045dec1d33f06733968))
* composed-server template — build your own server from the npm modules ([#203](https://github.com/Miragon/miragon-ai/issues/203)) ([fa4837f](https://github.com/Miragon/miragon-ai/commit/fa4837f2f5cc5359c731c8c458d4e444848f7217))

## [0.3.0](https://github.com/Miragon/miragon-ai/compare/v0.2.1...v0.3.0) (2026-08-04)


### ⚠ BREAKING CHANGES

* drop upstream/proxy federation — an external MCP gateway takes over ([#162](https://github.com/Miragon/miragon-ai/issues/162))

### Features

* **camunda7:** unify cockpit list pagination, filtering, and item UI ([#171](https://github.com/Miragon/miragon-ai/issues/171)) ([89b3070](https://github.com/Miragon/miragon-ai/commit/89b3070de756f782dfb90f7a9be1d452595b2f13))
* dialect-true package composition — renames, module contract, engine provider port ([#167](https://github.com/Miragon/miragon-ai/issues/167)) ([c1d737f](https://github.com/Miragon/miragon-ai/commit/c1d737f0299dda7a573bd453dcb887ad333bfe28))
* **docs:** cookie consent via consentmanager, like the marketing site ([#151](https://github.com/Miragon/miragon-ai/issues/151)) ([c88b750](https://github.com/Miragon/miragon-ai/commit/c88b750ebf7c8e1a3aec010a86c917c0354cd0a7))
* **docs:** hero "Try it out" button opens the MCP inspector ([#152](https://github.com/Miragon/miragon-ai/issues/152)) ([37b20dc](https://github.com/Miragon/miragon-ai/commit/37b20dcad09f85025b848ad0555a3ce670615157))
* **docs:** prominent "Try it out" CTA with example prompt ([#153](https://github.com/Miragon/miragon-ai/issues/153)) ([5c63368](https://github.com/Miragon/miragon-ai/commit/5c6336811a2303c783c0f5a12b15a23876aca2e2))
* **docs:** redesign the landing hero around a live conversation ([#154](https://github.com/Miragon/miragon-ai/issues/154)) ([fe654f9](https://github.com/Miragon/miragon-ai/commit/fe654f99c99b31278af7849fb6f0a9a61a9ce64e))
* drop upstream/proxy federation — an external MCP gateway takes over ([#162](https://github.com/Miragon/miragon-ai/issues/162)) ([ad09d8a](https://github.com/Miragon/miragon-ai/commit/ad09d8a9293f9ef781e08b83a0bbbd5dbcd1fdad))
* durable user settings — Postgres persistence, modular settings page, auth-scoped profiles ([#177](https://github.com/Miragon/miragon-ai/issues/177)) ([8fc91cb](https://github.com/Miragon/miragon-ai/commit/8fc91cb26736b1477ab6307e39eb6e660797cc62))
* OAuth resource-server, engine token passthrough, per-engine auth ([#144](https://github.com/Miragon/miragon-ai/issues/144)) ([2ae5094](https://github.com/Miragon/miragon-ai/commit/2ae5094f6bbce49902c24e96391e3587837f2c91))
* **playground:** reset the Fly.io playground nightly at midnight ([#157](https://github.com/Miragon/miragon-ai/issues/157)) ([c308742](https://github.com/Miragon/miragon-ai/commit/c3087421eeb7b938639181bf0fb1e96362a8c5fd))
* replace examples/ with deployable playground (Compose + Fly.io) ([#146](https://github.com/Miragon/miragon-ai/issues/146)) ([cf09d6a](https://github.com/Miragon/miragon-ai/commit/cf09d6a381889dc73c50f41716da5b20b3f5c0f7))
* repo-review remediation — bugfixes, shared widget primitives, generic shell widgets ([#158](https://github.com/Miragon/miragon-ai/issues/158)) ([51263b2](https://github.com/Miragon/miragon-ai/commit/51263b2f8f24fc48f9f9611910a049f21ab45e16))
* UI review remediation — shared primitives, engine-safe mutations, a11y/i18n fixes ([#168](https://github.com/Miragon/miragon-ai/issues/168)) ([e673992](https://github.com/Miragon/miragon-ai/commit/e6739925f6d9e0f459d65b24182c6bab609fb72d))


### Bug Fixes

* add missing npm metadata to published packages ([#182](https://github.com/Miragon/miragon-ai/issues/182)) ([69ff2bc](https://github.com/Miragon/miragon-ai/commit/69ff2bc9fe94b62a5c00418dcfc5817beeaf4e8d))
* **widgets:** expert-review fixes — paging scope, Apps-SDK contract, i18n/a11y, typed feed contracts, bundle diet, KPI navigation ([#173](https://github.com/Miragon/miragon-ai/issues/173)) ([08370a5](https://github.com/Miragon/miragon-ai/commit/08370a5b79b52b6cb1cc30a76fa983a89b5061f7))

## [0.2.1](https://github.com/Miragon/miragon-ai/compare/v0.2.0...v0.2.1) (2026-06-22)


### Bug Fixes

* **docker:** install pnpm directly, node:26 dropped corepack ([#135](https://github.com/Miragon/miragon-ai/issues/135)) ([f664c8e](https://github.com/Miragon/miragon-ai/commit/f664c8e83df0f5d8f44dd116c2356b2ef38a1da8))

## [0.2.0](https://github.com/Miragon/miragon-ai/compare/v0.1.0...v0.2.0) (2026-06-22)


### Features

* add Camunda 7 ops skills + supporting MCP tools ([#40](https://github.com/Miragon/miragon-ai/issues/40)) ([4309afd](https://github.com/Miragon/miragon-ai/commit/4309afdf4e052d55ef8228ac7d343ca0a5460cfa))
* add testdata ([#36](https://github.com/Miragon/miragon-ai/issues/36)) ([3e087a6](https://github.com/Miragon/miragon-ai/commit/3e087a624fb4bf1d494efda8218895c1b4f13654))
* AI-first audit fixes, stages 1-4 — feedback loops, knowledge & tests, MCP tool surface, contracts & publishing ([#124](https://github.com/Miragon/miragon-ai/issues/124)) ([673c3c3](https://github.com/Miragon/miragon-ai/commit/673c3c3609cf6213e30924326140cc9807c1edb0))
* **analytics:** render path frequency as BPMN heatmap ([#60](https://github.com/Miragon/miragon-ai/issues/60)) ([b68b18d](https://github.com/Miragon/miragon-ai/commit/b68b18d1de55f4af66a17c326e6b364aab51dc96))
* **analytics:** self-fetching failure widgets + manifest descriptions ([#80](https://github.com/Miragon/miragon-ai/issues/80)) ([7d52658](https://github.com/Miragon/miragon-ai/commit/7d52658925c7139ef7818e42cc212ccbe75931b8))
* **analytics:** version-compare tool, version-aware path-frequency, realistic seed timings ([#75](https://github.com/Miragon/miragon-ai/issues/75)) ([2413a46](https://github.com/Miragon/miragon-ai/commit/2413a46666cfb1678d79f313e47e8067f3feedb1))
* **bpmn-viewer:** accept processDefinitionKey + version as alternative to processInstanceId ([#81](https://github.com/Miragon/miragon-ai/issues/81)) ([25326ad](https://github.com/Miragon/miragon-ai/commit/25326ad3cd65f0cdbfb230141c3793242a7acfd4))
* **bpmn-viewer:** improve alignment and zoom controls in incident panel ([#54](https://github.com/Miragon/miragon-ai/issues/54)) ([4269f09](https://github.com/Miragon/miragon-ai/commit/4269f09ed67a2887cb48bd6a58b0b356f83d1a84))
* **bpmn-viewer:** re-fit zoom on fullscreen toggle and resize ([#74](https://github.com/Miragon/miragon-ai/issues/74)) ([fca00a7](https://github.com/Miragon/miragon-ai/commit/fca00a720526c0d7c115e32e77e2a8f7e5467f3d))
* **builder:** per-cell scoping for self-fetching widgets ([#71](https://github.com/Miragon/miragon-ai/issues/71)) ([086747c](https://github.com/Miragon/miragon-ai/commit/086747c56e66b8ad9c61fdb6f90ef4b9586c549b))
* Camunda Cockpit MCP + Analytics dashboards + client package refactor ([#14](https://github.com/Miragon/miragon-ai/issues/14)) ([265336c](https://github.com/Miragon/miragon-ai/commit/265336c5e10a06e1a790946f4cdad8407e2b0e92))
* **camunda7:** user profile & settings + i18n (localized summaries & widgets) ([#126](https://github.com/Miragon/miragon-ai/issues/126)) ([7cddd4c](https://github.com/Miragon/miragon-ai/commit/7cddd4cbbede55af6790722a7c0d7ccc156739c1))
* **cockpit:** CI-style process views + host-bridge navigation ([#55](https://github.com/Miragon/miragon-ai/issues/55)) ([c3997c5](https://github.com/Miragon/miragon-ai/commit/c3997c5a65525f4d8a6b3861a43300983791b151))
* **cockpit:** consolidated client-side CIB Seven cockpit (v4) ([#96](https://github.com/Miragon/miragon-ai/issues/96)) ([b32232d](https://github.com/Miragon/miragon-ai/commit/b32232df717b632f252ce8cfc5939e11512d714b))
* dev-platform MVP — T4 + T7 + T8 + T9 + T10 + T11 + T13 ([#35](https://github.com/Miragon/miragon-ai/issues/35)) ([ecdb8fe](https://github.com/Miragon/miragon-ai/commit/ecdb8fe4f9c4590ac299a91d157c35987d092648))
* **docker:** add mcp-server to compose stack ([#42](https://github.com/Miragon/miragon-ai/issues/42)) ([107648f](https://github.com/Miragon/miragon-ai/commit/107648f2a7a8faf6897718680bef858bc105b2d8))
* **docs:** replace GitBook with lightweight VitePress site ([#84](https://github.com/Miragon/miragon-ai/issues/84)) ([80e9aaa](https://github.com/Miragon/miragon-ai/commit/80e9aaaee423eb17f37cd3a4376e7f3b632f9f3e))
* **history:** populate trace_id in camunda history tables ([#62](https://github.com/Miragon/miragon-ai/issues/62)) ([b7b4249](https://github.com/Miragon/miragon-ai/commit/b7b4249e4aa358a007a71eb7bccb3cea71182058))
* **incident-detail:** add per-incident analysis view with OTEL logs ([#61](https://github.com/Miragon/miragon-ai/issues/61)) ([5fbfc79](https://github.com/Miragon/miragon-ai/commit/5fbfc79a189221fb9ec939a535df7c096424690c))
* **incident-panel:** distinct panels for incidents ([#53](https://github.com/Miragon/miragon-ai/issues/53)) ([b4d1330](https://github.com/Miragon/miragon-ai/commit/b4d13308fcd95c59d5f29c9f475bcbd7bd30fcc5))
* **incidents:** MCP tool + prompt to file engine incidents as GitHub issues ([#66](https://github.com/Miragon/miragon-ai/issues/66)) ([#72](https://github.com/Miragon/miragon-ai/issues/72)) ([daa73fb](https://github.com/Miragon/miragon-ai/commit/daa73fb0af309bb2fa9a4181366a6d73ac218112))
* initialize miragon.ai ([2a93770](https://github.com/Miragon/miragon-ai/commit/2a93770c272729befa0167ff9187acf776f9effc))
* **miravelo:** standalone leasing-application upstream + bpmn-viewer consolidation ([#82](https://github.com/Miragon/miragon-ai/issues/82)) ([d51c0c1](https://github.com/Miragon/miragon-ai/commit/d51c0c16a05a6db87e5118a20fec01d449843a88))
* **multi-engine:** route operations + analytics across multiple CIB Seven engines ([#91](https://github.com/Miragon/miragon-ai/issues/91)) ([ef492e6](https://github.com/Miragon/miragon-ai/commit/ef492e643a3c6732e2bac81ec2a4a213c223bd87))
* **release:** GHCR pipeline for the MCP server + correct engine-plugin namespace ([#128](https://github.com/Miragon/miragon-ai/issues/128)) ([a2d4f54](https://github.com/Miragon/miragon-ai/commit/a2d4f54bcb239ebc15db344a7b58fd1fda6681a6))
* replace loanApproval/orderFulfillment demos with Miravelo showcase ([#43](https://github.com/Miragon/miragon-ai/issues/43)) ([362b9a9](https://github.com/Miragon/miragon-ai/commit/362b9a9013e38e28014a38e207d517c240f99a2a))
* **task-form:** customer support order lookup + generic task completion form ([#64](https://github.com/Miragon/miragon-ai/issues/64)) ([046d2ab](https://github.com/Miragon/miragon-ai/commit/046d2ab0b34434bec882123b8ba863c19b6ca1ca))
* **task-form:** use embedded BPMN form definition instead of variable inference ([#69](https://github.com/Miragon/miragon-ai/issues/69)) ([63fa024](https://github.com/Miragon/miragon-ai/commit/63fa0244a9df51c7c569ef47c802822cb1acf0b6))
* **widget-shell:** use full width in fullscreen mode ([#59](https://github.com/Miragon/miragon-ai/issues/59)) ([3d706da](https://github.com/Miragon/miragon-ai/commit/3d706daa7683fb79b79890b0d994e645371a7e0e))
* **widgets:** shadcn token system + dark mode, a11y, color & state fixes ([#94](https://github.com/Miragon/miragon-ai/issues/94)) ([7938574](https://github.com/Miragon/miragon-ai/commit/7938574c0da4ff77f031704d7ef17149b3197ea1))


### Bug Fixes

* **analytics:** forward per-cell props in split dashboard widgets ([#79](https://github.com/Miragon/miragon-ai/issues/79)) ([f679ec2](https://github.com/Miragon/miragon-ai/commit/f679ec297f0b973d17a7435531961ea7817a5386))
* **analytics:** make failure & analytics dashboards render in render-view ([#57](https://github.com/Miragon/miragon-ai/issues/57)) ([92a1277](https://github.com/Miragon/miragon-ai/commit/92a1277e6a7f6f523e2ab36472fd26f6cb7b3474))
* **cibseven:** resolve render-view step client from the engine registry ([#97](https://github.com/Miragon/miragon-ai/issues/97)) ([eeaf741](https://github.com/Miragon/miragon-ai/commit/eeaf741b3af79da62bbe992576f2156d4de88ade))
* dev startup, missing enrichment config, and Docker build issues ([#50](https://github.com/Miragon/miragon-ai/issues/50)) ([58b6cec](https://github.com/Miragon/miragon-ai/commit/58b6cec818f3b44142067e049e0b5b5b34af0bc5))
* **heatmap:** colorize full canvas on retina displays ([#68](https://github.com/Miragon/miragon-ai/issues/68)) ([ecd6fc0](https://github.com/Miragon/miragon-ai/commit/ecd6fc09ac0039fd0a6c9ba49e5f660136d57e4e))
* **tooling:** create verified commits via GraphQL API ([#26](https://github.com/Miragon/miragon-ai/issues/26)) ([854d591](https://github.com/Miragon/miragon-ai/commit/854d5915472187881be8c1699b38078a402bfc8d))
* **tooling:** use GITHUB_TOKEN for push and PR operations in auto-format bot ([#24](https://github.com/Miragon/miragon-ai/issues/24)) ([73410e8](https://github.com/Miragon/miragon-ai/commit/73410e84dd19709daf7562f567bbad9f5ff1b135))
* **tooling:** use GITHUB_TOKEN for push, TOOLKIT_PAT for PR creation ([0d650f7](https://github.com/Miragon/miragon-ai/commit/0d650f7a71400a988c1d5c9d269eedbbd6c4e840))
* **ui:** route render-view through framework McpAppView shell ([#48](https://github.com/Miragon/miragon-ai/issues/48)) ([aaa08ae](https://github.com/Miragon/miragon-ai/commit/aaa08ae8cab05c1b7c24a2b1ab69dacbe1fcaa43))


### Reverts

* **deps:** pin spring-boot back to 3.5.6 (CIB Seven 2.1 incompat) ([#63](https://github.com/Miragon/miragon-ai/issues/63)) ([a79ea1c](https://github.com/Miragon/miragon-ai/commit/a79ea1cb1f07c347b4c83edd59200435beaf4daf))

## Changelog

All notable changes to this project are documented here. This file is maintained
automatically by [release-please](https://github.com/googleapis/release-please) from
Conventional Commit messages — do not edit it by hand.
