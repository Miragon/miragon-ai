<!--
  Port of the marketing site's hero animation
  (miragon-ai-website/src/components/OrbitalVisual.{tsx,module.css}),
  recoloured on the CI tokens: a brand-green sun with three dashed orbit
  rings and blue/white planet dots — flat, no glow. Pure CSS — no runtime
  dependency; used by CockpitToConversation.
-->
<template>
  <div class="orbital">
    <div class="sun" />

    <!-- Orbit 1 — inner, fast -->
    <div class="orbit orbit1">
      <div class="planet p1a" />
      <div class="planet p1b" />
    </div>

    <!-- Orbit 2 — middle -->
    <div class="orbit orbit2">
      <div class="planet p2a" />
      <div class="planet p2b" />
      <div class="planet p2c" />
    </div>

    <!-- Orbit 3 — outer, slow, counter-clockwise -->
    <div class="orbit orbit3">
      <div class="planet p3a" />
      <div class="planet p3b" />
      <div class="planet p3c" />
      <div class="planet p3d" />
    </div>
  </div>
</template>

<style scoped>
@keyframes spin-cw {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
@keyframes spin-ccw {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(-360deg);
  }
}

.orbital {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  max-width: 420px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  overflow: hidden;
}

.sun {
  position: absolute;
  z-index: 10;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--cd-gruen);
}

.orbit {
  position: absolute;
  border-radius: 50%;
}
.orbit1 {
  width: 160px;
  height: 160px;
  border: 1px dashed color-mix(in srgb, var(--cd-weiss) 16%, transparent);
  animation: spin-cw 8s linear infinite;
}
.orbit2 {
  width: 268px;
  height: 268px;
  border: 1px dashed color-mix(in srgb, var(--cd-weiss) 12%, transparent);
  animation: spin-cw 18s linear infinite;
}
.orbit3 {
  width: 374px;
  height: 374px;
  border: 1px dashed color-mix(in srgb, var(--cd-weiss) 8%, transparent);
  animation: spin-ccw 30s linear infinite;
}

.planet {
  position: absolute;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.p1a {
  width: 12px;
  height: 12px;
  left: 85.4%;
  top: 85.4%;
  background: var(--cd-blau);
}
.p1b {
  width: 8px;
  height: 8px;
  left: 14.6%;
  top: 14.6%;
  background: color-mix(in srgb, var(--cd-weiss) 65%, transparent);
}

.p2a {
  width: 10px;
  height: 10px;
  left: 93.3%;
  top: 75%;
  background: color-mix(in srgb, var(--cd-weiss) 65%, transparent);
}
.p2b {
  width: 14px;
  height: 14px;
  left: 6.7%;
  top: 75%;
  background: var(--cd-blau);
}
.p2c {
  width: 9px;
  height: 9px;
  left: 50%;
  top: 0%;
  background: var(--cd-blau);
}

.p3a {
  width: 11px;
  height: 11px;
  left: 98.3%;
  top: 62.9%;
  background: color-mix(in srgb, var(--cd-weiss) 55%, transparent);
}
.p3b {
  width: 7px;
  height: 7px;
  left: 37.1%;
  top: 98.3%;
  background: var(--cd-blau);
}
.p3c {
  width: 9px;
  height: 9px;
  left: 1.7%;
  top: 37.1%;
  background: color-mix(in srgb, var(--cd-blau) 70%, transparent);
}
.p3d {
  width: 13px;
  height: 13px;
  left: 62.9%;
  top: 1.7%;
  background: color-mix(in srgb, var(--cd-weiss) 35%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .orbit {
    animation: none;
  }
}
</style>
