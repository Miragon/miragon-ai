# OTEL → ClickHouse Integration

> Observability für das gesamte Camunda 7 MCP Ecosystem via OpenTelemetry

## Architekturentscheidung

**OTEL Collector als zentraler Hub** — kein Direktexport aus den Komponenten.

Begründung:
- Entkopplung: Komponenten kennen nur OTLP, nicht das Backend
- Flexibilität: Backend-Wechsel (Jaeger → Tempo, ClickHouse → Grafana) ohne Code-Änderung
- Sampling & Processing: Tail-based Sampling, Attribute-Enrichment zentral konfigurierbar
- Multi-Backend: Paralleler Export nach ClickHouse (Langzeit) + Jaeger (Live-UI)

## Architekturdiagramm

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MCP Ecosystem                                    │
│                                                                         │
│  ┌──────────────────┐   ┌──────────────────┐   ┌────────────────────┐  │
│  │  MCP Server (TS) │   │  Engine Adapter   │   │ Kotlin History     │  │
│  │  @otel/sdk-node  │   │  HttpClient Spans │   │ Plugins            │  │
│  │                  │   │                  │   │ io.opentelemetry   │  │
│  └────────┬─────────┘   └────────┬─────────┘   └────────┬───────────┘  │
│           │ OTLP/gRPC            │ (via MCP)             │ OTLP/gRPC   │
│           └──────────┬───────────┘                       │             │
│                      │                                   │             │
│  ┌───────────────────┼───────────────────────────────────┼──────────┐  │
│  │                   ▼                                   ▼          │  │
│  │           ┌───────────────────────────┐                          │  │
│  │           │     OTEL Collector        │                          │  │
│  │           │  ┌─────────────────────┐  │                          │  │
│  │           │  │ Receivers:          │  │                          │  │
│  │           │  │  - otlp (gRPC+HTTP) │  │                          │  │
│  │           │  ├─────────────────────┤  │                          │  │
│  │           │  │ Processors:         │  │                          │  │
│  │           │  │  - batch            │  │                          │  │
│  │           │  │  - attributes       │  │                          │  │
│  │           │  │  - tail_sampling    │  │                          │  │
│  │           │  ├─────────────────────┤  │                          │  │
│  │           │  │ Exporters:          │  │                          │  │
│  │           │  │  - clickhouse       │  │                          │  │
│  │           │  │  - otlp → Jaeger    │  │                          │  │
│  │           │  └─────────────────────┘  │                          │  │
│  │           └─────────┬────────┬────────┘                          │  │
│  └─────────────────────┼────────┼───────────────────────────────────┘  │
│                        │        │                                      │
│              ┌─────────▼──┐  ┌──▼────────┐                             │
│              │ ClickHouse │  │  Jaeger   │                             │
│              │ otel_*     │  │  UI :16686│                             │
│              │ Tabellen   │  │           │                             │
│              └────────────┘  └───────────┘                             │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  CIB Seven / Camunda 7 Engine                                    │   │
│  │  OTEL Java Agent (-javaagent:opentelemetry-javaagent.jar)        │   │
│  │  → Auto-Instrumentierung: HTTP, JDBC, Spring                     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Instrumentierung pro Komponente

### 1. MCP Server (TypeScript)

**SDK**: `@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations-node`

```typescript
// packages/camunda7-mcp-server/src/telemetry.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'camunda7-mcp-server',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    'deployment.environment': process.env.NODE_ENV ?? 'development',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317',
    }),
    exportIntervalMillis: 15_000,
  }),
});

sdk.start();
```

**Span-Wrapper um Tool-Handler:**

