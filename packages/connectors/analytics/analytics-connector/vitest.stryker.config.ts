import { defineConfig, mergeConfig } from "vitest/config"
import base from "./vitest.config"

// Mutation runs (Stryker) execute the suite hundreds of times against mutated
// sources — coverage collection would only slow that down, and the coverage
// THRESHOLDS would poison the result: a threshold failure reads as a killed
// mutant even when every test passed.
const config = mergeConfig(base, defineConfig({ test: { coverage: { enabled: false } } }))

// Server-side suites only (mergeConfig would CONCAT include arrays, so this is
// assigned after the merge): the widget DOM suites (`*.test.tsx`) need the
// per-file isolation that the Stryker vitest runner disables for speed, and
// the mutation scope (no widget files) is covered by the `.test.ts` suites.
config.test!.include = ["src/**/*.test.ts"]

export default config
