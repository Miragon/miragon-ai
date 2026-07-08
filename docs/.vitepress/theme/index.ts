// Extends the default theme with the miragon.ai brand (see custom.css) and
// mounts the marketing site's orbital hero animation on the landing page.
// theme-without-fonts drops VitePress' bundled Inter so we don't ship the
// font twice — @fontsource-variable/inter is the site's own copy, matching
// the marketing site (miragon-ai-website uses the same package).
import { h } from "vue"
import type { Theme } from "vitepress"
import DefaultTheme from "vitepress/theme-without-fonts"
import OrbitalVisual from "./OrbitalVisual.vue"
import CockpitToConversation from "./CockpitToConversation.vue"
import BrandContact from "./BrandContact.vue"
import LegalFooter from "./LegalFooter.vue"
import "@fontsource-variable/inter"
import "./custom.css"

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "home-hero-image": () => h(OrbitalVisual),
      // Legal footer (Impressum + Datenschutz) on every page, incl. 404 —
      // the default theme hides its footer on sidebar pages.
      "layout-bottom": () => h(LegalFooter),
    })
  },
  enhanceApp({ app }) {
    // Landing-page sections used from index.md
    app.component("CockpitToConversation", CockpitToConversation)
    app.component("BrandContact", BrandContact)
  },
} satisfies Theme
