# Development Workflow and Tests

[Development index](README.md) · [简体中文](../../zh-CN/developer/development.md) · [Resource synchronization](resource-sync.md)

## Environment

- Node.js 22
- pnpm 11, following the repository's lockfile policy
- Chromium for browser regression tests

Install dependencies:

```bash
pnpm install
pnpm exec playwright install chromium
```

The editor does not need node_modules at runtime. Dependencies are for development-time formatting, synchronization scripts, and automated tests.

## Common commands

```bash
# Format source files and documentation
pnpm format

# Formatting and JavaScript syntax checks
pnpm check

# Node.js unit tests
pnpm test:frontend

# Chromium browser tests
pnpm test:wynntils-browser

# Full test suite
pnpm test

# Snapshot checks
pnpm check:wynntils-functions
pnpm check:wynntils-resources

# Whitespace check
git diff --check
```

Snapshot checks access GitHub. Set GITHUB_TOKEN to improve API rate limits, but never write the token to files, logs, or commits.

## Directory boundaries

- index.html: static entry point, form, and accessibility markup.
- styles.css: layout, responsive styles, and theme variables.
- js/template-parser.js: Wynntils expression parsing and source ranges.
- js/editor-core.js: editor compatibility facade, validation, and example configuration.
- js/editor-formatting.js: formatting, format-code scanning, color application, and text insertion.
- js/template-simulator.js: safe simulation with fixed example state.
- js/canvas-renderer.js: formatting codes, font providers, control sequences, and Canvas glyph rendering.
- js/preview-controller.js: preview state, warnings, and render scheduling.
- js/function-catalog.js: function index, aliases, categories, search, and insertion examples.
- js/function-browser.js: function-catalog keyboard and DOM interactions.
- js/ai-assistant.js: AI requests, response parsing, tool calls, and proposal guards.
- js/ai-controller.js: AI form state and page-controller integration.
- js/simulation-profile.js: fixed example game state.
- js/functions.generated.js, js/functions.zh.js, js/resources.generated.js: generated snapshots; do not edit manually.
- tests/editor.test.js: Node.js unit and contract tests.
- tests/browser/editor.spec.js: headless Chromium regression tests.
- scripts/sync-functions.mjs, scripts/sync-resources.mjs, scripts/check-js.mjs: function/font resource synchronization and JavaScript syntax checks.
- tests/browser/static-server.mjs: local static server used by the browser regression tests.

Browsers load ordinary scripts in a fixed order without a bundler. When adding a module, update the loading order and startup check in index.html, the syntax-check script, and the tests.

## Change principles

1. Read the call chain and related tests before changing behavior.
2. Keep parser, simulator, and Canvas definitions consistent for the same format.
3. Use explicit placeholders and warnings for functions that cannot be simulated reliably; do not invent live values.
4. Use safe DOM APIs for external input; never concatenate model or remote API text into innerHTML.
5. Enforce the total preview text budget and never execute user-provided regular expressions on the main thread.
6. Check desktop, 767px, 719px, and 360px responsive layouts so fixed regions do not cover content.

## Pre-submit checklist

- pnpm format
- pnpm check
- pnpm test
- pnpm check:wynntils-functions
- pnpm check:wynntils-resources
- git diff --check
- Verify links, commands, and version notes in both README files and the matching language docs.

For documentation-only changes, at minimum run pnpm format, pnpm check, and git diff --check; a full pnpm test is still recommended before delivery.
