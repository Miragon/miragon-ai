/**
 * Architecture fitness functions — the dependency half of the CLAUDE.md
 * "Architecture invariants" made executable. Runs as `pnpm lint:architecture`
 * (chained into the root `pnpm lint`, so CI's quality job enforces it).
 *
 * Rule comments are written for the (human or AI) contributor who trips them:
 * each names the house path to use instead of the forbidden edge.
 *
 * Layout + naming carry the layer semantics: connector modules live at
 * `packages/connectors/<family>/<name>-connector` (npm
 * `@miragon-ai/<name>-connector`), their SDK leaves at
 * `packages/connectors/<family>/<name>-client` (npm
 * `@miragon-ai/<name>-client`), and the foundation packages under
 * `packages/core/` (npm names without a role suffix, e.g.
 * `@miragon-ai/widget-shell`). The rules below key on exactly these
 * conventions — a new package that follows them is covered without touching
 * this file; one that breaks them falls OUT of the rules, so don't.
 *
 * Workspace imports (`@miragon-ai/*`) resolve through pnpm's node_modules
 * symlinks; `preserveSymlinks: true` below keeps them as `node_modules/...`
 * paths so the rules can distinguish a package-entry import from a relative
 * escape into a sibling's source tree. Rule patterns therefore match both shapes:
 * `^packages/...` (relative escape) and `@miragon-ai/...` (package entry).
 */
module.exports = {
  forbidden: [
    {
      name: "connectors-are-peers",
      severity: "error",
      comment:
        "Connector modules are self-contained peers and never import each other (CLAUDE.md invariant 8). " +
        "Cross-module needs go through the composition root: shared server data via SharedResources " +
        "(apps/mcp-server-camunda7/src/module-contract.ts), cross-module UI via shell:* widgets " +
        "(props.dataKey) or raw tool-name strings with graceful degradation.",
      from: { path: "^packages/connectors/[^/]+/([^/]+)-connector/" },
      to: {
        path: ["^packages/connectors/.+-connector/", "@miragon-ai/[^/]+-connector(/|$)"],
        pathNot: ["^packages/connectors/[^/]+/$1-connector/", "@miragon-ai/$1-connector(/|$)"],
      },
    },
    {
      name: "connectors-own-their-client",
      severity: "error",
      comment:
        "A connector may only depend on its own client package (analytics-connector → " +
        "analytics-client). Engine data a foreign module needs arrives as an injected port on " +
        "SharedResources — the pattern is fetchBpmnXml, which feeds the analytics heatmap without " +
        "giving the analytics connector an engine-SDK dependency (CLAUDE.md invariant 8).",
      from: { path: "^packages/connectors/[^/]+/([^/]+)-connector/" },
      to: {
        path: ["^packages/connectors/.+-client/", "@miragon-ai/[^/]+-client(/|$)"],
        pathNot: ["^packages/connectors/[^/]+/$1-client/", "@miragon-ai/$1-client(/|$)"],
      },
    },
    {
      name: "clients-are-leaves",
      severity: "error",
      comment:
        "*-client packages are SDK leaves (generated REST SDK / PromQL queries + Zod schemas): " +
        "they never import connectors, the core packages, sibling clients, or the app. Shared " +
        "logic that grows here belongs in the connector layer or a core package, not in a client.",
      from: { path: "^packages/connectors/[^/]+/([^/]+)-client/" },
      to: {
        path: ["^packages/(core|connectors)/", "^apps/", "@miragon-ai/"],
        pathNot: ["^packages/connectors/[^/]+/$1-client/", "@miragon-ai/$1-client(/|$)"],
      },
    },
    {
      name: "core-is-foundation",
      severity: "error",
      comment:
        "packages/core/* is the shared foundation underneath every connector — it depends on the " +
        "toolkit (and core siblings) only. When a connector needs something a sibling already has, " +
        "extract it INTO a core package (on the second concrete consumer), never make core reach " +
        "up into a connector.",
      from: { path: "^packages/core/" },
      to: {
        path: [
          "^packages/connectors/",
          "^apps/",
          "@miragon-ai/[^/]+-(connector|client)(/|$)",
          "@miragon-ai/mcp-server-camunda7",
        ],
      },
    },
    {
      name: "packages-never-import-the-app",
      severity: "error",
      comment:
        "The app is a thin composition root ON TOP of the packages (CLAUDE.md invariant 8). " +
        "Anything a package needs from the app must be inverted into an injected port — " +
        "see SharedResources in apps/mcp-server-camunda7/src/module-contract.ts.",
      from: { path: "^packages/" },
      to: { path: ["^apps/", "@miragon-ai/mcp-server-camunda7"] },
    },
    {
      name: "no-cross-package-deep-imports",
      severity: "error",
      comment:
        "Never reach into a sibling package's source tree by relative path — import its public " +
        "entry (@miragon-ai/<pkg>, or a subpath like @miragon-ai/widget-shell/widgets) so the " +
        "exports map stays the contract between packages.",
      from: { path: "^(apps/[^/]+|packages/core/[^/]+|packages/connectors/[^/]+/[^/]+)/" },
      to: { path: "^(packages|apps)/", pathNot: "^$1/" },
    },
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Runtime import cycle — break it by extracting the shared piece into its own module " +
        "or by inverting the dependency (type-only cycles are tolerated).",
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ["type-only"] } },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: ["/generated/"] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    // Keep workspace imports as node_modules/@miragon-ai/* paths instead of
    // resolving the pnpm symlink to the sibling package's real path — the
    // rules above rely on the two shapes staying distinguishable.
    preserveSymlinks: true,
  },
}
