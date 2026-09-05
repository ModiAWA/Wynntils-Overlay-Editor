# Function and Font Resource Synchronization

[Development index](README.md) · [简体中文](../../zh-CN/developer/resource-sync.md) · [Architecture](architecture.md)

The editor does not call GitHub at runtime. Synchronization scripts read the official Wynntils repository, validate the data, and write function metadata, translations, and font bitmaps into repository snapshots.

## Function snapshots

The function sync reads FunctionManager, function sources, and English/Chinese translations from an official Release to generate the function catalog and Chinese search data:

```bash
# Follow the latest stable Release
pnpm sync:wynntils-functions

# Pin to a release or commit
node scripts/sync-functions.mjs --ref v4.2.8

# Check using the ref recorded by the current snapshot
pnpm check:wynntils-functions
```

The check command uses the pinned ref recorded in the generated snapshot by default, so routine CI is reproducible. The sync command follows the latest stable Release unless you provide a ref. Both commands accept an explicit `--ref` override.

The script rejects candidates that lack source, a registration class, a return type, an official English description, or key functions, and blocks anomalous drops in function count. Generated files should be updated by the script rather than edited by hand.

## Font resources

Font synchronization uses the GitHub Contents API to read five.json, banners.json, and their PNG files:

```bash
# Update resources and manifest
pnpm sync:wynntils-resources

# Check the current resource snapshot against its recorded commit
pnpm check:wynntils-resources

# Pin to a release or commit
node scripts/sync-resources.mjs --ref v4.2.8
```

The script validates the PNG signature, type, and dimensions, capping width and height at 4096, before writing. The generated manifest, the license-notice commit, and PNG files under assets/fonts/ are replaced atomically; any failure rolls back and keeps the previous complete snapshot.

## Pull requests and review

Synchronization workflows are:

- .github/workflows/sync-wynntils-functions.yml
- .github/workflows/sync-wynntils-resources.yml

They periodically check the official stable version. When data changes and tests pass, the workflow opens or updates an automated PR instead of writing directly to the default branch. Reviewers should confirm:

- The upstream ref, commit, and source notice agree.
- Generated-file counts did not change unexpectedly.
- pnpm check, snapshot checks, and related tests pass.
- No undeclared third-party fonts or files from outside the approved source entered the repository.

Snapshot checks use the GitHub API. CI uses GITHUB_TOKEN; locally you may set the same environment variable to raise rate limits, but never print or commit the token.
