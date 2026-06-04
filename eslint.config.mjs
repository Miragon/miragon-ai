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
            "apps/mcp-gateway/src/ui/*.ts",
            "apps/mcp-gateway/src/ui/*.tsx",
            "apps/mcp-gateway/vite.config.ts",
            "packages/mcp-analytics/src/widgets/*.ts",
            "packages/mcp-analytics/src/widgets/*.tsx",
            "packages/mcp-cibseven/src/widgets/*.ts",
            "packages/mcp-cibseven/src/widgets/*.tsx",
            "packages/mcp-cibseven/src/widgets/incident-detail/*.ts",
            "packages/mcp-cibseven/src/widgets/incident-detail/*.tsx",
            "packages/mcp-cibseven/src/widgets/process-incidents/*.ts",
            "packages/mcp-cibseven/src/widgets/process-incidents/*.tsx",
            "packages/mcp-cibseven/src/widgets/bpmn-viewer/*.ts",
            "packages/mcp-cibseven/src/widgets/bpmn-viewer/*.tsx",
            "packages/mcp-cibseven/src/widgets/cockpit-dashboard/*.ts",
            "packages/mcp-cibseven/src/widgets/cockpit-dashboard/*.tsx",
            "packages/mcp-cibseven/src/widgets/incidents-dashboard/*.ts",
            "packages/mcp-cibseven/src/widgets/incidents-dashboard/*.tsx",
            "packages/mcp-cibseven/src/widgets/task-dashboard/*.ts",
            "packages/mcp-cibseven/src/widgets/task-dashboard/*.tsx",
            "packages/mcp-cibseven/src/widgets/process-instances/*.ts",
            "packages/mcp-cibseven/src/widgets/process-instances/*.tsx",
            "packages/mcp-cibseven/src/widgets/cockpit-app/*.ts",
            "packages/mcp-cibseven/src/widgets/cockpit-app/*.tsx",
            "packages/mcp-analytics/src/widgets/analytics-dashboard/*.ts",
            "packages/mcp-analytics/src/widgets/analytics-dashboard/*.tsx",
            "packages/mcp-analytics/src/widgets/bpmn-heatmap/*.ts",
            "packages/mcp-analytics/src/widgets/bpmn-heatmap/*.tsx",
            "packages/mcp-analytics/src/widgets/failure-dashboard/*.ts",
            "packages/mcp-analytics/src/widgets/failure-dashboard/*.tsx",
            "packages/mcp-cibseven/vitest.config.ts",
            "packages/client-analytics/vitest.config.ts",
            "packages/client-cibseven/openapi-ts.config.ts",
            "docs/.vitepress/config.ts",
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 64,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
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
