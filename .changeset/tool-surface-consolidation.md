---
"@miragon-ai/client-cibseven": minor
"@miragon-ai/client-analytics": patch
---

Consolidate the process-instance suspension input schemas: `suspendProcessInstanceInput`
and `activateProcessInstanceInput` are replaced by a single
`setProcessInstanceSuspensionInput` with an explicit `suspended` boolean. The
engine-discovery hints in the analytics input schemas now point at the consolidated
`camunda7_engine` tool (action "list") instead of the removed `camunda7_list_engines`.
