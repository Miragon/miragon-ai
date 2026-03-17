# Camunda 7 MCP Ökosystem — Konzept & Umsetzungsplan (Multi-Engine)

## 1. Vision

Wir bauen ein **MCP-basiertes Ökosystem für Camunda-7-kompatible Engines**, das vier Säulen umfasst:

1. **Engine Adapter** — eine TypeScript-Abstraktionsschicht, die die REST-API-Unterschiede zwischen Camunda 7, CIB Seven und Operaton kapselt
2. **MCP Server** — ein eigenständiger MCP-Server, der über den Engine Adapter mit jeder kompatiblen Engine kommuniziert
3. **MCP Apps (Cockpit-Komponenten)** — interaktive UI-Komponenten auf Basis des sunpeak MCP App Frameworks (React + shadcn/ui), die Cockpit-ähnliche Funktionen in jedem MCP-kompatiblen Host (Claude, ChatGPT etc.) rendern
4. **History-to-ClickHouse Plugins** — engine-spezifische Plugins mit geteiltem Kern, die History-Events in Echtzeit nach ClickHouse schieben. ClickHouse dient als "MCP-Ready" Analytik-Backend mit eigenem MCP-Server.

### Unterstützte Engines

| Engine | Herkunft | Status | Fokus |
|--------|----------|--------|-------|
| **Camunda 7** | Camunda (Original) | **Unterstützt** — via Engine Adapter | Phase 1–4 |
| **CIB Seven** | CIB Group Fork von Camunda 7 | **Primär** — wird zuerst umgesetzt | Phase 1–4 |
| **Operaton** | Community Fork von Camunda 7 | **Vorbereitet** — Struktur angelegt, Implementierung später | Phase 5 |

### OpenAPI-Referenzdokumente

| Engine | OpenAPI-Spezifikation |
|--------|----------------------|
| **Camunda 7** | [`camunda7-open-api-doc.json`](./camunda7-open-api-doc.json) |
| **CIB Seven** | [`cibseve-open-api-doc.json`](./cibseve-open-api-doc.json) |
| **Operaton** | Noch zu klären (siehe ADR 8) |

```
┌──────────────────────────────────────────────────────────────┐
│                    MCP Host (Claude, ChatGPT, ...)           │
│                                                              │
│  ┌────────────────────┐  ┌─────────────────────────────────┐ │
│  │  MCP App: Process   │  │  MCP App: Task Dashboard       │ │
│  │  Instance Viewer    │  │  (sunpeak + shadcn/ui)         │ │
│  │  (sunpeak + shadcn) │  │                                 │ │
│  └────────┬───────────┘  └──────────┬──────────────────────┘ │
│           │                         │                        │
└───────────┼─────────────────────────┼────────────────────────┘
            │ MCP Protocol            │ MCP Protocol
            ▼                         ▼
┌───────────────────────┐   ┌──────────────────────────┐
│  camunda7-mcp-server  │   │  clickhouse-mcp-server   │
│  (TypeScript/Node)    │   │  (offiziell von CH)      │
│                       │   │                          │
│  Tools:               │   │  Tools:                  │
│  - list_deployments   │   │  - run_query             │
│  - start_process      │   │  - list_tables           │
│  - get_tasks          │   │  - describe_table        │
│  - complete_task      │   │                          │
│  - get_history        │   │                          │
│  - get_incidents      │   │                          │
│  - ...                │   │                          │
└───────────┬───────────┘   └──────────┬───────────────┘
            │                          │
            ▼                          │
┌───────────────────────┐              │
│   Engine Adapter      │              │
│   (TypeScript)        │              │
│                       │              │
│   ┌─────────────────┐ │              │
│   │ EngineAdapter   │ │              │
│   │ (Interface)     │ │              │
│   └──────┬──────────┘ │              │
│          │             │              │
│   ┌──────┴──────────────────┐ │              │
│   │            │            │ │              │
│   ▼            ▼            ▼ │              │
│ ┌────────┐ ┌─────────┐ ┌────────┐│           │
│ │Camunda7│ │CIBSeven │ │Operaton││           │
│ │Adapter │ │Adapter  │ │Adapter ││           │
│ │(aktiv) │ │(aktiv)  │ │(später)││           │
│ └───┬────┘ └────┬────┘ └───┬────┘│           │
│     │           │          │      │           │
└─────┼───────────┼──────────┼──────┘           │
      │           │          │                  │
      ▼           ▼          ▼                  ▼
┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────────────────────┐
│ Camunda 7 │ │ CIB Seven │ │  Operaton  │ │      ClickHouse          │
│ Engine    │ │ Engine    │ │  Engine    │ │   (History Analytics)    │
│ (Spring   │ │ (Spring   │ │  (Spring   │ │                          │
│  Boot)    │ │  Boot)    │ │   Boot)    │ │  Tables:                 │
│           │ │           │ │            │ │  - process_instances     │
│ + History │ │ + CIBSeven│ │ + Operaton │ │  - activity_instances    │
│   Plugin  │ │   History │ │   History  │ │  - task_instances        │
│           │ │   Plugin  │ │   Plugin   │ │  - variable_updates      │
│           │ │           │ │  (später)  │ │  - incidents             │
└─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └──────────────────────────┘
      │              │             │                     ▲
      └──────────────┴─────────────┴─────────────────────┘
                   History Events → ClickHouse
```

---

## 2. Monorepo-Struktur

