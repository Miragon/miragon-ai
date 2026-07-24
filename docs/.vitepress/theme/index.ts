// Extends the default theme with the miragon.ai brand (see custom.css) and
// mounts the hero conversation signature on the landing page.
// theme-without-fonts drops VitePress' bundled Inter so we don't ship the
// font twice — @fontsource-variable/inter is the site's own copy, matching
// the marketing site (miragon-ai-website uses the same package).
import { h } from "vue"
import type { Theme } from "vitepress"
import DefaultTheme from "vitepress/theme-without-fonts"
import HeroConversation from "./HeroConversation.vue"
import CockpitToConversation from "./CockpitToConversation.vue"
import ProductLineup from "./ProductLineup.vue"
import DocsDirectory from "./DocsDirectory.vue"
import OperationsPage from "./OperationsPage.vue"
import DesignPage from "./DesignPage.vue"
import TryItOut from "./TryItOut.vue"
import BrandContact from "./BrandContact.vue"
import LegalFooter from "./LegalFooter.vue"
import "@fontsource-variable/inter"
import "./custom.css"

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      // The hero's characteristic image: a live-feeling MCP conversation.
      "home-hero-image": () => h(HeroConversation),
      // Legal footer (Impressum + Datenschutz) on every page, incl. 404 —
      // the default theme hides its footer on sidebar pages.
      "layout-bottom": () => h(LegalFooter),
    })
  },
  enhanceApp({ app }) {
    // Landing-page sections used from index.md
    app.component("CockpitToConversation", CockpitToConversation)
    app.component("ProductLineup", ProductLineup)
    app.component("DocsDirectory", DocsDirectory)
    app.component("TryItOut", TryItOut)
    app.component("BrandContact", BrandContact)
    // Product pages used from docs/product/*.md
    app.component("OperationsPage", OperationsPage)
    app.component("DesignPage", DesignPage)
  },
} satisfies Theme
