# Engine plugins — Kotlin Micrometer metrics for CIB Seven

Multi-module Gradle build (Java 21) containing the CIB Seven process-metrics plugin
(`cibseven-history-metrics`). It runs inside the CIB Seven runtime and records Micrometer metrics
into the global registry, so any Micrometer export path surfaces them in Prometheus as `camunda_*`
series — an OTLP push via `micrometer-registry-otlp` through the OTEL Collector (the playground
default), an Actuator Prometheus scrape, or the OTEL Java agent's Micrometer bridge. There is no
engine-side database. Those series are what the [analytics module](../packages/connectors/analytics/analytics-connector) of
[Miragon AI](../README.md) queries.

Published to **Maven Central** as `io.miragon.mcp:cibseven-history-metrics` (released via
release-please together with the server image). A runnable showcase that consumes this plugin lives
in [`../playground/cibseven-example/`](../playground/cibseven-example/) as a separate Gradle build
(composite via `includeBuild`).

The metric names and labels it emits are governed by the
[metrics contract](../packages/connectors/analytics/analytics-client/metrics-contract.json) — change a metric there first;
`MetricsContractTest.kt` verifies this side against it.

## Consume it

Available from Maven Central — no credentials or extra repository needed:

```kotlin
repositories {
    mavenCentral()
}

dependencies {
    implementation("io.miragon.mcp:cibseven-history-metrics:0.5.0")
}
```

`micrometer-core` resolves transitively; the engine/Spring stack is `compileOnly`
(provided by the CIB Seven runtime).

For the OTLP push path on Spring Boot 4, additionally add
`spring-boot-starter-actuator`, `io.micrometer:micrometer-registry-otlp` and
`org.springframework.boot:spring-boot-opentelemetry` — Boot 4 gates the OTLP
export auto-configuration on that last module's `OpenTelemetryProperties`, so
without it the export silently never activates. Then set
`management.otlp.metrics.export.url`; see
[`../playground/cibseven-example/`](../playground/cibseven-example/) for a
working setup.

## Quality gates

Phase 1 guardrails are **warn-not-error**: ktlint reports findings but does not fail the build. Only compile errors, failing unit tests, and Konsist assertion failures block CI.

| Command                  | Purpose                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `./gradlew build`        | Compile + unit tests (includes Konsist architecture tests) |
| `./gradlew test`         | Run all tests (Konsist scoped per module)                  |
| `./gradlew ktlintCheck`  | Report ktlint findings (warn-only)                         |
| `./gradlew ktlintFormat` | Auto-fix ktlint findings in place                          |

### ktlint

Configured via `.editorconfig` at the repo root. Runs on every subproject. Phase 1 is warn-only; Phase 2 will flip `ignoreFailures` to `false` once the baseline is clean.

### Konsist architecture tests

See `konsist/README.md` for details on the shared test-base module and how to add new architecture rules.

## Pre-commit

Kotlin stays out of the pre-commit pipeline in Phase 1. `lint-staged` only handles TypeScript/JS/JSON. Gradle invocations are too slow to block every commit — we widen this in Phase 2 once detekt starts blocking and a standalone ktlint CLI can back a fast hook.
