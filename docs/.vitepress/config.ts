import { withMermaid } from "vitepress-plugin-mermaid"

export default withMermaid({
  title: "Miragon AI Platform",
  description:
    "AI-driven process management for Camunda 7 / CIB Seven via the Model Context Protocol.",
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: "Architecture", link: "/architecture" },
      { text: "Developers", link: "/developer" },
      { text: "Operations", link: "/operations" },
      { text: "Usage", link: "/usage" },
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
        link: "https://github.com/miragon/miragon-ai",
      },
    ],
    search: {
      provider: "local",
    },
    outline: { level: [2, 3] },
  },
})
