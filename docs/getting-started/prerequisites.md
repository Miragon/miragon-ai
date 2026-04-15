# Voraussetzungen

## Für die TypeScript-Pakete

| Tool    | Version | Beschreibung    |
| ------- | ------- | --------------- |
| Node.js | 22+     | Runtime         |
| pnpm    | 10+     | Package Manager |

## Für die Kotlin Plugins

| Tool   | Version | Beschreibung                           |
| ------ | ------- | -------------------------------------- |
| Java   | 17+     | JDK (Temurin empfohlen)                |
| Gradle | 8+      | Build Tool (Wrapper im Repo enthalten) |

## Für die Infrastruktur

| Tool           | Version | Beschreibung                   |
| -------------- | ------- | ------------------------------ |
| Docker         | 24+     | Container Runtime              |
| Docker Compose | 2.20+   | Multi-Container Orchestrierung |

## Engines

Mindestens eine der folgenden Engines muss erreichbar sein:

- **CIB Seven** — Standard via Docker Compose
- **Camunda 7** — Eigene Installation oder Docker
- **Operaton** — Community Fork (Phase 5)
