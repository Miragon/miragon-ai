# Engine Adapter

## Motivation

Camunda 7, CIB Seven, and Operaton share the same core. Their REST APIs are

> 95% identical, but they differ in base-URL paths, Maven coordinates, and
> individual API endpoints.

The Engine Adapter abstracts those differences so MCP servers and MCP Apps
stay engine-agnostic.

## Architecture

```
EngineAdapter (interface)
    │
    ├── BaseAdapter (shared HTTP logic)
    │       │
    │       ├── Camunda7Adapter
    │       ├── CibSevenAdapter
    │       └── OperatonAdapter
    │
    └── HttpClient (fetch + OTEL spans)
```

## Interface

The `EngineAdapter` interface defines all engine operations:

- **Process Definitions**: list, getXml, start
- **Process Instances**: list, get, activityTree, delete, modify
- **User Tasks**: list, get, claim, unclaim, complete, setAssignee
- **Messages & Signals**: correlateMessage, throwSignal
- **Variables**: get, set
- **History**: queryHistoricProcessInstances, Activities, Tasks, Variables
- **Incidents & Jobs**: list, resolve, setRetries
- **External Tasks**: fetchAndLock, complete, handleFailure
- **Deployments**: list, create

## HttpClient with OTEL

The HttpClient is instrumented with OpenTelemetry:

- Every request emits a span (`engine.http GET /task`)
- Trace context is propagated via the `traceparent` header
- Metrics: `engine.http.duration_ms` histogram

## Configuration

```typescript
const adapter = createEngineAdapter({
  engineType: "cibseven",
  baseUrl: "http://localhost:8080/engine-rest",
  authType: "basic",
  username: "demo",
  password: "demo",
})
```