```
camunda7-mcp-ecosystem/
├── README.md
├── package.json                          # Workspace root (pnpm workspaces)
├── pnpm-workspace.yaml
├── turbo.json                            # Turborepo build config
├── .github/
│   └── workflows/
│       ├── ci.yml                        # Lint, test, build
│       └── release.yml                   # Semantic release
│
├── packages/
│   ├── engine-adapter/                   # Engine-Abstraktionsschicht (NEU)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                  # Public API: EngineAdapter, AdapterFactory
│   │   │   ├── types.ts                  # Engine-agnostische Response-Types
│   │   │   ├── adapter.ts               # EngineAdapter Interface
│   │   │   ├── base-adapter.ts          # BaseAdapter: shared HTTP-Client-Logik
│   │   │   ├── factory.ts              # AdapterFactory: ENGINE_TYPE → konkreter Adapter
│   │   │   ├── camunda7/
│   │   │   │   ├── index.ts             # Camunda7Adapter Implementierung
│   │   │   │   └── mappings.ts          # Camunda 7-spezifische API-Pfade/Mappings
│   │   │   ├── cibseven/
│   │   │   │   ├── index.ts             # CibSevenAdapter Implementierung
│   │   │   │   └── mappings.ts          # CIB Seven-spezifische API-Pfade/Mappings
│   │   │   └── operaton/
│   │   │       ├── index.ts             # OperatonAdapter (Platzhalter)
│   │   │       └── mappings.ts          # Operaton-spezifische API-Pfade/Mappings (Platzhalter)
│   │   └── tests/
│   │       ├── adapter.test.ts
│   │       └── factory.test.ts
│   │
│   ├── camunda7-mcp-server/              # MCP Server (GEÄNDERT: nutzt engine-adapter)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                  # MCP Server Entry
│   │   │   ├── config.ts                 # Env/Config (ENGINE_TYPE, ENGINE_BASE_URL, Auth)
│   │   │   ├── tools/                    # MCP Tool Definitions
│   │   │   │   ├── deployment.ts
│   │   │   │   ├── process-definition.ts
│   │   │   │   ├── process-instance.ts
│   │   │   │   ├── task.ts
│   │   │   │   ├── message.ts
│   │   │   │   ├── signal.ts
│   │   │   │   ├── history.ts
│   │   │   │   ├── incident.ts
│   │   │   │   ├── variable.ts
│   │   │   │   ├── job.ts
│   │   │   │   └── external-task.ts
│   │   │   └── resources/
│   │   │       └── bpmn-diagram.ts
│   │   └── tests/
│   │       ├── tools/
│   │       │   └── *.test.ts
│   │       └── fixtures/
│   │           └── engine-responses.json
│   │
│   ├── camunda7-mcp-apps/                # sunpeak MCP Apps (GEÄNDERT: nutzt engine-adapter)
│   │   ├── package.json
│   │   ├── sunpeak.config.ts
│   │   ├── src/
│   │   │   ├── resources/
│   │   │   │   ├── process-list/
│   │   │   │   │   └── process-list.tsx
│   │   │   │   ├── instance-detail/
│   │   │   │   │   └── instance-detail.tsx
│   │   │   │   ├── task-dashboard/
│   │   │   │   │   └── task-dashboard.tsx
│   │   │   │   ├── history-timeline/
│   │   │   │   │   └── history-timeline.tsx
│   │   │   │   ├── incident-panel/
│   │   │   │   │   └── incident-panel.tsx
│   │   │   │   └── analytics-dashboard/
│   │   │   │       └── analytics-dashboard.tsx
│   │   │   ├── tools/
│   │   │   │   ├── show-process-list.ts
│   │   │   │   ├── show-instance-detail.ts
│   │   │   │   ├── show-task-dashboard.ts
│   │   │   │   ├── show-history-timeline.ts
│   │   │   │   ├── show-incident-panel.ts
│   │   │   │   └── show-analytics-dashboard.ts
│   │   │   ├── components/
│   │   │   │   ├── ui/
│   │   │   │   ├── bpmn-viewer.tsx
│   │   │   │   ├── status-badge.tsx
│   │   │   │   ├── variable-table.tsx
│   │   │   │   └── time-ago.tsx
│   │   │   └── server.ts
│   │   └── tests/
│   │       └── simulations/
│   │           ├── show-process-list.json
│   │           ├── show-instance-detail.json
│   │           └── show-task-dashboard.json
│   │
│   └── shared/                           # Shared TypeScript Types
│       ├── package.json
│       ├── src/
│       │   ├── engine-types.ts           # Engine-agnostische REST API Response Types
│       │   ├── clickhouse-types.ts       # ClickHouse Schema Types
│       │   └── mcp-schemas.ts            # Shared Zod Schemas für Tool Inputs
│       └── tsconfig.json
│
├── plugins/
│   ├── shared-history-clickhouse/        # Shared Kotlin Library (NEU)
│   │   ├── build.gradle.kts
│   │   ├── src/
│   │   │   ├── main/
│   │   │   │   ├── kotlin/
│   │   │   │   │   └── com/camunda7mcp/history/
│   │   │   │   │       ├── ClickHouseClient.kt                  # ClickHouse JDBC/HTTP Client
│   │   │   │   │       ├── ClickHouseHistoryEventHandlerBase.kt # Basis-Handler (engine-agnostisch)
│   │   │   │   │       ├── config/
│   │   │   │   │       │   └── ClickHouseProperties.kt          # Spring Boot Config Properties
│   │   │   │   │       ├── mapper/
│   │   │   │   │       │   ├── ProcessInstanceMapper.kt         # Map<String, Any?> → CH Row
│   │   │   │   │       │   ├── ActivityInstanceMapper.kt
│   │   │   │   │       │   ├── TaskInstanceMapper.kt
│   │   │   │   │       │   ├── VariableUpdateMapper.kt
│   │   │   │   │       │   └── IncidentMapper.kt
│   │   │   │   │       └── schema/
│   │   │   │   │           └── ClickHouseSchemaInitializer.kt   # DDL-Migration beim Start
│   │   │   │   └── resources/
│   │   │   │       └── clickhouse-schema.sql                    # DDL für ClickHouse Tabellen
│   │   │   └── test/
│   │   │       └── kotlin/
│   │   │           └── com/camunda7mcp/history/
│   │   │               ├── ClickHouseHistoryEventHandlerBaseTest.kt
│   │   │               └── MapperTest.kt
│   │   └── docker/
│   │       └── docker-compose.clickhouse.yml  # Nur ClickHouse für Tests
│   │
│   ├── camunda7-history-clickhouse/       # Camunda 7 Original Plugin (NEU)
│   │   ├── build.gradle.kts              # Abhängigkeit auf shared-history-clickhouse
│   │   ├── settings.gradle.kts
│   │   ├── src/
│   │   │   ├── main/
│   │   │   │   ├── kotlin/
│   │   │   │   │   └── com/camunda7mcp/history/camunda7/
│   │   │   │   │       ├── Camunda7HistoryPlugin.kt             # extends org.camunda.bpm.engine.impl.cfg.AbstractProcessEnginePlugin
│   │   │   │   │       ├── Camunda7HistoryEventHandler.kt       # extends Base, mapped Camunda 7 Events
│   │   │   │   │       └── Camunda7EventMapper.kt               # Camunda 7 Event-Klassen → Map<String, Any?>
│   │   │   │   └── resources/
│   │   │   │       └── META-INF/
│   │   │   │           └── spring.factories
│   │   │   └── test/
│   │   │       └── kotlin/
│   │   │           └── com/camunda7mcp/history/camunda7/
│   │   │               └── Camunda7HistoryEventHandlerTest.kt
│   │   └── docker/
│   │       └── docker-compose.camunda7.yml   # Camunda 7 + ClickHouse
│   │
│   ├── cibseven-history-clickhouse/      # CIB Seven Plugin (NEU)
│   │   ├── build.gradle.kts              # Abhängigkeit auf shared-history-clickhouse
│   │   ├── settings.gradle.kts
│   │   ├── src/
│   │   │   ├── main/
│   │   │   │   ├── kotlin/
│   │   │   │   │   └── com/camunda7mcp/history/cibseven/
│   │   │   │   │       ├── CibSevenHistoryPlugin.kt             # extends org.cibseven.bpm.engine.impl.cfg.AbstractProcessEnginePlugin
│   │   │   │   │       ├── CibSevenHistoryEventHandler.kt       # extends Base, mapped CIB Seven Events
│   │   │   │   │       └── CibSevenEventMapper.kt               # CIB Seven Event-Klassen → Map<String, Any?>
│   │   │   │   └── resources/
│   │   │   │       └── META-INF/
│   │   │   │           └── spring.factories
│   │   │   └── test/
│   │   │       └── kotlin/
│   │   │           └── com/camunda7mcp/history/cibseven/
│   │   │               └── CibSevenHistoryEventHandlerTest.kt
│   │   └── docker/
│   │       └── docker-compose.cibseven.yml   # CIB Seven + ClickHouse
│   │
│   └── operaton-history-clickhouse/      # Operaton Plugin (NEU, Platzhalter)
│       ├── build.gradle.kts              # Abhängigkeit auf shared-history-clickhouse
│       ├── settings.gradle.kts
│       ├── src/
│       │   ├── main/
│       │   │   ├── kotlin/
│       │   │   │   └── com/camunda7mcp/history/operaton/
│       │   │   │       ├── OperatonHistoryPlugin.kt             # extends org.operaton.bpm.engine.impl.cfg.AbstractProcessEnginePlugin (Platzhalter)
│       │   │   │       ├── OperatonHistoryEventHandler.kt       # extends Base (Platzhalter)
│       │   │   │       └── OperatonEventMapper.kt               # Operaton Event-Klassen → Map<String, Any?> (Platzhalter)
│       │   │   └── resources/
│       │   │       └── META-INF/
│       │   │           └── spring.factories
│       │   └── test/
│       │       └── kotlin/
│       │           └── com/camunda7mcp/history/operaton/
│       │               └── OperatonHistoryEventHandlerTest.kt
│       └── docker/
│           └── docker-compose.operaton.yml   # Operaton + ClickHouse (Platzhalter)
│
├── docker/
│   ├── docker-compose.yml                # Default: CIB Seven + ClickHouse + MCP Servers
│   ├── docker-compose.clickhouse.yml     # Nur ClickHouse (für composable Nutzung)
│   ├── docker-compose.camunda7.yml        # Camunda 7 Original Engine
│   ├── docker-compose.cibseven.yml       # CIB Seven Engine
│   └── docker-compose.operaton.yml       # Operaton Engine (Platzhalter)
│
└── docs/                                 # GitBook-Dokumentation
    ├── .gitbook.yaml                     # GitBook Konfiguration
    ├── SUMMARY.md                        # GitBook Inhaltsverzeichnis
    ├── README.md                         # Startseite / Übersicht
    ├── getting-started/
    │   ├── README.md                     # Getting Started Übersicht
    │   ├── prerequisites.md              # Voraussetzungen
    │   ├── quickstart.md                 # Schnellstart mit Docker Compose
    │   └── configuration.md              # Engine-Konfiguration (ENGINE_TYPE etc.)
    ├── architecture/
    │   ├── README.md                     # Architektur-Übersicht
    │   ├── engine-adapter.md             # Engine Adapter Pattern
    │   ├── history-pipeline.md           # History-to-ClickHouse Pipeline
    │   └── multi-engine.md              # Multi-Engine-Konzept
    ├── mcp-server/
    │   ├── README.md                     # MCP Server Übersicht
    │   └── tools-reference.md            # Alle MCP Tools dokumentiert
    ├── mcp-apps/
    │   ├── README.md                     # MCP Apps Übersicht
    │   └── app-catalog.md               # Alle Apps dokumentiert
    ├── history-plugins/
    │   ├── README.md                     # History Plugin Übersicht
    │   ├── clickhouse-schema.md         # ClickHouse Schema-Referenz
    │   └── plugin-development.md        # Eigenes Plugin entwickeln
    └── adrs/
        ├── README.md                     # ADR Index
        ├── adr-001-mcp-sdk-typescript.md
        ├── adr-002-clickhouse-jdbc.md
        ├── adr-003-async-history-buffer.md
        ├── adr-004-bpmn-js-lazy-load.md
        ├── adr-005-auth-propagation.md
        ├── adr-006-variable-serialization.md
        ├── adr-007-camunda7-maven-coordinates.md
        ├── adr-008-cibseven-maven-coordinates.md
        ├── adr-009-operaton-maven-coordinates.md
        ├── adr-010-rest-api-path-differences.md
        └── adr-011-event-class-packages.md
```

---

## 3. Engine Adapter Design

### 3.1 Motivation

Camunda 7, CIB Seven und Operaton teilen sich den gleichen Kern. Ihre REST-APIs sind zu >95% identisch, unterscheiden sich aber in:

- **Base-URL-Pfaden** (z.B. `/engine-rest` vs. ggf. abweichende Kontextpfade)
- **Maven Coordinates / Package Names** (Kotlin/Java Plugins)
- **Einzelne API-Endpunkte oder Parameter** (potenzielle Divergenz über Zeit)

Der Engine Adapter abstrahiert diese Unterschiede, sodass MCP Server und MCP Apps engine-agnostisch bleiben.

**REST API Referenz:**
- Camunda 7: [`camunda7-open-api-doc.json`](./camunda7-open-api-doc.json)
- CIB Seven: [`cibseve-open-api-doc.json`](./cibseve-open-api-doc.json)

