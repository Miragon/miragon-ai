import { withMermaid } from "vitepress-plugin-mermaid"

export default withMermaid({
  title: "Miragon AI Platform",
  description:
    "AI-driven process management for Camunda 7 / CIB Seven via the Model Context Protocol.",
  cleanUrls: true,
  lastUpdated: true,
  // Shiki's VitePress default dark theme (github-dark) renders comments at
  // 3.9:1 on the dark code background; github-dark-default keeps every token
  // colour above WCAG AA. Light stays on the default github-light.
  markdown: {
    theme: { light: "github-light", dark: "github-dark-default" },
  },
  // Doc pages offer the normal light/dark toggle; the landing page alone
  // always carries the dark Miragon CI theme (scoped in theme/custom.css).
  head: [
    // consentmanager.net cookie consent with autoblocking, same setup as the
    // marketing site (miragon-ai-website/index.html) — blocks third-party
    // scripts (e.g. the Calendly embed) until the visitor consents.
    ["script", {}, 'window.cmp_setlang = "EN";'],
    [
      "script",
      {
        type: "text/javascript",
        "data-cmp-ab": "1",
        src: "https://cdn.consentmanager.net/delivery/autoblocking/47e2555f7ae3.js?cmplang=EN",
        "data-cmp-host": "c.delivery.consentmanager.net",
        "data-cmp-cdn": "cdn.consentmanager.net",
        "data-cmp-codesrc": "0",
      },
    ],
    // The CI app icon (green comet on blue), with a PNG fallback.
    ["link", { rel: "icon", type: "image/svg+xml", href: "/logo/miragon-komet-blau.svg" }],
    ["link", { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" }],
    // CI primary blue (--cd-blau), as on the CI site
    ["meta", { name: "theme-color", content: "#335DE5" }],
  ],
  // Preload the self-hosted Geist Variable (hashed filename, so a static
  // head link can't point at it — see vitepress.dev site-config#transformhead).
  transformHead({ assets }) {
    const geist = assets.find((file) => /geist-latin-wght-normal\.[\w-]+\.woff2/.test(file))
    if (geist) {
      return [
        ["link", { rel: "preload", href: geist, as: "font", type: "font/woff2", crossorigin: "" }],
      ]
    }
  },
  themeConfig: {
    // Official CI wordmarks: green (the standard) on light, white on dark.
    logo: {
      light: "/logo/miragon-logo-gruen.svg",
      dark: "/logo/miragon-logo-weiss.svg",
      alt: "Miragon",
    },
    // The wordmark already reads MIRAGON — no text next to it.
    siteTitle: false,
    nav: [
      { text: "Architecture", link: "/architecture" },
      { text: "Developers", link: "/developer" },
      { text: "Operations", link: "/operations" },
      { text: "Usage", link: "/usage" },
      { text: "Playground", link: "https://miragon-ai-playground.fly.dev/mcp" },
    ],
    sidebar: [
      {
        text: "Overview",
        items: [{ text: "Introduction", link: "/" }],
      },
      {
        text: "Architecture",
        items: [{ text: "Overview", link: "/architecture" }],
      },
      {
        text: "Getting Started",
        items: [{ text: "For Developers", link: "/developer" }],
      },
      {
        text: "DevOps",
        items: [{ text: "Operations", link: "/operations" }],
      },
      {
        text: "End Users",
        items: [{ text: "How to Use It", link: "/usage" }],
      },
    ],
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/Miragon/miragon-ai",
      },
    ],
    search: {
      provider: "local",
    },
    outline: { level: [2, 3] },
    // No themeConfig.footer: the default theme hides it on sidebar pages,
    // which would leave the legally required Impressum/Datenschutz links off
    // most docs pages. They render on every page via the LegalFooter
    // component in the layout-bottom slot (theme/index.ts) instead.
  },
})