```typescript
// packages/camunda7-mcp-server/src/tools/instrumented-tool.ts
import { trace, SpanStatusCode, metrics } from '@opentelemetry/api';

const tracer = trace.getTracer('mcp-tools');
const meter = metrics.getMeter('mcp-tools');
const toolDuration = meter.createHistogram('mcp.tool.duration_ms', {
  description: 'Duration of MCP tool execution in milliseconds',
  unit: 'ms',
});
const toolErrors = meter.createCounter('mcp.tool.errors_total', {
  description: 'Total number of MCP tool errors',
});

export function instrumentToolHandler<TArgs, TResult>(
  toolName: string,
  handler: (args: TArgs) => Promise<TResult>,
): (args: TArgs) => Promise<TResult> {
  return async (args: TArgs) => {
    return tracer.startActiveSpan(`mcp.tool.${toolName}`, async (span) => {
      const start = performance.now();
      span.setAttribute('mcp.tool.name', toolName);
      try {
        const result = await handler(args);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
        span.recordException(error as Error);
        toolErrors.add(1, { 'mcp.tool.name': toolName });
        throw error;
      } finally {
        toolDuration.record(performance.now() - start, { 'mcp.tool.name': toolName });
        span.end();
      }
    });
  };
}
```

### 2. Engine Adapter HttpClient

**Span-Wrapper um `request()`** in `packages/engine-adapter/src/http-client.ts`:

```typescript
import { trace, SpanStatusCode, propagation, context, metrics } from '@opentelemetry/api';

const tracer = trace.getTracer('engine-adapter');
const meter = metrics.getMeter('engine-adapter');
const httpDuration = meter.createHistogram('engine.http.duration_ms', {
  description: 'Duration of engine HTTP requests in milliseconds',
  unit: 'ms',
});

// Im request()-Wrapper:
async function request<T>(method: string, path: string, options?: { ... }): Promise<T> {
  return tracer.startActiveSpan(`engine.http ${method} ${path}`, async (span) => {
    span.setAttribute('http.method', method);
    span.setAttribute('http.url', `${baseUrl}${path}`);
    span.setAttribute('engine.type', config.engineType ?? 'unknown');
    span.setAttribute('api.path', path);

    // Trace Context Propagation → Engine
    const headers = { ...buildHeaders(options?.contentType) };
    propagation.inject(context.active(), headers);

    const start = performance.now();
    try {
      const response = await fetch(url, { method, headers, ... });
      span.setAttribute('http.status_code', response.status);
      httpDuration.record(performance.now() - start, {
        'engine.type': config.engineType ?? 'unknown',
        'http.method': method,
        'http.status_code': response.status,
      });
      // ... bestehende Fehlerbehandlung
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### 3. Kotlin History Plugins

**SDK**: `io.opentelemetry:opentelemetry-sdk` + `io.opentelemetry:opentelemetry-exporter-otlp`

```kotlin
// plugins/shared-history-clickhouse/src/main/kotlin/telemetry/HistoryTelemetry.kt
import io.opentelemetry.api.GlobalOpenTelemetry
import io.opentelemetry.api.trace.Tracer
import io.opentelemetry.api.metrics.Meter

object HistoryTelemetry {
    val tracer: Tracer = GlobalOpenTelemetry.getTracer("history-plugin")
    val meter: Meter = GlobalOpenTelemetry.getMeter("history-plugin")

    val flushDuration = meter.histogramBuilder("history.flush.duration_ms")
        .setDescription("Duration of ClickHouse flush operations")
        .setUnit("ms")
        .build()

    val eventsBuffered = meter.counterBuilder("history.events.buffered_total")
        .setDescription("Total events buffered for ClickHouse")
        .build()

    val eventsInserted = meter.counterBuilder("history.events.inserted_total")
        .setDescription("Total events inserted into ClickHouse")
        .build()

