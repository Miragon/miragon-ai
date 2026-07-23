# Changelog

## [1.0.0](https://github.com/Miragon/miragon-ai/compare/v0.2.1...v1.0.0) (2026-07-23)


### ⚠ BREAKING CHANGES

* drop upstream/proxy federation — an external MCP gateway takes over ([#162](https://github.com/Miragon/miragon-ai/issues/162))

### Features

* dialect-true package composition — renames, module contract, engine provider port ([#167](https://github.com/Miragon/miragon-ai/issues/167)) ([c1d737f](https://github.com/Miragon/miragon-ai/commit/c1d737f0299dda7a573bd453dcb887ad333bfe28))
* **docs:** cookie consent via consentmanager, like the marketing site ([#151](https://github.com/Miragon/miragon-ai/issues/151)) ([c88b750](https://github.com/Miragon/miragon-ai/commit/c88b750ebf7c8e1a3aec010a86c917c0354cd0a7))
* **docs:** hero "Try it out" button opens the MCP inspector ([#152](https://github.com/Miragon/miragon-ai/issues/152)) ([37b20dc](https://github.com/Miragon/miragon-ai/commit/37b20dcad09f85025b848ad0555a3ce670615157))
* **docs:** prominent "Try it out" CTA with example prompt ([#153](https://github.com/Miragon/miragon-ai/issues/153)) ([5c63368](https://github.com/Miragon/miragon-ai/commit/5c6336811a2303c783c0f5a12b15a23876aca2e2))
* **docs:** redesign the landing hero around a live conversation ([#154](https://github.com/Miragon/miragon-ai/issues/154)) ([fe654f9](https://github.com/Miragon/miragon-ai/commit/fe654f99c99b31278af7849fb6f0a9a61a9ce64e))
* drop upstream/proxy federation — an external MCP gateway takes over ([#162](https://github.com/Miragon/miragon-ai/issues/162)) ([ad09d8a](https://github.com/Miragon/miragon-ai/commit/ad09d8a9293f9ef781e08b83a0bbbd5dbcd1fdad))
* OAuth resource-server, engine token passthrough, per-engine auth ([#144](https://github.com/Miragon/miragon-ai/issues/144)) ([2ae5094](https://github.com/Miragon/miragon-ai/commit/2ae5094f6bbce49902c24e96391e3587837f2c91))
* **playground:** reset the Fly.io playground nightly at midnight ([#157](https://github.com/Miragon/miragon-ai/issues/157)) ([c308742](https://github.com/Miragon/miragon-ai/commit/c3087421eeb7b938639181bf0fb1e96362a8c5fd))
* replace examples/ with deployable playground (Compose + Fly.io) ([#146](https://github.com/Miragon/miragon-ai/issues/146)) ([cf09d6a](https://github.com/Miragon/miragon-ai/commit/cf09d6a381889dc73c50f41716da5b20b3f5c0f7))
* repo-review remediation — bugfixes, shared widget primitives, generic shell widgets ([#158](https://github.com/Miragon/miragon-ai/issues/158)) ([51263b2](https://github.com/Miragon/miragon-ai/commit/51263b2f8f24fc48f9f9611910a049f21ab45e16))
* UI review remediation — shared primitives, engine-safe mutations, a11y/i18n fixes ([#168](https://github.com/Miragon/miragon-ai/issues/168)) ([e673992](https://github.com/Miragon/miragon-ai/commit/e6739925f6d9e0f459d65b24182c6bab609fb72d))

## [0.2.1](https://github.com/Miragon/miragon-ai/compare/v0.2.0...v0.2.1) (2026-06-22)


### Bug Fixes

* **docker:** install pnpm directly, node:26 dropped corepack ([#135](https://github.com/Miragon/miragon-ai/issues/135)) ([f664c8e](https://github.com/Miragon/miragon-ai/commit/f664c8e83df0f5d8f44dd116c2356b2ef38a1da8))

## [0.2.0](https://github.com/Miragon/miragon-ai/compare/v0.1.0...v0.2.0) (2026-06-22)


### Features

* add Camunda 7 ops skills + supporting MCP tools ([#40](https://github.com/Miragon/miragon-ai/issues/40)) ([4309afd](https://github.com/Miragon/miragon-ai/commit/4309afdf4e052d55ef8228ac7d343ca0a5460cfa))
* add testdata ([#36](https://github.com/Miragon/miragon-ai/issues/36)) ([3e087a6](https://github.com/Miragon/miragon-ai/commit/3e087a624fb4bf1d494efda8218895c1b4f13654))
* AI-first audit fixes, stages 1-4 — feedback loops, knowledge & tests, MCP tool surface, contracts & publishing ([#124](https://github.com/Miragon/miragon-ai/issues/124)) ([673c3c3](https://github.com/Miragon/miragon-ai/commit/673c3c3609cf6213e30924326140cc9807c1edb0))
* **analytics:** render path frequency as BPMN heatmap ([#60](https://github.com/Miragon/miragon-ai/issues/60)) ([b68b18d](https://github.com/Miragon/miragon-ai/commit/b68b18d1de55f4af66a17c326e6b364aab51dc96))
* **analytics:** self-fetching failure widgets + manifest descriptions ([#80](https://github.com/Miragon/miragon-ai/issues/80)) ([7d52658](https://github.com/Miragon/miragon-ai/commit/7d52658925c7139ef7818e42cc212ccbe75931b8))
* **analytics:** version-compare tool, version-aware path-frequency, realistic seed timings ([#75](https://github.com/Miragon/miragon-ai/issues/75)) ([2413a46](https://github.com/Miragon/miragon-ai/commit/2413a46666cfb1678d79f313e47e8067f3feedb1))
* **bpmn-viewer:** accept processDefinitionKey + version as alternative to processInstanceId ([#81](https://github.com/Miragon/miragon-ai/issues/81)) ([25326ad](https://github.com/Miragon/miragon-ai/commit/25326ad3cd65f0cdbfb230141c3793242a7acfd4))
* **bpmn-viewer:** improve alignment and zoom controls in incident panel ([#54](https://github.com/Miragon/miragon-ai/issues/54)) ([4269f09](https://github.com/Miragon/miragon-ai/commit/4269f09ed67a2887cb48bd6a58b0b356f83d1a84))
* **bpmn-viewer:** re-fit zoom on fullscreen toggle and resize ([#74](https://github.com/Miragon/miragon-ai/issues/74)) ([fca00a7](https://github.com/Miragon/miragon-ai/commit/fca00a720526c0d7c115e32e77e2a8f7e5467f3d))
* **builder:** per-cell scoping for self-fetching widgets ([#71](https://github.com/Miragon/miragon-ai/issues/71)) ([086747c](https://github.com/Miragon/miragon-ai/commit/086747c56e66b8ad9c61fdb6f90ef4b9586c549b))
* Camunda Cockpit MCP + Analytics dashboards + client package refactor ([#14](https://github.com/Miragon/miragon-ai/issues/14)) ([265336c](https://github.com/Miragon/miragon-ai/commit/265336c5e10a06e1a790946f4cdad8407e2b0e92))
* **camunda7:** user profile & settings + i18n (localized summaries & widgets) ([#126](https://github.com/Miragon/miragon-ai/issues/126)) ([7cddd4c](https://github.com/Miragon/miragon-ai/commit/7cddd4cbbede55af6790722a7c0d7ccc156739c1))
* **cockpit:** CI-style process views + host-bridge navigation ([#55](https://github.com/Miragon/miragon-ai/issues/55)) ([c3997c5](https://github.com/Miragon/miragon-ai/commit/c3997c5a65525f4d8a6b3861a43300983791b151))
* **cockpit:** consolidated client-side CIB Seven cockpit (v4) ([#96](https://github.com/Miragon/miragon-ai/issues/96)) ([b32232d](https://github.com/Miragon/miragon-ai/commit/b32232df717b632f252ce8cfc5939e11512d714b))
* dev-platform MVP — T4 + T7 + T8 + T9 + T10 + T11 + T13 ([#35](https://github.com/Miragon/miragon-ai/issues/35)) ([ecdb8fe](https://github.com/Miragon/miragon-ai/commit/ecdb8fe4f9c4590ac299a91d157c35987d092648))
* **docker:** add mcp-server to compose stack ([#42](https://github.com/Miragon/miragon-ai/issues/42)) ([107648f](https://github.com/Miragon/miragon-ai/commit/107648f2a7a8faf6897718680bef858bc105b2d8))
* **docs:** replace GitBook with lightweight VitePress site ([#84](https://github.com/Miragon/miragon-ai/issues/84)) ([80e9aaa](https://github.com/Miragon/miragon-ai/commit/80e9aaaee423eb17f37cd3a4376e7f3b632f9f3e))
* **history:** populate trace_id in camunda history tables ([#62](https://github.com/Miragon/miragon-ai/issues/62)) ([b7b4249](https://github.com/Miragon/miragon-ai/commit/b7b4249e4aa358a007a71eb7bccb3cea71182058))
* **incident-detail:** add per-incident analysis view with OTEL logs ([#61](https://github.com/Miragon/miragon-ai/issues/61)) ([5fbfc79](https://github.com/Miragon/miragon-ai/commit/5fbfc79a189221fb9ec939a535df7c096424690c))
* **incident-panel:** distinct panels for incidents ([#53](https://github.com/Miragon/miragon-ai/issues/53)) ([b4d1330](https://github.com/Miragon/miragon-ai/commit/b4d13308fcd95c59d5f29c9f475bcbd7bd30fcc5))
* **incidents:** MCP tool + prompt to file engine incidents as GitHub issues ([#66](https://github.com/Miragon/miragon-ai/issues/66)) ([#72](https://github.com/Miragon/miragon-ai/issues/72)) ([daa73fb](https://github.com/Miragon/miragon-ai/commit/daa73fb0af309bb2fa9a4181366a6d73ac218112))
* initialize miragon.ai ([2a93770](https://github.com/Miragon/miragon-ai/commit/2a93770c272729befa0167ff9187acf776f9effc))
* **miravelo:** standalone leasing-application upstream + bpmn-viewer consolidation ([#82](https://github.com/Miragon/miragon-ai/issues/82)) ([d51c0c1](https://github.com/Miragon/miragon-ai/commit/d51c0c16a05a6db87e5118a20fec01d449843a88))
* **multi-engine:** route operations + analytics across multiple CIB Seven engines ([#91](https://github.com/Miragon/miragon-ai/issues/91)) ([ef492e6](https://github.com/Miragon/miragon-ai/commit/ef492e643a3c6732e2bac81ec2a4a213c223bd87))
* **release:** GHCR pipeline for the MCP server + correct engine-plugin namespace ([#128](https://github.com/Miragon/miragon-ai/issues/128)) ([a2d4f54](https://github.com/Miragon/miragon-ai/commit/a2d4f54bcb239ebc15db344a7b58fd1fda6681a6))
* replace loanApproval/orderFulfillment demos with Miravelo showcase ([#43](https://github.com/Miragon/miragon-ai/issues/43)) ([362b9a9](https://github.com/Miragon/miragon-ai/commit/362b9a9013e38e28014a38e207d517c240f99a2a))
* **task-form:** customer support order lookup + generic task completion form ([#64](https://github.com/Miragon/miragon-ai/issues/64)) ([046d2ab](https://github.com/Miragon/miragon-ai/commit/046d2ab0b34434bec882123b8ba863c19b6ca1ca))
* **task-form:** use embedded BPMN form definition instead of variable inference ([#69](https://github.com/Miragon/miragon-ai/issues/69)) ([63fa024](https://github.com/Miragon/miragon-ai/commit/63fa0244a9df51c7c569ef47c802822cb1acf0b6))
* **widget-shell:** use full width in fullscreen mode ([#59](https://github.com/Miragon/miragon-ai/issues/59)) ([3d706da](https://github.com/Miragon/miragon-ai/commit/3d706daa7683fb79b79890b0d994e645371a7e0e))
* **widgets:** shadcn token system + dark mode, a11y, color & state fixes ([#94](https://github.com/Miragon/miragon-ai/issues/94)) ([7938574](https://github.com/Miragon/miragon-ai/commit/7938574c0da4ff77f031704d7ef17149b3197ea1))


### Bug Fixes

* **analytics:** forward per-cell props in split dashboard widgets ([#79](https://github.com/Miragon/miragon-ai/issues/79)) ([f679ec2](https://github.com/Miragon/miragon-ai/commit/f679ec297f0b973d17a7435531961ea7817a5386))
* **analytics:** make failure & analytics dashboards render in render-view ([#57](https://github.com/Miragon/miragon-ai/issues/57)) ([92a1277](https://github.com/Miragon/miragon-ai/commit/92a1277e6a7f6f523e2ab36472fd26f6cb7b3474))
* **cibseven:** resolve render-view step client from the engine registry ([#97](https://github.com/Miragon/miragon-ai/issues/97)) ([eeaf741](https://github.com/Miragon/miragon-ai/commit/eeaf741b3af79da62bbe992576f2156d4de88ade))
* dev startup, missing enrichment config, and Docker build issues ([#50](https://github.com/Miragon/miragon-ai/issues/50)) ([58b6cec](https://github.com/Miragon/miragon-ai/commit/58b6cec818f3b44142067e049e0b5b5b34af0bc5))
* **heatmap:** colorize full canvas on retina displays ([#68](https://github.com/Miragon/miragon-ai/issues/68)) ([ecd6fc0](https://github.com/Miragon/miragon-ai/commit/ecd6fc09ac0039fd0a6c9ba49e5f660136d57e4e))
* **tooling:** create verified commits via GraphQL API ([#26](https://github.com/Miragon/miragon-ai/issues/26)) ([854d591](https://github.com/Miragon/miragon-ai/commit/854d5915472187881be8c1699b38078a402bfc8d))
* **tooling:** use GITHUB_TOKEN for push and PR operations in auto-format bot ([#24](https://github.com/Miragon/miragon-ai/issues/24)) ([73410e8](https://github.com/Miragon/miragon-ai/commit/73410e84dd19709daf7562f567bbad9f5ff1b135))
* **tooling:** use GITHUB_TOKEN for push, TOOLKIT_PAT for PR creation ([0d650f7](https://github.com/Miragon/miragon-ai/commit/0d650f7a71400a988c1d5c9d269eedbbd6c4e840))
* **ui:** route render-view through framework McpAppView shell ([#48](https://github.com/Miragon/miragon-ai/issues/48)) ([aaa08ae](https://github.com/Miragon/miragon-ai/commit/aaa08ae8cab05c1b7c24a2b1ab69dacbe1fcaa43))


### Reverts

* **deps:** pin spring-boot back to 3.5.6 (CIB Seven 2.1 incompat) ([#63](https://github.com/Miragon/miragon-ai/issues/63)) ([a79ea1c](https://github.com/Miragon/miragon-ai/commit/a79ea1cb1f07c347b4c83edd59200435beaf4daf))

## Changelog

All notable changes to this project are documented here. This file is maintained
automatically by [release-please](https://github.com/googleapis/release-please) from
Conventional Commit messages — do not edit it by hand.
