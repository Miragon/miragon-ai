# How to Use It

The platform is an MCP server. You use it by pointing an MCP-aware AI assistant
at it and asking questions in natural language. Skills wrap common workflows so
the assistant takes the right steps without you having to spell each one out.

## Connect your assistant

Point the assistant at your deployment's `/mcp` endpoint — or at the hosted
[playground](https://miragon-ai-playground.fly.dev/mcp) to try it without any
setup.

| Host               | How to connect                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| claude.ai          | Settings → Connectors → **Add custom connector**, URL `https://miragon-ai-playground.fly.dev/mcp` (needs a public HTTPS endpoint) |
| Claude Code        | `claude mcp add --transport http miragon-ai https://miragon-ai-playground.fly.dev/mcp`                                            |
| Claude Desktop     | stdio only — bridge the HTTP endpoint with `mcp-remote` (below)                                                                   |
| Any other MCP host | add it as a streamable-HTTP server                                                                                                |

Claude Desktop validates `claude_desktop_config.json` against the stdio shape,
so a bare `"url"` entry is dropped silently. Open Settings → Developer → Edit
Config, add the bridge, and restart the app:

```json
{
  "mcpServers": {
    "miragon-ai": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://miragon-ai-playground.fly.dev/mcp",
        "--transport",
        "http-only"
      ]
    }
  }
}
```

For a server on your own machine, use `http://127.0.0.1:8400/mcp` there —
`127.0.0.1` rather than `localhost`, which Node may resolve to IPv6 while the
server listens on IPv4.

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

## Your settings

Ask _"open the cockpit"_ and click ⚙ **Settings** for the full page — one
section per active module, so an assistant with only some modules connected
shows only those sections.

| Setting             | Section   | Effect                                                                 |
| ------------------- | --------- | ---------------------------------------------------------------------- |
| Language            | Profile   | UI language, and the language tool summaries come back in              |
| Theme               | Profile   | Light, dark, or follow the OS                                          |
| Engine availability | Profile   | Which engines appear in pickers, and which one is the default          |
| Pinned dashboards   | Profile   | Which saved dashboards come first in pickers                           |
| Look-back period    | Analytics | Applied whenever you ask an analytics question without naming a window |
| Comparison bucket   | Analytics | How many instances a window needs before a comparison is trusted       |

You can also open a single section — _"open my profile settings"_ or _"show my
analytics settings"_ — or change a value in passing, without any page:
_"switch the UI to German"_, _"default my analytics to 30 days"_. Only the
setting you name changes; the rest keeps its value.

Where settings are stored depends on the deployment: signed in, they follow your
user account across sessions; without a login they belong to the current MCP
session and expire after a period of inactivity. A read-only deployment shows
the settings but hides Save.

## Tips

- Ask follow-ups. Once a widget is on screen, you can drill down by clicking,
  or ask for "the same thing but for the last 7 days."
- Combine tools. "Find failed instances from yesterday, then retry the
  transient ones" works as a single sentence.
- If a tool isn't doing what you expect, ask the assistant to show you the raw
  arguments — it'll print them and you can spot mismatches quickly.
