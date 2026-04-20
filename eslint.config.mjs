import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/generated/**", "vendor/**"] },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // UI/widget files are excluded from tsconfig (compiled by Vite/bundler directly)
          allowDefaultProject: [
            "server/src/ui/*.ts",
            "server/src/ui/*.tsx",
            "modules/analytics/mcp/src/widgets/*.ts",
            "modules/analytics/mcp/src/widgets/*.tsx",
            "modules/camunda7/mcp/src/widgets/*.ts",
            "modules/camunda7/mcp/src/widgets/*.tsx",
            "modules/enrichment/client/vitest.config.ts",
            "modules/enrichment/mcp/vitest.config.ts",
            "modules/analytics/client/vitest.config.ts",
            "modules/camunda7/client/openapi-ts.config.ts",
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 16,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      // Downgraded to warn: mcp-use and ClickHouse libs have poor type coverage (Phase 1)
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
    files: ["server/src/**/*.{ts,tsx}", "modules/**/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs["recommended-latest"].rules,
  },
)
