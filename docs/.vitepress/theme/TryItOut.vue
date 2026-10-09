<!--
  Prominent "try it now" CTA lower on the landing page, modelled on the
  marketing site's CtaBanner (centered card under a brand-gradient edge).
  The button opens the hosted playground in the MCP inspector; the
  example-prompt hint shows newcomers a concrete first thing to ask.
  Colours come from the theme's CSS variables (custom.css → CI tokens).
-->
<script setup lang="ts">
const INSPECTOR_URL =
  "https://inspector.manufact.com/inspector?server=https%3A%2F%2Fmiragon-ai-playground.fly.dev%2Fmcp&tab=chat"
</script>

<template>
  <section class="tio" aria-label="Try it out">
    <div class="card">
      <div class="grad-line" aria-hidden="true" />

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
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--cd-radius-lg);
}

/* Brand gradient across the top edge */
.grad-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--cd-gradient-brand);
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
  color: var(--vp-c-text-2);
}
/* Live indicator */
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cd-gruen);
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
  color: var(--vp-c-text-1);
  border: none;
}

.desc {
  position: relative;
  max-width: 460px;
  margin: 0 auto 32px;
  font-size: 16px;
  line-height: 1.7;
  color: var(--vp-c-text-2);
}

.cta {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 13px 28px;
  border-radius: var(--cd-radius-pill);
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background var(--cd-motion-fast) var(--cd-ease),
    transform var(--cd-motion-fast) var(--cd-ease);
}
.cta:hover {
  background: var(--vp-button-brand-hover-bg);
  color: var(--vp-button-brand-hover-text);
  transform: translateY(-1px);
}
.arrow {
  transition: transform var(--cd-motion-fast) var(--cd-ease);
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
  color: var(--vp-c-text-3);
  letter-spacing: 0.04em;
}
.prompt {
  padding: 6px 14px;
  border-radius: var(--cd-radius-pill);
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 30%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, transparent);
  color: var(--vp-c-brand-1);
  font-family: var(--vp-font-family-mono);
}

@media (prefers-reduced-motion: reduce) {
  .dot {
    animation: none;
  }
  .cta,
  .arrow {
    transition: none;
  }
}
</style>