    val insertErrors = meter.counterBuilder("history.insert.errors_total")
        .setDescription("Total ClickHouse insert errors")
        .build()
}
```

**Spans um Buffer/Flush/Insert** in `ClickHouseHistoryEventHandlerBase`:

```kotlin
fun flush() {
    val span = HistoryTelemetry.tracer.spanBuilder("history.flush")
        .setAttribute("buffer.size", buffer.size.toLong())
        .startSpan()
    val start = System.currentTimeMillis()
    try {
        span.makeCurrent().use {
            clickHouseClient.insertBatch(buffer)
            HistoryTelemetry.eventsInserted.add(buffer.size.toLong())
        }
        span.setStatus(StatusCode.OK)
    } catch (e: Exception) {
        span.setStatus(StatusCode.ERROR, e.message ?: "flush failed")
        span.recordException(e)
        HistoryTelemetry.insertErrors.add(1)
        throw e
    } finally {
        HistoryTelemetry.flushDuration.record(
            (System.currentTimeMillis() - start).toDouble()
        )
        span.end()
    }
}
```

### 4. CIB Seven / Camunda 7 Engine

**OTEL Java Agent** als JVM-Argument — keine Code-Änderung nötig:

```dockerfile
# plugins/examples/cibseven-example/Dockerfile (Erweiterung)
ADD https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar /opt/otel/opentelemetry-javaagent.jar

ENV JAVA_OPTS="-javaagent:/opt/otel/opentelemetry-javaagent.jar"
ENV OTEL_SERVICE_NAME=cibseven-engine
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
ENV OTEL_TRACES_SAMPLER=parentbased_traceidratio
ENV OTEL_TRACES_SAMPLER_ARG=0.1
```

Auto-instrumentiert: Spring MVC, JDBC, HTTP-Client-Calls.

## Trace Context Propagation

Durchgängige Korrelation über `traceparent` Header (W3C Trace Context):

```
MCP Tool Call                Engine REST API           Process Execution
─────────────               ──────────────            ─────────────────
[Span: mcp.tool.list_tasks]
       │ traceparent
       ▼
[Span: engine.http GET /task]
       │ traceparent (via propagation.inject)
       ▼
                             [Span: HTTP GET /task]    (Java Agent)
                                    │
                                    ▼
                             [Span: JDBC SELECT]       (Java Agent)
```

Die `trace_id` kann in bestehenden History-Tabellen gespeichert werden (siehe Schema-Erweiterung).

## ClickHouse OTEL-Schema

Der OTEL Collector ClickHouse Exporter erstellt automatisch native Tabellen:

```sql
-- Automatisch vom OTEL Collector ClickHouse Exporter erstellt
-- Database: otel (separat von camunda_history)

CREATE DATABASE IF NOT EXISTS otel;

-- Traces
CREATE TABLE IF NOT EXISTS otel.otel_traces (
    Timestamp           DateTime64(9),
    TraceId             String,
    SpanId              String,
    ParentSpanId        String,
    TraceState          String,
    SpanName            LowCardinality(String),
    SpanKind            LowCardinality(String),
    ServiceName         LowCardinality(String),
    ResourceAttributes  Map(LowCardinality(String), String),
    ScopeName           String,
    ScopeVersion        String,
    SpanAttributes      Map(LowCardinality(String), String),
    Duration            UInt64,
    StatusCode          LowCardinality(String),
    StatusMessage       String,
    Events              Nested(
        Timestamp DateTime64(9),
        Name      LowCardinality(String),
        Attributes Map(LowCardinality(String), String)
    ),
    Links               Nested(
        TraceId    String,
        SpanId     String,
        TraceState String,
        Attributes Map(LowCardinality(String), String)
    )
) ENGINE = MergeTree()
ORDER BY (ServiceName, SpanName, toUnixTimestamp(Timestamp), TraceId)
PARTITION BY toDate(Timestamp)
TTL toDateTime(Timestamp) + INTERVAL 30 DAY;

-- Metrics (Sum)
CREATE TABLE IF NOT EXISTS otel.otel_metrics_sum (
    ResourceAttributes  Map(LowCardinality(String), String),
    ResourceSchemaUrl   String,
    ScopeName           String,
    ScopeVersion        String,
    ScopeAttributes     Map(LowCardinality(String), String),
    ScopeSchemaUrl      String,
    MetricName          LowCardinality(String),
    MetricDescription   String,
    MetricUnit          String,
    Attributes          Map(LowCardinality(String), String),
    StartTimeUnix       DateTime64(9),
    TimeUnix            DateTime64(9),
    Value               Float64,
    Flags               UInt32,
    IsMonotonic         Bool,
    AggregationTemporality Int32
) ENGINE = MergeTree()
ORDER BY (MetricName, Attributes, toUnixTimestamp(TimeUnix))
PARTITION BY toDate(TimeUnix)
TTL toDateTime(TimeUnix) + INTERVAL 90 DAY;

