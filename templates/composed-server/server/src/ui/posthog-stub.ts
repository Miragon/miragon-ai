/**
 * No-op stand-in aliased over `posthog-js` (see vite.config.ts): mcp-use
 * dynamic-imports posthog for its own telemetry, which the bundle would
 * force-inline (~180 KB). This server sends no telemetry, so the stub keeps
 * the interface mcp-use touches and drops the weight.
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
