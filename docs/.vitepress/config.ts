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
  },
})
