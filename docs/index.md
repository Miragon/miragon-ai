---
layout: home

hero:
  name: Design it together.
  text: Run it by conversation.
  tagline: "One AI-native platform for Camunda 7 and CIB Seven, spanning the whole process lifecycle. Model as a team on a single live source, then operate the running engine in plain language — no cockpit tab-hunting, no hand-written PromQL."
  actions:
    - theme: brand
      text: Try the live playground
      link: "https://inspector.manufact.com/inspector?server=https%3A%2F%2Fmiragon-ai-playground.fly.dev%2Fmcp&tab=chat"
      target: _blank
    - theme: alt
      text: See Miragon AI Design
      link: /product/design
    - theme: alt
      text: GitHub
      link: https://github.com/Miragon/miragon-ai
---

<ProductLineup />

<CockpitToConversation />

## Connect your Claude in 30 seconds {#connect-your-claude}

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

<TryItOut />

<DocsDirectory />

<BrandContact />