-- Logs
CREATE TABLE IF NOT EXISTS otel.otel_logs (
    Timestamp          DateTime64(9),
    TraceId            String,
    SpanId             String,
    TraceFlags         UInt32,
    SeverityText       LowCardinality(String),
    SeverityNumber     UInt8,
    ServiceName        LowCardinality(String),
    Body               String,
    ResourceAttributes Map(LowCardinality(String), String),
    LogAttributes      Map(LowCardinality(String), String)
) ENGINE = MergeTree()
ORDER BY (ServiceName, SeverityText, toUnixTimestamp(Timestamp), TraceId)
PARTITION BY toDate(Timestamp)
TTL toDateTime(Timestamp) + INTERVAL 30 DAY;
```

### `trace_id`-Spalte in bestehenden History-Tabellen

Erweiterung des Schemas in `docker/clickhouse/init-schema.sql`:

```sql
-- ALTER TABLE Statements für bestehende Tabellen
ALTER TABLE camunda_history.camunda_process_instances
    ADD COLUMN IF NOT EXISTS trace_id Nullable(String);

ALTER TABLE camunda_history.camunda_activity_instances
    ADD COLUMN IF NOT EXISTS trace_id Nullable(String);

ALTER TABLE camunda_history.camunda_incidents
    ADD COLUMN IF NOT EXISTS trace_id Nullable(String);
```

Damit können History-Events direkt mit OTEL-Traces korreliert werden:

```sql
-- Beispiel: Trace für eine Prozessinstanz finden
SELECT t.TraceId, t.SpanName, t.Duration, t.StatusCode
FROM otel.otel_traces t
JOIN camunda_history.camunda_process_instances p
    ON t.TraceId = p.trace_id
WHERE p.id = '{process_instance_id}'
ORDER BY t.Timestamp;
```

## Custom Metrics

| Metric | Typ | Labels | Quelle |
|--------|-----|--------|--------|
| `mcp.tool.duration_ms` | Histogram | `mcp.tool.name` | MCP Server |
| `mcp.tool.errors_total` | Counter | `mcp.tool.name` | MCP Server |
| `engine.http.duration_ms` | Histogram | `engine.type`, `http.method`, `http.status_code` | Engine Adapter |
| `history.flush.duration_ms` | Histogram | `engine.type` | Kotlin Plugins |
| `history.events.buffered_total` | Counter | `event.type` | Kotlin Plugins |
| `history.events.inserted_total` | Counter | `table.name` | Kotlin Plugins |
| `history.insert.errors_total` | Counter | `error.type` | Kotlin Plugins |
| `history.buffer.size` | Gauge | `engine.type` | Kotlin Plugins |

## Docker Compose Erweiterung

### `docker/docker-compose.otel.yml`

```yaml
# Nutzung: docker compose -f docker-compose.yml -f docker-compose.otel.yml up
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.98.0
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./otel/otel-collector-config.yaml:/etc/otel-collector-config.yaml:ro
    ports:
      - "4317:4317"   # OTLP gRPC
      - "4318:4318"   # OTLP HTTP
      - "8888:8888"   # Collector Metrics
      - "8889:8889"   # Prometheus Exporter (optional)
    depends_on:
      clickhouse:
        condition: service_started

  jaeger:
    image: jaegertracing/jaeger:2.4
    ports:
      - "16686:16686" # Jaeger UI
      - "4319:4317"   # OTLP gRPC (Jaeger-intern, vom Collector genutzt)
    environment:
      - COLLECTOR_OTLP_ENABLED=true

  # Override: CIB Seven mit OTEL Java Agent
  cibseven:
    environment:
      - JAVA_OPTS=-javaagent:/opt/otel/opentelemetry-javaagent.jar
      - OTEL_SERVICE_NAME=cibseven-engine
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
      - OTEL_TRACES_SAMPLER=parentbased_traceidratio
      - OTEL_TRACES_SAMPLER_ARG=0.1
    volumes:
      - otel-agent:/opt/otel

  # Init-Container: OTEL Java Agent herunterladen
  otel-agent-init:
    image: curlimages/curl:8.7.1
    command: >
      sh -c "curl -L -o /opt/otel/opentelemetry-javaagent.jar
      https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar"
    volumes:
      - otel-agent:/opt/otel

