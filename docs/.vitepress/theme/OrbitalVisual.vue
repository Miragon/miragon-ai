<!--
  1:1 port of the marketing site's hero animation
  (miragon-ai-website/src/components/OrbitalVisual.{tsx,module.css}):
  a glowing brand-green sun with three dashed orbit rings and planet dots.
  Pure CSS — no runtime dependency; rendered into the home-hero-image slot.
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
  background: radial-gradient(circle at 35% 35%, #33ff99, #00e676 55%, #00a854);
  box-shadow:
    0 0 18px 6px rgba(0, 230, 118, 0.55),
    0 0 48px 16px rgba(0, 230, 118, 0.25),
    0 0 90px 30px rgba(0, 230, 118, 0.1);
}

.orbit {
  position: absolute;
  border-radius: 50%;
}
.orbit1 {
  width: 160px;
  height: 160px;
  border: 1px dashed rgba(255, 255, 255, 0.11);
  animation: spin-cw 8s linear infinite;
}
.orbit2 {
  width: 268px;
  height: 268px;
  border: 1px dashed rgba(255, 255, 255, 0.08);
  animation: spin-cw 18s linear infinite;
}
.orbit3 {
  width: 374px;
  height: 374px;
  border: 1px dashed rgba(255, 255, 255, 0.05);
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
  background: #00e676;
  box-shadow: 0 0 8px 3px rgba(0, 230, 118, 0.7);
}
.p1b {
  width: 8px;
  height: 8px;
  left: 14.6%;
  top: 14.6%;
  background: #7b93ff;
  box-shadow: 0 0 6px 2px rgba(123, 147, 255, 0.5);
}

.p2a {
  width: 10px;
  height: 10px;
  left: 93.3%;
  top: 75%;
  background: rgba(255, 255, 255, 0.65);
  box-shadow: 0 0 5px 1px rgba(255, 255, 255, 0.25);
}
.p2b {
  width: 14px;
  height: 14px;
  left: 6.7%;
  top: 75%;
  background: #3d5af1;
  box-shadow: 0 0 10px 4px rgba(61, 90, 241, 0.55);
}
.p2c {
  width: 9px;
  height: 9px;
  left: 50%;
  top: 0%;
  background: #00b388;
  box-shadow: 0 0 6px 2px rgba(0, 179, 136, 0.5);
}

.p3a {
  width: 11px;
  height: 11px;
  left: 98.3%;
  top: 62.9%;
  background: rgba(255, 255, 255, 0.55);
  box-shadow: 0 0 5px 1px rgba(255, 255, 255, 0.2);
}
.p3b {
  width: 7px;
  height: 7px;
  left: 37.1%;
  top: 98.3%;
  background: #3d5af1;
}
.p3c {
  width: 9px;
  height: 9px;
  left: 1.7%;
  top: 37.1%;
  background: rgba(0, 230, 118, 0.45);
  box-shadow: 0 0 6px 2px rgba(0, 230, 118, 0.2);
}
.p3d {
  width: 13px;
  height: 13px;
  left: 62.9%;
  top: 1.7%;
  background: rgba(255, 255, 255, 0.35);
}

@media (prefers-reduced-motion: reduce) {
  .orbit {
    animation: none;
  }
}
</style>
