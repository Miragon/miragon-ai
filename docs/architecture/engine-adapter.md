# Engine Adapter

## Motivation

Camunda 7, CIB Seven und Operaton teilen sich den gleichen Kern. Ihre REST-APIs sind zu >95% identisch, unterscheiden sich aber in Base-URL-Pfaden, Maven Coordinates und einzelnen API-Endpunkten.

Der Engine Adapter abstrahiert diese Unterschiede, sodass MCP Server und MCP Apps engine-agnostisch bleiben.

## Architektur

```
EngineAdapter (Interface)
    │
    ├── BaseAdapter (Shared HTTP Logic)
    │       │
    │       ├── Camunda7Adapter
    │       ├── CibSevenAdapter
    │       └── OperatonAdapter
    │
    └── HttpClient (fetch + OTEL Spans)
```

## Interface

Das `EngineAdapter` Interface definiert alle Engine-Operationen:

- **Process Definitions**: list, getXml, start
- **Process Instances**: list, get, activityTree, delete, modify
- **User Tasks**: list, get, claim, unclaim, complete, setAssignee
- **Messages & Signals**: correlateMessage, throwSignal
- **Variables**: get, set
- **History**: queryHistoricProcessInstances, Activities, Tasks, Variables
- **Incidents & Jobs**: list, resolve, setRetries
- **External Tasks**: fetchAndLock, complete, handleFailure
- **Deployments**: list, create

## HttpClient mit OTEL

Der HttpClient ist mit OpenTelemetry instrumentiert:

- Jeder Request erzeugt einen Span (`engine.http GET /task`)
- Trace Context wird via `traceparent` Header propagiert
- Metriken: `engine.http.duration_ms` Histogram

## Konfiguration

```typescript
const adapter = createEngineAdapter({
  engineType: 'cibseven',
  baseUrl: 'http://localhost:8080/engine-rest',
  authType: 'basic',
  username: 'demo',
  password: 'demo',
});
```
