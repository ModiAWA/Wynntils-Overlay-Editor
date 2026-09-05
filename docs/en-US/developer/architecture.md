# Architecture and Data Flow

[Development index](README.md) · [简体中文](../../zh-CN/developer/architecture.md) · [Resource synchronization](resource-sync.md)

## Overall flow

```text
Static entry point
  ├─ Native textarea + highlight layer
  ├─ template-parser / editor-core
  │    └─ parsing, ranges, validation, and diagnostics
  ├─ template-simulator + simulation-profile
  │    └─ fixed example state, type checks, placeholders, and length budget
  └─ preview-controller
       └─ canvas-renderer
            └─ formatting codes, Color Templates, font providers, controls, glyphs
```

The page loads ordinary JavaScript files directly without a bundler. index.html controls script order and required-module checks; app.js assembles controllers while the stable editor contract remains in editor-core.js.

## Editing and highlighting

The native textarea is the only input source. The highlight layer derives a readable visual layer from the same text, preserving input methods, selection, undo, screen readers, and keyboard behavior while exposing ranges to diagnostics and formatting.

template-parser.js defines Wynntils expression boundaries, arguments, and suffix rules. editor-formatting.js handles plain-text insertion, AST formatting, format-code scanning, and color application. Quotes, escapes, and nested ranges must come from parser results rather than global character counting.

## Simulation and rendering

The simulator converts function calls into results with declared types. Functions that depend on live game state read fixed example values from simulation-profile.js; functions that cannot be simulated safely or accurately return a placeholder containing the function name and keep a warning in preview state.

The simulator and Canvas share a total text budget so that nested repeat, leading_zeros, or other functions cannot create huge strings. User-provided regular expressions are never passed to JavaScript RegExp; those functions return an explicit unsupported result to keep backtracking patterns from blocking the main thread.

Canvas parses Minecraft and Wynntils formatting codes first, then handles Color Templates, shader sentinels, font namespaces, background controls, and negative advances. Structured styled-text controls emitted by the simulator must be consumed rather than drawn as ordinary text.

## State and drafts

The preview controller distinguishes empty content, syntax pause, valid results, and results containing placeholders. Invalid syntax or configuration keeps and fades the last valid canvas; a single Canvas failure never blocks editing, diagnostics, or draft storage.

Draft storage accepts only versioned schemas and an explicit Info Box configuration whitelist. API keys, AI endpoints, models, and conversations are excluded. Multi-tab conflicts use timestamps and user confirmation; damaged or unknown schemas never silently overwrite current content.

## AI boundary

The AI adapter sends requests to the endpoint selected by the user and parses responses. Function-search tools run locally in the browser, with limits on result count and conversation turns. A proposal passes code-block extraction, escape checks, and editor-core validation before the user can apply it.

Markdown is rendered by a safe local DOM renderer and never executes model-provided HTML. Cancellation stops the whole request loop, and each request has its own timeout.

## Accessibility and responsive constraints

- Input and highlight layers keep the same scroll position.
- Diagnostics can focus Content and select the reported range.
- aria-live announces only new warning identities, not every source-offset shift.
- The function catalog supports keyboard navigation, Escape, and visible focus states.
- Sticky preview behavior on narrow screens must not cover headings, form controls, or keyboard focus.

## Third-party boundary

Function metadata, translations, and font bitmaps retain upstream sources and pinned commits. License boundaries for the tool's code and third-party content are documented in the root LICENSE, LICENSES/README.md, and THIRD_PARTY_NOTICES.md.
