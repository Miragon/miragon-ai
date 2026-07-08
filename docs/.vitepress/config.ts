import { withMermaid } from "vitepress-plugin-mermaid"

export default withMermaid({
  title: "Miragon AI Platform",
  description:
    "AI-driven process management for Camunda 7 / CIB Seven via the Model Context Protocol.",
  cleanUrls: true,
  lastUpdated: true,
  // Doc pages offer the normal light/dark toggle; the landing page alone
  // always carries the dark miragon.ai brand (scoped in theme/custom.css).
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
    ["link", { rel: "icon", type: "image/png", href: "/favicon.png" }],
    ["meta", { name: "theme-color", content: "#00e676" }],
  ],
  // Preload the self-hosted Inter Variable (hashed filename, so a static
  // head link can't point at it — see vitepress.dev site-config#transformhead).
  transformHead({ assets }) {
    const inter = assets.find((file) => /inter-latin-wght-normal\.[\w-]+\.woff2/.test(file))
    if (inter) {
      return [
        ["link", { rel: "preload", href: inter, as: "font", type: "font/woff2", crossorigin: "" }],
      ]
    }
  },
  themeConfig: {
    logo: { src: "/logo.svg", alt: "Miragon" },
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
    // Shown on pages without a sidebar (the landing page) — mirrors the
    // marketing site's footer incl. the legally required German links.
    footer: {
      message:
        '<a href="https://www.miragon.io/datenschutz/" target="_blank" rel="noopener noreferrer">Privacy</a> · <a href="https://www.miragon.io/impressum/" target="_blank" rel="noopener noreferrer">Impressum</a>',
      copyright: "© 2022–2026 Miragon GmbH",
    },
  },
})
