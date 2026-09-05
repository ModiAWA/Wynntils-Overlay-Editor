# Releases and tags

[Development index](README.md) · [简体中文](../../zh-CN/developer/release.md) · [Architecture](architecture.md)

This project is a static web tool, not an npm package. The version in package.json is the release source of truth, and Git tags must use the vMAJOR.MINOR.PATCH form, such as v0.1.0.

## Standard release flow

1. Complete the code, tests, and documentation in a pull request. If a new release is needed, update the version in package.json first.
2. Run the local checks:

```bash
pnpm format
pnpm check
pnpm test
pnpm check:wynntils-functions
pnpm check:wynntils-resources
git diff --check
```

3. Merge the pull request into main and confirm the merged package.json version.
4. Create and push an annotated version tag:

```bash
git tag -a v0.1.0 -m "release: v0.1.0"
git push origin v0.1.0
```

5. After the tag is pushed, the Release workflow checks out that exact tag, reruns the checks and Chromium regression tests, verifies that the tag matches package.json, then creates a GitHub Release with a source ZIP containing tracked Git files only.

GitHub generates the release notes automatically from the merged commits, so you do not need to write them by hand.

## Manual retry

If an existing tag needs to be retried, open GitHub Actions, select Release → Run workflow, and enter the existing version tag. Manual runs should use a tag that has already been pushed. The workflow revalidates the tag and package version, and replaces the source ZIP if the Release already exists.

## Version rules

- The tag without its leading v must exactly equal package.json version.
- Use only three numeric version components; do not push unrelated tags.
- Do not move or force-update a published tag. Increment the patch version and create a new tag for a fix.
- The workflow does not push code or modify the main branch.
- The source ZIP is built from tracked files in the tag and excludes local runtime data, dependencies, and uncommitted files.
