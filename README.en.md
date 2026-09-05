# Wynntils Overlay Editor

[简体中文](README.md) | [English](README.en.md)

Wynntils Overlay Editor is an unofficial community tool for creating and previewing Wynntils overlays, currently focused on Info Box. It is a build-free static web page: most users can open a hosted deployment without installing Node.js or connecting it to another host project.

The tool does not export a complete Wynntils JSON document or create an in-game overlay for you. The preview uses fixed example values and is meant to check Content layout, colors, fonts, and formatting codes; the Wynntils game client remains the source of truth.

## Quick use

1. Open the hosted page provided for the project.
2. Load an example, or enter your own template in the Content field.
3. Search the function catalog, insert expressions, and follow the preview and validation messages.
4. Adjust Info Box colors, fonts, shadows, background, border, and other options.
5. Select Copy Content, then create or edit an Info Box in Wynntils → Overlay Management.

See the [user guide](docs/en-US/user/README.md) for the complete editing workflow, preview boundaries, and AI basics. For local use, self-hosting, or AI endpoint configuration, see [advanced usage](docs/en-US/user/advanced-usage.md).

## Documentation

- [User guide](docs/en-US/user/README.md)
- [Advanced usage: local run, self-hosting, and troubleshooting](docs/en-US/user/advanced-usage.md)
- [Development](docs/en-US/developer/README.md)
- [Function and font resource synchronization](docs/en-US/developer/resource-sync.md)
- [Architecture and data flow](docs/en-US/developer/architecture.md)
- [Releases and tags](docs/en-US/developer/release.md)
- [简体中文文档](docs/zh-CN/user/README.md)

## Highlights

- Edit Wynntils Content directly in the browser while preserving input method, selection, undo, and keyboard behavior.
- Offline function search, syntax highlighting, validation, examples, and Canvas preview.
- Explicit example values or placeholders for functions that depend on live game state.
- Optional OpenAI-compatible assistant; it never overwrites Content automatically and requires confirmation before applying a proposal.
- Drafts store only the explicit Info Box configuration whitelist, never API keys, endpoints, models, or AI conversations.

## License

The tool's own code is licensed under the MIT License; see [LICENSE](LICENSE). Wynntils function metadata, translations, and font bitmaps are third-party content covered by the licenses and source notices in [LICENSES/README.md](LICENSES/README.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

This is not an official Wynntils project. The Wynntils name, code, and resources belong to their respective rights holders.
