# Running the Skills in the Stack

> How to invoke the dev skills from Claude Code — from prerequisites to the
> concrete prompt.

## 1. Prerequisites

The dev skills consume three MCP servers. All three need to be reachable for
the skills to run end-to-end. If one is missing, the skills degrade (see each
skill's docs).

| Server           | Purpose                                                                            | Required for                                                            |
| ---------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `camunda7-mcp`   | BPMN XML, deployment metadata                                                      | UC1, UC5                                                                |
| `analytics-mcp`  | `path.frequency`, `element.bottleneck`, `variable.distribution`, `cluster.compare` | UC1, UC2, UC4, UC5, UC6                                                 |
| `enrichment-mcp` | `auto_resolve` for segment naming                                                  | optional — every skill works without it, but reports omit segment names |

Base setup of the MCP servers: see [Quickstart](../getting-started/quickstart.md).
ClickHouse analytics must be active (`CLICKHOUSE_ENABLED=true`) for
`analytics-mcp` to expose the aggregation tools.

## 2. Install the skills

The five skills live under `.claude/skills/<name>/SKILL.md` in the repo. Claude
Code picks them up automatically once the repo is opened as a workspace —
`.claude/skills/` is the default source.

```
.claude/skills/
├── dev-process-explain/SKILL.md
├── dev-change-impact/SKILL.md
├── dev-test-scenarios-from-production/SKILL.md
├── dev-fix-verification/SKILL.md
└── dev-code-archaeology/SKILL.md
```

For global availability (across other repos), copy the skill folders into
`~/.claude/skills/`.

## 3. Connect the MCP servers in Claude Code

Minimal `~/.claude/mcp.json` for all five skills:

```jsonc
{
  "mcpServers": {
    "camunda7": {
      "command": "node",
      "args": ["<path>/packages/camunda7-mcp-server/dist/index.js"],
      "env": {
        "ENGINE_TYPE": "cibseven",
        "ENGINE_BASE_URL": "http://localhost:8080/engine-rest",
        "ENGINE_AUTH_TYPE": "basic",
        "ENGINE_USERNAME": "demo",
        "ENGINE_PASSWORD": "demo",
        "CLICKHOUSE_ENABLED": "true",
        "CLICKHOUSE_URL": "http://localhost:8123",
        "CLICKHOUSE_USER": "camunda",
        "CLICKHOUSE_PASSWORD": "camunda123",
        "CLICKHOUSE_DATABASE": "camunda_history",
      },
    },
    "analytics": {
      "command": "node",
      "args": ["<path>/modules/analytics/mcp/dist/index.js"],
      "env": {
        "CLICKHOUSE_URL": "http://localhost:8123",
        "CLICKHOUSE_USER": "camunda",
        "CLICKHOUSE_PASSWORD": "camunda123",
        "CLICKHOUSE_DATABASE": "camunda_history",
      },
    },
    "enrichment": {
      "command": "node",
      "args": ["<path>/modules/enrichment/mcp/dist/index.js"],
      "env": {
        "ENRICHMENT_CONFIG_PATH": "<path>/server/resources/enrichment-examples/loanApproval-local.yaml",
      },
    },
  },
}
```

After saving: restart Claude Code or `Reload MCP servers`. `claude mcp list`
shows whether the servers are registered.

### Enrichment locally with WireMock

The bundled `*-local.yaml` configs target the WireMock instance from the
`docker/` stack (host port `8088`) instead of real backends. That makes
`enrichment_auto_resolve` runnable out of the box, without provisioning
Salesforce / ERP credentials.

```
cd docker && docker compose up -d wiremock
export ENRICHMENT_CONFIG_PATH=$(pwd)/../server/resources/enrichment-examples/loanApproval-local.yaml
pnpm --filter @miragon-ai/server dev
```

Stub coverage (see `docker/wiremock/mappings/`):

| YAML                      | Sources                          | Coverage                                                                                                                             |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `loanApproval-local.yaml` | `crm`, `billing`                 | `customerSegment` (PRIVATE/BUSINESS/ENTERPRISE), `currency` (EUR/USD/GBP), `channel` (ONLINE/FAX) — pairs 1:1 with the cibseven seed |
| `acme-local.yaml`         | `salesforce`, `erp`, `contracts` | `CUST-001` (ENTERPRISE/platinum), `CUST-002` (BUSINESS/premium); other ids return 404 to demo the `skipped` path                     |

The non-`-local` variant (`acme.yaml`) is preserved as a shape reference with
`bearer` / `header` auth examples — for real tenant configs.

## 4. Invoke a skill

Each skill is triggered via `/<skill-name> <arguments>`. The
`argument-hint` frontmatter line in the skill file shows the expected argument
syntax.

### Pick a seed profile

The cibseven-example ships three seed profiles — pick the one that matches
what you're doing:

```bash
# Backward-compatible: loanApproval only, 200 instances (default).
./gradlew :examples:cibseven-example:bootRun

# Fast iteration: both processes, ~80 instances total.
./gradlew :examples:cibseven-example:bootRun \
  -Dspring-boot.run.profiles=seed-minimal

# Full presentation mode: both processes, ~600 instances, two bug eras,
# dead path, rare priority-handoff, APAC regression / rollback cutoffs.
./gradlew :examples:cibseven-example:bootRun \
  -Dspring-boot.run.profiles=seed-presentation
```

The examples below target both `loanApproval` and `orderFulfillment` in
`cibseven-example` — runnable as soon as `docker compose up -d` is up and the
app booted with a seed profile.

### UC1 — Explain a process

```
/dev-process-explain loanApproval 30d
```

Or the richer process (available under `seed-minimal` / `seed-presentation`):

```
/dev-process-explain orderFulfillment 30d
```

No period → defaults to `30d`. If the key is missing, the skill asks once.

### UC2 — Project a change

```
/dev-change-impact plugins/examples/cibseven-example/src/main/kotlin/com/camunda7mcp/example/cibseven/delegates/NotifyApplicantDelegate.kt:28
```

Or a free-form description:

```
/dev-change-impact "lift amount threshold for automatic approval from 25000 to 50000"
```

### UC4 — Generate tests from production

```
/dev-test-scenarios-from-production loanApproval 30d bpm-assert
```

Or against the richer order process with explicit JUnit output:

```
/dev-test-scenarios-from-production orderFulfillment 30d junit
```

Framework optional (`junit` or `bpm-assert`, defaults to `bpm-assert`).

### UC5 — Verify a fix

```
/dev-fix-verification <deploymentId> loanApproval Task_notifyApplicant 7
```

`deploymentId` comes from `camunda7_list_deployments` — in the seed that's the
deployment id of `loanApproval.bpmn`. The timeline is simulated via the seed
timestamp; the "fix" is conceptually the cutoff between the buggy era and now
(see [README](README.md) → Deployment-Era).

### UC6 — Code archaeology

```
/dev-code-archaeology plugins/examples/cibseven-example/src/main/kotlin/com/camunda7mcp/example/cibseven/delegates/NotifyApplicantDelegate.kt:20
```

Or paraphrase the rare FAX condition:

```
/dev-code-archaeology "instances where channel == 'FAX'"
```

## 5. Debugging

**Skill reports "Tool not available":** one of the three MCP servers is
missing or doesn't export the tool. `claude mcp tools` lists what's currently
attached.

**`suppressed: true` in every report:** the chosen window contains fewer than
`minBucketSize` instances. Widen the window (`90d`) or drop
`processDefinitionKey` to aggregate across all processes.

**Empty enrichment lookups:** `ENRICHMENT_CONFIG_PATH` points at no valid
YAML file, or the variable names don't match any `lookup` definition. See the
[enrichment YAML reference](../mcp-server/tools-reference.md#enrichment-mcp)
for the schema.

**Delegate not found (UC1, UC2, UC6):** the skill expects the Java code in
the current workspace. If the code lives in a separate repo, extend the
workspace or drive the skill manually with `Read` / `Grep`.

## 6. Persisting skill output

By default, reports are **not** written to disk. That's by design — they
should stay alive in the chat so they can be iterated on. To file the report
in a ticket / PR, save it explicitly in a follow-up turn:

```
Save this as docs/process-analysis/loanApproval-2026-04.md
```

Or copy the result to the clipboard and paste it into Jira / GitHub.
