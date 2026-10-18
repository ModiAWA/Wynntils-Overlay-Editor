# Function and Font Resource Synchronization

[Development index](README.md) · [简体中文](../../zh-CN/developer/resource-sync.md) · [Architecture](architecture.md)

The editor does not call GitHub at runtime. Synchronization scripts read the official Wynntils repository, validate the data, and write function metadata, translations, and font bitmaps into repository snapshots.

## Function snapshots

The function sync reads FunctionManager, function sources, and English/Chinese translations from an official Release to generate the function catalog and Chinese search data:

```bash
# Follow the latest stable Release
node scripts/sync-functions.mjs

# Pin to a release or commit
node scripts/sync-functions.mjs --ref v4.2.8

# Check using the ref recorded by the current snapshot
node scripts/sync-functions.mjs --check
```

The check command uses the pinned ref recorded in the generated snapshot by default, so routine CI is reproducible. The sync command follows the latest stable Release unless you provide a ref. Both commands accept an explicit `--ref` override.

The sync command only writes when the **content** changes. If upstream merely published a new Release while the function catalog (names, aliases, return types, arguments, official English/Chinese descriptions) is identical to the committed snapshot, the script leaves `js/functions.generated.js` untouched, so the workflow opens no PR and refreshes neither the cache hash nor the `?v=` value in `index.html`. The ref/commit recorded in the generated file then means "the upstream version this snapshot content was last generated from"; there is no need to follow every upstream release. Use `--force` (or `WYNNTILS_FORCE=1`) when you intentionally want to re-pin the provenance of an unchanged snapshot.

Before certifying that nothing changed, the script also checks that the ref recorded in the snapshot still resolves to the recorded commit and date. If upstream re-points the tag, or the metadata was edited by hand, the sync re-pins the snapshot even though the payload is identical — the one case where a diff with only ref/commit changes is expected. The workflow runs its strict snapshot check after the sync instead of before it, so such a state is repaired automatically rather than failing the job at the check step; that check only runs when the sync wrote nothing.

The script rejects candidates that lack source, a registration class, a return type, an official English description, or key functions, and blocks anomalous drops in function count. Generated files should be updated by the script rather than edited by hand.

## Browser cache versions

The cache-version script maintains `?v=` parameters for local JavaScript and CSS files in `index.html`:

```bash
# Update versions for locally changed JS/CSS files
node scripts/sync-cache-versions.mjs

# Check that versions and file contents are synchronized
node scripts/sync-cache-versions.mjs --check
```

The script records JS/CSS content hashes in `cache-versions.json`. Unchanged files keep their versions; changed files with an unchanged numeric version are incremented automatically. Font PNG content hashes are stored in `js/resources.generated.js` and appended to image URLs by the renderer. Upstream synchronization workflows run the relevant scripts after generating snapshots.

## Font resources

Font synchronization uses the GitHub Contents API to read five.json, banners.json, and their PNG files:

```bash
# Update resources and manifest
node scripts/sync-resources.mjs

# Check the current resource snapshot against its recorded commit
node scripts/sync-resources.mjs --check

# Pin to a release or commit
node scripts/sync-resources.mjs --ref v4.2.8
```

Before writing, the script validates the PNG signature, type, and dimensions, capping width and height at 4096. The generated manifest, the license-notice commit, and PNG files under assets/fonts/ are replaced atomically; any failure rolls back and keeps the previous complete snapshot.

Font synchronization is content-gated in the same way: when a newer upstream Release has byte-identical `five.json`, `banners.json`, and `assets/fonts/` PNG files, only the upstream commit differs, and the script writes nothing at all — it does not bump the `js/resources.generated.js` cache version, refresh hashes in `cache-versions.json`, or rewrite the commit in `THIRD_PARTY_NOTICES.md`. `--force` or `WYNNTILS_FORCE=1` re-pins the upstream commit on demand.

## Pull requests and review

Synchronization workflows are:

- .github/workflows/sync-wynntils-functions.yml
- .github/workflows/sync-wynntils-resources.yml

They periodically check the official stable version. The workflow opens or updates an automated PR only when the snapshot content actually changes and tests pass; it never writes directly to the default branch. When upstream only re-released identical content, the run explains why in its log and stops — no PR, no cache-version bump, no hash refresh. Manual dispatches expose a `force` input (equivalent to `--force`) to re-pin the upstream ref/commit. Reviewers should confirm:

- The PR contains a real content change (counts or entries). A diff with only ref, commit, or cache-version churn is expected only when the run logged a re-pin (upstream re-pointed the tag or the metadata was edited by hand); otherwise the old behaviour regressed and the sync script needs a look.
- The upstream ref, commit, and source notice agree.
- Generated-file counts did not change unexpectedly.
- pnpm check, separate snapshot checks, and related tests pass.
- No undeclared third-party fonts or files from outside the approved source entered the repository.

Snapshot checks use the GitHub API. CI uses GITHUB_TOKEN; locally you may set the same environment variable to raise rate limits, but never print or commit the token.
