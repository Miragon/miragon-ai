<!--
  Quiet editorial directory into the documentation, kept low-contrast so it recedes
  behind the product story above it. Replaces the four VitePress `features` cards that
  used to sit right under the hero (which forced docs-before-products ordering).
-->
<template>
  <section class="docs" aria-label="Documentation">
    <span class="label">Documentation</span>
    <div class="grid">
      <a class="item" href="/developer">
        <span class="t">For Developers</span>
        <span class="d">Clone, install, and run the full stack locally in a few minutes.</span>
      </a>
      <a class="item" href="/architecture">
        <span class="t">Architecture</span>
        <span class="d">A one-page mental model of the server, modules, and external systems.</span>
      </a>
      <a class="item" href="/operations">
        <span class="t">Deployment</span>
        <span class="d">Deployment artifact, environment variables, and observability.</span>
      </a>
      <a class="item" href="/usage">
        <span class="t">How to Use It</span>
        <span class="d">Connect Claude, ask questions about your processes, fix incidents.</span>
      </a>
    </div>
  </section>
</template>

<style scoped>
.docs {
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
  margin-bottom: 24px;
}
.label::before {
  content: "";
  width: 20px;
  height: 1px;
  background: #00e676;
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 28px;
}
@media (max-width: 860px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
  }
}
@media (max-width: 520px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

.item {
  display: block;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.14);
  text-decoration: none;
  transition: border-color 0.25s;
}
.item:hover {
  border-top-color: #00e676;
}
.t {
  display: block;
  margin-bottom: 8px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #f5f5f7;
}
.d {
  display: block;
  font-size: 13px;
  line-height: 1.6;
  color: #98989d;
}
.item:hover .t {
  color: #00e676;
}
</style>
