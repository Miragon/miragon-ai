import { defineConfig } from "vitepress"
import { withMermaid } from "vitepress-plugin-mermaid"

// GitHub Pages serves the project site under /miragon-ai/, and the docs
// workflow (.github/workflows/docs.yml) sets DOCS_BASE accordingly.
// Local dev and preview keep the default "/".
const base = process.env.DOCS_BASE ?? "/"

// withMermaid renders the ```mermaid fences (architecture.md) as diagrams.
export default withMermaid(
  defineConfig({
    base,
    lang: "en-US",
    // The product name (corporate design: a tool is "Miragon" plus its name);
    // the repo, the Docker image, the @miragon-ai/* packages and the MCP
    // server name keep "miragon-ai".
    title: "Miragon Pulse",
    description:
      "Pulse, the miragon-ai MCP server: operate and analyse your Camunda 7, CIB seven and Operaton engines from Claude, ChatGPT or any other MCP client.",
    cleanUrls: true,
    lastUpdated: true,

    // README.md is the index for reading the pages on GitHub; the site's
    // index is index.md.
    srcExclude: ["README.md"],

    // Pre-bundle mermaid for the dev server: it imports CommonJS packages
    // (fastdom since mermaid 11.17) that vitepress-plugin-mermaid's own
    // optimizeDeps list doesn't name, and without this `pnpm docs:dev` renders
    // no diagram. The build is unaffected.
    vite: { optimizeDeps: { include: ["mermaid"] } },

    // Code blocks sit on --cd-grau (light) and a white lift of --cd-schwarz
    // (dark). There, github-light-high-contrast and github-dark-default keep
    // every token colour at WCAG AA (the lowest, comments, at 4.72:1 and
    // 4.98:1); VitePress' default pair github-light/github-dark and
    // github-light-default (comments 4.26:1 on --cd-grau) don't.
    markdown: {
      theme: { light: "github-light-high-contrast", dark: "github-dark-default" },
    },

    head: [
      // The app icon of Miragon software: the green Komet on the blue tile,
      // the CI's file unchanged. Head links are not rewritten for `base`.
      ["link", { rel: "icon", type: "image/svg+xml", href: `${base}logo/miragon-komet-blau.svg` }],
      // CI primary blue (--cd-blau) for the browser chrome
      ["meta", { name: "theme-color", content: "#335DE5" }],
    ],

    // Preload the self-hosted Geist (hashed file name, so a static head link
    // can't point at it; see vitepress.dev site-config#transformhead).
    transformHead({ assets }) {
      const geist = assets.find((file) => /geist-latin-wght-normal\.[\w-]+\.woff2$/.test(file))
      if (!geist) return
      return [
        ["link", { rel: "preload", href: geist, as: "font", type: "font/woff2", crossorigin: "" }],
      ]
    },

    themeConfig: {
      // The official wordmarks: green (the standard) on light, white on dark.
      logo: {
        light: "/logo/miragon-logo-gruen.svg",
        dark: "/logo/miragon-logo-weiss.svg",
        alt: "Miragon",
      },
      // A product shows the wordmark and writes its name next to it in Geist;
      // the wordmark already reads MIRAGON, so the nav reads "MIRAGON Pulse".
      siteTitle: "Pulse",
      nav: [
        { text: "Getting started", link: "/getting-started" },
        { text: "Usage", link: "/usage" },
        { text: "Operations", link: "/operations" },
        { text: "Architecture", link: "/architecture" },
        { text: "Developers", link: "/developer" },
        { text: "miragon.ai", link: "https://miragon.ai/tools/pulse/" },
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

      socialLinks: [{ icon: "github", link: "https://github.com/Miragon/miragon-ai" }],

      outline: { level: [2, 3] },

      search: { provider: "local" },

      editLink: {
        pattern: "https://github.com/Miragon/miragon-ai/edit/main/docs/:path",
        text: "Edit this page on GitHub",
      },

      // A plain date in the site's language ("Oct 11, 2026"), not the reader's
      // short date and time ("10/11/26, 10:44 AM").
      lastUpdated: {
        text: "Last updated",
        formatOptions: { dateStyle: "medium", forceLocale: true },
      },

      // Say what happened and what to do, in sentence case (VitePress' default
      // is an all-caps "PAGE NOT FOUND" and a quote).
      notFound: {
        title: "This page doesn't exist",
        quote: "The link may be outdated. Search the docs, or start at the docs home.",
        linkLabel: "Go to the docs home",
        linkText: "Go to the docs home",
      },

      footer: {
        message: "Released under the MIT License.",
        copyright: "Copyright © Miragon",
      },
    },
  }),
)
