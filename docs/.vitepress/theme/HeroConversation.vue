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
const shown = ref(false)
onMounted(() => {
  // next frame → CSS transitions run (stagger-in); reduced-motion shows final state
  requestAnimationFrame(() => (shown.value = true))
})
</script>

<template>
  <div class="convo" :class="{ shown }">
    <div class="glow" aria-hidden="true" />
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

      <div class="input">
        <span class="caret" />
        <span class="ph">Ask a follow-up…</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.convo {
  position: relative;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
}

/* Ambient brand glow behind the window */
.glow {
  position: absolute;
  inset: -12% -8% -20%;
  background: radial-gradient(
    ellipse at 60% 30%,
    rgba(0, 230, 118, 0.14) 0%,
    rgba(61, 90, 241, 0.06) 45%,
    transparent 72%
  );
  filter: blur(36px);
  pointer-events: none;
}

.win {
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  background: #0c0c0c;
  overflow: hidden;
  box-shadow: 0 24px 60px -24px rgba(0, 0, 0, 0.8);
}
/* Signature green→blue hairline across the top edge */
.win::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, #00e676 30%, #3d5af1 70%, transparent);
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-family: "SF Mono", ui-monospace, "Menlo", monospace;
  font-size: 11.5px;
}
.live {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #98989d;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #00e676;
  box-shadow: 0 0 8px rgba(0, 230, 118, 0.7);
  animation: hc-pulse 2s ease-in-out infinite;
}
.host {
  color: #56565b;
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
  font-family: "SF Mono", ui-monospace, "Menlo", monospace;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6e6e73;
}
.turn.asst .who {
  color: #00b388;
}

.turn.user {
  margin-bottom: 20px;
}
.msg {
  margin: 0;
  display: inline-block;
  padding: 10px 14px;
  border-radius: 12px 12px 12px 4px;
  background: #17181a;
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: #f5f5f7;
  font-size: 14px;
  line-height: 1.45;
}

.line {
  margin: 0 0 12px;
  color: #c8c8cd;
  font-size: 14px;
  line-height: 1.5;
}
.line b {
  color: #f5f5f7;
  font-weight: 600;
}

/* Rendered "widget" card — mirrors the real analytics widgets */
.widget {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: #121315;
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
  color: #98989d;
}
.w-total {
  font-family: "SF Mono", ui-monospace, "Menlo", monospace;
  font-size: 18px;
  font-weight: 600;
  color: #ff6b6b;
}
.w-row {
  display: grid;
  grid-template-columns: 1fr 72px auto;
  align-items: center;
  gap: 12px;
  padding: 7px 0;
}
.pk {
  font-family: "SF Mono", ui-monospace, "Menlo", monospace;
  font-size: 12.5px;
  color: #e6e6e9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.track {
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #ff9500, #ff6b6b);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1);
  transition-delay: calc(1.1s + var(--j) * 0.12s);
}
.shown .fill {
  transform: scaleX(1);
}
.n {
  font-family: "SF Mono", ui-monospace, "Menlo", monospace;
  font-size: 13px;
  color: #f5f5f7;
  text-align: right;
}
.w-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.tag {
  font-family: "SF Mono", ui-monospace, "Menlo", monospace;
  font-size: 11px;
  color: #6e6e73;
}
.act {
  font-size: 12px;
  font-weight: 600;
  color: #00e676;
}

.input {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 14px 16px;
  padding: 11px 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: #141414;
}
.caret {
  width: 2px;
  height: 15px;
  background: #00e676;
  animation: hc-blink 1.1s step-end infinite;
}
.ph {
  font-size: 13px;
  color: #56565b;
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
