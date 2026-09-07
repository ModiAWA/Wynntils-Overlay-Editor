import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_INDEX = path.join(EDITOR_DIR, 'index.html');
const DEFAULT_MANIFEST = path.join(EDITOR_DIR, 'cache-versions.json');
const LOCAL_ASSET =
  /(?:href|src)=["']((?:styles\.css|js\/[A-Za-z0-9._-]+\.js))(?:\?v=([^"']+))?["']/g;

function parseCli(argv) {
  const options = { check: false, index: DEFAULT_INDEX, manifest: DEFAULT_MANIFEST };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--check') options.check = true;
    else if (value === '--index' || value === '--manifest') {
      const next = argv[index + 1];
      if (!next) throw new Error(`${value} requires a value.`);
      index += 1;
      options[value === '--index' ? 'index' : 'manifest'] = path.resolve(next);
    } else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

export function parseAssetReferences(indexSource) {
  const references = [];
  for (const match of indexSource.matchAll(LOCAL_ASSET)) {
    references.push({ path: match[1], version: match[2] || '' });
  }
  if (!references.length)
    throw new Error('Could not find local JavaScript or CSS assets in index.html.');
  return references;
}

function replaceAssetVersions(indexSource, versions) {
  return indexSource.replace(LOCAL_ASSET, (match, assetPath, version) => {
    const nextVersion = versions.get(assetPath);
    if (!nextVersion || !version) return match;
    return match.replace(`?v=${version}`, `?v=${nextVersion}`);
  });
}

function digest(content) {
  return createHash('sha256').update(content).digest('hex');
}

function isNumericVersion(version) {
  return /^\d+$/.test(version);
}

async function readManifest(manifestPath) {
  try {
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (parsed?.schemaVersion !== 1 || !parsed.assets || typeof parsed.assets !== 'object')
      throw new Error('Invalid cache-versions.json schema.');
    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function synchronize(options = parseCli([])) {
  const indexSource = await readFile(options.index, 'utf8');
  const references = parseAssetReferences(indexSource);
  const previous = await readManifest(options.manifest);
  if (options.check && !previous)
    throw new Error('cache-versions.json is missing. Run node scripts/sync-cache-versions.mjs.');

  const versions = new Map();
  const assets = {};
  const indexDirectory = path.dirname(options.index);
  let changed = !previous;
  for (const reference of references) {
    const assetPath = path.join(indexDirectory, reference.path);
    const content = await readFile(assetPath);
    const hash = digest(content);
    const prior = previous?.assets?.[reference.path];
    let version = reference.version;
    if (!version) throw new Error(`Asset ${reference.path} is missing a cache version.`);
    if (!prior) {
      changed = true;
    } else if (prior.hash !== hash) {
      if (reference.version === prior.version) {
        if (isNumericVersion(reference.version)) {
          version = String(Number(reference.version) + 1);
        } else if (reference.path === 'js/functions.generated.js') {
          const upstreamVersion = reference.version.replace(/-[0-9a-f]{12}$/i, '');
          version = `${upstreamVersion}-${hash.slice(0, 12)}`;
        } else {
          throw new Error(
            `Asset ${reference.path} changed but version ${reference.version} is not numeric; update it explicitly.`,
          );
        }
        changed = true;
      } else {
        changed = true;
      }
    } else if (reference.version !== prior.version) {
      changed = true;
    }
    versions.set(reference.path, version);
    assets[reference.path] = { hash, version };
  }

  const updatedIndex = replaceAssetVersions(indexSource, versions);
  const manifest = { schemaVersion: 1, assets };
  const manifestSource = `${JSON.stringify(manifest, null, 2)}\n`;
  const indexChanged = updatedIndex !== indexSource;
  const manifestChanged = !previous || JSON.stringify(previous) !== JSON.stringify(manifest);
  changed ||= indexChanged || manifestChanged;
  if (options.check && changed)
    throw new Error('Cache versions are stale. Run node scripts/sync-cache-versions.mjs.');
  if (!options.check && changed) {
    await writeFile(options.index, updatedIndex, 'utf8');
    await writeFile(options.manifest, manifestSource, 'utf8');
  }
  return { changed, assets: references.length };
}

async function main() {
  const result = await synchronize(parseCli(process.argv.slice(2)));
  process.stdout.write(
    `Cache versions ${result.changed ? 'updated' : 'current'}: ${result.assets} assets\n`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}
