<!--
  Miragon AI Operations product page (route /product/operations). Run-time product,
  green accent, live today. Reuses the HeroConversation signature (the incident-widget
  demo) as the hero visual. Rendered on a layout:home page, so it inherits the forced-dark
  brand from theme/custom.css. Self-contained scoped section, matching the landing idiom.
-->
<script setup lang="ts">
import HeroConversation from "./HeroConversation.vue"

const INSPECTOR_URL =
  "https://inspector.manufact.com/inspector?server=https%3A%2F%2Fmiragon-ai-playground.fly.dev%2Fmcp&tab=chat"

const pillars = [
  {
    chip: "Operations",
    title: "The cockpit, by conversation",
    text: "List and inspect definitions and instances. Start, modify, suspend and migrate. Work user and external tasks, deployments and history — from the same conversation you asked the question in.",
  },
  {
    chip: "Analytics",
    title: "KPIs without a line of PromQL",
    text: "Prometheus-backed process performance, element bottlenecks, failed instances, and cluster / version / engine comparison. Ask where throughput is dropping and see it, no query language required.",
  },
  {
    chip: "Incidents",
    title: "Resolve incidents, retry jobs, in the chat",
    text: "Find failing instances, read the incident, resolve it, and retry failed jobs without leaving the conversation — with the BPMN token highlighted exactly where it broke.",
  },
  {
    chip: "Multi-engine",
    title: "Multi-engine, scoped, self-hosted",
    text: "Route CIB Seven, Operaton and Camunda 7 in one fleet, per call or per session. Ship read-only, operations or admin toolsets per deployment, as one multi-arch Docker image inside your own network.",
  },
]

const steps = [
  {
    title: "Point a client at it",
    text: "Connect any MCP-capable assistant — Claude, ChatGPT, Claude Code — to the Operations server sitting in front of your Camunda 7 / CIB Seven fleet.",
  },
  {
    title: "Ask in plain language",
    text: "Ask about definitions, instances, incidents or KPIs. Operations reads and acts on the right engine through multi-engine routing — nothing about your landscape has to change.",
  },
  {
    title: "Get a widget and a straight answer",
    text: "Every reply renders as an interactive widget for you and a compact summary for the model, so the conversation stays sharp.",
  },
]

const widgets = [
  "Cockpit-style engine-health dashboard",
  "Process and incident panels",
  "BPMN viewer with the current token highlighted",
  "Activity and bottleneck heatmaps",
  "Process history timeline",
  "Cluster, version and engine comparison",
]
</script>

<template>
  <div class="operations">
    <!-- Hero -->
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">Miragon AI Operations · Live today</span>
        <h1 class="hero-title">From cockpit<span class="grad"> to conversation</span>.</h1>
        <p class="hero-tagline">
          Your Camunda 7 / CIB Seven cockpit, tasklist, dashboard and monitoring tool collapse into
          one conversation. Ask in plain language; get back an interactive widget and a straight
          answer.
        </p>
        <div class="actions">
          <a class="btn primary" :href="INSPECTOR_URL" target="_blank" rel="noopener noreferrer">
            Open the live playground <span class="arrow" aria-hidden="true">→</span>
          </a>
          <a class="btn ghost" href="/usage">Read the docs</a>
        </div>
      </div>
      <div class="hero-visual"><HeroConversation /></div>
    </section>

    <!-- Problem -->
    <section class="problem block">
      <span class="label">The problem</span>
      <h2 class="block-title">Operating Camunda shouldn't mean tab-hunting.</h2>
      <p class="lead">
        Every question about a running engine turns into a hunt. Which cockpit tab shows suspended
        instances? What's the PromQL for element-level bottlenecks? Who's awake at 3am when a job
        queue backs up? The information is all there — it's just scattered across four tools and a
        query language. Operations replaces the hunt with a sentence.
      </p>
    </section>

    <!-- How it works -->
    <section class="block">
      <span class="label">How it works</span>
      <h2 class="block-title">An MCP server for your engine.</h2>
      <ol class="steps">
        <li v-for="(s, i) in steps" :key="s.title" class="step">
          <span class="num">{{ i + 1 }}</span>
          <div>
            <span class="step-title">{{ s.title }}</span>
            <p class="step-text">{{ s.text }}</p>
          </div>
        </li>
      </ol>
    </section>

    <!-- Pillars -->
    <section class="block">
      <span class="label">What you can do</span>
      <div class="pillars">
        <div v-for="p in pillars" :key="p.chip" class="pillar">
          <span class="chip">{{ p.chip }}</span>
          <h3 class="pillar-title">{{ p.title }}</h3>
          <p class="pillar-text">{{ p.text }}</p>
        </div>
      </div>
    </section>

    <!-- Widgets -->
    <section class="block">
      <span class="label">Answers that render</span>
      <h2 class="block-title">Not walls of text. Interactive widgets.</h2>
      <p class="lead">
        Answers render as MCP Apps right in the chat — read them at a glance, click into them for
        detail, while the assistant reasons over a lightweight summary of the same data.
      </p>
      <ul class="widget-list">
        <li v-for="w in widgets" :key="w">{{ w }}</li>
      </ul>
    </section>

    <!-- CTA band -->
    <section class="cta-wrap" aria-label="Try Operations">
      <div class="cta">
        <div class="grad-line" aria-hidden="true" />
        <div class="orb" aria-hidden="true" />
        <p class="cta-eyebrow"><span class="dot" />Start now</p>
        <h2 class="cta-title">Stop hunting. Start asking.</h2>
        <p class="cta-body">
          A live CIB Seven engine with seeded traffic is waiting in the playground — no install, no
          signup wall. Point your MCP client at it and ask your first question, then take the same
          server self-hosted.
        </p>
        <a class="btn primary big" :href="INSPECTOR_URL" target="_blank" rel="noopener noreferrer">
          Open the live playground <span class="arrow" aria-hidden="true">→</span>
        </a>
        <p class="cta-hint">
          No install · Camunda 7 / CIB Seven / Operaton · Self-hostable as one Docker image
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.operations {
  --accent: #00e676;
  --accent-2: #00b388;
  --accent-soft: rgba(0, 230, 118, 0.09);
  --accent-border: rgba(0, 230, 118, 0.28);
}

