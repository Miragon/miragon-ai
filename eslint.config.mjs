import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"

// Widget/UI sources are excluded from the package tsconfigs (they are
// compiled by Vite/the bundler) and get their type information from the
// dedicated tsconfig.widgets.json / tsconfig.ui.json projects instead.
const bundledUiFiles = [
  "apps/mcp-gateway/src/ui/**/*.{ts,tsx}",
  "packages/mcp-analytics/src/widgets/**/*.{ts,tsx}",
  "packages/mcp-cibseven/src/widgets/**/*.{ts,tsx}",
]

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/generated/**", "vendor/**"] },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  // Typed linting via the project service for everything the package tsconfigs cover
  {
    ignores: bundledUiFiles,
    languageOptions: {
      parserOptions: {
        projectService: {
          // Standalone config files that are not part of any tsconfig
          allowDefaultProject: [
            "apps/mcp-gateway/vite.config.ts",
            "packages/mcp-cibseven/vitest.config.ts",
            "packages/client-analytics/vitest.config.ts",
            "packages/client-cibseven/openapi-ts.config.ts",
            "docs/.vitepress/config.ts",
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
          "apps/mcp-gateway/tsconfig.ui.json",
          "packages/mcp-analytics/tsconfig.widgets.json",
          "packages/mcp-cibseven/tsconfig.widgets.json",
        ],
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
    files: ["apps/mcp-gateway/src/**/*.{ts,tsx}", "packages/**/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs["recommended-latest"].rules,
  },
)
