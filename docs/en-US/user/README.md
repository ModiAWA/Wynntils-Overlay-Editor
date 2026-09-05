# User Guide

[Documentation index](../../README.md) · [简体中文](../../zh-CN/user/README.md) · [Advanced usage](advanced-usage.md)

This guide is for people using a hosted Wynntils Overlay Editor page. The editor currently focuses on editing, previewing, and copying Content for Wynntils Info Boxes.

## Basic workflow

1. Open the hosted page provided for the project.
2. Load the FPS, coordinates, or General Information example, or start with empty Content.
3. Edit the template in the Content field. Use the function catalog on the right to search and insert expressions.
4. Follow the preview and status messages to fix syntax, type, or unsupported-simulation warnings.
5. Adjust Color Template, shadow, font size, Fit Text, background, border, and other Info Box options.
6. Select Copy Content, then create or edit an Info Box in Wynntils → Overlay Management.

Copied text is the Content value expected by the in-game form, not a complete Wynntils JSON document. The tool does not create an in-game overlay for you.

## Editing Content

Template expressions use Wynntils brace syntax, for example:

```text
{concat("FPS: ";fps)}
```

Plain text, functions, arguments, strings, numbers, and template punctuation receive separate highlighting. The highlight layer is visual only; the native text area remains the actual input, preserving input methods, selection, undo, and keyboard navigation.

### Inserting functions

- Search by function name, alias, or Chinese description.
- Selecting a result inserts an expression with example arguments.
- Use the arrow keys to move focus, Enter to insert, and Escape to close the results.
- After insertion, the first editable argument is normally selected so you can replace the example value immediately.

The catalog comes from a pinned Wynntils snapshot. The page does not request live game state; values that cannot be known offline use an example value or an explicit placeholder.

### Colors and formatting

Minecraft and Wynntils formatting codes, Color Templates, and color-returning functions are approximated in the preview. Literal colors use eight hexadecimal digits (**&#RRGGBBAA**); validation rejects incomplete or malformed codes.

## Preview and validation

The preview distinguishes:

- Empty Content, which clears the previous canvas.
- Invalid syntax or configuration, which keeps and fades the last valid preview while showing the error range.
- Fully simulated content using fixed example game state.
- Partially simulated content that keeps the result and lists placeholder functions.

The preview is not a game-client screenshot. Use it to inspect layout, colors, fonts, formatting codes, and text length; functions that depend on live game state cannot be predicted exactly by a web page.

Simulation results and Canvas input share a 4096-character budget. Oversized results are truncated with a message, and user-provided regular expressions are not executed on the browser main thread.

## Optional AI assistant

The AI assistant is optional. Without it, editing, function search, validation, preview, examples, and explanations remain offline.

When using AI:

- Provide your own OpenAI-compatible Chat Completions endpoint, model name, and API key.
- The endpoint must allow browser CORS requests; compatible services do not always expose /models, so you can enter the model name manually.
- The API key remains only in the current page's password field and is not written to drafts, browser storage, URLs, logs, or downloaded files.
- The assistant never overwrites Content automatically. A clear Wynntils code block must pass local validation and be confirmed by you before it is applied.
- Do not send real credentials, personal information, or production data to a model.

See [advanced usage](advanced-usage.md) for endpoint, request-boundary, CORS, and local-run details.

## Drafts and undo

Normal Info Box configuration is stored as a versioned draft in the current browser, but API keys, endpoints, models, and AI conversations are excluded.

Unknown or damaged drafts are not restored automatically. When multiple tabs edit the same draft, the page asks whether to load the newer version or keep the current content. Loading examples, applying AI proposals, and formatting replacements can all be undone.

## Common messages

- **A function placeholder appears**: the function depends on game state or is not included in offline simulation; confirm that this is expected before copying.
- **A syntax error appears**: select the diagnostic to focus the reported range, then fix brackets, quotes, argument types, or formatting codes.
- **The preview differs from the game**: treat the game client as authoritative; the preview uses fixed example state and does not access Wynncraft or Wynntils services.
- **The page fails to load**: confirm the static deployment contains index.html, styles.css, js/, and assets/, then inspect the browser console for missing-module diagnostics.
