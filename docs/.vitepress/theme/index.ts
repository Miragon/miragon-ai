// Extends the default theme with the miragon.ai brand (see custom.css) and
// mounts the marketing site's orbital hero animation on the landing page.
// theme-without-fonts drops VitePress' bundled Inter so we don't ship the
// font twice — @fontsource-variable/inter is the site's own copy, matching
// the marketing site (miragon-ai-website uses the same package).
import { h } from "vue"
import type { Theme } from "vitepress"
import DefaultTheme from "vitepress/theme-without-fonts"
import OrbitalVisual from "./OrbitalVisual.vue"
import "@fontsource-variable/inter"
import "./custom.css"

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "home-hero-image": () => h(OrbitalVisual),
    })
  },
} satisfies Theme
