<!--
  Prominent "try it now" CTA lower on the landing page, modelled on the
  marketing site's CtaBanner (centered card, gradient hairline, green orb
  glow). The button opens the hosted playground in the MCP inspector; the
  example-prompt hint shows newcomers a concrete first thing to ask.
-->
<script setup lang="ts">
const INSPECTOR_URL =
  "https://inspector.manufact.com/inspector?server=https%3A%2F%2Fmiragon-ai-playground.fly.dev%2Fmcp&tab=chat"
</script>

<template>
  <section class="tio" aria-label="Try it out">
    <div class="card">
      <div class="grad-line" aria-hidden="true" />
      <div class="orb" aria-hidden="true" />

      <p class="eyebrow"><span class="dot" />Live playground</p>
      <h2 class="title">Talk to your processes.</h2>
      <p class="desc">
        No install, no login. Open the hosted playground in an MCP chat, connected to a live, seeded
        CIB Seven engine — ask a question and watch the interactive widgets render.
      </p>

      <a class="cta" :href="INSPECTOR_URL" target="_blank" rel="noopener noreferrer">
        Try it out
        <span class="arrow" aria-hidden="true">→</span>
      </a>

      <p class="hint">
        <span class="hint-label">Try asking</span>
        <span class="prompt">Show me the Cockpit</span>
      </p>
    </div>
  </section>
</template>

<style scoped>
.tio {
  margin-top: 64px;
}

.card {
  position: relative;
  overflow: hidden;
  max-width: 720px;
  margin: 0 auto;
  padding: 56px 40px;
  text-align: center;
  background: #141414;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 28px;
}

/* Signature green→blue hairline across the top edge */
.grad-line {
  position: absolute;
  top: 0;
  left: 10%;
  right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, #00e676 30%, #3d5af1 70%, transparent);
}

/* Ambient green glow behind the headline */
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

.eyebrow {
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
  animation: tio-pulse 2s ease-in-out infinite;
}
@keyframes tio-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.title {
  position: relative;
  margin: 0 0 16px;
  font-size: clamp(28px, 4vw, 44px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: #f5f5f7;
  border: none;
}

.desc {
  position: relative;
  max-width: 460px;
  margin: 0 auto 32px;
  font-size: 16px;
  line-height: 1.7;
  color: #98989d;
}

.cta {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 13px 28px;
  border-radius: 999px;
  background: #00e676;
  color: #000;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition:
    opacity 0.2s,
    transform 0.2s;
}
.cta:hover {
  opacity: 0.88;
  transform: translateY(-1px);
}
.arrow {
  transition: transform 0.2s;
}
.cta:hover .arrow {
  transform: translateX(3px);
}

.hint {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 24px 0 0;
  font-size: 13px;
}
.hint-label {
  color: #6e6e73;
  letter-spacing: 0.04em;
}
.prompt {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(0, 230, 118, 0.28);
  background: rgba(0, 230, 118, 0.06);
  color: #00e676;
  font-family: "SF Mono", ui-monospace, "Menlo", "Courier New", monospace;
}
</style>
