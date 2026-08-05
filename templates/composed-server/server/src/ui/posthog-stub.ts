/**
 * No-op stand-in aliased over `posthog-js` (see vite.config.ts). mcp-use's
 * McpUseProvider dynamic-imports posthog for its own telemetry; under
 * vite-singlefile the dynamic import is force-inlined, shipping ~180 KB of
 * analytics code into every widget iframe. The cockpit sends no telemetry, so
 * the stub keeps the interface mcp-use touches (init/capture/identify/reset)
 * and drops the weight.
 */
type Noop = (...args: unknown[]) => void
const noop: Noop = () => undefined

interface PosthogStub {
  init: () => PosthogStub
  capture: Noop
  identify: Noop
  reset: Noop
  register: Noop
  opt_in_capturing: Noop
  opt_out_capturing: Noop
}

const stub: PosthogStub = {
  init: () => stub,
  capture: noop,
  identify: noop,
  reset: noop,
  register: noop,
  opt_in_capturing: noop,
  opt_out_capturing: noop,
}

export default stub
export { stub as posthog }