### 3.2 Interface

```typescript
// packages/engine-adapter/src/adapter.ts

export interface EngineAdapter {
  readonly engineType: 'camunda7' | 'cibseven' | 'operaton';

  // Process Definitions
  listProcessDefinitions(filter?: ProcessDefinitionFilter): Promise<ProcessDefinition[]>;
  getProcessDefinitionXml(id: string): Promise<string>;
  startProcessInstance(key: string, body: StartProcessBody): Promise<ProcessInstance>;

  // Process Instances
  listProcessInstances(filter?: ProcessInstanceFilter): Promise<ProcessInstance[]>;
  getProcessInstance(id: string): Promise<ProcessInstance>;
  getActivityInstanceTree(id: string): Promise<ActivityInstanceTree>;
  deleteProcessInstance(id: string): Promise<void>;
  modifyProcessInstance(id: string, body: ModificationBody): Promise<void>;

  // User Tasks
  listTasks(filter?: TaskFilter): Promise<Task[]>;
  getTask(id: string): Promise<Task>;
  claimTask(id: string, userId: string): Promise<void>;
  unclaimTask(id: string): Promise<void>;
  completeTask(id: string, variables?: Record<string, VariableValue>): Promise<void>;
  setTaskAssignee(id: string, userId: string): Promise<void>;

  // Messages & Signals
  correlateMessage(body: CorrelateMessageBody): Promise<MessageCorrelationResult[]>;
  throwSignal(body: ThrowSignalBody): Promise<void>;

  // Variables
  getVariables(scope: 'process-instance' | 'task', id: string): Promise<Record<string, VariableValue>>;
  setVariable(processInstanceId: string, name: string, value: VariableValue): Promise<void>;

  // History
  queryHistoricProcessInstances(filter: HistoricProcessInstanceFilter): Promise<HistoricProcessInstance[]>;
  queryHistoricActivityInstances(filter: HistoricActivityInstanceFilter): Promise<HistoricActivityInstance[]>;
  queryHistoricTaskInstances(filter: HistoricTaskFilter): Promise<HistoricTaskInstance[]>;
  queryHistoricVariableInstances(filter: HistoricVariableFilter): Promise<HistoricVariableInstance[]>;

  // Incidents & Jobs
  listIncidents(filter?: IncidentFilter): Promise<Incident[]>;
  resolveIncident(id: string): Promise<void>;
  listJobs(filter?: JobFilter): Promise<Job[]>;
  setJobRetries(id: string, retries: number): Promise<void>;

  // External Tasks
  fetchAndLock(body: FetchAndLockBody): Promise<ExternalTask[]>;
  completeExternalTask(id: string, body: CompleteExternalTaskBody): Promise<void>;
  handleExternalTaskFailure(id: string, body: HandleFailureBody): Promise<void>;

  // Deployments
  listDeployments(filter?: DeploymentFilter): Promise<Deployment[]>;
  createDeployment(body: CreateDeploymentBody): Promise<Deployment>;
}
```

### 3.3 BaseAdapter

```typescript
// packages/engine-adapter/src/base-adapter.ts

export abstract class BaseAdapter implements EngineAdapter {
  abstract readonly engineType: 'camunda7' | 'cibseven' | 'operaton';

  protected readonly httpClient: HttpClient;
  protected readonly baseUrl: string;

  constructor(config: AdapterConfig) {
    this.baseUrl = config.baseUrl;
    this.httpClient = createHttpClient({
      baseUrl: config.baseUrl,
      authType: config.authType,
      username: config.username,
      password: config.password,
      token: config.token,
    });
  }

  // Gemeinsame Implementierung — REST-Pfade sind bei beiden Engines identisch
  async listProcessDefinitions(filter?: ProcessDefinitionFilter): Promise<ProcessDefinition[]> {
    return this.httpClient.get('/process-definition', { params: filter });
  }

  async getProcessDefinitionXml(id: string): Promise<string> {
    const result = await this.httpClient.get(`/process-definition/${id}/xml`);
    return result.bpmn20Xml;
  }

  async startProcessInstance(key: string, body: StartProcessBody): Promise<ProcessInstance> {
    return this.httpClient.post(`/process-definition/key/${key}/start`, { body });
  }

  async listTasks(filter?: TaskFilter): Promise<Task[]> {
    return this.httpClient.post('/task', { body: filter });
  }

  async completeTask(id: string, variables?: Record<string, VariableValue>): Promise<void> {
    await this.httpClient.post(`/task/${id}/complete`, { body: { variables } });
  }

  // ... alle weiteren Methoden mit Standard-Camunda-7-REST-Pfaden
}
```

### 3.4 Camunda7Adapter

```typescript
// packages/engine-adapter/src/camunda7/index.ts

import { BaseAdapter } from '../base-adapter';

export class Camunda7Adapter extends BaseAdapter {
  readonly engineType = 'camunda7' as const;

  // Original Camunda 7 — Standard-REST-API ohne Abweichungen.
  // REST API Referenz: camunda7-open-api-doc.json
}
```

### 3.5 CibSevenAdapter

```typescript
// packages/engine-adapter/src/cibseven/index.ts

import { BaseAdapter } from '../base-adapter';

export class CibSevenAdapter extends BaseAdapter {
  readonly engineType = 'cibseven' as const;

  // Aktuell: Keine Overrides nötig, da CIB Seven 1:1 kompatibel ist.
  // Hier können CIB-Seven-spezifische Endpoints oder Abweichungen ergänzt werden.
  // REST API Referenz: cibseve-open-api-doc.json
}
```

### 3.6 OperatonAdapter (Platzhalter)

```typescript
// packages/engine-adapter/src/operaton/index.ts

import { BaseAdapter } from '../base-adapter';

export class OperatonAdapter extends BaseAdapter {
  readonly engineType = 'operaton' as const;

  // TODO: Overrides für Operaton-spezifische API-Abweichungen
  // Wird in Phase 5 implementiert.
}
```

### 3.7 AdapterFactory

```typescript
// packages/engine-adapter/src/factory.ts

import { Camunda7Adapter } from './camunda7';
import { CibSevenAdapter } from './cibseven';
import { OperatonAdapter } from './operaton';
import type { EngineAdapter } from './adapter';

export type EngineType = 'camunda7' | 'cibseven' | 'operaton';

export interface AdapterConfig {
  engineType: EngineType;
  baseUrl: string;
  authType: 'basic' | 'bearer' | 'none';
  username?: string;
  password?: string;
  token?: string;
}

export function createEngineAdapter(config: AdapterConfig): EngineAdapter {
  switch (config.engineType) {
    case 'camunda7':
      return new Camunda7Adapter(config);
    case 'cibseven':
      return new CibSevenAdapter(config);
    case 'operaton':
      return new OperatonAdapter(config);
    default:
      throw new Error(`Unsupported engine type: ${config.engineType}`);
  }
}
```

### 3.8 Environment-Variablen

```env
ENGINE_TYPE=cibseven                    # camunda7 | cibseven | operaton
ENGINE_BASE_URL=http://localhost:8080/engine-rest
ENGINE_AUTH_TYPE=basic                   # basic | bearer | none
ENGINE_USERNAME=demo
ENGINE_PASSWORD=demo
# Optional
ENGINE_NAME=default                     # Multi-Engine innerhalb eines Servers
```

---

## 4. Komponente 1: Camunda 7 MCP Server

### 4.1 Technologie-Stack

| Aspekt | Entscheidung | Begründung |
|--------|-------------|------------|
| Runtime | Node.js / TypeScript | MCP SDK Ökosystem, sunpeak-Kompatibilität |
| MCP SDK | `@modelcontextprotocol/sdk` | Offizielles SDK von Anthropic |
| Transport | stdio + Streamable HTTP | stdio für lokale Nutzung, HTTP für Remote-Deployment |
| Engine-Zugriff | `@camunda7-mcp/engine-adapter` | Engine-agnostische Abstraktion |
| Validation | Zod | Standard im MCP-Ökosystem für Tool-Schemas |

**Wichtig:** Der MCP Server verwendet keinen eigenen HTTP-Client mehr, sondern ausschließlich den `engine-adapter`. Damit ist der gesamte MCP-Server-Code engine-agnostisch.

### 4.2 Tool-Katalog

Jedes Tool bildet einen logischen REST-API-Endpoint ab. Die Tools sind so geschnitten, dass ein LLM sie sinnvoll orchestrieren kann.

#### Process Definitions
- `list_process_definitions` — GET /process-definition (mit Filtern: key, name, version)
- `get_process_definition_xml` — GET /process-definition/{id}/xml → gibt BPMN-XML zurück
- `start_process_instance` — POST /process-definition/key/{key}/start (mit Variablen, businessKey)

#### Process Instances
- `list_process_instances` — POST /process-instance (Filter: businessKey, processDefinitionKey, active/suspended/ended)
- `get_process_instance` — GET /process-instance/{id}
- `get_activity_instance_tree` — GET /process-instance/{id}/activity-instances
- `delete_process_instance` — DELETE /process-instance/{id}
- `modify_process_instance` — POST /process-instance/{id}/modification (Token bewegen)

