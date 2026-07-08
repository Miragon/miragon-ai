<!--
  Slim legal footer rendered on EVERY page via the layout-bottom slot
  (all layouts incl. 404, all viewport widths). German DDG §5 requires the
  Impressum, and GDPR Art. 13 the privacy policy, reachable from every page
  — the default theme's footer is hidden on sidebar pages, so this bar
  guarantees the links are always present. Uses theme variables so it
  adapts to light/dark on doc pages and stays dark on the landing page.
-->
<template>
  <div class="legal-footer">
    <div class="legal-inner">
      <span class="copyright">© 2022–2026 Miragon GmbH</span>
      <nav class="legal-links" aria-label="Legal">
        <a href="https://www.miragon.io/datenschutz/" target="_blank" rel="noopener noreferrer"
          >Datenschutz</a
        >
        <a href="https://www.miragon.io/impressum/" target="_blank" rel="noopener noreferrer"
          >Impressum</a
        >
      </nav>
    </div>
  </div>
</template>

<style scoped>
.legal-footer {
  position: relative;
  z-index: 1;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  padding: 16px 24px;
}

.legal-inner {
  max-width: 1152px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

/* Clear the fixed sidebar on doc pages so the copyright isn't overlapped. */
@media (min-width: 960px) {
  :root:has(.VPSidebar) .legal-inner {
    padding-left: var(--vp-sidebar-width);
  }
}

.legal-links {
  display: flex;
  gap: 20px;
}

.legal-links a {
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color 0.2s;
}

.legal-links a:hover {
  color: var(--vp-c-brand-1);
}
</style>
