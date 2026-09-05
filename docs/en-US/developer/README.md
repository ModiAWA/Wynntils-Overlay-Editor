# Development and Maintenance

[Documentation index](../../README.md) · [简体中文](../../zh-CN/developer/README.md) · [User guide](../user/README.md)

This directory is for contributors and maintainers:

- [Development workflow and tests](development.md)
- [Function and font resource synchronization](resource-sync.md)
- [Architecture and data flow](architecture.md)
- [Releases and tags](release.md)

The editor has no build step: browsers load the repository's static files directly. When you change HTML, CSS, or JavaScript, update the related tests and documentation, then run formatting, unit tests, and Chromium regression tests before submitting.
