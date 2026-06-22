# @miragon-ai/client-analytics

## 0.1.1

### Patch Changes

- 673c3c3: Declare publishing metadata for the two publication candidates: `publishConfig`
  targeting npm.pkg.github.com (restricted), a `files` allowlist (`dist`, plus the
  `metrics-contract.json` artefact for client-analytics), and `repository` fields.
- 673c3c3: Consolidate the process-instance suspension input schemas: `suspendProcessInstanceInput`
  and `activateProcessInstanceInput` are replaced by a single
  `setProcessInstanceSuspensionInput` with an explicit `suspended` boolean. The
  engine-discovery hints in the analytics input schemas now point at the consolidated
  `camunda7_engine` tool (action "list") instead of the removed `camunda7_list_engines`.
