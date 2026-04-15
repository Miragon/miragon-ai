# Tool-Referenz

## Engine Tools (37)

### Process Definitions

| Tool                         | Beschreibung                  | Parameter                                            |
| ---------------------------- | ----------------------------- | ---------------------------------------------------- |
| `list_process_definitions`   | Prozessdefinitionen auflisten | `key?`, `nameLike?`, `latestVersion?`, `maxResults?` |
| `get_process_definition_xml` | BPMN-XML einer Definition     | `processDefinitionId`                                |
| `start_process_instance`     | Prozessinstanz starten        | `processDefinitionKey`, `businessKey?`, `variables?` |

### Process Instances

| Tool                         | Beschreibung        | Parameter                                          |
| ---------------------------- | ------------------- | -------------------------------------------------- |
| `list_process_instances`     | Instanzen auflisten | `processDefinitionKey?`, `businessKey?`, `active?` |
| `get_process_instance`       | Instanz-Details     | `processInstanceId`                                |
| `get_activity_instance_tree` | Activity Tree       | `processInstanceId`                                |
| `delete_process_instance`    | Instanz löschen     | `processInstanceId`                                |
| `modify_process_instance`    | Token bewegen       | `processInstanceId`, `instructions[]`              |

### User Tasks

| Tool                | Beschreibung     | Parameter                                               |
| ------------------- | ---------------- | ------------------------------------------------------- |
| `list_tasks`        | Tasks auflisten  | `assignee?`, `candidateGroup?`, `processDefinitionKey?` |
| `get_task`          | Task-Details     | `taskId`                                                |
| `claim_task`        | Task claimen     | `taskId`, `userId`                                      |
| `unclaim_task`      | Task unclaimen   | `taskId`                                                |
| `complete_task`     | Task abschließen | `taskId`, `variables?`                                  |
| `set_task_assignee` | Assignee setzen  | `taskId`, `userId`                                      |

### Messages & Signals

| Tool                | Beschreibung        | Parameter                                         |
| ------------------- | ------------------- | ------------------------------------------------- |
| `correlate_message` | Message korrelieren | `messageName`, `businessKey?`, `correlationKeys?` |
| `throw_signal`      | Signal senden       | `name`, `variables?`                              |

### Variables

| Tool            | Beschreibung    | Parameter                                    |
| --------------- | --------------- | -------------------------------------------- |
| `get_variables` | Variablen lesen | `scope`, `id`                                |
| `set_variable`  | Variable setzen | `processInstanceId`, `variableName`, `value` |

### History

| Tool                                | Beschreibung           | Parameter                                             |
| ----------------------------------- | ---------------------- | ----------------------------------------------------- |
| `query_historic_process_instances`  | Historische Instanzen  | `processDefinitionKey?`, `finished?`, `startedAfter?` |
| `query_historic_activity_instances` | Historische Activities | `processInstanceId?`, `activityType?`                 |
| `query_historic_task_instances`     | Historische Tasks      | `processInstanceId?`, `taskAssignee?`                 |
| `query_historic_variable_instances` | Historische Variablen  | `processInstanceId?`, `variableName?`                 |

### Incidents & Jobs

| Tool               | Beschreibung        | Parameter                                |
| ------------------ | ------------------- | ---------------------------------------- |
| `list_incidents`   | Incidents auflisten | `processInstanceId?`, `incidentType?`    |
| `resolve_incident` | Incident resolven   | `incidentId`                             |
| `list_jobs`        | Jobs auflisten      | `processInstanceId?`, `withRetriesLeft?` |
| `set_job_retries`  | Job-Retries setzen  | `jobId`, `retries`                       |

### External Tasks

| Tool                           | Beschreibung              | Parameter                                                 |
| ------------------------------ | ------------------------- | --------------------------------------------------------- |
| `fetch_and_lock`               | External Tasks holen      | `workerId`, `maxTasks`, `topics[]`                        |
| `complete_external_task`       | External Task abschließen | `externalTaskId`, `workerId`, `variables?`                |
| `handle_external_task_failure` | Fehler melden             | `externalTaskId`, `workerId`, `errorMessage?`, `retries?` |

### Deployments

| Tool                | Beschreibung          | Parameter                       |
| ------------------- | --------------------- | ------------------------------- |
| `list_deployments`  | Deployments auflisten | `name?`, `source?`              |
| `create_deployment` | BPMN deployen         | `deploymentName`, `resources[]` |

---

## ClickHouse Search Tools (6)

Nur verfügbar wenn `CLICKHOUSE_ENABLED=true`.

| Tool                          | Beschreibung              | Parameter                                                                             |
| ----------------------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| `search_process_instances`    | Flexible Suche            | `processDefinitionKey?`, `state?`, `startedAfter?`, `withIncidents?`, `variableName?` |
| `analyze_process_performance` | KPI + Bottleneck-Analyse  | `processDefinitionKey`, `period`, `includeActivityBreakdown?`                         |
| `find_failed_instances`       | Fehler-Pattern-Analyse    | `processDefinitionKey?`, `period`, `groupByError?`                                    |
| `search_by_variable`          | Variable-basierte Suche   | `variableName`, `variableValue`                                                       |
| `trace_process_execution`     | OTEL + History kombiniert | `processInstanceId`, `includeOtelSpans?`                                              |
| `compare_execution_periods`   | Zeitraum-Vergleich        | `processDefinitionKey`, `periodA*`, `periodB*`                                        |
