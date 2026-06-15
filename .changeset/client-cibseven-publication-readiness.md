---
"@miragon-ai/client-cibseven": minor
---

Publication readiness: replace the `./*` wildcard export with explicit `./sdk`,
`./types`, and `./schemas` subpaths, move the widget view-model interfaces out
of the package (they live in `@miragon-ai/mcp-cibseven` now), lift the runtime
client options into the hey-api generator config so generated types and runtime
behavior share one source (`createClientConfig`), and add a `spec:refresh`
script plus a README documenting the OpenAPI spec origin and refresh procedure.
