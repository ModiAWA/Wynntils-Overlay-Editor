import { createHash } from 'node:crypto';
import { access, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPOSITORY = 'Wynntils/Wynntils';
const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
const CONTENTS_URL = `https://api.github.com/repos/${REPOSITORY}/contents`;
const FIVE_MANIFEST = 'common/src/main/resources/assets/wynntils/font/five.json';
const BANNERS_MANIFEST = 'common/src/main/resources/assets/wynntils/font/banners.json';
const FONT_FILE_PATTERN = /^wynntils:font\/chat\/([a-z0-9_]+\.png)$/;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_OUTPUT = path.join(EDITOR_DIR, 'js', 'resources.generated.js');
const DEFAULT_NOTICE = path.join(EDITOR_DIR, 'THIRD_PARTY_NOTICES.md');
const DEFAULT_ASSETS = path.join(EDITOR_DIR, 'assets', 'fonts');
const MAX_RESOURCE_BYTES = 2 * 1024 * 1024;
const MAX_PNG_DIMENSION = 4096;
const READ_CONCURRENCY = 4;
const FIVE_LABELS = ['ABCDEFGHIJKLMNOP', 'QRSTUVWXYZ?[]\\%&', '0123456789!()<=>'];

function parseCli(argv) {
  const options = {
    ref: process.env.WYNNTILS_RESOURCES_REF || '',
    check: false,
    force: process.env.WYNNTILS_FORCE === '1',
    output: DEFAULT_OUTPUT,
    notice: DEFAULT_NOTICE,
    assets: DEFAULT_ASSETS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--check') options.check = true;
    else if (value === '--force') options.force = true;
    else if (['--ref', '--output', '--notice', '--assets'].includes(value)) {
      const next = argv[index + 1];
      if (!next) throw new Error(`${value} requires a value.`);
      index += 1;
      if (value === '--ref') options.ref = next;
      else if (value === '--output') options.output = path.resolve(next);
      else if (value === '--notice') options.notice = path.resolve(next);
      else options.assets = path.resolve(next);
    } else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchResponse(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'wynntils-editor-resource-sync',
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
            : {}),
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 400);
        if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
          throw new Error(
            `GitHub API rate limit exceeded for ${url}; set GITHUB_TOKEN for authenticated sync.`,
          );
        }
        throw new Error(`HTTP ${response.status} from ${url}: ${detail}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(400 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Failed to fetch ${url} after 3 attempts: ${lastError?.message || lastError}`, {
    cause: lastError,
  });
}

