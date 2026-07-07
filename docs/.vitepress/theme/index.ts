// Extends the default theme with the miragon.ai brand (see custom.css).
// theme-without-fonts drops VitePress' bundled Inter so we don't ship the
// font twice — @fontsource-variable/inter is the site's own copy, matching
// the marketing site (miragon-ai-website uses the same package).
import type { Theme } from "vitepress"
import DefaultTheme from "vitepress/theme-without-fonts"
import "@fontsource-variable/inter"
import "./custom.css"

export default {
  extends: DefaultTheme,
} satisfies Theme
