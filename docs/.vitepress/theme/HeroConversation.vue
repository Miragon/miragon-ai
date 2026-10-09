<!--
  Hero signature: a live-feeling MCP conversation that shows the product's
  whole thesis in one frame — a plain-language question about running BPMN
  processes, answered by a rendered widget instead of a wall of text. The
  numbers mirror the real playground (147 open incidents on miraveloLeasing
  + assessCreditworthiness, all failed jobs). Replaces the generic orbital
  galaxy as the hero's characteristic image.
-->
<script setup lang="ts">
import { onMounted, ref } from "vue"
// Clicking the input opens the real playground in the MCP inspector — same
// destination as the hero's "Try it out" button.
const INSPECTOR_URL =
  "https://inspector.manufact.com/inspector?server=https%3A%2F%2Fmiragon-ai-playground.fly.dev%2Fmcp&tab=chat"
const shown = ref(false)
onMounted(() => {
  // next frame → CSS transitions run (stagger-in); reduced-motion shows final state
  requestAnimationFrame(() => (shown.value = true))
})
</script>

<template>
  <div class="convo" :class="{ shown }">
    <div class="win">
      <div class="bar">
        <span class="live"><span class="dot" />playground</span>
        <span class="host">miragon-ai-playground.fly.dev</span>
      </div>

      <div class="body">
        <div class="turn user" style="--i: 0">
          <span class="who">You</span>
          <p class="msg">Which processes have open incidents right now?</p>
        </div>

        <div class="turn asst" style="--i: 1">
          <span class="who">miragon-ai</span>
          <p class="line">
            Across 2 process definitions, <b>147 open incidents</b> — all failed jobs.
          </p>

          <div class="widget">
            <div class="w-head">
              <span class="w-title">Open incidents</span>
              <span class="w-total">147</span>
            </div>
            <div class="w-row" style="--j: 0">
              <span class="pk">miraveloLeasing</span>
              <span class="track"><span class="fill" style="width: 62%" /></span>
              <span class="n">91</span>
            </div>
            <div class="w-row" style="--j: 1">
              <span class="pk">assessCreditworthiness</span>
              <span class="track"><span class="fill" style="width: 38%" /></span>
              <span class="n">56</span>
            </div>
            <div class="w-foot">
              <span class="tag">all failedJob</span>
              <span class="act">Triage →</span>
            </div>
          </div>
        </div>
      </div>

      <a class="input" :href="INSPECTOR_URL" target="_blank" rel="noopener noreferrer">
        <span class="caret" />
        <span class="ph">Ask a follow-up…</span>
        <span class="go" aria-hidden="true">↗</span>
      </a>
    </div>
  </div>
</template>

<style scoped>
/* Colours come from the theme's CSS variables (custom.css → CI tokens):
   --vp-c-brand-1 (green on the dark ground, per the CI) marks the assistant
   and everything interactive, the brand gradient only the window's top
   edge. */
.convo {
  position: relative;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
}

.win {
  position: relative;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--cd-radius-lg);
  background: var(--vp-c-bg-soft);
  overflow: hidden;
  box-shadow: var(--cd-shadow-3);
}
/* Brand gradient across the top edge */
.win::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--cd-gradient-brand);
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 16px;
  border-bottom: 1px solid var(--vp-c-divider);
  font-family: var(--vp-font-family-mono);
  font-size: 11.5px;
}
.live {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--vp-c-text-2);
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cd-gruen);
  animation: hc-pulse 2s ease-in-out infinite;
}
.host {
  color: var(--vp-c-text-3);
}

.body {
  padding: 20px 18px 8px;
}

.turn {
  opacity: 0;
  transform: translateY(10px);
  transition:
    opacity 0.5s ease,
    transform 0.5s ease;
  transition-delay: calc(var(--i) * 0.5s + 0.1s);
}
.shown .turn {
  opacity: 1;
  transform: none;
}

.who {
  display: block;
  margin-bottom: 6px;
  font-family: var(--vp-font-family-mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}
.turn.asst .who {
  color: var(--vp-c-brand-1);
}

.turn.user {
  margin-bottom: 20px;
}
.msg {
  margin: 0;
  display: inline-block;
  padding: 10px 14px;
  border-radius: 12px 12px 12px 4px;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-1);
  font-size: 14px;
  line-height: 1.45;
}

.line {
  margin: 0 0 12px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.5;
}
.line b {
  color: var(--vp-c-text-1);
  font-weight: 600;
}

/* Rendered "widget" card — mirrors the real analytics widgets */
.widget {
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--cd-radius-md);
  background: var(--vp-c-bg-elv);
  padding: 14px 16px;
}
.w-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}
.w-title {
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}
.w-total {
  font-family: var(--vp-font-family-mono);
  font-size: 18px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.w-row {
  display: grid;
  grid-template-columns: 1fr 72px auto;
  align-items: center;
  gap: 12px;
  padding: 7px 0;
}
.pk {
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  color: var(--vp-c-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.track {
  height: 6px;
  border-radius: var(--cd-radius-pill);
  background: var(--vp-c-default-soft);
  overflow: hidden;
}
/* Incidents are an error state: the CI's functional danger colour. */
.fill {
  display: block;
  height: 100%;
  border-radius: var(--cd-radius-pill);
  background: var(--cd-danger);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.7s var(--cd-ease);
  transition-delay: calc(1.1s + var(--j) * 0.12s);
}
.shown .fill {
  transform: scaleX(1);
}
.n {
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  color: var(--vp-c-text-1);
  text-align: right;
}
.w-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--vp-c-divider);
}
.tag {
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  color: var(--vp-c-text-3);
}
.act {
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
}

.input {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 14px 16px;
  padding: 11px 14px;
  border: 1px solid var(--vp-c-border);
  border-radius: var(--cd-radius-pill);
  background: var(--vp-c-bg);
  text-decoration: none;
  cursor: pointer;
  transition:
    border-color var(--cd-motion-fast) var(--cd-ease),
    background var(--cd-motion-fast) var(--cd-ease);
}
.input:hover {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-alt);
}
.caret {
  width: 2px;
  height: 15px;
  background: var(--vp-c-brand-1);
  animation: hc-blink 1.1s step-end infinite;
}
.ph {
  font-size: 13px;
  color: var(--vp-c-text-3);
  transition: color var(--cd-motion-fast) var(--cd-ease);
}
.input:hover .ph {
  color: var(--vp-c-text-2);
}
.go {
  margin-left: auto;
  font-size: 13px;
  color: var(--vp-c-text-3);
  transition: color var(--cd-motion-fast) var(--cd-ease);
}
.input:hover .go {
  color: var(--vp-c-brand-1);
}

@keyframes hc-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
@keyframes hc-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .turn,
  .fill {
    transition: none;
  }
  .dot,
  .caret {
    animation: none;
  }
}
</style>