async function fetchJson(url) {
  return (await fetchResponse(url)).json();
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, values.length);
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function decodeContent(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing content for ${label}.`);
  const decoded = Buffer.from(value.replaceAll(/\s/g, ''), 'base64');
  if (!decoded.length || decoded.length > MAX_RESOURCE_BYTES)
    throw new Error(`Resource ${label} exceeds the ${MAX_RESOURCE_BYTES}-byte limit.`);
  return decoded;
}

function contentsUrl(sourcePath, commit) {
  const encodedPath = sourcePath.split('/').map(encodeURIComponent).join('/');
  return `${CONTENTS_URL}/${encodedPath}?ref=${encodeURIComponent(commit)}`;
}

async function readContentsFile(sourcePath, commit) {
  const payload = await fetchJson(contentsUrl(sourcePath, commit));
  return decodeContent(payload.content, sourcePath);
}

export function pngDimensions(buffer, label = 'PNG') {
  if (
    buffer.length < 24 ||
    !buffer.subarray(0, 8).equals(Buffer.from('\x89PNG\r\n\x1a\n', 'binary'))
  )
    throw new Error(`${label} is not a valid PNG.`);
  if (buffer.readUInt32BE(12) !== 0x49484452) throw new Error(`${label} has no PNG IHDR.`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height || width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION)
    throw new Error(`${label} has unsafe dimensions ${width}x${height}.`);
  return { width, height };
}

export function parseManifest(source, kind) {
  const manifest = JSON.parse(Buffer.isBuffer(source) ? source.toString('utf8') : source);
  if (!Array.isArray(manifest.providers) || !manifest.providers.length)
    throw new Error(`${kind} font manifest has no providers.`);
  return manifest.providers.map((provider, index) => {
    if (provider?.type !== 'bitmap') throw new Error(`${kind} provider ${index} is not bitmap.`);
    const file = String(provider.file || '');
    const match = FONT_FILE_PATTERN.exec(file);
    if (!match) throw new Error(`${kind} provider ${index} has an unsupported file.`);
    if (!Number.isInteger(provider.ascent) || !Number.isInteger(provider.height))
      throw new Error(`${kind} provider ${index} has invalid metrics.`);
    if (
      !Array.isArray(provider.chars) ||
      provider.chars.some((chars) => typeof chars !== 'string' || !chars)
    )
      throw new Error(`${kind} provider ${index} has invalid chars.`);
    const chars = provider.chars.map((value) => String(value));
    const result = {
      asset: match[1].slice(0, -4),
      sourcePath: `common/src/main/resources/assets/wynntils/textures/font/chat/${match[1]}`,
      ascent: provider.ascent,
      height: provider.height,
      chars,
    };
    if (kind === 'banners') {
      const glyph = [...chars[0]];
      if (glyph.length !== 1) throw new Error(`Banner provider ${index} must contain one glyph.`);
      result.codepoint = glyph[0].codePointAt(0);
    }
    return result;
  });
}

function ensureUniqueAssets(manifests) {
  const names = new Set();
  for (const provider of manifests.flat()) {
    if (names.has(provider.asset)) throw new Error(`Duplicate font asset: ${provider.asset}`);
    names.add(provider.asset);
  }
}

export function buildResourceData(commit, manifests, dimensions) {
  const [fiveProviders, bannerProviders] = manifests;
  if (!/^[0-9a-f]{40}$/i.test(commit))
    throw new Error('Resource source commit must be a full SHA.');
  ensureUniqueAssets(manifests);
  if (
    fiveProviders.length !== 1 ||
    fiveProviders[0].chars.length !== FIVE_LABELS.length ||
    fiveProviders[0].chars.some(
      (chars, index) => [...chars].length !== [...FIVE_LABELS[index]].length,
    )
  )
    throw new Error('The Wynntils five font no longer matches the editor glyph labels.');
  const assets = {};
  for (const provider of [...fiveProviders, ...bannerProviders]) {
    const size = dimensions[provider.asset];
    if (!size) throw new Error(`Missing dimensions for ${provider.asset}.`);
    assets[provider.asset] = {
      path: `assets/fonts/${provider.asset}.png`,
      width: size.width,
      height: size.height,
      ...(size.hash ? { hash: size.hash } : {}),
    };
  }
  return {
    source: { repository: REPOSITORY_URL, commit, license: 'LGPL-3.0' },
    assets,
    fonts: {
      'wynntils:five': {
        providers: fiveProviders.map((provider) => ({
          type: 'bitmap',
          asset: provider.asset,
          ascent: provider.ascent,
          height: provider.height,
          chars: provider.chars,
          labels: FIVE_LABELS,
        })),
      },
      'wynntils:banners': {
        providers: bannerProviders.map((provider) => ({
          type: 'bitmap',
          asset: provider.asset,
          codepoint: provider.codepoint,
          ascent: provider.ascent,
          height: provider.height,
        })),
      },
    },
  };
}

export function renderResources(data) {
  return `(function (root) {\n  'use strict';\n\n  // Generated from ${REPOSITORY_URL}.\n  const freeze = (value) => {\n    if (value && typeof value === 'object' && !Object.isFrozen(value)) {\n      Object.freeze(value);\n      Object.values(value).forEach(freeze);\n    }\n    return value;\n  };\n  root.WYNNTILS_FONT_RESOURCES = freeze(${JSON.stringify(data, null, 2)});\n})(typeof globalThis !== 'undefined' ? globalThis : window);\n`;
}

async function formatGenerated(source, filepath) {
  const prettier = await import('prettier');
  return prettier.format(source, {
    filepath,
    endOfLine: 'lf',
    printWidth: 100,
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'all',
    useTabs: false,
  });
}

const NOTICE_COMMIT_PATTERN = /(## Wynntils 字体资源[\s\S]*?- 上游 commit：`)([0-9a-f]{40})(`)/i;
// Only the pinned upstream commit is provenance; every other byte of the generated artifacts
// stays comparable, so an unrelated 40-hex value would still count as a substantive change.
const PROVENANCE_PATTERNS = [
  /(["']?commit["']?\s*:\s*["'])[0-9a-f]{40}(["'])/gi,
  /(- 上游 commit：`)[0-9a-f]{40}(`)/g,
];

export function updateNotice(source, commit) {
  if (!NOTICE_COMMIT_PATTERN.test(source))
    throw new Error('Could not find the Wynntils font notice commit.');
  return source.replace(NOTICE_COMMIT_PATTERN, `$1${commit}$3`);
}

export function noticeCommit(source) {
  const match = NOTICE_COMMIT_PATTERN.exec(String(source || ''));
  return match ? match[2].toLowerCase() : null;
}

export function stripProvenance(source) {
  let result = String(source || '');
  for (const pattern of PROVENANCE_PATTERNS) result = result.replace(pattern, '$1<commit>$2');
  return result;
}

export function hasSubstantiveChange({
  previousSource,
  nextSource,
  previousNotice,
  nextNotice,
  assetChanges = 0,
}) {
  return (
    assetChanges > 0 ||
    stripProvenance(previousSource) !== stripProvenance(nextSource) ||
    stripProvenance(previousNotice) !== stripProvenance(nextNotice)
  );
}

export function currentCommit(source) {
  const match = /["']?commit["']?\s*:\s*["']([0-9a-f]{40})["']/i.exec(source);
  if (!match) throw new Error('Could not find a pinned resource commit in resources.generated.js.');
  return match[1].toLowerCase();
}

export async function resolveCommit(requestedRef, check, existingSource) {
  const ref = requestedRef || (check ? currentCommit(existingSource) : '');
  let resolvedRef = ref;
  if (!resolvedRef) {
    const release = await fetchJson(`https://api.github.com/repos/${REPOSITORY}/releases/latest`);
    resolvedRef = String(release.tag_name || '').trim();
    if (!resolvedRef) throw new Error('The latest Wynntils release did not include a tag name.');
  }
  const commitData = await fetchJson(
    `https://api.github.com/repos/${REPOSITORY}/commits/${encodeURIComponent(resolvedRef)}`,
  );
  const commit = String(commitData.sha || '')
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(commit))
    throw new Error(`Could not resolve Wynntils ref ${resolvedRef}.`);
  return { ref: resolvedRef, commit };
}

export async function loadRemote(commit) {
  const [fiveSource, bannerSource] = await Promise.all([
    readContentsFile(FIVE_MANIFEST, commit),
    readContentsFile(BANNERS_MANIFEST, commit),
  ]);
  const five = parseManifest(fiveSource, 'five');
  const banners = parseManifest(bannerSource, 'banners');
  const providers = [...five, ...banners];
  ensureUniqueAssets(providers);
  const loaded = await mapWithConcurrency(providers, READ_CONCURRENCY, async (provider) => {
    const content = await readContentsFile(provider.sourcePath, commit);
    return { provider, content, dimensions: pngDimensions(content, provider.sourcePath) };
  });
  const dimensions = Object.fromEntries(
    loaded.map(({ provider, content, dimensions: size }) => [
      provider.asset,
      { ...size, hash: createHash('sha256').update(content).digest('hex').slice(0, 16) },
    ]),
  );
  const assets = Object.fromEntries(
    loaded.map(({ provider, content }) => [provider.asset, content]),
  );
  return { data: buildResourceData(commit, [five, banners], dimensions), assets };
}

async function readOptional(file, encoding = 'utf8') {
  try {
    return await readFile(file, encoding);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function existingAssetNames(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
    .map((entry) => entry.name.slice(0, -4));
}

export async function writeAtomicGroup(updates, operationOverrides = {}) {
  const operations = { access, mkdir, readFile, rename, rm, writeFile, ...operationOverrides };
  const nonce = `${process.pid}.${Date.now()}`;
  const stages = updates.map((update, index) => {
    const target = path.resolve(update.target);
    const basename = path.basename(target);
    return {
      target,
      content: update.content,
      remove: update.remove === true,
      directory: path.dirname(target),
      temporary: path.join(path.dirname(target), `.${basename}.${nonce}.${index}.tmp`),
      backup: path.join(path.dirname(target), `.${basename}.${nonce}.${index}.bak`),
      backedUp: false,
      promoted: false,
    };
  });
  try {
    for (const stage of stages) {
      await operations.mkdir(stage.directory, { recursive: true });
      if (!stage.remove) await operations.writeFile(stage.temporary, stage.content);
    }
    for (const stage of stages) {
      try {
        await operations.access(stage.target);
      } catch (error) {
        if (error?.code === 'ENOENT') continue;
        throw error;
      }
      await operations.rename(stage.target, stage.backup);
      stage.backedUp = true;
    }
    for (const stage of stages) {
      if (!stage.remove) {
        await operations.rename(stage.temporary, stage.target);
        stage.promoted = true;
      }
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const stage of [...stages].reverse()) {
      try {
        if (stage.promoted) await operations.rm(stage.target, { force: true });
        if (stage.backedUp) await operations.rename(stage.backup, stage.target);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    await Promise.allSettled(
      stages.map((stage) => operations.rm(stage.temporary, { force: true })),
    );
    if (rollbackErrors.length)
      throw new AggregateError([error, ...rollbackErrors], 'Atomic replacement rollback failed.');
    throw error;
  }
  await Promise.all(
    stages.map((stage) => (stage.backedUp ? operations.rm(stage.backup, { force: true }) : null)),
  );
}

export async function synchronize(options = parseCli([])) {
  const existingSource = (await readOptional(options.output)) || '';
  const currentNotice = (await readOptional(options.notice)) || '';
  const resolve = options.resolveCommit || resolveCommit;
  const load = options.loadRemote || loadRemote;
  const resolved = await resolve(options.ref, options.check, existingSource);
  const remote = await load(resolved.commit);
  const generated = await formatGenerated(renderResources(remote.data), options.output);
  const notice = updateNotice(currentNotice, resolved.commit);
  const desiredNames = new Set(Object.keys(remote.data.assets));
  const updates = [];
  let assetChanges = 0;
  if (generated !== existingSource) updates.push({ target: options.output, content: generated });
  if (notice !== currentNotice) updates.push({ target: options.notice, content: notice });
  for (const [name, content] of Object.entries(remote.assets)) {
    const target = path.join(options.assets, `${name}.png`);
    const current = await readOptional(target, null);
    if (!current || !Buffer.from(current).equals(content)) {
      updates.push({ target, content });
      assetChanges += 1;
    }
  }
  for (const name of await existingAssetNames(options.assets)) {
    if (!desiredNames.has(name)) {
      updates.push({ target: path.join(options.assets, `${name}.png`), remove: true });
      assetChanges += 1;
    }
  }
  const substantive = hasSubstantiveChange({
    previousSource: existingSource,
    nextSource: generated,
    previousNotice: currentNotice,
    nextNotice: notice,
    assetChanges,
  });
  let pinnedCommit = null;
  try {
    pinnedCommit = currentCommit(existingSource);
  } catch (_error) {
    pinnedCommit = null;
  }
  // The snapshot is self-consistent only when the notice pins the same commit as the generated
  // manifest. Anything else (hand edits, merge leftovers) must fall through to the repair path.
  const snapshotConsistent = pinnedCommit !== null && noticeCommit(currentNotice) === pinnedCommit;
  const skipProvenanceOnly =
    !options.check && options.force !== true && snapshotConsistent && !substantive;
  const changed = options.check ? updates.length > 0 : !skipProvenanceOnly && updates.length > 0;
  if (options.check) {
    if (changed)
      throw new Error('The Wynntils resource snapshot is stale. Run the resource sync command.');
  } else if (changed) await writeAtomicGroup(updates);
  return {
    changed,
    commit: resolved.commit,
    ref: resolved.ref,
    assets: Object.keys(remote.assets).length,
    substantive,
    pinnedCommit,
    provenanceChanged: pinnedCommit !== resolved.commit,
    snapshotConsistent,
  };
}

async function main() {
  const result = await synchronize(parseCli(process.argv.slice(2)));
  if (!result.changed && result.provenanceChanged) {
    const pinned = result.pinnedCommit ? result.pinnedCommit.slice(0, 12) : 'unknown';
    process.stdout.write(
      `Wynntils resources current: ${result.assets} assets, upstream ${result.ref} @ ${result.commit.slice(0, 12)} has an identical resource payload; snapshot stays pinned to ${pinned}.\n`,
    );
    return;
  }
  process.stdout.write(
    `Wynntils resources ${result.changed ? 'updated' : 'current'}: ${result.assets} assets, ${result.ref} @ ${result.commit.slice(0, 12)}\n`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}
