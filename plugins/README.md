# plugins — Kotlin/Spring Boot engine adapters

Multi-module Gradle build containing the Camunda 7 / CIB seven / Operaton history plugins and the CIB seven OTel event-bridge, plus shared ClickHouse infrastructure and runnable examples.

## Quality gates

Phase 1 guardrails are **warn-not-error**: ktlint and detekt report findings but do not fail the build. Only compile errors, failing unit tests, and Konsist assertion failures block CI.

| Command                    | Purpose                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `./gradlew build`          | Compile + unit tests (includes Konsist architecture tests) |
| `./gradlew test`           | Run all tests (Konsist scoped per module)                  |
| `./gradlew ktlintCheck`    | Report ktlint findings (warn-only)                         |
| `./gradlew ktlintFormat`   | Auto-fix ktlint findings in place                          |
| `./gradlew detekt`         | Report detekt findings (warn-only, baselined)              |
| `./gradlew detektBaseline` | Regenerate per-subproject detekt baselines                 |

### ktlint

Configured via `.editorconfig` at the repo root. Runs on every subproject including `examples/`. Phase 1 is warn-only; Phase 2 will flip `ignoreFailures` to `false` once the baseline is clean.

### detekt

Config at `plugins/config/detekt/detekt.yml`. Per-subproject baselines at `plugins/config/detekt/baseline-<subproject>.xml`. Applied to core subprojects only — `examples/` is excluded because its `io.spring.dependency-management` plugin conflicts with detekt's bundled Kotlin version.

### Konsist architecture tests

See `konsist/README.md` for details on the shared test-base module and how to add new architecture rules.

## Pre-commit

Kotlin stays out of the pre-commit pipeline in Phase 1. `lint-staged` only handles TypeScript/JS/JSON. Gradle invocations are too slow to block every commit — we widen this in Phase 2 once detekt starts blocking and a standalone ktlint CLI can back a fast hook.
