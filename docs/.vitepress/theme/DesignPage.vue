<!--
  Miragon AI Design product page (route /product/design). Design-time product, indigo
  accent, IN DEVELOPMENT — framing stays honest (no GA claims; CTA is a conversation, not
  a demo login). Uses the CollabCanvas signature (live co-modeling) as the hero visual.
  Rendered on a layout:home page, so it inherits the forced-dark brand.
-->
<script setup lang="ts">
import CollabCanvas from "./CollabCanvas.vue"

const pillars = [
  {
    chip: "Live collaboration",
    title: "One live source, everyone on it",
    text: "An always-on Live Host holds the single working state. Model from the bpmn-js web canvas with Monaco for YAML and Markdown docs, or from VS Code via the Miragon BPMN Modeler — the same live document, synced in real time, with avatars, remote cursors and soft element locks.",
  },
  {
    chip: "Git-governed releases",
    title: "A release is a Pull Request",
    text: "A release turns the live state of one process into a GitHub Pull Request. Review and merge is the approval — governed by the CODEOWNERS and branch protection you already trust. No bespoke permission model: GitHub decides who can merge.",
  },
  {
    chip: "Source of truth",
    title: "One read-only portal",
    text: "A read-only portal is the surface for everyone who doesn't model — always showing the last released state of every process, never a half-finished draft or someone's branch.",
  },
  {
    chip: "AI-native",
    title: "MCP reads both states",
    text: "Because Design speaks MCP too, agents can read and reason about both your live work-in-progress (clearly labeled) and your released models — the same conversational surface that runs your engines can talk about the processes you're still shaping.",
  },
]

const steps = [
  {
    title: "Model live, together",
    text: "Everyone connects to the same live session from the web canvas or VS Code and always sees the latest state — no check-out, no branches.",
  },
  {
    title: "Release as a Pull Request",
    text: "When a process is ready, a release turns its current live state into a GitHub Pull Request.",
  },
  {
    title: "Review and merge",
    text: "Review and merge is the approval, governed by CODEOWNERS and branch protection — GitHub decides who can ship.",
  },
  {
    title: "Publish to the portal",
    text: "The merged, released state lands in the read-only portal — the last-released source of truth for everyone who consumes processes.",
  },
]

const points = [
  "Per-file avatars and remote cursors",
  "Live highlighting of remote changes",
  "Soft “someone's editing this task” element locks",
  "Real-time sync over Hocuspocus and Yjs",
]
</script>

<template>
  <div class="design">
    <!-- Hero -->
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">Miragon AI Design · In development</span>
        <h1 class="hero-title">One live version,<span class="grad"> no merge hell</span>.</h1>
        <p class="hero-tagline">
          The design-time counterpart to Operations: a live-collaboration platform for your Camunda
          BPM landscape. We're building it in the open — here's the idea, and how it works.
        </p>
        <div class="actions">
          <a class="btn primary" href="#contact">
            Request early access <span class="arrow" aria-hidden="true">→</span>
          </a>
          <a class="btn ghost" href="#contact">Book a call with the team</a>
        </div>
      </div>
      <div class="hero-visual"><CollabCanvas /></div>
    </section>

    <!-- The inversion -->
    <section class="problem block">
      <span class="label">The inversion</span>
      <h2 class="block-title">Today the repo is the workspace. We flip it.</h2>
      <p class="lead">
        In most BPM setups the git repository is where models live, and you check a diagram out to
        work on it. That's where branches, stale copies and merge conflicts come from. Design
        inverts it: an always-on Live Host holds the single current working state, and everyone who
        models connects to the same live session. Nothing is checked out. There is exactly one live
        version — no branches to reconcile, no merges to fight.
      </p>
    </section>

    <!-- Pillars -->
    <section class="block">
      <span class="label">What it is</span>
      <div class="pillars">
        <div v-for="p in pillars" :key="p.chip" class="pillar">
          <span class="chip">{{ p.chip }}</span>
          <h3 class="pillar-title">{{ p.title }}</h3>
          <p class="pillar-text">{{ p.text }}</p>
        </div>
      </div>
    </section>

    <!-- Flow -->
    <section class="block">
      <span class="label">How it works</span>
      <h2 class="block-title">Live is the draft. Git is the record.</h2>
      <ol class="flow">
        <li v-for="(s, i) in steps" :key="s.title" class="fstep">
          <span class="fnum">{{ i + 1 }}</span>
          <span class="fstep-title">{{ s.title }}</span>
          <p class="fstep-text">{{ s.text }}</p>
        </li>
      </ol>
    </section>

    <!-- Presence -->
    <section class="presence block">
      <div class="presence-copy">
        <span class="label">Presence</span>
        <h2 class="block-title">See who's shaping the process, live.</h2>
        <p class="lead">
          Per-file avatars show who's in. Remote cursors show where they are. Remote changes
          highlight as they happen, and soft element locks make it clear when someone is already
          editing a task — collaboration you can watch, not a merge conflict you discover later.
        </p>
      </div>
      <ul class="points">
        <li v-for="pt in points" :key="pt">{{ pt }}</li>
      </ul>
    </section>

    <!-- Honest status -->
    <section class="block">
      <div class="status">
        <span class="status-label"><span class="wip" />Honest status</span>
        <h2 class="status-title">Being built now. Come build it with us.</h2>
        <p class="status-body">
          Miragon AI Design is in active development in 2026 and not yet generally available.
          Everything here describes the platform we're building and the mechanics behind it — React
          19, Vite, TanStack Router and Query, Tailwind, real-time sync over Hocuspocus and Yjs. If
          living on one live version instead of a pile of branches is how your team wants to work,
          request early access or book a call.
        </p>
      </div>
    </section>

    <!-- CTA band -->
    <section class="cta-wrap" aria-label="Get involved with Design">
      <div class="cta">
        <div class="grad-line" aria-hidden="true" />
        <div class="orb" aria-hidden="true" />
        <p class="cta-eyebrow"><span class="dot" />Build it with us</p>
        <h2 class="cta-title">One live version of your BPM landscape. Let's build it.</h2>
        <p class="cta-body">
          Design is in development — the honest ask is a conversation, not a demo login. Tell us how
          your team models today and we'll show you where this is going.
        </p>
        <a class="btn primary big" href="#contact">
          Request early access <span class="arrow" aria-hidden="true">→</span>
        </a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.design {
  --accent: #7b93ff;
  --accent-2: #3d5af1;
  --accent-soft: rgba(61, 90, 241, 0.1);
  --accent-border: rgba(123, 147, 255, 0.4);
}

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

