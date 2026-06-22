# @miragon-ai/client-cibseven

## 0.2.0

### Minor Changes

- 673c3c3: Publication readiness: replace the `./*` wildcard export with explicit `./sdk`,
  `./types`, and `./schemas` subpaths, move the widget view-model interfaces out
  of the package (they live in `@miragon-ai/mcp-cibseven` now), lift the runtime
  client options into the hey-api generator config so generated types and runtime
  behavior share one source (`createClientConfig`), and add a `spec:refresh`
  script plus a README documenting the OpenAPI spec origin and refresh procedure.
- 673c3c3: Consolidate the process-instance suspension input schemas: `suspendProcessInstanceInput`
  and `activateProcessInstanceInput` are replaced by a single
  `setProcessInstanceSuspensionInput` with an explicit `suspended` boolean. The
  engine-discovery hints in the analytics input schemas now point at the consolidated
  `camunda7_engine` tool (action "list") instead of the removed `camunda7_list_engines`.

### Patch Changes

- 673c3c3: Declare publishing metadata for the two publication candidates: `publishConfig`
  targeting npm.pkg.github.com (restricted), a `files` allowlist (`dist`, plus the
  `metrics-contract.json` artefact for client-analytics), and `repository` fields.
