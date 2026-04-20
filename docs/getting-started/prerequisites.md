# Prerequisites

## For the TypeScript packages

| Tool    | Version | Description     |
| ------- | ------- | --------------- |
| Node.js | 22+     | Runtime         |
| pnpm    | 10+     | Package manager |

## For the Kotlin plugins

| Tool   | Version | Description                          |
| ------ | ------- | ------------------------------------ |
| Java   | 17+     | JDK (Temurin recommended)            |
| Gradle | 8+      | Build tool (wrapper bundled in repo) |

## For the infrastructure

| Tool           | Version | Description                   |
| -------------- | ------- | ----------------------------- |
| Docker         | 24+     | Container runtime             |
| Docker Compose | 2.20+   | Multi-container orchestration |

## Engines

At least one of the following engines must be reachable:

- **CIB Seven** — default via Docker Compose
- **Camunda 7** — your own installation or Docker
- **Operaton** — community fork (Phase 5)
