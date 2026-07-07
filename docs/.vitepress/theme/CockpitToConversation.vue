<!--
  "From cockpit to conversation" — the AI-native-platform section from the
  marketing site's landing page (miragon-ai-website LandingPage.tsx, Mova
  showcase), distilled for the docs landing: the three role-based value
  props map 1:1 onto this platform's modules (operations tools, analytics,
  incident resolution). Rendered on the (always dark) landing page only.
-->
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
      <div class="features">
        <div class="feature">
          <span class="chip">Pulse</span>
          <div>
            <span class="role">Operations</span>
            <p class="text">
              Ask where any instance stands, what went wrong, which variables are set. No cockpit,
              no click path.
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
    </div>
  </section>
</template>

<style scoped>
.c2c {
  margin-top: 64px;
  padding-top: 48px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.label {
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
.label::before {
  content: "";
  width: 20px;
  height: 1px;
  background: #00e676;
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
  color: #f5f5f7;
}

.desc {
  font-size: 16px;
  line-height: 1.75;
  color: #98989d;
  margin: 0;
}

.feature {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  transition: background 0.2s;
}
.feature:last-child {
  border-bottom: none;
}
.feature:hover {
  background: rgba(255, 255, 255, 0.03);
}

.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid rgba(0, 230, 118, 0.28);
  background: rgba(0, 230, 118, 0.06);
  font-size: 12px;
  font-weight: 600;
  color: #00e676;
  flex-shrink: 0;
}

.role {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: #6e6e73;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 4px;
}

.text {
  font-size: 13px;
  line-height: 1.6;
  color: #98989d;
  margin: 0;
}
</style>
