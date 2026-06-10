---
name: docs-style
description: Always-on style guide for the Miragon AI Platform documentation under `docs/`. Use whenever editing, reviewing, or planning anything in `docs/` (any `.md` file, `.vitepress/config.ts`, `package.json` of `@miragon-ai/docs`), whenever shipping a feature that changes user-visible behavior (env vars, modules, tools, deployment), and proactively whenever you suspect the docs site has drifted from the code. Encodes the four-section structure (Architecture / Developer / Operations / Usage), per-page line budgets, English-only rule, the VitePress + Mermaid stack, and the rule against duplicating the root `README.md`.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

# docs-style — keep the docs light, keep them current

The docs site under `docs/` was deliberately built lightweight. This skill is a
reminder of the rules and a nudge to refresh the docs whenever code changes
make them stale.

## Goal

A scannable overview, not an encyclopedia. Distill from source material (root
`README.md`, skill manifests, code) — never copy verbatim. The root `README.md`
stays comprehensive for GitHub viewers; the docs site stays light.

## Structure (4 sections, no extras)

| File                   | Audience   | Purpose                                               |
| ---------------------- | ---------- | ----------------------------------------------------- |
| `docs/index.md`        | Landing    | Hero + 4 feature cards pointing at the four sections  |
| `docs/architecture.md` | Anyone     | One-page mental model of modules and external systems |
| `docs/developer.md`    | Developers | Clone → install → run, plus the common `pnpm` tasks   |
| `docs/operations.md`   | DevOps     | Deployment artifact, env vars, observability, CI      |
| `docs/usage.md`        | End users  | How to connect Claude and what kinds of things to ask |

Don't invent a new top-level section. If new content doesn't fit one of these,
condense it until it does or push it to the root `README.md` / inline code
comments. If you genuinely need a fifth page, ask the user first.

## Line budgets (hard ceiling)

| Page              | Budget      |
| ----------------- | ----------- |
| `architecture.md` | ≤ 150 lines |
| `developer.md`    | ≤ 80 lines  |
| `operations.md`   | ≤ 120 lines |
| `usage.md`        | ≤ 150 lines |

When a page approaches the limit, condense — don't extend.

## Stack

- VitePress at `docs/`, configured via `docs/.vitepress/config.ts`.
- Mermaid via `vitepress-plugin-mermaid` — the config is wrapped in
  `withMermaid(...)`. Don't add competing diagram libraries.
- Local search via `themeConfig.search.provider: "local"`.
- Don't add another docs framework, theme, or plugin without a real reason.
- Build commands: `pnpm docs:dev`, `pnpm docs:build`, `pnpm docs:preview`.

## Style

- **English only.** No German.
- Prefer tables for structured data (env vars, modules, skills) — easier to
  scan than prose paragraphs.
- Link to source files (`Dockerfile`, `docker/docker-compose.yml`, root
  `README.md`, `.github/workflows/ci.yml`) instead of inlining their content.
- One Mermaid diagram on the architecture page. Don't add more diagrams unless
  they earn their place.
- No marketing fluff ("comprehensive guide", "powerful platform"). Tight,
  factual, present tense.
- Prettier formats markdown — run `pnpm exec prettier --write docs/` after
  significant edits.

## When to refresh the docs

Treat any of the following as a signal to re-read the matching page and update
it:

| Code change                                                  | Page to revisit   |
| ------------------------------------------------------------ | ----------------- |
| New / removed workspace package under `apps/` or `packages/` | `architecture.md` |
| Change to data flow, external system, or widget pipeline     | `architecture.md` |
| New / changed `pnpm` script affecting dev workflow           | `developer.md`    |
| Bumped Node / pnpm / Java version, new prerequisite          | `developer.md`    |
| New / changed environment variable                           | `operations.md`   |
| `Dockerfile` or `docker-compose.yml` change with op impact   | `operations.md`   |
| New CI job or deployment recipe                              | `operations.md`   |
| New or removed skill under `.claude/skills/`                 | `usage.md`        |
| New top-level capability exposed to MCP hosts                | `usage.md`        |

If you ship one of these without touching the docs, the docs are stale.

## Workflow when editing docs

1. Run `wc -l docs/*.md` first — know where you stand against the budgets.
2. Decide which existing page the change belongs in. Don't create a new page.
3. Distill from source material; don't copy and paste from the root
   `README.md`.
4. After editing, run `pnpm exec prettier --write docs/` and `pnpm docs:build`
   to verify the site still compiles.
5. Re-check `wc -l docs/*.md` — if you blew the budget, condense before
   committing.

## What stays out of the docs site

- Comprehensive tool reference (lives in the root `README.md`).
- Detailed CI internals (link to `.github/workflows/ci.yml`).
- Per-skill deep dives (skills self-document via their own `SKILL.md`).
- Screenshots (none today; don't add unless they materially help).
- German translations.
- Multi-page narratives. If a page wants to grow into multiple pages, the
  scope is wrong — push detail back into the codebase or root README.

## Reminder

If the user is shipping a feature and hasn't mentioned the docs, ask whether
the relevant page needs an update before the change lands. The docs only stay
useful if they stay current.