volumes:
  otel-agent:
```

### `docker/otel/otel-collector-config.yaml`

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    send_batch_size: 10000
    timeout: 5s

  attributes/env:
    actions:
      - key: deployment.environment
        value: docker-local
        action: upsert

  # Tail-based Sampling: Fehler immer, Rest 10%
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: errors-always
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: sample-rest
        type: probabilistic
        probabilistic:
          sampling_percentage: 10

exporters:
  clickhouse:
    endpoint: tcp://clickhouse:9000?dial_timeout=10s&compress=lz4
    database: otel
    ttl: 720h  # 30 Tage
    create_schema: true
    logs:
      table_name: otel_logs
    traces:
      table_name: otel_traces
    metrics:
      table_name: otel_metrics_sum

  otlp/jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true

  debug:
    verbosity: basic

service:
  telemetry:
    logs:
      level: info
    metrics:
      address: 0.0.0.0:8888

  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch, attributes/env, tail_sampling]
      exporters: [clickhouse, otlp/jaeger, debug]
    metrics:
      receivers: [otlp]
      processors: [batch, attributes/env]
      exporters: [clickhouse, debug]
    logs:
      receivers: [otlp]
      processors: [batch, attributes/env]
      exporters: [clickhouse, debug]
```

## Implementierungsreihenfolge

| Schritt | Was | Aufwand | Abhängigkeit |
|---------|-----|---------|-------------|
| **1** | `docker-compose.otel.yml` + Collector Config erstellen | Klein | Keine |
| **2** | MCP Server: `@opentelemetry/sdk-node` + `telemetry.ts` Setup | Klein | Schritt 1 |
| **3** | MCP Server: `instrumentToolHandler()` um alle 27 Tool-Handler wrappen | Mittel | Schritt 2 |
| **4** | Engine Adapter: Span-Wrapper um `request()` in `http-client.ts` + `traceparent` Propagation | Mittel | Schritt 2 |
| **5** | Kotlin Plugins: OTEL SDK Dependencies + `HistoryTelemetry` Object | Mittel | Schritt 1 |
| **6** | Kotlin Plugins: Spans um `flush()`/`insertBatch()` in `ClickHouseHistoryEventHandlerBase` | Mittel | Schritt 5 |
| **7** | CIB Seven Dockerfile: OTEL Java Agent Integration | Klein | Schritt 1 |
| **8** | History-Tabellen: `trace_id`-Spalte + Migration | Klein | Schritt 4+6 |

### Kritischer Pfad

```
Schritt 1 (Docker/Collector)
    ├── Schritt 2 (MCP OTEL Setup)
    │       ├── Schritt 3 (Tool Instrumentation)
    │       └── Schritt 4 (HttpClient Spans)
    │               └── Schritt 8 (trace_id Spalte) ←── auch abhängig von Schritt 6
    ├── Schritt 5 (Kotlin OTEL Setup)
    │       └── Schritt 6 (Flush Spans)
    └── Schritt 7 (Java Agent)
```

## Konfiguration

Alle OTEL-Konfiguration erfolgt über Environment-Variablen (Standard OTEL SDK):

| Variable | Default | Beschreibung |
|----------|---------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OTEL Collector Endpoint |
| `OTEL_SERVICE_NAME` | Komponenten-spezifisch | Service-Name in Traces |
| `OTEL_TRACES_SAMPLER` | `parentbased_always_on` | Sampling-Strategie |
| `OTEL_TRACES_SAMPLER_ARG` | `1.0` | Sampling-Rate |
| `OTEL_ENABLED` | `true` | OTEL komplett deaktivieren |
