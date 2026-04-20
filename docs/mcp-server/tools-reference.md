# Tool Reference

## Engine Tools (37)

### Process Definitions

| Tool                         | Description              | Parameters                                           |
| ---------------------------- | ------------------------ | ---------------------------------------------------- |
| `list_process_definitions`   | List process definitions | `key?`, `nameLike?`, `latestVersion?`, `maxResults?` |
| `get_process_definition_xml` | BPMN XML of a definition | `processDefinitionId`                                |
| `start_process_instance`     | Start a process instance | `processDefinitionKey`, `businessKey?`, `variables?` |

### Process Instances

| Tool                         | Description        | Parameters                                         |
| ---------------------------- | ------------------ | -------------------------------------------------- |
| `list_process_instances`     | List instances     | `processDefinitionKey?`, `businessKey?`, `active?` |
| `get_process_instance`       | Instance details   | `processInstanceId`                                |
| `get_activity_instance_tree` | Activity tree      | `processInstanceId`                                |
| `delete_process_instance`    | Delete an instance | `processInstanceId`                                |
| `modify_process_instance`    | Move tokens        | `processInstanceId`, `instructions[]`              |

### User Tasks

| Tool                | Description     | Parameters                                              |
| ------------------- | --------------- | ------------------------------------------------------- |
| `list_tasks`        | List tasks      | `assignee?`, `candidateGroup?`, `processDefinitionKey?` |
| `get_task`          | Task details    | `taskId`                                                |
| `claim_task`        | Claim a task    | `taskId`, `userId`                                      |
| `unclaim_task`      | Unclaim a task  | `taskId`                                                |
| `complete_task`     | Complete a task | `taskId`, `variables?`                                  |
| `set_task_assignee` | Set assignee    | `taskId`, `userId`                                      |

### Messages & Signals

| Tool                | Description       | Parameters                                        |
| ------------------- | ----------------- | ------------------------------------------------- |
| `correlate_message` | Correlate message | `messageName`, `businessKey?`, `correlationKeys?` |
| `throw_signal`      | Throw a signal    | `name`, `variables?`                              |

### Variables

| Tool            | Description    | Parameters                                   |
| --------------- | -------------- | -------------------------------------------- |
| `get_variables` | Read variables | `scope`, `id`                                |
| `set_variable`  | Set a variable | `processInstanceId`, `variableName`, `value` |

### History

| Tool                                | Description         | Parameters                                            |
| ----------------------------------- | ------------------- | ----------------------------------------------------- |
| `query_historic_process_instances`  | Historic instances  | `processDefinitionKey?`, `finished?`, `startedAfter?` |
| `query_historic_activity_instances` | Historic activities | `processInstanceId?`, `activityType?`                 |
| `query_historic_task_instances`     | Historic tasks      | `processInstanceId?`, `taskAssignee?`                 |
| `query_historic_variable_instances` | Historic variables  | `processInstanceId?`, `variableName?`                 |

### Incidents & Jobs

| Tool               | Description      | Parameters                               |
| ------------------ | ---------------- | ---------------------------------------- |
| `list_incidents`   | List incidents   | `processInstanceId?`, `incidentType?`    |
| `resolve_incident` | Resolve incident | `incidentId`                             |
| `list_jobs`        | List jobs        | `processInstanceId?`, `withRetriesLeft?` |
| `set_job_retries`  | Set job retries  | `jobId`, `retries`                       |

### External Tasks

| Tool                           | Description            | Parameters                                                |
| ------------------------------ | ---------------------- | --------------------------------------------------------- |
| `fetch_and_lock`               | Fetch external tasks   | `workerId`, `maxTasks`, `topics[]`                        |
| `complete_external_task`       | Complete external task | `externalTaskId`, `workerId`, `variables?`                |
| `handle_external_task_failure` | Report failure         | `externalTaskId`, `workerId`, `errorMessage?`, `retries?` |

### Deployments

| Tool                | Description        | Parameters                      |
| ------------------- | ------------------ | ------------------------------- |
| `list_deployments`  | List deployments   | `name?`, `source?`              |
| `get_deployment`    | Deployment details | `deploymentId`                  |
| `create_deployment` | Deploy a BPMN      | `deploymentName`, `resources[]` |

