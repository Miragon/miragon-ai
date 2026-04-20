# App Catalog

## Process List

**Tool**: `show-process-list`

Shows all deployed process definitions as cards with:

- Process key, name, version
- Status badge (Active / Suspended)
- Version tags
- Search filter

**Parameters**: `key?`, `nameLike?`, `latestVersion?`

---

## Task Dashboard

**Tool**: `show-task-dashboard`

Interactive table of open user tasks:

- Task name, assignee, process, priority, creation timestamp
- Colour-coded priority badges (high / medium / normal)
- Relative time display (TimeAgo)
- **Claim button** (for unassigned tasks)
- **Complete button** (for all tasks)

**Parameters**: `assignee?`, `candidateGroup?`, `processDefinitionKey?`, `maxResults?`

---

## Instance Detail

**Tool**: `show-instance-detail`

Detail view of a single process instance:

- Instance metadata (definition, business key, status)
- Recursive activity instance tree
- Variables table with type badges
- BPMN XML of the process definition

**Parameters**: `processInstanceId` (required)

---

## Analytics Dashboard

**Tool**: `show-analytics-dashboard`

KPI dashboard with aggregated metrics:

- StatCards: Completed, Running, Incidents, Avg Duration
- Duration formatting (ms → seconds / minutes / hours / days)
- Grouping by `processDefinitionKey`
- Average duration per process

**Parameters**: `processDefinitionKey?`, `startedAfter?`, `startedBefore?`

---

## History Timeline

**Tool**: `show-history-timeline`

Time-based view of every activity in a process instance:

- Colour-coded dots by activity type (11 BPMN types)
- Connected timeline with vertical lines
- Activity metadata: name, type, duration, assignee
- Canceled-flag indicator

**Parameters**: `processInstanceId` (required)

---

## Incident Panel

**Tool**: `show-incident-panel`

Failure monitoring with action buttons:

- Incident cards with red accent colour
- Type badge, timestamp, error message
- Activity and process reference
- **Retry button** (for `failedJob` incidents with a job ID)

**Parameters**: `processDefinitionId?`, `processInstanceId?`, `incidentType?`
