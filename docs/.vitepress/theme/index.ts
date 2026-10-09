// Extends the default theme with the Miragon corporate design (see
// custom.css) and mounts the hero conversation signature on the landing page.
// theme-without-fonts drops VitePress' bundled Inter: the CI typeface is
// Geist / Geist Mono, self-hosted through @fontsource (italic included for
// emphasis and quotes).
import { h } from "vue"
import type { Theme } from "vitepress"
import DefaultTheme from "vitepress/theme-without-fonts"
import HeroConversation from "./HeroConversation.vue"
import CockpitToConversation from "./CockpitToConversation.vue"
import TryItOut from "./TryItOut.vue"
import BrandContact from "./BrandContact.vue"
import LegalFooter from "./LegalFooter.vue"
import "@fontsource-variable/geist"
import "@fontsource-variable/geist/wght-italic.css"
import "@fontsource-variable/geist-mono"
// CI tokens (--cd-*), vendored verbatim from Miragon/corporate-identity —
// loaded before custom.css, which maps the VitePress variables onto them.
import "./cd-tokens.generated.css"
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
    app.component("TryItOut", TryItOut)
    app.component("BrandContact", BrandContact)
  },
} satisfies Theme
