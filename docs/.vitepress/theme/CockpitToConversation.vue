<!--
  "From cockpit to conversation" — the AI-native-platform section from the
  marketing site's landing page (miragon-ai-website LandingPage.tsx, Mova
  showcase), distilled for the docs landing: the three role-based value
  props map 1:1 onto this platform's modules (operations tools, analytics,
  incident resolution). Rendered on the (always dark) landing page only;
  colours come from the theme's CSS variables (custom.css → CI tokens).
-->
<script setup lang="ts">
import OrbitalVisual from "./OrbitalVisual.vue"
</script>

<template>
  <section class="c2c">
    <span class="label">AI-Native Platform</span>
    <div class="grid">
      <div>
        <h3 class="title">From cockpit to conversation</h3>
        <p class="desc">
          Every role gets exactly what they need from any running process, just by asking. The
          cockpit, the tasklist, the dashboard, the monitoring tool — all of it collapses into a
          single conversation. No cockpit. No tab hunt.
        </p>
      </div>
      <!-- One reliable engine at the center, the orbiting tools it replaces. -->
      <div class="orbit" aria-hidden="true"><OrbitalVisual /></div>
    </div>

    <div class="features">
      <div class="feature">
        <span class="chip">Pulse</span>
        <div>
          <span class="role">Operations</span>
          <p class="text">
            Ask where any instance stands, what went wrong, which variables are set. No cockpit, no
            click path.
          </p>
        </div>
      </div>
      <div class="feature">
        <span class="chip">Insight</span>
        <div>
          <span class="role">Management</span>
          <p class="text">
            KPIs, throughput times, bottlenecks — delivered in the conversation. No dashboard to
            open, no filter to set.
          </p>
        </div>
      </div>
      <div class="feature">
        <span class="chip">Resolve</span>
        <div>
          <span class="role">Development</span>
          <p class="text">
            Incidents analyzed, root causes identified, fixes proposed. No on-call panic, no 3am
            pages.
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.c2c {
  margin-top: 64px;
  padding-top: 48px;
  border-top: 1px solid var(--vp-c-divider);
}

.label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
  margin-bottom: 20px;
}
.label::before {
  content: "";
  width: 20px;
  height: 1px;
  background: var(--vp-c-brand-1);
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 48px;
  align-items: start;
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}

.title {
  font-size: clamp(28px, 3.5vw, 44px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin: 0 0 20px;
  color: var(--vp-c-text-1);
}

.desc {
  font-size: 16px;
  line-height: 1.75;
  color: var(--vp-c-text-2);
  margin: 0;
}

.orbit {
  display: flex;
  align-items: center;
  justify-content: center;
}
.orbit :deep(.orbital) {
  max-width: 340px;
}
@media (max-width: 900px) {
  .orbit {
    display: none;
  }
}

.features {
  margin-top: 40px;
}

.feature {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--vp-c-divider);
  transition: background var(--cd-motion-fast) var(--cd-ease);
}
.feature:last-child {
  border-bottom: none;
}
.feature:hover {
  background: var(--vp-c-bg-alt);
}

.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
  border-radius: var(--cd-radius-pill);
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 30%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, transparent);
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  flex-shrink: 0;
}

.role {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--vp-c-text-3);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 4px;
}

.text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
  margin: 0;
}
</style>