#### User Tasks
- `list_tasks` — POST /task (Filter: assignee, candidateGroup, processInstanceId, name)
- `get_task` — GET /task/{id}
- `claim_task` — POST /task/{id}/claim
- `unclaim_task` — POST /task/{id}/unclaim
- `complete_task` — POST /task/{id}/complete (mit Variablen)
- `set_task_assignee` — POST /task/{id}/assignee

#### Messages & Signals
- `correlate_message` — POST /message (messageName, businessKey, correlationKeys, processVariables)
- `throw_signal` — POST /signal (name, variables)

#### Variables
- `get_variables` — GET /process-instance/{id}/variables oder /task/{id}/variables
- `set_variable` — PUT /process-instance/{id}/variables/{name}

#### History
- `query_historic_process_instances` — POST /history/process-instance (mit Filtern)
- `query_historic_activity_instances` — POST /history/activity-instance
- `query_historic_task_instances` — POST /history/task
- `query_historic_variable_instances` — POST /history/variable-instance

#### Incidents & Jobs
- `list_incidents` — GET /incident (Filter: processInstanceId, type)
- `resolve_incident` — PUT /incident/{id}
- `list_jobs` — POST /job (Filter: processInstanceId)
- `set_job_retries` — PUT /job/{id}/retries

#### External Tasks
- `fetch_and_lock` — POST /external-task/fetchAndLock
- `complete_external_task` — POST /external-task/{id}/complete
- `handle_external_task_failure` — POST /external-task/{id}/failure

### 4.3 MCP Resources

Neben Tools bieten wir auch MCP Resources (lesende, strukturierte Daten):

- `resource://camunda7/process-definitions` — Liste aller Deployments
- `resource://camunda7/process/{key}/xml` — BPMN-XML als Resource
- `resource://camunda7/process/{key}/stats` — Instanzstatistiken

### 4.4 Beispiel Tool-Implementierung (mit Engine Adapter)

```typescript
// packages/camunda7-mcp-server/src/tools/task.ts
import { z } from 'zod';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';

export function createListTasksTool(adapter: EngineAdapter) {
  return {
    name: 'list_tasks',
    description: `List user tasks from ${adapter.engineType === 'cibseven' ? 'CIB Seven' : 'Operaton'}. Filter by assignee, candidate group, process definition, or process instance.`,
    inputSchema: z.object({
      assignee: z.string().optional().describe('Filter by assigned user'),
      candidateGroup: z.string().optional().describe('Filter by candidate group'),
      processDefinitionKey: z.string().optional().describe('Filter by process definition key'),
      processInstanceId: z.string().optional().describe('Filter by process instance ID'),
      unfinished: z.boolean().optional().default(true).describe('Only return open tasks'),
      maxResults: z.number().optional().default(20).describe('Max results to return'),
      sortBy: z.enum(['created', 'dueDate', 'priority', 'name']).optional().default('created'),
      sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
    }),
    handler: async (input) => {
      const tasks = await adapter.listTasks(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }],
      };
    },
  };
}
```

---

## 5. Komponente 2: MCP Apps (Cockpit-Komponenten)

### 5.1 Technologie-Stack

| Aspekt | Entscheidung | Begründung |
|--------|-------------|------------|
| Framework | sunpeak | Cross-Host MCP App Framework (Claude, ChatGPT, etc.) |
| UI Library | shadcn/ui + Tailwind | Hochwertige, anpassbare Komponenten |
| BPMN Rendering | bpmn-js (bpmn.io) | Standard für BPMN-Visualisierung, Open Source |
| State | `useToolData` (sunpeak Hook) | MCP-native State-Verwaltung |
| Charts | Recharts | Leichtgewichtig, React-nativ |
| Engine-Zugriff | `@camunda7-mcp/engine-adapter` | Engine-agnostisch in Server-Side Tool-Handlern |

**Wichtig:** Alle MCP App Tool-Handler verwenden den `engine-adapter` statt direkter `fetch()`-Aufrufe. Damit sind die Apps automatisch mit CIB Seven und Operaton kompatibel.

### 5.2 App-Katalog

#### App 1: Process List (`process-list`)
**Zweck:** Übersicht aller deployed Process Definitions mit Instanzstatistiken.
**Datenquelle:** engine-adapter → `listProcessDefinitions()`
**Features:**
- Tabelle mit Key, Name, Version, Tenant
- Instanz-Counter (running, suspended, incidents)
- Klick → Instanz-Liste oder Detail
- Suchfeld mit Filterung

#### App 2: Instance Detail (`instance-detail`)
**Zweck:** Detailansicht einer einzelnen Prozessinstanz.
**Datenquelle:** engine-adapter → `getProcessInstance()` + `getActivityInstanceTree()` + `getVariables()`
**Features:**
- BPMN-Diagramm mit aktuellem Token-Overlay (bpmn-js)
- Activity Instance Tree als Sidebar
- Variablen-Tabelle mit Typ-Badges
- Incident-Anzeige falls vorhanden
- Aktions-Buttons: Suspend, Cancel, Modify

#### App 3: Task Dashboard (`task-dashboard`)
**Zweck:** Offene User Tasks mit Claim/Complete-Funktionalität.
**Datenquelle:** engine-adapter → `listTasks()`
**Features:**
- Tabellarische Ansicht: Task Name, Assignee, Due Date, Priority, Process Key
- Filter nach Assignee, Candidate Group, Process Definition
- Inline-Claim und -Complete Aktionen
- Variablen-Preview im Expandable Row

#### App 4: History Timeline (`history-timeline`)
**Zweck:** Zeitliche Darstellung aller Activities einer abgeschlossenen Prozessinstanz.
**Datenquelle:** ClickHouse MCP Server → `run_query` auf `activity_instances` Tabelle
**Features:**
- Gantt-ähnliche Timeline (Recharts oder custom SVG)
- Activity-Typ-Icons (User Task, Service Task, Gateway, Event)
- Duration-Badges
- Variablen-Diff zwischen Activities

#### App 5: Incident Panel (`incident-panel`)
**Zweck:** Alle offenen Incidents mit Retry-Möglichkeit.
**Datenquelle:** engine-adapter → `listIncidents()`
**Features:**
- Incident-Liste mit Error-Message, Timestamp, Process Instance
- Bulk-Retry Button
- Stack-Trace Expander
- Gruppierung nach Incident-Typ

#### App 6: Analytics Dashboard (`analytics-dashboard`)
**Zweck:** Aggregierte Prozessmetriken aus ClickHouse.
**Datenquelle:** ClickHouse MCP Server → diverse Queries
**Features:**
- Process Instance Throughput (Zeitreihe)
- Avg. Duration pro Process Definition
- Top-10 langsame Activities
- Incident Rate über Zeit
- SLA-Überschreitungen

### 5.3 Beispiel sunpeak Tool (mit Engine Adapter)

```typescript
// packages/camunda7-mcp-apps/src/tools/show-task-dashboard.ts
import { z } from 'zod';
import type { AppToolConfig } from 'sunpeak/mcp';
import { createEngineAdapter } from '@camunda7-mcp/engine-adapter';

export const tool: AppToolConfig = {
  resource: 'task-dashboard',
  title: 'Camunda Task Dashboard',
  description: 'Show open user tasks with filtering and claim/complete actions',
  annotations: { readOnlyHint: false },
};

export const schema = {
  assignee: z.string().optional().describe('Filter by assigned user'),
  candidateGroup: z.string().optional().describe('Filter by candidate group'),
  processDefinitionKey: z.string().optional().describe('Filter by process definition key'),
};

export default async function (args: z.infer<z.ZodObject<typeof schema>>) {
  const adapter = createEngineAdapter({
    engineType: (process.env.ENGINE_TYPE as 'camunda7' | 'cibseven' | 'operaton') ?? 'cibseven',
    baseUrl: process.env.ENGINE_BASE_URL!,
    authType: (process.env.ENGINE_AUTH_TYPE as 'basic' | 'bearer' | 'none') ?? 'basic',
    username: process.env.ENGINE_USERNAME,
    password: process.env.ENGINE_PASSWORD,
  });

  const tasks = await adapter.listTasks({
    ...args,
    sortBy: 'created',
    sortOrder: 'desc',
  });

  return {
    structuredContent: {
      tasks,
      totalCount: tasks.length,
    },
  };
}
```

### 5.4 Beispiel sunpeak Resource

```tsx
// packages/camunda7-mcp-apps/src/resources/task-dashboard/task-dashboard.tsx
import { useToolData } from 'sunpeak';
import type { ResourceConfig } from 'sunpeak';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { StatusBadge } from '../components/status-badge';

export const resource: ResourceConfig = {
  description: 'Interactive dashboard showing open user tasks with filtering and actions',
};

interface Task {
  id: string;
  name: string;
  assignee: string | null;
  created: string;
  due: string | null;
  priority: number;
  processDefinitionId: string;
  processInstanceId: string;
}

export function TaskDashboardResource() {
  const { output: data } = useToolData<unknown, { tasks: Task[]; totalCount: number }>();

  if (!data) return <div className="p-4">Loading tasks...</div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Open Tasks</h2>
        <Badge variant="secondary">{data.totalCount} total</Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Task</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Process</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.tasks.map((task) => (
            <TableRow key={task.id}>
              <TableCell className="font-medium">{task.name}</TableCell>
              <TableCell>{task.assignee ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
              <TableCell className="text-xs font-mono">{task.processDefinitionId.split(':')[0]}</TableCell>
              <TableCell><StatusBadge priority={task.priority} /></TableCell>
              <TableCell className="text-sm">{new Date(task.created).toLocaleDateString('de-DE')}</TableCell>
              <TableCell>
                <Button size="sm" variant="outline">Claim</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

---

## 6. Komponente 3: History-to-ClickHouse Plugins (Multi-Engine)

### 6.1 Architektur-Überblick

Die History-Pipeline ist in vier Module aufgeteilt:

```
┌──────────────────────────────────────────────────────────────┐
│                  shared-history-clickhouse                    │
│                  (Engine-agnostisch)                          │
│                                                              │
│  ClickHouseClient          ClickHouseHistoryEventHandlerBase │
│  ClickHouseProperties      Mapper (Map<String,Any?> → CH)   │
│  SchemaInitializer         clickhouse-schema.sql             │
│                                                              │
│  Package: com.camunda7mcp.history                            │
│  Abhängigkeiten: ClickHouse JDBC, Spring Boot                │
│  KEINE Engine-SDK-Abhängigkeit!                              │
└───────┬────────────────────┬─────────────────────┬───────────┘
        │                    │                     │
        ▼                    ▼                     ▼
