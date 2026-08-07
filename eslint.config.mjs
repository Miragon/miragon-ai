import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"

// Widget/UI sources are excluded from the package tsconfigs (they are
// compiled by Vite/the bundler) and get their type information from the
// dedicated tsconfig.widgets.json / tsconfig.ui.json projects instead.
const bundledUiFiles = [
  "apps/mcp-server-camunda7/src/ui/**/*.{ts,tsx}",
  "packages/mcp-analytics/src/widgets/**/*.{ts,tsx}",
  "packages/mcp-camunda7/src/widgets/**/*.{ts,tsx}",
]

// Server tests (and the Playwright host simulation) live outside src/ (not
// part of the build tsconfig) and get their type information from the
// dedicated tsconfig.test.json project.
const serverTestFiles = [
  "apps/mcp-server-camunda7/test/**/*.ts",
  "apps/mcp-server-camunda7/test-host/**/*.ts",
]

// Ratchet debt: frozen high-water marks from the 2026-08-07 baseline
// measurement. Shrink-only lists — refactor a file below the global target
// (complexity 15 / 400 effective lines), then DELETE its entry. Never raise
// a value, never add an entry; new code gets the global budget.
const complexityRatchet = {}

// Frozen at current length rounded up to the next 10 lines.
const maxLinesRatchet = {
  "packages/mcp-camunda7/src/widget-tools.ts": 1030,
  "packages/mcp-camunda7/src/data/incident-panel-data.ts": 420,
  "packages/mcp-camunda7/src/data/incident-panel-data.test.ts": 420,
  "packages/mcp-camunda7/src/data/cockpit-data.ts": 410,
}

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/generated/**",
      "vendor/**",
      // Plain-node static server for the Playwright host simulation — not part
      // of any tsconfig project, deliberately untyped.
      "apps/mcp-server-camunda7/test-host/serve.mjs",
      // Standalone customer-facing workspace, outside the root pnpm workspace
      // and its tsconfig projects — verified by scripts/test-template.sh
      // (build + typecheck + tests) instead of the repo's typed linting.
      "templates/**",
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  // Typed linting via the project service for everything the package tsconfigs cover
  {
    ignores: [...bundledUiFiles, ...serverTestFiles],
    languageOptions: {
      parserOptions: {
        projectService: {
          // Standalone config files that are not part of any tsconfig
          allowDefaultProject: [
            "vitest.shared.ts",
            "apps/mcp-server-camunda7/vite.config.ts",
            "apps/mcp-server-camunda7/vitest.config.ts",
            "packages/mcp-analytics/vitest.config.ts",
            "packages/mcp-camunda7/vitest.config.ts",
            "packages/client-analytics/vitest.config.ts",
            "packages/client-camunda7/vitest.config.ts",
            "packages/client-camunda7/openapi-ts.config.ts",
            "packages/widget-shell/vitest.config.ts",
            "docs/.vitepress/config.ts",
            "docs/.vitepress/theme/index.ts",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Widget/UI files: typed via their dedicated tsconfig projects
  {
    files: bundledUiFiles,
    languageOptions: {
      parserOptions: {
        project: [
          "apps/mcp-server-camunda7/tsconfig.ui.json",
          "packages/mcp-analytics/tsconfig.widgets.json",
          "packages/mcp-camunda7/tsconfig.widgets.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Server test files: typed via the dedicated test tsconfig project
  {
    files: serverTestFiles,
    languageOptions: {
      parserOptions: {
        project: ["apps/mcp-server-camunda7/tsconfig.test.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      // Downgraded to warn: mcp-use has poor type coverage (Phase 1)
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/require-await": "warn",
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // React hooks for all UI/widget code
  {
    files: ["apps/mcp-server-camunda7/src/**/*.{ts,tsx}", "packages/**/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs["recommended-latest"].rules,
  },

  // ── Architecture pattern gates ──────────────────────────────────────────
  // The AST-checkable slices of the CLAUDE.md invariants; the dependency
  // rules live in .dependency-cruiser.cjs (`pnpm lint:architecture`).

  // Invariant 1: operations tools go through createToolRegistrar. Raw
  // server.tool() is reserved for the widget-tools path (show_* / *_data
  // feeds + module settings) — exactly the ignores list below. A durable
  // write registered there must gate itself against the module's toolset.
  {
    files: ["packages/mcp-analytics/src/**/*.ts", "packages/mcp-camunda7/src/**/*.ts"],
    ignores: [
      "packages/mcp-analytics/src/widget-tools.ts",
      "packages/mcp-analytics/src/settings-tools.ts",
      "packages/mcp-camunda7/src/widget-tools.ts",
      "packages/mcp-camunda7/src/tools/user-profile.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(tool|registerTool)$/]",
          message:
            "Operations tools are registered through createToolRegistrar in src/tools/ (see .claude/skills/add-bpm-feature); raw server.tool() is reserved for the widget-tools files.",
        },
      ],
    },
  },

  // Invariant 6: all date/time rendering in widgets goes through the
  // widget-shell format helpers so every module renders timestamps the same
  // way. Number#toLocaleString (thousands separators) is deliberately allowed.
  {
    files: [
      "apps/mcp-server-camunda7/src/ui/**/*.{ts,tsx}",
      "packages/mcp-analytics/src/widgets/**/*.{ts,tsx}",
      "packages/mcp-camunda7/src/widgets/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            ":matches(NewExpression, CallExpression)[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
          message:
            "Use formatTimestamp/formatDate/formatTime from @miragon-ai/widget-shell/widgets — the single source for timestamp rendering (CLAUDE.md invariant 6).",
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleDateString']",
          message:
            "Use formatDate from @miragon-ai/widget-shell/widgets instead of Date#toLocaleDateString (CLAUDE.md invariant 6).",
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleTimeString']",
          message:
            "Use formatTime from @miragon-ai/widget-shell/widgets instead of Date#toLocaleTimeString (CLAUDE.md invariant 6).",
        },
      ],
    },
  },

  // ── Ratchet metrics: complexity + file-length budgets ───────────────────
  // Global targets for all source code; the ratchet lists above freeze
  // today's offenders at their high-water mark.
  {
    files: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    rules: {
      complexity: ["error", 15],
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  // i18n message catalogs are data, not code — no length budget.
  {
    files: ["packages/*/src/messages/*.sweep.ts"],
    rules: { "max-lines": "off" },
  },
  ...Object.entries(complexityRatchet).map(([file, max]) => ({
    files: [file],
    rules: { complexity: ["error", max] },
  })),
  ...Object.entries(maxLinesRatchet).map(([file, max]) => ({
    files: [file],
    rules: { "max-lines": ["error", { max, skipBlankLines: true, skipComments: true }] },
  })),
)
