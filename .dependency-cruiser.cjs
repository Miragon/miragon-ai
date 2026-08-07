/**
 * Architecture fitness functions — the dependency half of the CLAUDE.md
 * "Architecture invariants" made executable. Runs as `pnpm lint:architecture`
 * (chained into the root `pnpm lint`, so CI's quality job enforces it).
 *
 * Rule comments are written for the (human or AI) contributor who trips them:
 * each names the house path to use instead of the forbidden edge.
 *
 * Workspace imports (`@miragon-ai/*`) resolve through pnpm's node_modules
 * symlinks; `preserveSymlinks: true` below keeps them as `node_modules/...`
 * paths so the rules can distinguish a package-entry import from a relative
 * escape into a sibling's source tree. Rule patterns therefore match both shapes:
 * `^packages/<pkg>` (relative escape) and `@miragon-ai/<pkg>` (package entry).
 */
module.exports = {
  forbidden: [
    {
      name: "modules-are-peers",
      severity: "error",
      comment:
        "mcp-* modules are self-contained peers and never import each other (CLAUDE.md invariant 8). " +
        "Cross-module needs go through the composition root: shared server data via SharedResources " +
        "(apps/mcp-server-camunda7/src/module-contract.ts), cross-module UI via shell:* widgets " +
        "(props.dataKey) or raw tool-name strings with graceful degradation.",
      from: { path: "^packages/mcp-([^/]+)/" },
      to: {
        path: ["^packages/mcp-", "@miragon-ai/mcp-"],
        pathNot: ["^packages/mcp-$1/", "@miragon-ai/mcp-$1(/|$)"],
      },
    },
    {
      name: "modules-own-their-client",
      severity: "error",
      comment:
        "A module may only depend on its own client package (mcp-analytics → client-analytics). " +
        "Engine data a foreign module needs arrives as an injected port on SharedResources — " +
        "the pattern is fetchBpmnXml, which feeds the analytics heatmap without giving " +
        "mcp-analytics an engine-SDK dependency (CLAUDE.md invariant 8).",
      from: { path: "^packages/mcp-([^/]+)/" },
      to: {
        path: ["^packages/client-", "@miragon-ai/client-"],
        pathNot: ["^packages/client-$1/", "@miragon-ai/client-$1(/|$)"],
      },
    },
    {
      name: "clients-are-leaves",
      severity: "error",
      comment:
        "client-* packages are SDK leaves (generated REST SDK / PromQL queries + Zod schemas): " +
        "they never import modules, the widget kit, sibling clients, or the app. Shared logic " +
        "that grows here belongs in the module layer or widget-shell, not in a client.",
      from: { path: "^packages/client-([^/]+)/" },
      to: {
        path: [
          "^packages/(mcp-|widget-shell|client-)",
          "^apps/",
          "@miragon-ai/(mcp-|widget-shell|client-)",
        ],
        pathNot: ["^packages/client-$1/", "@miragon-ai/client-$1(/|$)"],
      },
    },
    {
      name: "widget-shell-is-foundation",
      severity: "error",
      comment:
        "widget-shell is the shared kit underneath every module — it depends on the toolkit only. " +
        "When a module needs something a sibling already has, extract it INTO widget-shell " +
        "(on the second concrete consumer), never make widget-shell reach up into a module.",
      from: { path: "^packages/widget-shell/" },
      to: {
        path: ["^packages/(mcp-|client-)", "^apps/", "@miragon-ai/(mcp-|client-)"],
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
      from: { path: "^(packages|apps)/([^/]+)/" },
      to: { path: "^(packages|apps)/", pathNot: "^$1/$2/" },
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
