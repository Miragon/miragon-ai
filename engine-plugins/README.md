# Engine plugins — Kotlin OTEL metrics for CIB Seven

Multi-module Gradle build (Java 21) containing the CIB Seven OTEL process-metrics plugin
(`cibseven-history-metrics`). It runs inside the CIB Seven runtime and emits OpenTelemetry metrics
that the OTEL Collector exports to Prometheus as `camunda_*` series — there is no engine-side
database. Those series are what the [analytics module](../packages/mcp-analytics) of
[Miragon AI](../README.md) queries.

Published to **GitHub Packages Maven** as `ai.miragon.mcp:cibseven-history-metrics` (released via
release-please together with the server image). A runnable showcase that consumes this plugin lives
in [`../playground/cibseven-example/`](../playground/cibseven-example/) as a separate Gradle build
(composite via `includeBuild`).

The metric names and labels it emits are governed by the
[metrics contract](../packages/client-analytics/metrics-contract.json) — change a metric there first;
`MetricsContractTest.kt` verifies this side against it.

## Consume it

```kotlin
repositories {
    maven {
        url = uri("https://maven.pkg.github.com/Miragon/miragon-ai")
        credentials {
            username = providers.gradleProperty("gpr.user").orNull ?: System.getenv("GITHUB_ACTOR")
            password = providers.gradleProperty("gpr.key").orNull ?: System.getenv("GITHUB_TOKEN")
        }
    }
}

dependencies {
    implementation("ai.miragon.mcp:cibseven-history-metrics:0.2.1")
}
```

GitHub Packages requires authentication even for reads — supply a token with `read:packages`.

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