┌───────────────────┐ ┌────────────────────────┐ ┌────────────────────────┐
│camunda7-history-  │ │cibseven-history-       │ │operaton-history-       │
│clickhouse         │ │clickhouse              │ │clickhouse              │
│(Camunda 7 Orig.)  │ │(CIB Seven-spezifisch)  │ │(Operaton-spezifisch)   │
│                   │ │                        │ │                        │
│Camunda7History    │ │CibSevenHistoryPlugin   │ │OperatonHistoryPlugin   │
│Plugin             │ │CibSevenHistoryEvent    │ │OperatonHistoryEvent    │
│Camunda7HistoryEvt │ │Handler                 │ │Handler                 │
│Handler            │ │CibSevenEventMapper     │ │OperatonEventMapper     │
│Camunda7EventMapper│ │                        │ │                        │
│                   │ │Package:                │ │Package:                │
│Package:           │ │ com.camunda7mcp        │ │ com.camunda7mcp        │
│ com.camunda7mcp   │ │ .history.cibseven      │ │ .history.operaton      │
│ .history.camunda7 │ │                        │ │                        │
│                   │ │Abhängigkeit:           │ │Abhängigkeit:           │
│Abhängigkeit:      │ │ org.cibseven:          │ │ org.operaton:          │
│ org.camunda.bpm:  │ │ cibseven-bpm-engine    │ │ operaton-bpm-engine    │
│ camunda-engine    │ │                        │ │                        │
│                   │ │Status: AKTIV           │ │Status: PLATZHALTER     │
│Status: AKTIV      │ └────────────────────────┘ └────────────────────────┘
└───────────────────┘
```

### 6.2 Warum ClickHouse?

| Kriterium | ClickHouse | Begründung |
|-----------|-----------|------------|
| MCP-Ready | Offizieller MCP Server vorhanden | `mcp-clickhouse` von ClickHouse Inc. |
| Open Source | Apache 2.0 | Vollständig Open Source |
| Betrieb | Single Binary | Docker-Image, kein Cluster nötig für kleine/mittlere Setups |
| Spaltenorientiert | Ja | Ideal für analytische Queries auf History-Daten |
| SQL-Kompatibel | Ja | Standard-SQL, leicht zu querien |
| Compression | LZ4/ZSTD | History-Daten komprimieren extrem gut |
| Performance | Ja | Millionen History-Events in Millisekunden abfragbar |

### 6.3 Shared Library: `shared-history-clickhouse`

Die shared Library enthält allen engine-agnostischen Code. Sie arbeitet **nicht** mit Engine-spezifischen Event-Klassen, sondern mit `Map<String, Any?>` als Zwischenformat.

#### ClickHouseHistoryEventHandlerBase

```kotlin
// plugins/shared-history-clickhouse/src/main/kotlin/com/camunda7mcp/history/ClickHouseHistoryEventHandlerBase.kt
package com.camunda7mcp.history

import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

abstract class ClickHouseHistoryEventHandlerBase(
    protected val client: ClickHouseClient,
    protected val properties: ClickHouseProperties,
) {
    protected val buffer = ConcurrentLinkedQueue<HistoryEventData>()
    private val scheduler = Executors.newSingleThreadScheduledExecutor()

    init {
        scheduler.scheduleAtFixedRate(
            { flush() },
            properties.flushIntervalSeconds,
            properties.flushIntervalSeconds,
            TimeUnit.SECONDS
        )
    }

    /**
     * Engine-agnostisches Zwischenformat.
     * Die engine-spezifischen Subklassen mappen ihre Events hierauf.
     */
    data class HistoryEventData(
        val eventCategory: EventCategory,
        val data: Map<String, Any?>,
    )

    enum class EventCategory {
        PROCESS_INSTANCE,
        ACTIVITY_INSTANCE,
        TASK_INSTANCE,
        VARIABLE_UPDATE,
        INCIDENT,
    }

    protected fun bufferEvent(event: HistoryEventData) {
        buffer.add(event)
        if (buffer.size >= properties.batchSize) {
            flush()
        }
    }

    private fun flush() {
        val events = mutableListOf<HistoryEventData>()
        while (buffer.isNotEmpty()) {
            buffer.poll()?.let { events.add(it) }
        }
        if (events.isEmpty()) return

        val grouped = events.groupBy { it.eventCategory }

        grouped[EventCategory.PROCESS_INSTANCE]?.let {
            client.insertProcessInstances(it.map { e -> e.data })
        }
        grouped[EventCategory.ACTIVITY_INSTANCE]?.let {
            client.insertActivityInstances(it.map { e -> e.data })
        }
        grouped[EventCategory.TASK_INSTANCE]?.let {
            client.insertTaskInstances(it.map { e -> e.data })
        }
        grouped[EventCategory.VARIABLE_UPDATE]?.let {
            client.insertVariableUpdates(it.map { e -> e.data })
        }
        grouped[EventCategory.INCIDENT]?.let {
            client.insertIncidents(it.map { e -> e.data })
        }
    }
}
```

#### ClickHouse Schema (unverändert, engine-agnostisch)

```sql
-- plugins/shared-history-clickhouse/src/main/resources/clickhouse-schema.sql

