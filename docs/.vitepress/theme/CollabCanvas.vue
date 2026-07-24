<!--
  Design-time signature: a live-feeling collaborative BPMN canvas that shows the
  Miragon AI Design thesis in one frame — everyone models the same single live
  version at once (remote cursors, presence, a soft element lock), and a release
  turns that live state into a pull request. Indigo-accented counterpart to the
  green HeroConversation (which is the Operations signature). Pure CSS + inline
  SVG, no runtime dependency; reduced-motion safe.
-->
<script setup lang="ts">
import { onMounted, ref } from "vue"
const shown = ref(false)
onMounted(() => {
  requestAnimationFrame(() => (shown.value = true))
})
</script>

<template>
  <div class="canvas" :class="{ shown }">
    <div class="glow" aria-hidden="true" />
    <div class="win">
      <div class="bar">
        <span class="live"><span class="dot" />live session</span>
        <span class="file">order-to-cash.bpmn</span>
        <span class="who-online" aria-hidden="true">
          <span class="ava a1">D</span>
          <span class="ava a2">L</span>
          <span class="ava a3">M</span>
          <span class="n-online">3 online</span>
        </span>
      </div>

      <div class="board">
        <!-- BPMN mini-flow: start → task → gateway → task → end -->
        <svg
          class="flow"
          viewBox="0 0 460 150"
          fill="none"
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
        >
          <!-- connectors -->
          <g class="edges">
            <path d="M52 75 H96" />
            <path d="M176 75 H208" />
            <path d="M252 75 H288" />
            <path d="M368 75 H404" />
          </g>
          <g class="arrows">
            <path d="M96 75 l-7 -4 v8 z" />
            <path d="M208 75 l-7 -4 v8 z" />
            <path d="M288 75 l-7 -4 v8 z" />
            <path d="M404 75 l-7 -4 v8 z" />
          </g>

          <!-- start event -->
          <circle class="node start" cx="36" cy="75" r="15" />
          <!-- task 1 -->
          <rect class="node task" x="96" y="58" width="80" height="34" rx="7" />
          <!-- gateway -->
          <rect
            class="node gw"
            x="208"
            y="61"
            width="30"
            height="30"
            rx="5"
            transform="rotate(45 223 76)"
          />
          <!-- task 2 (soft-locked by a teammate) -->
          <rect class="node task locked" x="288" y="58" width="80" height="34" rx="7" />
          <!-- end event -->
          <circle class="node end" cx="425" cy="75" r="15" />
        </svg>

        <!-- element labels (HTML so type inherits the site font) -->
        <span class="lbl l-task1">Check credit</span>
        <span class="lbl l-task2">Approve</span>

        <!-- soft "someone is editing" lock tag on task 2 -->
        <span class="lock-tag">Lena is editing</span>

        <!-- two remote cursors, gently drifting -->
        <span class="cursor c-d">
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 1l9 4-4 1-1 4z" /></svg>
          <span class="tag">Dominik</span>
        </span>
        <span class="cursor c-l">
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 1l9 4-4 1-1 4z" /></svg>
          <span class="tag">Lena</span>
        </span>
      </div>

      <div class="foot">
        <span class="branch">live · in sync with main</span>
        <span class="release">Release → PR</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas {
  position: relative;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
}

/* Ambient indigo glow behind the window (Design reads blue). */
.glow {
  position: absolute;
  inset: -12% -8% -20%;
  background: radial-gradient(
    ellipse at 45% 30%,
    rgba(61, 90, 241, 0.18) 0%,
    rgba(0, 230, 118, 0.05) 55%,
    transparent 72%
  );
  filter: blur(38px);
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
/* Signature gradient hairline across the top edge (indigo-led for Design). */
.win::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, #3d5af1 30%, #7b93ff 70%, transparent);
}