/* Shared eyebrow label */
.label,
.eyebrow {
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
.label::before,
.eyebrow::before {
  content: "";
  width: 20px;
  height: 1px;
  background: var(--accent);
}

/* Gradient accent word */
.grad {
  background: linear-gradient(135deg, #00e676 0%, #3d5af1 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition:
    opacity 0.2s,
    transform 0.2s,
    border-color 0.2s,
    background 0.2s;
}
.btn.primary {
  padding: 12px 24px;
  background: #00e676;
  color: #000;
}
.btn.primary:hover {
  opacity: 0.88;
  transform: translateY(-1px);
}
.btn.primary.big {
  padding: 13px 28px;
  font-size: 15px;
}
.btn.ghost {
  padding: 12px 22px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #f5f5f7;
}
.btn.ghost:hover {
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.05);
}
.arrow {
  transition: transform 0.2s;
}
.btn:hover .arrow {
  transform: translateX(3px);
}

/* Hero */
.hero {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: 48px;
  padding: 40px 0 8px;
}
@media (max-width: 900px) {
  .hero {
    grid-template-columns: 1fr;
    gap: 36px;
  }
}
.hero-title {
  margin: 0 0 20px;
  border: 0;
  padding: 0;
  font-size: clamp(34px, 5vw, 54px);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1.05;
  color: #f5f5f7;
}
.hero-tagline {
  margin: 0 0 28px;
  font-size: 17px;
  line-height: 1.65;
  color: #98989d;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

/* Content blocks */
.block {
  margin-top: 72px;
  padding-top: 48px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.block-title {
  margin: 0 0 20px;
  border: 0;
  padding: 0;
  font-size: clamp(24px, 3vw, 34px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: #f5f5f7;
}
.lead {
  max-width: 720px;
  margin: 0;
  font-size: 16px;
  line-height: 1.75;
  color: #98989d;
}

/* Steps */
.steps {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 28px;
}
@media (max-width: 800px) {
  .steps {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}
.step {
  display: flex;
  gap: 14px;
}
.num {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--accent-border);
  background: var(--accent-soft);
  color: var(--accent);
  font-family: "SF Mono", ui-monospace, "Menlo", monospace;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.step-title {
  display: block;
  margin-bottom: 6px;
  font-size: 15px;
  font-weight: 600;
  color: #f5f5f7;
}
.step-text {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: #98989d;
}

/* Pillars */
.pillars {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
@media (max-width: 760px) {
  .pillars {
    grid-template-columns: 1fr;
  }
}
.pillar {
  padding: 22px 22px 20px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 16px;
  background: #101011;
  transition:
    border-color 0.25s,
    background 0.25s;
}
.pillar:hover {
  border-color: var(--accent-border);
  background: #131314;
}
.chip {
  display: inline-flex;
  padding: 4px 12px;
  margin-bottom: 14px;
  border-radius: 999px;
  border: 1px solid var(--accent-border);
  background: var(--accent-soft);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent);
}
.pillar-title {
  margin: 0 0 8px;
  border: 0;
  padding: 0;
  font-size: 16.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #f5f5f7;
}
.pillar-text {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: #98989d;
}

/* Widget list */
.widget-list {
  list-style: none;
  margin: 24px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 32px;
}
@media (max-width: 640px) {
  .widget-list {
    grid-template-columns: 1fr;
  }
}
.widget-list li {
  position: relative;
  padding: 12px 0 12px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 14px;
  color: #c8c8cd;
}
.widget-list li::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 18px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px rgba(0, 230, 118, 0.5);
}

/* CTA band */
.cta-wrap {
  margin-top: 72px;
}
.cta {
  position: relative;
  overflow: hidden;
  max-width: 760px;
  margin: 0 auto;
  padding: 56px 40px;
  text-align: center;
  background: #141414;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 28px;
}
.grad-line {
  position: absolute;
  top: 0;
  left: 10%;
  right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, #00e676 30%, #3d5af1 70%, transparent);
}
.orb {
  position: absolute;
  top: -40%;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 300px;
  background: radial-gradient(ellipse, rgba(0, 230, 118, 0.08) 0%, transparent 65%);
  filter: blur(40px);
  pointer-events: none;
}
.cta-eyebrow {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #98989d;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #00e676;
  box-shadow: 0 0 8px rgba(0, 230, 118, 0.7);
  animation: op-pulse 2s ease-in-out infinite;
}
.cta-title {
  position: relative;
  margin: 0 0 16px;
  border: 0;
  padding: 0;
  font-size: clamp(26px, 4vw, 40px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: #f5f5f7;
}
.cta-body {
  position: relative;
  max-width: 500px;
  margin: 0 auto 30px;
  font-size: 16px;
  line-height: 1.7;
  color: #98989d;
}
.cta-hint {
  position: relative;
  margin: 22px 0 0;
  font-size: 12.5px;
  color: #6e6e73;
}

@keyframes op-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
@media (prefers-reduced-motion: reduce) {
  .btn:hover {
    transform: none;
  }
  .dot {
    animation: none;
  }
}
</style>
