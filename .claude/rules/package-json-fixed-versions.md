---
paths:
  - "**/package.json"
---

# Always use fixed dependency versions

Never use version ranges (`^`, `~`, `>=`, `*`) in `package.json`.
Always pin to an exact version (e.g. `"eslint": "9.39.4"`).

This applies to `dependencies`, `devDependencies`, and `peerDependencies`.

When adding a new dependency: install it first with `pnpm add`, then read the exact installed version from `pnpm list` or `pnpm-lock.yaml` and write that exact version into `package.json`.