.bar {
  display: flex;
  align-items: center;
  gap: 12px;
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
  background: #7b93ff;
  box-shadow: 0 0 8px rgba(123, 147, 255, 0.8);
  animation: cc-pulse 2s ease-in-out infinite;
}
.file {
  color: #56565b;
}
.who-online {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
}
.ava {
  width: 20px;
  height: 20px;
  margin-left: -6px;
  border-radius: 50%;
  border: 1.5px solid #0c0c0c;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9.5px;
  font-weight: 700;
  color: #050505;
}
.a1 {
  background: #7b93ff;
}
.a2 {
  background: #00e676;
}
.a3 {
  background: #d7b3ff;
}
.n-online {
  margin-left: 10px;
  color: #6e6e73;
}

.board {
  position: relative;
  padding: 26px 18px 20px;
}

.flow {
  width: 100%;
  height: auto;
  display: block;
}
.edges path {
  stroke: rgba(255, 255, 255, 0.28);
  stroke-width: 1.4;
}
.arrows path {
  fill: rgba(255, 255, 255, 0.4);
}
.node {
  stroke-width: 1.6;
}
.node.start {
  fill: rgba(0, 230, 118, 0.12);
  stroke: #00b388;
}
.node.end {
  fill: rgba(255, 255, 255, 0.04);
  stroke: rgba(255, 255, 255, 0.35);
  stroke-width: 2.4;
}
.node.task {
  fill: rgba(61, 90, 241, 0.1);
  stroke: rgba(123, 147, 255, 0.55);
}
.node.gw {
  fill: rgba(255, 255, 255, 0.04);
  stroke: rgba(255, 255, 255, 0.4);
}
.node.locked {
  stroke: #7b93ff;
  stroke-dasharray: 4 3;
  animation: cc-lockpulse 2.4s ease-in-out infinite;
}

.lbl {
  position: absolute;
  font-size: 10px;
  color: #c8c8cd;
  white-space: nowrap;
  pointer-events: none;
}
.l-task1 {
  left: 22.5%;
  top: 50%;
  transform: translate(-50%, -50%);
}
.l-task2 {
  left: 63%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.lock-tag {
  position: absolute;
  left: 60%;
  top: 20px;
  transform: translateX(-50%);
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(123, 147, 255, 0.14);
  border: 1px solid rgba(123, 147, 255, 0.4);
  font-size: 9.5px;
  color: #aeb9ff;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.5s ease 0.8s;
}
.shown .lock-tag {
  opacity: 1;
}

/* Remote cursors */
.cursor {
  position: absolute;
  display: inline-flex;
  align-items: flex-start;
  gap: 3px;
  opacity: 0;
  transition:
    opacity 0.5s ease,
    transform 3.5s ease-in-out;
}
.cursor svg {
  width: 12px;
  height: 12px;
}
.cursor .tag {
  padding: 1px 6px;
  border-radius: 4px 4px 4px 0;
  font-size: 9px;
  font-weight: 600;
  color: #050505;
  white-space: nowrap;
  transform: translateY(-2px);
}
.c-d {
  left: 30%;
  top: 62%;
  transition-delay: 0.4s, 0s;
}
.c-d svg {
  fill: #7b93ff;
}
.c-d .tag {
  background: #7b93ff;
}
.c-l {
  left: 66%;
  top: 30%;
  transition-delay: 0.6s, 0s;
}
.c-l svg {
  fill: #00e676;
}
.c-l .tag {
  background: #00e676;
}
.shown .c-d {
  opacity: 1;
  transform: translate(6px, -8px);
}
.shown .c-l {
  opacity: 1;
  transform: translate(-8px, 6px);
}

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 11px;
}
.branch {
  font-family: "SF Mono", ui-monospace, "Menlo", monospace;
  color: #6e6e73;
}
.release {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid rgba(123, 147, 255, 0.4);
  background: rgba(61, 90, 241, 0.12);
  font-size: 11px;
  font-weight: 600;
  color: #aeb9ff;
}

@keyframes cc-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
@keyframes cc-lockpulse {
  0%,
  100% {
    stroke-opacity: 1;
  }
  50% {
    stroke-opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cursor,
  .lock-tag {
    transition: opacity 0.3s ease;
  }
  .shown .c-d,
  .shown .c-l {
    transform: none;
  }
  .dot,
  .node.locked {
    animation: none;
  }
}
</style>
