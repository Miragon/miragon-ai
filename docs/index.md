---
layout: home

hero:
  name: Miragon AI Platform
  text: Your processes, one conversation away.
  tagline: "One MCP server, two modules, a fleet of widgets: drive Camunda 7 and CIB Seven from any MCP host — operations, analytics, and incident response in natural language."
  actions:
    - theme: brand
      text: Start in 30 seconds
      link: "#start-in-30-seconds"
    - theme: alt
      text: Playground
      link: https://miragon-ai-playground.fly.dev/mcp
    - theme: alt
      text: GitHub
      link: https://github.com/Miragon/miragon-ai

features:
  - title: For End Users
    details: Connect Claude, ask questions about your processes, fix incidents.
    link: /usage
    linkText: Start using it
  - title: For Developers
    details: Clone, install, and run the full stack locally in a few minutes.
    link: /developer
    linkText: Set up your machine
  - title: Architecture
    details: A one-page mental model of the server, modules, and external systems.
    link: /architecture
    linkText: See the diagram
  - title: Operations
    details: Deployment artifact, environment variables, and observability.
    link: /operations
    linkText: Run it in production
---

## Start in 30 seconds {#start-in-30-seconds}

The hosted [playground](https://miragon-ai-playground.fly.dev/mcp) runs a seeded
CIB Seven engine with live traffic and the full analytics stack — nothing to
install. Point any MCP client at it:

```
https://miragon-ai-playground.fly.dev/mcp
```

::: code-group

```sh [Claude Code]
claude mcp add --transport http miragon-ai https://miragon-ai-playground.fly.dev/mcp
```

```txt [claude.ai]
Settings → Connectors → Add custom connector
URL: https://miragon-ai-playground.fly.dev/mcp
```

:::

Then ask: _"Which processes have open incidents right now?"_ — and drill into
the interactive widgets. Ready for your own stack? Head to
[For Developers](/developer).

<CockpitToConversation />

<BrandContact />