CREATE TABLE IF NOT EXISTS camunda_process_instances (
    id                    String,
    process_definition_id String,
    process_definition_key String,
    process_definition_name Nullable(String),
    business_key          Nullable(String),
    start_time            DateTime64(3),
    end_time              Nullable(DateTime64(3)),
    duration_in_millis    Nullable(UInt64),
    start_user_id         Nullable(String),
    start_activity_id     Nullable(String),
    end_activity_id       Nullable(String),
    delete_reason         Nullable(String),
    super_process_instance_id Nullable(String),
    state                 String,
    tenant_id             Nullable(String),
    engine_type           String,                  -- 'camunda7', 'cibseven' oder 'operaton'
    event_type            String,
    timestamp             DateTime64(3) DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(timestamp)
ORDER BY (process_definition_key, start_time, id)
PARTITION BY toYYYYMM(start_time);

CREATE TABLE IF NOT EXISTS camunda_activity_instances (
    id                    String,
    parent_activity_instance_id Nullable(String),
    activity_id           String,
    activity_name         Nullable(String),
    activity_type         String,
    process_definition_id String,
    process_definition_key String,
    process_instance_id   String,
    execution_id          String,
    start_time            DateTime64(3),
    end_time              Nullable(DateTime64(3)),
    duration_in_millis    Nullable(UInt64),
    assignee              Nullable(String),
    task_id               Nullable(String),
    caller_process_definition_id Nullable(String),
    caller_process_instance_id Nullable(String),
    tenant_id             Nullable(String),
    engine_type           String,
    event_type            String,
    timestamp             DateTime64(3) DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(timestamp)
ORDER BY (process_definition_key, process_instance_id, start_time, id)
PARTITION BY toYYYYMM(start_time);

CREATE TABLE IF NOT EXISTS camunda_task_instances (
    id                    String,
    task_id               String,
    process_definition_id String,
    process_definition_key String,
    process_instance_id   String,
    execution_id          String,
    activity_instance_id  Nullable(String),
    name                  Nullable(String),
    description           Nullable(String),
    assignee              Nullable(String),
    owner                 Nullable(String),
    priority              Int32,
    due_date              Nullable(DateTime64(3)),
    follow_up_date        Nullable(DateTime64(3)),
    start_time            DateTime64(3),
    end_time              Nullable(DateTime64(3)),
    duration_in_millis    Nullable(UInt64),
    delete_reason         Nullable(String),
    tenant_id             Nullable(String),
    engine_type           String,
    event_type            String,
    timestamp             DateTime64(3) DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(timestamp)
ORDER BY (process_definition_key, process_instance_id, start_time, id)
PARTITION BY toYYYYMM(start_time);

CREATE TABLE IF NOT EXISTS camunda_variable_updates (
    id                    String,
    process_definition_id String,
    process_definition_key String,
    process_instance_id   String,
    execution_id          Nullable(String),
    activity_instance_id  Nullable(String),
    task_id               Nullable(String),
    variable_name         String,
    variable_type         String,
    serialized_value      Nullable(String),
    text_value            Nullable(String),
    long_value            Nullable(Int64),
    double_value          Nullable(Float64),
    revision              UInt32,
    tenant_id             Nullable(String),
    engine_type           String,
    event_type            String,
    timestamp             DateTime64(3) DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(timestamp)
ORDER BY (process_definition_key, process_instance_id, variable_name, timestamp)
PARTITION BY toYYYYMM(timestamp);

CREATE TABLE IF NOT EXISTS camunda_incidents (
    id                    String,
    process_definition_id String,
    process_definition_key String,
    process_instance_id   String,
    execution_id          Nullable(String),
    activity_id           Nullable(String),
    incident_type         String,
    incident_message      Nullable(String),
    cause_incident_id     Nullable(String),
    root_cause_incident_id Nullable(String),
    configuration         Nullable(String),
    create_time           DateTime64(3),
    end_time              Nullable(DateTime64(3)),
    state                 String,
    tenant_id             Nullable(String),
    engine_type           String,
    event_type            String,
    timestamp             DateTime64(3) DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(timestamp)
ORDER BY (process_definition_key, create_time, id)
PARTITION BY toYYYYMM(create_time);
```

**Hinweis:** Alle Tabellen enthalten jetzt eine `engine_type`-Spalte (`'camunda7'`, `'cibseven'` oder `'operaton'`), um History-Daten aus verschiedenen Engines in einer ClickHouse-Instanz unterscheiden zu können.

### 6.4 CIB Seven Plugin: `cibseven-history-clickhouse`

```kotlin
// plugins/cibseven-history-clickhouse/src/main/kotlin/com/camunda7mcp/history/cibseven/CibSevenHistoryPlugin.kt
package com.camunda7mcp.history.cibseven

import com.camunda7mcp.history.ClickHouseClient
import com.camunda7mcp.history.ClickHouseProperties
import org.cibseven.bpm.engine.impl.cfg.AbstractProcessEnginePlugin
import org.cibseven.bpm.engine.impl.cfg.ProcessEngineConfigurationImpl
import org.cibseven.bpm.engine.impl.history.handler.CompositeDbHistoryEventHandler
import org.springframework.stereotype.Component

@Component
class CibSevenHistoryPlugin(
    private val clickHouseClient: ClickHouseClient,
    private val properties: ClickHouseProperties,
) : AbstractProcessEnginePlugin() {

    override fun preInit(config: ProcessEngineConfigurationImpl) {
        val clickHouseHandler = CibSevenHistoryEventHandler(clickHouseClient, properties)

        val compositeHandler = CompositeDbHistoryEventHandler(
            listOf(clickHouseHandler)
        )
        config.historyEventHandler = compositeHandler
    }
}
```

```kotlin
// plugins/cibseven-history-clickhouse/src/main/kotlin/com/camunda7mcp/history/cibseven/CibSevenHistoryEventHandler.kt
package com.camunda7mcp.history.cibseven

import com.camunda7mcp.history.ClickHouseClient
import com.camunda7mcp.history.ClickHouseHistoryEventHandlerBase
import com.camunda7mcp.history.ClickHouseProperties
import org.cibseven.bpm.engine.impl.history.event.*
import org.cibseven.bpm.engine.impl.history.handler.HistoryEventHandler

class CibSevenHistoryEventHandler(
    client: ClickHouseClient,
    properties: ClickHouseProperties,
) : ClickHouseHistoryEventHandlerBase(client, properties), HistoryEventHandler {

    private val eventMapper = CibSevenEventMapper()

    override fun handleEvent(historyEvent: HistoryEvent) {
        val mapped = eventMapper.map(historyEvent) ?: return
        bufferEvent(mapped)
    }

    override fun handleEvents(historyEvents: List<HistoryEvent>) {
        historyEvents.forEach { handleEvent(it) }
    }
}
```

```kotlin
// plugins/cibseven-history-clickhouse/src/main/kotlin/com/camunda7mcp/history/cibseven/CibSevenEventMapper.kt
package com.camunda7mcp.history.cibseven

import com.camunda7mcp.history.ClickHouseHistoryEventHandlerBase.EventCategory
import com.camunda7mcp.history.ClickHouseHistoryEventHandlerBase.HistoryEventData
import org.cibseven.bpm.engine.impl.history.event.*

class CibSevenEventMapper {

    fun map(event: HistoryEvent): HistoryEventData? {
        return when (event) {
            is HistoricProcessInstanceEventEntity -> HistoryEventData(
                eventCategory = EventCategory.PROCESS_INSTANCE,
                data = mapOf(
                    "id" to event.processInstanceId,
                    "process_definition_id" to event.processDefinitionId,
                    "process_definition_key" to event.processDefinitionKey,
                    "process_definition_name" to event.processDefinitionName,
                    "business_key" to event.businessKey,
                    "start_time" to event.startTime,
                    "end_time" to event.endTime,
                    "duration_in_millis" to event.durationInMillis,
                    "start_user_id" to event.startUserId,
                    "start_activity_id" to event.startActivityId,
                    "end_activity_id" to event.endActivityId,
                    "delete_reason" to event.deleteReason,
                    "super_process_instance_id" to event.superProcessInstanceId,
                    "state" to event.state,
                    "tenant_id" to event.tenantId,
                    "engine_type" to "cibseven",
                    "event_type" to event.eventType,
                )
            )
            is HistoricActivityInstanceEventEntity -> HistoryEventData(
                eventCategory = EventCategory.ACTIVITY_INSTANCE,
                data = mapOf(
                    "id" to event.activityInstanceId,
                    "parent_activity_instance_id" to event.parentActivityInstanceId,
                    "activity_id" to event.activityId,
                    "activity_name" to event.activityName,
                    "activity_type" to event.activityType,
                    "process_definition_id" to event.processDefinitionId,
                    "process_definition_key" to event.processDefinitionKey,
                    "process_instance_id" to event.processInstanceId,
                    "execution_id" to event.executionId,
                    "start_time" to event.startTime,
                    "end_time" to event.endTime,
                    "duration_in_millis" to event.durationInMillis,
                    "assignee" to event.assignee,
                    "task_id" to event.taskId,
                    "tenant_id" to event.tenantId,
                    "engine_type" to "cibseven",
                    "event_type" to event.eventType,
                )
            )
            is HistoricTaskInstanceEventEntity -> HistoryEventData(
                eventCategory = EventCategory.TASK_INSTANCE,
                data = mapOf(
                    "id" to event.id,
                    "task_id" to event.taskId,
                    "process_definition_id" to event.processDefinitionId,
                    "process_definition_key" to event.processDefinitionKey,
                    "process_instance_id" to event.processInstanceId,
                    "execution_id" to event.executionId,
                    "activity_instance_id" to event.activityInstanceId,
                    "name" to event.name,
                    "description" to event.description,
                    "assignee" to event.assignee,
                    "owner" to event.owner,
                    "priority" to event.priority,
                    "due_date" to event.dueDate,
                    "follow_up_date" to event.followUpDate,
                    "start_time" to event.startTime,
                    "end_time" to event.endTime,
                    "duration_in_millis" to event.durationInMillis,
                    "delete_reason" to event.deleteReason,
                    "tenant_id" to event.tenantId,
                    "engine_type" to "cibseven",
                    "event_type" to event.eventType,
                )
            )
            is HistoricVariableUpdateEventEntity -> HistoryEventData(
                eventCategory = EventCategory.VARIABLE_UPDATE,
                data = mapOf(
                    "id" to event.variableInstanceId,
                    "process_definition_id" to event.processDefinitionId,
                    "process_definition_key" to event.processDefinitionKey,
                    "process_instance_id" to event.processInstanceId,
                    "execution_id" to event.executionId,
                    "activity_instance_id" to event.activityInstanceId,
                    "task_id" to event.taskId,
                    "variable_name" to event.variableName,
                    "variable_type" to event.serializerName,
                    "serialized_value" to event.textValue2,
                    "text_value" to event.textValue,
                    "long_value" to event.longValue,
                    "double_value" to event.doubleValue,
                    "revision" to event.revision,
                    "tenant_id" to event.tenantId,
                    "engine_type" to "cibseven",
                    "event_type" to event.eventType,
                )
            )
            is HistoricIncidentEventEntity -> HistoryEventData(
                eventCategory = EventCategory.INCIDENT,
                data = mapOf(
                    "id" to event.id,
                    "process_definition_id" to event.processDefinitionId,
                    "process_definition_key" to event.processDefinitionKey,
                    "process_instance_id" to event.processInstanceId,
                    "execution_id" to event.executionId,
                    "activity_id" to event.activityId,
                    "incident_type" to event.incidentType,
                    "incident_message" to event.incidentMessage,
                    "cause_incident_id" to event.causeIncidentId,
                    "root_cause_incident_id" to event.rootCauseIncidentId,
                    "configuration" to event.configuration,
                    "create_time" to event.createTime,
                    "end_time" to event.endTime,
                    "state" to event.incidentState.toString(),
                    "tenant_id" to event.tenantId,
                    "engine_type" to "cibseven",
                    "event_type" to event.eventType,
                )
            )
            else -> null
        }
    }
}
```

### 6.5 Operaton Plugin: `operaton-history-clickhouse` (Platzhalter)

Analog zum CIB Seven Plugin, aber mit Operaton-SDK-Klassen:

```kotlin
// plugins/operaton-history-clickhouse/src/main/kotlin/com/camunda7mcp/history/operaton/OperatonHistoryPlugin.kt
package com.camunda7mcp.history.operaton

// TODO: Implementierung in Phase 5
// import org.operaton.bpm.engine.impl.cfg.AbstractProcessEnginePlugin
// import org.operaton.bpm.engine.impl.cfg.ProcessEngineConfigurationImpl
//
// Struktur analog zu CibSevenHistoryPlugin, aber mit:
// - org.operaton.bpm.engine.impl.cfg.AbstractProcessEnginePlugin
// - org.operaton.bpm.engine.impl.history.event.*
// - engine_type = "operaton"
```

### 6.6 Spring Boot Konfiguration

```yaml
# application.yml (gilt für beide Engine-Plugins)
camunda7mcp:
  history:
    clickhouse:
      enabled: true
      url: jdbc:clickhouse://localhost:8123/camunda_history
      username: default
      password: ""
      database: camunda_history
      batch-size: 100
      flush-interval-seconds: 5
      create-schema: true
```

---

## 7. ClickHouse MCP Server (existierender)

Wir verwenden den **offiziellen ClickHouse MCP Server** (`mcp-clickhouse`) als fertiges Modul:

```bash
pip install mcp-clickhouse
```

Konfiguration via Environment:

```env
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=camunda_history
CLICKHOUSE_SECURE=false
```

Damit kann jeder MCP-Host (Claude, ChatGPT, Cursor, etc.) direkt SQL-Queries gegen die ClickHouse History-Daten ausführen. Der LLM kann das Schema discovern und analytische Fragen beantworten wie:

- "Wie viele Prozessinstanzen von 'invoice-process' liefen letzte Woche?"
- "Was ist die durchschnittliche Durchlaufzeit pro Activity?"
- "Zeige mir alle Tasks, die länger als 2 Tage offen waren"
- "Vergleiche die Durchlaufzeiten zwischen CIB Seven und Operaton" (mit `engine_type`-Filter)

---

## 8. Dokumentation (GitBook)

### 8.1 Technologie

Die Projektdokumentation wird mit **GitBook** erstellt und lebt im `docs/`-Verzeichnis des Monorepos. GitBook bietet:

- Markdown-basierte Authoring-Erfahrung
- Automatische Navigation via `SUMMARY.md`
- Suchfunktion, Versionierung, Custom Domain
- GitHub-Sync (Änderungen am `docs/`-Verzeichnis deployen automatisch)

### 8.2 Struktur

Die Dokumentation ist in folgende Bereiche gegliedert:

| Bereich | Pfad | Inhalt |
|---------|------|--------|
| **Getting Started** | `docs/getting-started/` | Voraussetzungen, Quickstart, Konfiguration |
| **Architektur** | `docs/architecture/` | Engine Adapter Pattern, History Pipeline, Multi-Engine-Konzept |
| **MCP Server** | `docs/mcp-server/` | Server-Übersicht, Tool-Referenz (alle ~25 Tools) |
| **MCP Apps** | `docs/mcp-apps/` | App-Übersicht, App-Katalog (alle 6 Apps) |
| **History Plugins** | `docs/history-plugins/` | Plugin-Übersicht, ClickHouse Schema, Plugin-Entwicklung |
| **ADRs** | `docs/adrs/` | Architecture Decision Records |

### 8.3 ADRs (Architecture Decision Records)

Alle Architekturentscheidungen werden als ADRs im Format [MADR](https://adr.github.io/madr/) dokumentiert:

| ADR | Titel | Status |
|-----|-------|--------|
| ADR-001 | MCP SDK: TypeScript (@modelcontextprotocol/sdk) | Accepted |
| ADR-002 | ClickHouse Client: JDBC im Plugin | Proposed |
| ADR-003 | Async History: In-Process Buffer | Accepted |
| ADR-004 | BPMN Rendering: bpmn-js Lazy-Load | Proposed |
| ADR-005 | Auth-Propagation: OAuth2 Token Forwarding | Proposed |
| ADR-006 | Variable Serialization: JSON in String-Column | Proposed |
| ADR-007 | Camunda 7 Maven Coordinates & Docker Image | To Verify |
| ADR-008 | CIB Seven Maven Coordinates & Docker Image | To Verify |
| ADR-009 | Operaton Maven Coordinates & Docker Image | To Verify |
| ADR-010 | REST API Pfad-Unterschiede zwischen Engines | Monitoring |
| ADR-011 | Event-Class-Package-Unterschiede | To Verify |

### 8.4 GitBook Konfiguration

```yaml
# docs/.gitbook.yaml
root: ./
structure:
  readme: README.md
  summary: SUMMARY.md
```

---

## 9. Umsetzungsplan (Phasen)

### Phase 1: Foundation + Engine Adapter (CIB Seven) + Core MCP Tools (2–3 Wochen)

1. **Monorepo Setup**: pnpm workspaces + Turborepo + TypeScript Config
2. **Engine Adapter Package**: `EngineAdapter` Interface, `BaseAdapter`, `Camunda7Adapter`, `CibSevenAdapter`, `AdapterFactory`
3. **Shared Types**: Engine-agnostische REST API Response Types + ClickHouse Schema Types
4. **Camunda 7 MCP Server — Core Tools**: `list_tasks`, `complete_task`, `start_process`, `list_process_definitions`, `get_variables` — alle über `engine-adapter`
5. **Docker Compose**: CIB Seven (Spring Boot) + ClickHouse
6. **Erster Test**: MCP Server mit CIB Seven in Claude Desktop / Claude Code anbinden

### Phase 2: History Pipeline für Camunda 7 + CIB Seven (1–2 Wochen)

1. **shared-history-clickhouse**: `ClickHouseClient`, `ClickHouseHistoryEventHandlerBase`, Mapper, Schema DDL
2. **camunda7-history-clickhouse**: `Camunda7HistoryPlugin`, `Camunda7HistoryEventHandler`, `Camunda7EventMapper`
3. **cibseven-history-clickhouse**: `CibSevenHistoryPlugin`, `CibSevenHistoryEventHandler`, `CibSevenEventMapper`
4. **ClickHouse Schema**: DDL Skripte mit `engine_type`-Spalte + Schema Initializer
5. **Integration Test**: Prozess in Camunda 7 / CIB Seven starten, History in ClickHouse prüfen
6. **ClickHouse MCP Server**: offizielle Installation, Schema-Discovery testen

### Phase 3: Erste MCP App — Task Dashboard (1–2 Wochen)

1. **sunpeak Projekt aufsetzen**: `sunpeak new`, shadcn/ui integrieren
2. **Task Dashboard App**: Als erste App umsetzen (häufigster Use Case), nutzt `engine-adapter`
3. **Simulator testen**: sunpeak dev, Simulation JSONs erstellen
4. **In Claude/ChatGPT deployen**: sunpeak build + start

### Phase 4: Weitere Apps (2–3 Wochen)

1. **Process List App**
2. **Instance Detail App** (mit bpmn-js Integration)
3. **Incident Panel App**
4. **History Timeline App** (ClickHouse-basiert)
5. **Analytics Dashboard App** (ClickHouse-basiert)

### Phase 5: Operaton Adapter + History Plugin (1–2 Wochen)

1. **OperatonAdapter**: Implementierung in `packages/engine-adapter/src/operaton/`, Overrides wo APIs divergieren
2. **operaton-history-clickhouse**: `OperatonHistoryPlugin`, `OperatonHistoryEventHandler`, `OperatonEventMapper`
3. **Docker Compose Operaton**: `docker-compose.operaton.yml` mit Operaton Engine
4. **Integration Test**: MCP Server + History Pipeline mit Operaton verifizieren
5. **Cross-Engine Queries**: ClickHouse-Queries testen, die über `engine_type` filtern

### Phase 6: Polish & Release (1 Woche)

1. **Dokumentation**: Setup Guide, Tool Reference, Architektur-ADRs
2. **CI/CD**: GitHub Actions für Build/Test/Release
3. **npm/Docker Publish**: MCP Server + Engine Adapter als npm-Pakete, Plugins als Maven-Artifacts
4. **Blog Post / LinkedIn**: Launch-Kommunikation

---

## 10. Lokale Entwicklungsumgebung (Composable Docker Compose)

### Strategie

Docker Compose Files sind **composable** aufgebaut:

| Compose File | Inhalt | Nutzung |
|-------------|--------|---------|
| `docker-compose.clickhouse.yml` | ClickHouse Server | Basis für alle Setups |
| `docker-compose.camunda7.yml` | Camunda 7 Original Engine + History Plugin | Camunda 7 Entwicklung |
| `docker-compose.cibseven.yml` | CIB Seven Engine + History Plugin | CIB Seven Entwicklung |
| `docker-compose.operaton.yml` | Operaton Engine + History Plugin | Operaton Entwicklung (später) |
| `docker-compose.yml` | Default = CIB Seven + ClickHouse + MCP Servers | Schnellstart |

### Default Setup (CIB Seven)

```yaml
# docker/docker-compose.yml
# Default: CIB Seven + ClickHouse + MCP Servers
services:
  cibseven:
    image: cibseven/cibseven-bpm-platform:latest  # TODO: ADR 7 — exaktes Image klären
    ports:
      - "8080:8080"
    environment:
      - DB_DRIVER=org.h2.Driver
    # Für Plugin-Entwicklung: eigenes Image mit History-Plugin-JAR bauen

  clickhouse:
    image: clickhouse/clickhouse-server:24.3
    ports:
      - "8123:8123"
      - "9000:9000"
    volumes:
      - clickhouse-data:/var/lib/clickhouse
    environment:
      - CLICKHOUSE_DB=camunda_history
      - CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1

  camunda7-mcp-server:
    build: ../packages/camunda7-mcp-server
    environment:
      - ENGINE_TYPE=cibseven
      - ENGINE_BASE_URL=http://cibseven:8080/engine-rest
      - ENGINE_AUTH_TYPE=basic
      - ENGINE_USERNAME=demo
      - ENGINE_PASSWORD=demo
      - MCP_TRANSPORT=sse
      - MCP_PORT=3100
    ports:
      - "3100:3100"
    depends_on:
      - cibseven

  clickhouse-mcp-server:
    image: python:3.12-slim
    command: ["pip", "install", "mcp-clickhouse", "&&", "mcp-clickhouse"]
    environment:
      - CLICKHOUSE_HOST=clickhouse
      - CLICKHOUSE_DATABASE=camunda_history
      - CLICKHOUSE_MCP_SERVER_TRANSPORT=sse
    ports:
      - "3200:8000"
    depends_on:
      - clickhouse

volumes:
  clickhouse-data:
```

### Operaton Setup (Platzhalter)

```yaml
# docker/docker-compose.operaton.yml
# Operaton + ClickHouse + MCP Servers
services:
  operaton:
    image: operaton/operaton-bpm-platform:latest  # TODO: ADR 8 — exaktes Image klären
    ports:
      - "8080:8080"
    environment:
      - DB_DRIVER=org.h2.Driver

  clickhouse:
    image: clickhouse/clickhouse-server:24.3
    ports:
      - "8123:8123"
      - "9000:9000"
    volumes:
      - clickhouse-data:/var/lib/clickhouse
    environment:
      - CLICKHOUSE_DB=camunda_history
      - CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1

  camunda7-mcp-server:
    build: ../packages/camunda7-mcp-server
    environment:
      - ENGINE_TYPE=operaton
      - ENGINE_BASE_URL=http://operaton:8080/engine-rest
      - ENGINE_AUTH_TYPE=basic
      - ENGINE_USERNAME=demo
      - ENGINE_PASSWORD=demo
      - MCP_TRANSPORT=sse
      - MCP_PORT=3100
    ports:
      - "3100:3100"
    depends_on:
      - operaton

volumes:
  clickhouse-data:
```

---

## 11. Offene Entscheidungen / ADRs

| # | Frage | Tendenz | Zu klären |
|---|-------|---------|-----------|
| 1 | MCP SDK: FastMCP (Python) vs @modelcontextprotocol/sdk (TS) | TypeScript (sunpeak-Kompatibilität) | Performance-Vergleich |
| 2 | ClickHouse Client im Plugin: JDBC vs HTTP | JDBC (com.clickhouse:clickhouse-jdbc) | Connection Pooling Setup |
| 3 | Async History Writes: In-Process Buffer vs Message Queue | In-Process Buffer (einfacher Start) | Skalierung ab X Events/sec |
| 4 | BPMN Rendering in MCP App: bpmn-js Bundle Size | Lazy-Load, nur Viewer (kein Modeler) | Bundle-Size-Check im MCP-Host |
| 5 | Auth-Propagation: MCP Host → MCP Server → Engine | OAuth2 Token Forwarding | sunpeak Auth-Guide lesen |
| 6 | Variable Serialization: Große Objekte in ClickHouse | JSON in String-Column + LowCardinality für Typen | Max-Size-Limit definieren |
| **7** | **Camunda 7 Maven Coordinates & Docker Image** | `org.camunda.bpm:camunda-engine`, Docker: `camunda/camunda-bpm-platform:7.21.0` | **Lizenz-Kompatibilität prüfen (Camunda BPM CE)** |
| **8** | **CIB Seven Maven Coordinates & Docker Image** | `org.cibseven:cibseven-bpm-engine` (Tendenz) | **Exakte GroupId, ArtifactId, Docker-Image verifizieren** |
| **9** | **Operaton Maven Coordinates & Docker Image** | `org.operaton:operaton-bpm-engine` (Tendenz) | **Exakte GroupId, ArtifactId, Docker-Image verifizieren** |
| **10** | **REST API Pfad-Unterschiede zwischen Engines** | Aktuell identisch (`/engine-rest/...`) | **Monitoring: Divergenz bei neuen Releases tracken** |
| **11** | **Event-Class-Package-Unterschiede** | Camunda 7: `org.camunda.bpm.engine.impl.history.event.*`, CIB Seven: `org.cibseven.bpm.engine.impl.history.event.*`, Operaton: `org.operaton.bpm.engine.impl.history.event.*` | **Verifizieren, ob Event-Klassen strukturell identisch sind** |

---

## 12. Nicht-funktionale Anforderungen

- **Engine-Agnostik im MCP-Layer**: Kein CIB-Seven- oder Operaton-spezifischer Code in MCP Server oder MCP Apps — alles geht durch den Engine Adapter
- **Keine Breaking Changes an Engines**: Die History-Plugins sind additiv (CompositeHandler), keine Engine-DB wird verändert
- **Ausfallsicherheit**: Wenn ClickHouse nicht erreichbar ist, darf der Engine-Prozess NICHT blockieren → Async + Error Handling mit Retry
- **Datenschutz**: Variable-Values können sensible Daten enthalten → konfigurierbare Excludes (`camunda7mcp.history.clickhouse.exclude-variables: [password, secret]`)
- **Idempotenz**: `ReplacingMergeTree` in ClickHouse sorgt für Deduplizierung bei Re-Sends
- **Monitoring**: Metriken für Buffer-Size, Flush-Duration, Error-Count via Micrometer
- **Multi-Engine ClickHouse**: Eine ClickHouse-Instanz kann History-Daten von Camunda 7, CIB Seven und Operaton aufnehmen (unterschieden über `engine_type`-Spalte)

---

## 13. Zusammenfassung für Claude Code

> **Ziel**: Erstelle ein pnpm-Monorepo mit Turborepo, das vier Hauptkomponenten enthält:
>
> 1. `packages/engine-adapter` — TypeScript Engine-Abstraktionsschicht mit `EngineAdapter` Interface, `BaseAdapter` (shared HTTP-Client-Logik), `Camunda7Adapter` (Original), `CibSevenAdapter` (primäre Implementierung), `OperatonAdapter` (Platzhalter) und `AdapterFactory` (`ENGINE_TYPE=camunda7|cibseven|operaton` → konkreter Adapter). Kapselt alle REST-API-Unterschiede zwischen den drei Engines. REST-API-Referenz: [`camunda7-open-api-doc.json`](./camunda7-open-api-doc.json) (Camunda 7), [`cibseve-open-api-doc.json`](./cibseve-open-api-doc.json) (CIB Seven).
>
> 2. `packages/camunda7-mcp-server` — TypeScript MCP Server auf Basis von `@modelcontextprotocol/sdk`, der über den `engine-adapter` mit CIB Seven oder Operaton kommuniziert (ca. 25 Tools in den Kategorien: Deployments, Process Definitions, Process Instances, Tasks, Messages, Variables, History, Incidents, Jobs, External Tasks). Kein eigener HTTP-Client, kein engine-spezifischer Code.
>
> 3. `packages/camunda7-mcp-apps` — sunpeak MCP App Projekt mit 6 React-Komponenten (shadcn/ui): Process List, Instance Detail, Task Dashboard, History Timeline, Incident Panel, Analytics Dashboard. Tool-Handler nutzen `engine-adapter`. Jede App hat eine Resource (.tsx) und ein Tool (.ts) nach sunpeak-Konvention.
>
> 4. History-to-ClickHouse Plugins (3 Gradle-Module):
>    - `plugins/shared-history-clickhouse` — Engine-agnostische Kotlin Library: `ClickHouseClient`, `ClickHouseHistoryEventHandlerBase` (arbeitet mit `Map<String, Any?>`), Mapper, Schema DDL. Package: `com.camunda7mcp.history`. Keine Engine-SDK-Abhängigkeit.
>    - `plugins/camunda7-history-clickhouse` — Camunda 7 Original Plugin: `Camunda7HistoryPlugin` (extends `org.camunda.bpm.engine.impl.cfg.AbstractProcessEnginePlugin`), `Camunda7HistoryEventHandler` (extends Base), `Camunda7EventMapper`. Package: `com.camunda7mcp.history.camunda7`.
>    - `plugins/cibseven-history-clickhouse` — CIB Seven Plugin: `CibSevenHistoryPlugin` (extends `org.cibseven.bpm.engine.impl.cfg.AbstractProcessEnginePlugin`), `CibSevenHistoryEventHandler` (extends Base), `CibSevenEventMapper`. Package: `com.camunda7mcp.history.cibseven`.
>    - `plugins/operaton-history-clickhouse` — Operaton Plugin (Platzhalter): analoger Aufbau mit `org.operaton.bpm.*`-Klassen. Package: `com.camunda7mcp.history.operaton`.
>
> ClickHouse Schema nutzt `ReplacingMergeTree` mit Partitionierung nach Monat und `engine_type`-Spalte zur Unterscheidung der Quell-Engine.
>
> Docker Compose ist composable aufgebaut: `docker-compose.clickhouse.yml` + `docker-compose.camunda7.yml` / `docker-compose.cibseven.yml` / `docker-compose.operaton.yml`. Default `docker-compose.yml` = CIB Seven + ClickHouse + MCP Servers.
>
> **Umsetzungsreihenfolge**: CIB Seven zuerst (Phase 1–4), Operaton als Erweiterung (Phase 5).
