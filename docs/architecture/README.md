# Architecture

The ecosystem consists of five top-level components plus an optional WireMock
sidecar for local enrichment demos.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                       MCP Host (Claude, ChatGPT, ...)                      │
│ ┌────────────┐  ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│ │ MCP Apps   │  │ camunda7-mcp  │  │ analytics-   │  │ enrichment-mcp  │ │
│ │ (React UI) │  │ engine tools  │  │ mcp          │  │ (opt-in via     │ │
│ │            │  │ + history     │  │ (ClickHouse) │  │  YAML config)   │ │
│ └─────┬──────┘  └───────┬───────┘  └──────┬───────┘  └────────┬────────┘ │
└───────┼─────────────────┼─────────────────┼───────────────────┼──────────┘
        ▼                 ▼                 ▼                   ▼
┌───────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│ Engine Adapter│  │ Engine REST  │  │ ClickHouse   │  │ Customer REST/   │
│ Camunda 7 /   │  │ + History    │  │ history +    │  │ SOAP backends    │
│ CIB Seven /   │  │ Plugin       │  │ analytics    │  │ (Salesforce,     │
│ Operaton      │  │ (Kotlin)     │  │              │  │  ERP, CRM, ...) │
└───────┬───────┘  └──────┬───────┘  └──────▲───────┘  └────────▲─────────┘
        ▼                 │                 │                   │
   ┌─────────┐            └─ History Events ┘                   │
   │ Engine  │              (batched JDBC inserts)              │
   │ runtime │                                                  │
   └─────────┘                                          ┌───────┴────────┐
                                                       │ WireMock (opt) │
                                                       │ docker stack   │
                                                       │ port 8088 — for│
                                                       │ local YAML demos│
                                                       └────────────────┘
```

## Design Principles

1. **Engine-agnostic** — every package goes through the Engine Adapter, never
   directly against an engine API.
2. **MCP-first** — all functionality is exposed as MCP tool or resource.
3. **Composable Docker** — infrastructure assembled from small, combinable
   compose services.
4. **OTEL-instrumented** — end-to-end tracing from MCP tool down to engine call.
5. **Enrichment is opt-in** — `enrichment-mcp` only registers tools when
   `ENRICHMENT_CONFIG_PATH` points at a valid YAML. Without it the rest of the
   stack runs unchanged.
6. **No external deps for demos** — the bundled `*-local.yaml` enrichment
   configs target the local WireMock sidecar, so contributors can exercise
   `enrichment_auto_resolve` without provisioning Salesforce / ERP credentials.

## Module Map

| Component        | Path                                 | Purpose                                                  |
| ---------------- | ------------------------------------ | -------------------------------------------------------- |
| `camunda7-mcp`   | `modules/camunda7/`                  | Engine tools (process definitions, instances, tasks, …)  |
| `analytics-mcp`  | `modules/analytics/`                 | Aggregated history queries against ClickHouse            |
| `enrichment-mcp` | `modules/enrichment/`                | YAML-driven REST lookups + `auto_resolve` rule engine    |
| MCP Apps         | `packages/camunda7-mcp-apps/`        | Interactive React widgets (BPMN viewer, dashboards, …)   |
| History Plugin   | `plugins/shared-history-clickhouse/` | Engine-side Kotlin plugin → batched JDBC into ClickHouse |
| WireMock stubs   | `docker/wiremock/mappings/`          | Backends for the `*-local.yaml` enrichment demos         |
