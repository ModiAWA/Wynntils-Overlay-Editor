# Advanced Usage

[Back to user guide](README.md) · [简体中文](../../zh-CN/user/advanced-usage.md) · [Documentation index](../../README.md)

This page is for people who need to run, deploy, or troubleshoot the editor themselves. Most users can use a hosted page without installing Node.js.

## Run locally

The editor is a build-free static page. The simplest option is to open index.html from the repository root in a browser.

If the browser restricts local-file access, or you want to reproduce a static-hosting environment, use any static server. For example:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000/. The server only serves repository files; no backend is required.

## Self-hosting

Keep these paths in the deployment:

- index.html
- styles.css
- js/
- assets/

GitHub Pages, Nginx, object-storage static sites, and similar services all work. Do not upload the HTML file alone: omitting the generated function data, translations, or font bitmaps makes the startup checks fail or leaves the preview incomplete.

If a deployment still shows old modules, clear the site cache and confirm that the script version parameters in the HTML match the deployed files. The startup check lists the missing required modules so an incomplete package is easier to diagnose.

## AI endpoints and CORS

AI requests are sent directly from the browser to the OpenAI-compatible Chat Completions endpoint you provide, so the service must allow CORS from the deployed origin. Recommended safeguards:

1. Use a dedicated proxy or low-privilege API key for the editor.
2. Allow only the required origins, methods, and request headers.
3. Set request-size, rate, and timeout limits at the proxy.
4. Never put an API key in static files, URLs, repositories, or build artifacts.

Standard and compatible endpoint shapes are both supported. The page derives /models from a /v1 or /chat/completions address; if no model list is available, enter the model name manually.

Each AI turn has bounded model requests and local function searches. The editor rejects JSON-wrapped Content, invalid backslash escaping, and code blocks that fail local validation; always confirm a proposal before applying it.

## Offline and data boundaries

Unless you explicitly submit an AI request, the browser does not call remote APIs. Function metadata, examples, translations, validation, simulation, and Canvas assets come from repository files.

Drafts are stored only in the current browser's local storage and contain only the explicit Info Box configuration whitelist. Clearing site data removes drafts; it does not change repository files or in-game configuration.

The preview uses fixed example state. It does not read a Wynncraft account, server state, or game-client data, and it never writes preview results back to the game.

## Troubleshooting

### Blank page or missing-module warning

Confirm that the deployment includes the controllers and generated files under js/. Open each script URL directly and check for 404 responses or an incorrect MIME type. Then hard-refresh and inspect the console.

### Browser blocks an AI request

Check that the endpoint permits the current page Origin, POST, and the Content-Type and authorization headers. You can also verify the editor and preview without AI first.

### Preview layout differs from the game

Confirm that Content was not escaped again or wrapped as a JSON string by another system. For live-state functions, resource-pack differences, and client-specific rendering, use the game client as the final result.

### A local draft cannot be restored

Damaged or incompatible drafts are blocked to avoid overwriting current content. Choose to keep the current content or explicitly replace it; do not paste an object value into the Content field.
