<!--
  Landing headline section: Miragon AI is one platform with two products across the
  Camunda process lifecycle — Design (design-time, indigo, in development) and
  Operations (run-time, green, live today). Each card links to its product page.
  Design sits first so the row reads left→right as the lifecycle: design → operate.
-->
<template>
  <section class="lineup" aria-label="Products">
    <span class="label">Two products, one lifecycle</span>
    <div class="head">
      <h2 class="title">Design the process. Operate the engine.</h2>
      <p class="intro">
        One platform for both halves of the Camunda lifecycle — model collaboratively, then operate
        the live engine in plain language. From the first model to the 3am incident.
      </p>
    </div>

    <div class="grid">
      <!-- Design — design-time, indigo, in development -->
      <a class="card design" href="/product/design">
        <div class="grad-line" aria-hidden="true" />
        <div class="card-top">
          <span class="kicker">In development</span>
          <span class="stage">Design-time</span>
        </div>
        <h3 class="name">Miragon AI Design</h3>
        <p class="tagline">
          Model your Camunda processes together on one always-live source — no check-out, no
          branches, no merge hell.
        </p>
        <ul class="bullets">
          <li>
            One live version everyone connects to — nothing is checked out, everyone sees the latest
            state
          </li>
          <li>
            Model from the web (bpmn-js canvas + Monaco docs) or from VS Code — the same live
            document
          </li>
          <li>
            Real-time presence: per-file avatars, remote cursors, soft “someone's editing this task”
            locks
          </li>
          <li>
            A release becomes a GitHub Pull Request — CODEOWNERS and branch protection decide what
            ships
          </li>
        </ul>
        <span class="go">See the vision <span class="arrow" aria-hidden="true">→</span></span>
      </a>

      <!-- Lifecycle connector: design → operate -->
      <div class="connector" aria-hidden="true">
        <span class="c-dot d" />
        <span class="c-rail" />
        <span class="c-dot o" />
      </div>

      <!-- Operations — run-time, green, live today -->
      <a class="card ops" href="/product/operations">
        <div class="grad-line" aria-hidden="true" />
        <div class="card-top">
          <span class="kicker live"><span class="dot" />Live today</span>
          <span class="stage">Run-time</span>
        </div>
        <h3 class="name">Miragon AI Operations</h3>
        <p class="tagline">
          Drive your running Camunda 7 / CIB Seven fleet in plain language — every answer an
          interactive widget in the chat.
        </p>
        <ul class="bullets">
          <li>An MCP server any AI assistant can drive — Claude, ChatGPT, Claude Code</li>
          <li>
            Inspect, start, suspend and migrate definitions and instances — work user &amp; external
            tasks, resolve incidents and retry failed jobs
          </li>
          <li>
            Prometheus-backed analytics: bottlenecks, failed instances, engine health, version
            comparison
          </li>
          <li>
            Multi-engine routing, toolset scoping, one self-hostable Docker image — plus a live
            playground
          </li>
        </ul>
        <span class="go">Explore Operations <span class="arrow" aria-hidden="true">→</span></span>
      </a>
    </div>
  </section>
</template>

<style scoped>
.lineup {
  margin-top: 72px;
  padding-top: 48px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #98989d;
  margin-bottom: 20px;
}
.label::before {
  content: "";
  width: 20px;
  height: 1px;
  background: linear-gradient(90deg, #00e676, #3d5af1);
}

.head {
  max-width: 640px;
  margin-bottom: 40px;
}
.title {
  font-size: clamp(28px, 3.5vw, 44px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin: 0 0 16px;
  color: #f5f5f7;
  border: none;
}
.intro {
  font-size: 16px;
  line-height: 1.7;
  color: #98989d;
  margin: 0;
}

.grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: stretch;
  gap: 20px;
}
@media (max-width: 860px) {
  .grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}

.card {
  --accent: #00e676;
  --accent-soft: rgba(0, 230, 118, 0.09);
  --accent-border: rgba(0, 230, 118, 0.28);
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 26px 26px 24px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  background: #101011;
  text-decoration: none;
  transition:
    border-color 0.25s,
    transform 0.25s,
    background 0.25s;
}
.card.design {
  --accent: #7b93ff;
  --accent-soft: rgba(61, 90, 241, 0.1);
  --accent-border: rgba(123, 147, 255, 0.4);
}
.card:hover {
  transform: translateY(-3px);
  border-color: var(--accent-border);
  background: #131314;
}

.grad-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
}
.card.ops .grad-line {
  background: linear-gradient(90deg, transparent, #00e676 30%, #00b388 70%, transparent);
}
.card.design .grad-line {
  background: linear-gradient(90deg, transparent, #3d5af1 30%, #7b93ff 70%, transparent);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.kicker {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--accent-border);
  background: var(--accent-soft);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent);
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #00e676;
  box-shadow: 0 0 8px rgba(0, 230, 118, 0.7);
  animation: pl-pulse 2s ease-in-out infinite;
}
.stage {
  font-family: "SF Mono", ui-monospace, "Menlo", monospace;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #6e6e73;
}

.name {
  margin: 0 0 10px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #f5f5f7;
}
.tagline {
  margin: 0 0 18px;
  font-size: 14.5px;
  line-height: 1.6;
  color: #c8c8cd;
}

.bullets {
  margin: 0 0 22px;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bullets li {
  position: relative;
  padding-left: 22px;
  font-size: 13.5px;
  line-height: 1.55;
  color: #98989d;
}
.bullets li::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

.go {
  margin-top: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
}
.arrow {
  transition: transform 0.2s;
}
.card:hover .arrow {
  transform: translateX(4px);
}

/* Lifecycle connector between the two cards (design → operate) */
.connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 2px;
}
.c-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.c-dot.d {
  background: #7b93ff;
  box-shadow: 0 0 8px rgba(123, 147, 255, 0.6);
}
.c-dot.o {
  background: #00e676;
  box-shadow: 0 0 8px rgba(0, 230, 118, 0.6);
}
.c-rail {
  width: 1px;
  flex: 1;
  min-height: 60px;
  background: linear-gradient(180deg, #3d5af1, #00e676);
}
@media (max-width: 860px) {
  .connector {
    flex-direction: row;
    padding: 2px 0;
  }
  .c-rail {
    width: 60px;
    min-height: 0;
    height: 1px;
    flex: none;
    background: linear-gradient(90deg, #3d5af1, #00e676);
  }
}

@keyframes pl-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
@media (prefers-reduced-motion: reduce) {
  .card {
    transition: border-color 0.25s;
  }
  .card:hover {
    transform: none;
  }
  .dot {
    animation: none;
  }
}
</style>