---

## ClickHouse Search Tools (6)

Only available when `CLICKHOUSE_ENABLED=true`.

| Tool                          | Description               | Parameters                                                                            |
| ----------------------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| `search_process_instances`    | Flexible search           | `processDefinitionKey?`, `state?`, `startedAfter?`, `withIncidents?`, `variableName?` |
| `analyze_process_performance` | KPI + bottleneck analysis | `processDefinitionKey`, `period`, `includeActivityBreakdown?`                         |
| `find_failed_instances`       | Failure pattern analysis  | `processDefinitionKey?`, `period`, `groupByError?`                                    |
| `search_by_variable`          | Variable-based search     | `variableName`, `variableValue`                                                       |
| `trace_process_execution`     | OTEL + history combined   | `processInstanceId`, `includeOtelSpans?`                                              |
| `compare_execution_periods`   | Time-window comparison    | `processDefinitionKey`, `periodA*`, `periodB*`                                        |

---

## Analytics Aggregation Tools

Available when `CLICKHOUSE_ENABLED=true`. These power the dev skills and
enforce `minBucketSize` (default 10) — buckets below the threshold come back
as `suppressed: true` instead of leaking individual instances.

| Tool                    | Description                                                                 |
| ----------------------- | --------------------------------------------------------------------------- |
| `path_frequency`        | Top execution paths through a process, with relative frequencies.           |
| `element_bottleneck`    | Slowest activities by p95/avg duration over a time window.                  |
| `variable_distribution` | Bucketized distribution of a single variable (numeric, string, or boolean). |
| `cluster_compare`       | Pre/post comparison around a deployment timestamp (incident rate, p95, …).  |

---

## enrichment-mcp

Opt-in. Activated by setting `ENRICHMENT_CONFIG_PATH` to an absolute YAML
path. The module then registers one MCP tool per declared `lookups` entry
plus the meta-tool `enrichment_auto_resolve`.

### Built-in tools

| Tool                      | Description                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `enrichment_auto_resolve` | Given a variable map (and optional context), runs every matching `enrichment_rules` entry and returns the projected lookup results. Used by all dev skills for segment naming. |

### YAML schema

```yaml
sources:
  <sourceId>:
    baseUrl: https://api.example.com/v1 # REST root
    auth:
      mode: none | bearer | header | oauth2
      # mode-specific fields (token, headerName, clientId, ...)

lookups:
  <lookupId>:
    source: <sourceId> # references sources above
    description: human-readable
    method: GET | POST | PUT | PATCH | DELETE
    path: /customers/{customerId} # path params resolved from inputSchema
    inputSchema:
      <param>:
        type: string | number | boolean
        description: shown to the LLM
    projection: # optional whitelist of response fields
      - id
      - segment
    annotations:
      readOnlyHint: true # MCP tool annotation hints

enrichment_rules:
  - whenVariable: <varName> # rule fires if this variable is present
    resolve:
      - lookup: <lookupId>
        with:
          <param>: $value # $value = current variable value
```

### Demos

The repo ships two ready-to-run YAMLs under `server/resources/enrichment-examples/`.
Both target the WireMock sidecar (`docker compose up -d wiremock`, port 8088),
so no external credentials are needed:

| YAML                      | Sources                          | Stub coverage                                                                                                                        |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `loanApproval-local.yaml` | `crm`, `billing`                 | `customerSegment` (PRIVATE/BUSINESS/ENTERPRISE), `currency` (EUR/USD/GBP), `channel` (ONLINE/FAX) — pairs 1:1 with the cibseven seed |
| `acme-local.yaml`         | `salesforce`, `erp`, `contracts` | `CUST-001` (ENTERPRISE/platinum), `CUST-002` (BUSINESS/premium); other ids return 404 to demo the `skipped` path                     |

The non-`-local` variant (`acme.yaml`) is preserved as a shape reference for
real tenant configs and demonstrates `bearer` / `header` auth.