.grad {
  background: linear-gradient(135deg, #7b93ff 0%, #3d5af1 100%);
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
  background: #3d5af1;
  color: #fff;
}
.btn.primary:hover {
  background: #4d68ff;
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
  border-color: var(--accent-border);
  background: rgba(61, 90, 241, 0.08);
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

/* Blocks */
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

/* Flow — 4-step pipeline */
.flow {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18px;
}
@media (max-width: 860px) {
  .flow {
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }
}
@media (max-width: 480px) {
  .flow {
    grid-template-columns: 1fr;
  }
}
.fstep {
  position: relative;
  padding: 20px 18px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 14px;
  background: #0f0f11;
}
.fnum {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-bottom: 12px;
  border-radius: 8px;
  border: 1px solid var(--accent-border);
  background: var(--accent-soft);
  color: var(--accent);
  font-family: "SF Mono", ui-monospace, "Menlo", monospace;
  font-size: 13px;
  font-weight: 600;
}
.fstep-title {
  display: block;
  margin-bottom: 6px;
  font-size: 14.5px;
  font-weight: 600;
  color: #f5f5f7;
}
.fstep-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: #98989d;
}

/* Presence */
.presence {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 40px;
  align-items: center;
}
@media (max-width: 820px) {
  .presence {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}
.points {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.points li {
  position: relative;
  padding: 12px 16px 12px 34px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: #0f0f11;
  font-size: 14px;
  color: #c8c8cd;
}
.points li::before {
  content: "";
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px rgba(123, 147, 255, 0.6);
}

/* Honest status note */
.status {
  padding: 28px 28px 26px;
  border: 1px solid var(--accent-border);
  border-radius: 18px;
  background: rgba(61, 90, 241, 0.05);
}
.status-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
}
.wip {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #7b93ff;
  box-shadow: 0 0 8px rgba(123, 147, 255, 0.7);
  animation: dp-pulse 2s ease-in-out infinite;
}
.status-title {
  margin: 0 0 12px;
  border: 0;
  padding: 0;
  font-size: clamp(20px, 2.6vw, 28px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: #f5f5f7;
}
.status-body {
  margin: 0;
  max-width: 760px;
  font-size: 15px;
  line-height: 1.7;
  color: #a8a8ad;
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
  background: linear-gradient(90deg, transparent, #3d5af1 30%, #7b93ff 70%, transparent);
}
.orb {
  position: absolute;
  top: -40%;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 300px;
  background: radial-gradient(ellipse, rgba(61, 90, 241, 0.12) 0%, transparent 65%);
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
  background: #7b93ff;
  box-shadow: 0 0 8px rgba(123, 147, 255, 0.7);
  animation: dp-pulse 2s ease-in-out infinite;
}
.cta-title {
  position: relative;
  margin: 0 0 16px;
  border: 0;
  padding: 0;
  font-size: clamp(24px, 3.6vw, 38px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.12;
  color: #f5f5f7;
}
.cta-body {
  position: relative;
  max-width: 520px;
  margin: 0 auto 30px;
  font-size: 16px;
  line-height: 1.7;
  color: #98989d;
}

@keyframes dp-pulse {
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
  .dot,
  .wip {
    animation: none;
  }
}
</style>
