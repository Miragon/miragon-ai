# App-Katalog

## Process List

**Tool**: `show-process-list`

Zeigt alle deployed Prozessdefinitionen als Karten mit:
- Prozess-Key, Name, Version
- Status-Badge (Active/Suspended)
- Version-Tags
- Suchfilter

**Parameter**: `key?`, `nameLike?`, `latestVersion?`

---

## Task Dashboard

**Tool**: `show-task-dashboard`

Interaktive Tabelle offener User Tasks:
- Task-Name, Assignee, Prozess, Priorität, Erstellzeitpunkt
- Farbcodierte Priority-Badges (high/medium/normal)
- Relative Zeitanzeige (TimeAgo)
- **Claim-Button** (für unassigned Tasks)
- **Complete-Button** (für alle Tasks)

**Parameter**: `assignee?`, `candidateGroup?`, `processDefinitionKey?`, `maxResults?`

---

## Instance Detail

**Tool**: `show-instance-detail`

Detailansicht einer einzelnen Prozessinstanz:
- Instanz-Metadaten (Definition, Business Key, Status)
- Rekursiver Activity Instance Tree
- Variablen-Tabelle mit Typ-Badges
- BPMN-XML der Prozessdefinition

**Parameter**: `processInstanceId` (required)

---

## Analytics Dashboard

**Tool**: `show-analytics-dashboard`

KPI-Dashboard mit aggregierten Metriken:
- StatCards: Completed, Running, Incidents, Avg Duration
- Dauer-Formatierung (ms → Sekunden/Minuten/Stunden/Tage)
- Gruppierung nach `processDefinitionKey`
- Durchschnittsdauer pro Prozess

**Parameter**: `processDefinitionKey?`, `startedAfter?`, `startedBefore?`

---

## History Timeline

**Tool**: `show-history-timeline`

Zeitliche Darstellung aller Activities einer Prozessinstanz:
- Farbcodierte Punkte nach Activity-Typ (11 BPMN-Typen)
- Verbundene Timeline mit vertikalen Linien
- Activity-Metadaten: Name, Typ, Dauer, Assignee
- Canceled-Flag-Indikator

**Parameter**: `processInstanceId` (required)

---

## Incident Panel

**Tool**: `show-incident-panel`

Fehler-Monitoring mit Aktionsmöglichkeiten:
- Incident-Karten mit roter Akzentfarbe
- Typ-Badge, Timestamp, Error-Message
- Activity- und Prozessreferenz
- **Retry-Button** (bei `failedJob`-Incidents mit Job-ID)

**Parameter**: `processDefinitionId?`, `processInstanceId?`, `incidentType?`
