# plugins — Kotlin/Spring Boot engine adapters

Multi-module Gradle build containing the CIB Seven OTEL process-metrics plugin (`cibseven-history-metrics`) and the CIB Seven OTEL event-bridge. Both emit OpenTelemetry signals that the OTEL Collector exports to Prometheus / Jaeger — there is no engine-side database. A runnable showcase that consumes these plugins lives in [`../examples/cibseven-example/`](../examples/cibseven-example/) as a separate Gradle build (composite via `includeBuild`).

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
