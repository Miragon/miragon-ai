# How to Use It

The platform is an MCP server. You use it by pointing an MCP-aware AI assistant
at it and asking questions in natural language. Skills wrap common workflows so
the assistant takes the right steps without you having to spell each one out.

## Connect your assistant

Add an HTTP MCP server pointing at `http://localhost:3010` (or wherever you've
deployed it). For Claude Desktop:

```json
{
  "mcpServers": {
    "miragon-ai": {
      "url": "http://localhost:3010"
    }
  }
}
```

Once connected, you'll see Camunda and analytics tools available in the
assistant. Try asking _"list all running incidents"_ — Claude calls
`camunda7_list_incidents` and renders the result in the incidents widget.

## What you can ask

| Topic          | Example questions                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| **Processes**  | "Show me all process definitions." · "Start a new instance of `loan-approval`."                        |
| **Tasks**      | "What tasks are assigned to me?" · "Complete task 12345 with `approved=true`."                         |
| **Incidents**  | "Triage the open incidents." · "Retry all failed jobs from this morning."                              |
| **Analytics**  | "Where do `loan-approval` instances spend the most time?" · "Find failed instances from the last 24h." |
| **Migrations** | "Plan a migration from v1 to v2 of `loan-approval`."                                                   |

Most data-heavy answers come back as an interactive widget — process lists,
task inboxes, incident dashboards, instance details, and analytics dashboards
all render inline.

Every action that mutates state — retries, resolves, modifications, deletions
— prompts for explicit confirmation before running.

## Tips

- Ask follow-ups. Once a widget is on screen, you can drill down by clicking,
  or ask for "the same thing but for the last 7 days."
- Combine tools. "Find failed instances from yesterday, then retry the
  transient ones" works as a single sentence.
- If a tool isn't doing what you expect, ask the assistant to show you the raw
  arguments — it'll print them and you can spot mismatches quickly.
