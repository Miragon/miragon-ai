# MCP Apps

The MCP Apps are interactive UI components built on the [sunpeak](https://sunpeak.dev)
MCP App framework. They render cockpit-style features directly inside
MCP-compatible hosts.

## Tech stack

| Aspect        | Technology                         |
| ------------- | ---------------------------------- |
| Framework     | sunpeak 0.16                       |
| UI            | React 19 + Tailwind CSS            |
| State         | `useToolData` (sunpeak hook)       |
| Interaction   | `useCallServerTool` (sunpeak hook) |
| Engine access | `@camunda7-mcp/engine-adapter`     |

## Apps

| App                 | Purpose                            | Interactive |
| ------------------- | ---------------------------------- | ----------- |
| Process List        | Deployed process definitions       | No          |
| Task Dashboard      | Open tasks with claim/complete     | Yes         |
| Instance Detail     | Activity tree + variables + BPMN   | No          |
| Analytics Dashboard | KPIs, throughput, duration metrics | No          |
| History Timeline    | Colour-coded activity timeline     | No          |
| Incident Panel      | Failure monitoring with retry      | Yes         |

## Action tools

In addition to the 6 display apps, three action tools enable user interactions:

| Tool                   | Description                             |
| ---------------------- | --------------------------------------- |
| `claim-task-action`    | Claim a task for a user                 |
| `complete-task-action` | Complete a task with optional variables |
| `retry-job-action`     | Retry a failed job                      |

Detailed app catalog: [app-catalog.md](app-catalog.md)

Connection & setup: [connection.md](connection.md)
