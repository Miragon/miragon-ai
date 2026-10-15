// The Pulse docs site, built with the Miragon docs kit (docs/.vitepress/miragon/,
// vendored unchanged from Miragon/corporate-identity, skill docs-site). The kit sets
// everything else: base from DOCS_BASE (the repo name, set in .github/workflows/docs.yml),
// theme, colours light and dark, GitHub anchors, Mermaid, search, the legal row.
import { miragonDocs } from "./miragon/config"

export default miragonDocs({
  repo: "Miragon/miragon-ai",
  // The product name. Miragon AI is the family of all tools, this repo is Pulse.
  // The repo, the Docker image, the @miragon-ai/* packages and the MCP server name
  // still say "miragon-ai" until #415 renames them.
  title: "Miragon Pulse",
  siteTitle: "Pulse",
  description:
    "Pulse, part of Miragon AI: operate and analyse your Camunda 7, CIB seven and Operaton engines from Claude, ChatGPT or any other MCP client.",
  productPage: "https://miragon.ai/tools/pulse/",
  footerMessage: "Released under the MIT License.",

  // README.md is the index for reading the pages on GitHub; the site's index is
  // index.md.
  srcExclude: ["README.md"],

  nav: [
    { text: "Getting started", link: "/getting-started" },
    { text: "Usage", link: "/usage" },
    { text: "Operations", link: "/operations" },
    { text: "Architecture", link: "/architecture" },
    { text: "Developers", link: "/developer" },
  ],

  sidebar: [
    {
      text: "Start",
      items: [
        { text: "Getting started", link: "/getting-started" },
        { text: "Usage", link: "/usage" },
      ],
    },
    {
      text: "Reference",
      items: [
        { text: "Operations", link: "/operations" },
        { text: "Architecture", link: "/architecture" },
        { text: "Developer guide", link: "/developer" },
      ],
    },
  ],
})
