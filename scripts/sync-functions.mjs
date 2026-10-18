import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPOSITORY = 'Wynntils/Wynntils';
const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
const MANAGER_PATH =
  'common/src/main/java/com/wynntils/core/consumers/functions/FunctionManager.java';
const FUNCTIONS_PREFIX = 'common/src/main/java/com/wynntils/functions/';
const ENGLISH_PATH = 'common/src/main/resources/assets/wynntils/lang/en_us.json';
const CHINESE_PATH = 'common/src/main/resources/assets/wynntils/lang/zh_cn.json';
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_OUTPUT = path.join(EDITOR_DIR, 'js', 'functions.generated.js');
const DEFAULT_INDEX = path.join(EDITOR_DIR, 'index.html');
const MIN_FUNCTION_COUNT = 300;
const MIN_ARGUMENT_COUNT = 100;
const UPSTREAM_READ_CONCURRENCY = 8;
const REQUIRED_FUNCTIONS = ['concat', 'current_world', 'fps'];

function parseCli(argv) {
  const options = {
    ref: process.env.WYNNTILS_REF || '',
    sourceDir: '',
    output: DEFAULT_OUTPUT,
    index: DEFAULT_INDEX,
    check: false,
    force: process.env.WYNNTILS_FORCE === '1',
    allowLargeChange: process.env.ALLOW_LARGE_WYNNTILS_CHANGE === '1',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--check') options.check = true;
    else if (value === '--force') options.force = true;
    else if (value === '--allow-large-change') options.allowLargeChange = true;
    else if (['--ref', '--source-dir', '--output', '--index'].includes(value)) {
      const next = argv[index + 1];
      if (!next) throw new Error(`${value} requires a value.`);
      index += 1;
      if (value === '--ref') options.ref = next;
      else if (value === '--source-dir') options.sourceDir = path.resolve(next);
      else if (value === '--output') options.output = path.resolve(next);
      else options.index = path.resolve(next);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
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
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'wynntils-editor-function-sync',
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
            : {}),
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 400);
        const error = new Error(`HTTP ${response.status} from ${url}: ${detail}`);
        error.status = response.status;
        throw error;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(400 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  const cause = lastError?.cause?.message ? ` (${lastError.cause.message})` : '';
  throw new Error(
    `Failed to fetch ${url} after ${attemptsLabel(3)}: ${lastError?.message || lastError}${cause}`,
    { cause: lastError },
  );
}

function attemptsLabel(count) {
  return `${count} attempts`;
}

async function fetchJson(url) {
  return (await fetchResponse(url)).json();
}

function rawUrl(commit, sourcePath) {
  const encodedPath = sourcePath.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${REPOSITORY}/${commit}/${encodedPath}`;
}

async function resolveRemoteProvenance(ref) {
  const commitData = await fetchJson(
    `https://api.github.com/repos/${REPOSITORY}/commits/${encodeURIComponent(ref)}`,
  );
  const commit = String(commitData.sha || '')
    .trim()
    .toLowerCase();
  const commitDate = String(commitData.commit?.committer?.date || '').trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`Could not resolve Wynntils ref ${ref}.`);
  return { commit, commitDate };
}

async function createRemoteSource(requestedRef) {
  let ref = requestedRef;
  if (!ref) {
    const release = await fetchJson(`https://api.github.com/repos/${REPOSITORY}/releases/latest`);
    ref = String(release.tag_name || '').trim();
    if (!ref) throw new Error('The latest Wynntils release did not include a tag name.');
  }
  const { commit, commitDate } = await resolveRemoteProvenance(ref);

  const tree = await fetchJson(
    `https://api.github.com/repos/${REPOSITORY}/git/trees/${commit}?recursive=1`,
  );
  if (tree.truncated) throw new Error('The Wynntils repository tree was truncated by GitHub.');
  const paths = new Set((tree.tree || []).map((entry) => entry.path));
  return {
    ref,
    commit,
    commitDate,
    paths,
    read: async (sourcePath) => {
      if (!paths.has(sourcePath)) throw new Error(`Missing upstream source: ${sourcePath}`);
      return (
        await fetchResponse(rawUrl(commit, sourcePath), { headers: { Accept: 'text/plain' } })
      ).text();
    },
  };
}

function runGit(sourceDir, args) {
  return execFileSync('git', ['-C', sourceDir, ...args], { encoding: 'utf8' }).trim();
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

async function createLocalSource(sourceDir, requestedRef) {
  const commit = runGit(sourceDir, ['rev-parse', 'HEAD']);
  const commitDate = runGit(sourceDir, ['show', '-s', '--format=%cI', 'HEAD']);
  let ref = requestedRef;
  if (!ref) {
    try {
      ref = runGit(sourceDir, ['describe', '--tags', '--exact-match', 'HEAD']);
    } catch (_error) {
      ref = commit.slice(0, 12);
    }
  }
  const listedFiles = runGit(sourceDir, ['ls-files']).split(/\r?\n/).filter(Boolean);
  const paths = new Set(listedFiles.map((entry) => entry.replaceAll('\\', '/')));
  return {
    ref,
    commit,
    commitDate,
    paths,
    read: (sourcePath) => readFile(path.join(sourceDir, ...sourcePath.split('/')), 'utf8'),
  };
}

function findMatchingBrace(source, openingIndex) {
  let depth = 0;
  let state = 'code';
  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === 'line-comment') {
      if (character === '\n') state = 'code';
      continue;
    }
    if (state === 'block-comment') {
      if (character === '*' && next === '/') {
        state = 'code';
        index += 1;
      }
      continue;
    }
    if (state === 'string' || state === 'character') {
      if (character === '\\') index += 1;
      else if (character === (state === 'string' ? '"' : "'")) state = 'code';
      continue;
    }
    if (character === '/' && next === '/') {
      state = 'line-comment';
      index += 1;
    } else if (character === '/' && next === '*') {
      state = 'block-comment';
      index += 1;
    } else if (character === '"') state = 'string';
    else if (character === "'") state = 'character';
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`Unbalanced Java class body near offset ${openingIndex}.`);
}

function extractClassDefinitions(source) {
  const definitions = new Map();
  const pattern =
    /\b(?:(?:public|private|protected|abstract|static|final)\s+)*class\s+([A-Za-z0-9_]+)(?:<[^>{]+>)?\s+extends\s+([A-Za-z0-9_$.]+)(?:<([^>{]+)>)?\s*\{/g;
  for (const match of source.matchAll(pattern)) {
    const openingIndex = match.index + match[0].lastIndexOf('{');
    const closingIndex = findMatchingBrace(source, openingIndex);
    definitions.set(match[1], {
      name: match[1],
      parent: match[2].split('.').at(-1),
      typeArgument: String(match[3] || '').trim(),
      body: source.slice(openingIndex + 1, closingIndex),
    });
  }
  return definitions;
}

function decodeJavaString(value) {
  return value.replace(/\\([\\"'])/g, '$1');
}

function extractAliases(definition, definitions, seen = new Set()) {
  if (!definition || seen.has(definition.name)) return [];
  seen.add(definition.name);
  const method = definition.body.match(
    /getAliases\s*\(\s*\)[\s\S]*?return\s+List\.of\s*\(([\s\S]*?)\)\s*;/,
  );
  if (method) {
    return [...method[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].map((match) =>
      decodeJavaString(match[1]),
    );
  }
  return extractAliases(definitions.get(definition.parent), definitions, seen);
}

function scanArguments(body) {
  const required = body.includes('RequiredArgumentBuilder');
  const matches = [];
  const typed =
    /new\s+(Argument|ListArgument)\s*<[^>]*>\s*\(\s*"((?:\\.|[^"\\])*)"\s*,\s*([A-Za-z0-9_$.]+)\.class/g;
  for (const match of body.matchAll(typed)) {
    matches.push({
      index: match.index,
      name: decodeJavaString(match[2]),
      type: match[1] === 'ListArgument' ? 'List' : match[3].split('.').at(-1),
      required,
    });
  }
  const any = /new\s+(AnyArgument|AnyArgumentList)\s*\(\s*"((?:\\.|[^"\\])*)"/g;
  for (const match of body.matchAll(any)) {
    matches.push({
      index: match.index,
      name: decodeJavaString(match[2]),
      type: match[1] === 'AnyArgumentList' ? 'List' : 'Object',
      required,
    });
  }
  return matches
    .sort((left, right) => left.index - right.index)
    .map((entry) => [entry.name, entry.type, entry.required]);
}

function extractArguments(definition, definitions, seen = new Set()) {
  if (!definition || seen.has(definition.name)) return [];
  seen.add(definition.name);
  const ownArguments = scanArguments(definition.body);
  if (ownArguments.length) return ownArguments;
  return extractArguments(definitions.get(definition.parent), definitions, seen);
}

function isGenericFunction(definition, definitions, seen = new Set()) {
  if (!definition || seen.has(definition.name)) return false;
  if (definition.parent === 'GenericFunction') return true;
  if (definition.parent === 'Function') return false;
  seen.add(definition.name);
  return isGenericFunction(definitions.get(definition.parent), definitions, seen);
}

function toLowerUnderscore(className) {
  const withoutSuffix = className.replace(/Function$/, '');
  return withoutSuffix
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function translationPrefix(className, generic) {
  const words = toLowerUnderscore(className).split('_');
  const keyName =
    words[0] +
    words
      .slice(1)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join('');
  return `function.wynntils.${generic ? 'generic.' : ''}${keyName}`;
}

export function buildCatalog({
  managerSource,
  functionSources,
  english,
  chinese,
  minimumFunctionCount = MIN_FUNCTION_COUNT,
  minimumArgumentCount = MIN_ARGUMENT_COUNT,
  requiredFunctions = REQUIRED_FUNCTIONS,
}) {
  const registrations = [
    ...managerSource.matchAll(/registerFunction\(new\s+([A-Za-z0-9_.]+)\(\)\);/g),
  ].map((match) => match[1]);
  if (registrations.length < minimumFunctionCount) {
    throw new Error(`Only ${registrations.length} registered Wynntils functions were found.`);
  }

  const definitionsByContainer = new Map();
  const functions = registrations.map((reference) => {
    const parts = reference.split('.');
    const container = parts[0];
    const className = parts.at(-1);
    const source = functionSources.get(`${container}.java`);
    if (!source) throw new Error(`Missing source file for registered function ${reference}.`);
    if (!definitionsByContainer.has(container)) {
      definitionsByContainer.set(container, extractClassDefinitions(source));
    }
    const definitions = definitionsByContainer.get(container);
    const definition = definitions.get(className);
    if (!definition) throw new Error(`Could not parse registered function class ${reference}.`);
    const name = toLowerUnderscore(className);
    const generic = isGenericFunction(definition, definitions);
    const prefix = translationPrefix(className, generic);
    const description = english[`${prefix}.description`];
    if (!description) {
      throw new Error(`Missing official English description for ${name} (${prefix}).`);
    }
    const entry = {
      n: name,
      a: [...new Set(extractAliases(definition, definitions))],
      r: definition.typeArgument,
      p: extractArguments(definition, definitions),
    };
    const chineseDescription = chinese[`${prefix}.description`];
    if (chineseDescription) entry.d = chineseDescription;
    if (!entry.r) throw new Error(`Missing return type for ${name}.`);
    return entry;
  });

  functions.sort((left, right) => left.n.localeCompare(right.n));
  const names = new Set();
  for (const entry of functions) {
    if (names.has(entry.n)) throw new Error(`Duplicate function name: ${entry.n}`);
    names.add(entry.n);
  }
  for (const requiredName of requiredFunctions) {
    if (!names.has(requiredName)) throw new Error(`Required function is missing: ${requiredName}`);
  }
  const argumentCount = functions.reduce((total, entry) => total + entry.p.length, 0);
  if (argumentCount < minimumArgumentCount) {
    throw new Error(`Only ${argumentCount} function arguments were parsed.`);
  }
  return functions;
}

function parseExistingCount(source) {
  const count = source.match(/WYNNTILS_FUNCTION_META\s*=\s*\{[^}]*"count":(\d+)/)?.[1];
  return count ? Number(count) : 0;
}

function parseExistingMetadata(source) {
  const serialized = String(source || '').match(
    /WYNNTILS_FUNCTION_META\s*=\s*(\{[^\r\n;]+\})\s*;/,
  )?.[1];
  if (!serialized) return null;
  try {
    return JSON.parse(serialized);
  } catch (_error) {
    return null;
  }
}

export function parseFunctionPayload(source) {
  const serialized = String(source || '').match(
    /window\.WYNNTILS_FUNCTIONS\s*=\s*(\[[^\r\n]*\])\s*;/,
  )?.[1];
  if (!serialized) return null;
  try {
    const payload = JSON.parse(serialized);
    return Array.isArray(payload) ? payload : null;
  } catch (_error) {
    return null;
  }
}

export function isPayloadEquivalent(functions, existingSource) {
  const existing = parseFunctionPayload(existingSource);
  if (!existing) return false;
  return JSON.stringify(existing) === JSON.stringify(functions);
}

function parsePinnedProvenance(source) {
  const metadata = parseExistingMetadata(source);
  const ref = String(metadata?.ref || '').trim();
  const commit = String(metadata?.commit || '')
    .trim()
    .toLowerCase();
  const commitDate = String(metadata?.commitDate || '').trim();
  return { ref, commit, commitDate, healthy: Boolean(ref) && /^[0-9a-f]{40}$/.test(commit) };
}

function isMissingRefError(error) {
  const status = error?.status ?? error?.cause?.status;
  return status === 404 || status === 410 || /HTTP (?:404|410)\b/.test(error?.message || '');
}

// `--check` re-renders the committed snapshot from the ref recorded in its metadata, so a pin that
// no longer resolves to the commit and date it records would leave verification red forever: the
// content gate resolves a newer release, sees identical content, and keeps skipping. Asking about
// the pinned ref costs one request instead of the full upstream load `--check` performs.
async function pinStillResolves(pinned, upstreamRef, options) {
  // Local --source-dir runs stay offline, and a run that resolved this exact ref already compared
  // the pin against it through the same-ref drift check.
  if (options.sourceDir || pinned.ref === upstreamRef) return true;
  const resolve = options.resolveRemoteProvenance || resolveRemoteProvenance;
  let resolved;
  try {
    resolved = await resolve(pinned.ref);
  } catch (error) {
    // A deleted ref is a verdict, not an outage: the pin cannot be reproduced, so repair it.
    if (isMissingRefError(error)) return false;
    throw new Error(
      `Could not verify the pinned Wynntils ref ${pinned.ref} (${pinned.commit.slice(0, 12)}): ${error.message}`,
      { cause: error },
    );
  }
  return resolved.commit === pinned.commit && resolved.commitDate === pinned.commitDate;
}

export function resolveRequestedRef(options, existingSource) {
  if (options.ref || options.sourceDir || !options.check) return options.ref || '';
  const ref = String(parseExistingMetadata(existingSource)?.ref || '').trim();
  if (!ref) {
    throw new Error('The committed Wynntils snapshot has no ref; pass --ref explicitly.');
  }
  return ref;
}

export function validateCandidate(functions, existingSource, allowLargeChange = false) {
  if (!Array.isArray(functions) || functions.length < MIN_FUNCTION_COUNT) {
    throw new Error('The generated Wynntils function catalog is incomplete.');
  }
  const existingCount = parseExistingCount(existingSource || '');
  if (!allowLargeChange && existingCount && functions.length < existingCount * 0.8) {
    throw new Error(
      `Refusing to replace ${existingCount} functions with only ${functions.length}; review the upstream change first.`,
    );
  }
}

export function renderCatalog(functions, metadata) {
  const officialTranslations = functions.filter((entry) => entry.d).length;
  const meta = {
    count: functions.length,
    officialChineseDescriptions: officialTranslations,
    repository: REPOSITORY_URL,
    ref: metadata.ref,
    commit: metadata.commit,
    commitDate: metadata.commitDate,
  };
  return [
    `/* Generated only from ${REPOSITORY_URL} at ${metadata.ref} (${metadata.commit}). */`,
    `window.WYNNTILS_FUNCTIONS=${JSON.stringify(functions)};`,
    `window.WYNNTILS_FUNCTION_META=${JSON.stringify(meta)};`,
    '',
  ].join('\n');
}

function updateIndexVersion(indexSource, ref, commit) {
  const version = String(ref || commit.slice(0, 12)).replace(/^v/i, '');
  const pattern = /js\/functions\.generated\.js(?:\?v=[^"']*)?/;
  if (!pattern.test(indexSource))
    throw new Error('Could not find functions.generated.js in index.html.');
  return indexSource.replace(pattern, `js/functions.generated.js?v=${encodeURIComponent(version)}`);
}

export async function writeAtomicGroup(updates, operationOverrides = {}) {
  const operations = { access, mkdir, readFile, rename, rm, writeFile, ...operationOverrides };
  const nonce = `${process.pid}.${Date.now()}`;
  const stages = updates.map((update, index) => {
    const target = path.resolve(update.target);
    const directory = path.dirname(target);
    const basename = path.basename(target);
    return {
      target,
      content: update.content,
      directory,
      temporary: path.join(directory, `.${basename}.${nonce}.${index}.tmp`),
      backup: path.join(directory, `.${basename}.${nonce}.${index}.bak`),
      backedUp: false,
      promoted: false,
    };
  });

  try {
    for (const stage of stages) {
      await operations.mkdir(stage.directory, { recursive: true });
      await operations.writeFile(stage.temporary, stage.content, 'utf8');
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
      await operations.rename(stage.temporary, stage.target);
      stage.promoted = true;
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const stage of [...stages].reverse()) {
      try {
        if (stage.promoted) await operations.rm(stage.target, { force: true });
        if (stage.backedUp) {
          await operations.rename(stage.backup, stage.target);
          stage.backedUp = false;
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    await Promise.allSettled(
      stages.map((stage) => operations.rm(stage.temporary, { force: true })),
    );
    if (rollbackErrors.length) {
      const retained = stages
        .filter((stage) => stage.backedUp)
        .map((stage) => stage.backup)
        .join(', ');
      throw new AggregateError(
        [error, ...rollbackErrors],
        `Atomic replacement failed and rollback was incomplete. Backups retained at: ${retained}`,
      );
    }
    throw error;
  }

  await Promise.all(
    stages.map((stage) => (stage.backedUp ? operations.rm(stage.backup, { force: true }) : null)),
  );
}

export async function loadUpstream(options) {
  const source = options.sourceDir
    ? await createLocalSource(options.sourceDir, options.ref)
    : await createRemoteSource(options.ref);
  const functionPaths = [...source.paths].filter(
    (entry) => entry.startsWith(FUNCTIONS_PREFIX) && entry.endsWith('.java'),
  );
  if (functionPaths.length < 20)
    throw new Error('The Wynntils functions source tree is incomplete.');
  const [managerSource, englishSource, chineseSource] = await Promise.all([
    source.read(MANAGER_PATH),
    source.read(ENGLISH_PATH),
    source.read(CHINESE_PATH),
  ]);
  const javaSources = await mapWithConcurrency(functionPaths, UPSTREAM_READ_CONCURRENCY, (entry) =>
    source.read(entry),
  );
  const functionSources = new Map(
    functionPaths.map((entry, index) => [path.posix.basename(entry), javaSources[index]]),
  );
  return {
    metadata: { ref: source.ref, commit: source.commit, commitDate: source.commitDate },
    managerSource,
    functionSources,
    english: JSON.parse(englishSource),
    chinese: JSON.parse(chineseSource),
  };
}

export async function synchronize(options) {
  const existingSource = await readFile(options.output, 'utf8').catch(() => '');
  const requestedRef = resolveRequestedRef(options, existingSource);
  const load =
    options.loadCatalog ||
    (async () => {
      const upstream = await loadUpstream({ ...options, ref: requestedRef });
      const functions = buildCatalog(upstream);
      validateCandidate(functions, existingSource, options.allowLargeChange);
      return { metadata: upstream.metadata, functions };
    });
  const { metadata, functions } = await load();
  const pinned = parsePinnedProvenance(existingSource);
  const upstreamRef = String(metadata.ref || '').trim();
  const upstreamCommit = String(metadata.commit || '')
    .trim()
    .toLowerCase();
  const upstreamCommitDate = String(metadata.commitDate || '').trim();
  const payloadChanged = !isPayloadEquivalent(functions, existingSource);
  const provenanceChanged =
    pinned.ref !== upstreamRef ||
    pinned.commit !== upstreamCommit ||
    pinned.commitDate !== upstreamCommitDate;
  const summary = {
    count: functions.length,
    descriptions: functions.filter((entry) => entry.d).length,
    ...metadata,
    payloadChanged,
    pinnedRef: pinned.ref,
    provenanceChanged,
  };
  const currentIndex = await readFile(options.index, 'utf8');
  // A snapshot is self-consistent only when the committed files are exactly what this payload
  // renders to at the pinned provenance. Hand edits or merge leftovers fall through to the
  // regular write path so `--check` cannot get stuck on a tree the sync refuses to repair.
  const snapshotConsistent =
    pinned.healthy &&
    renderCatalog(functions, {
      ref: pinned.ref,
      commit: pinned.commit,
      commitDate: pinned.commitDate,
    }) === existingSource &&
    updateIndexVersion(currentIndex, pinned.ref, pinned.commit) === currentIndex;
  summary.snapshotConsistent = snapshotConsistent;
  // A newer release always resolves to a different ref than the pin. When the *same* ref now
  // resolves to a different commit or commit date (moved tag, hand-edited metadata) the pin is
  // wrong even though the payload matches, so refresh it instead of leaving `--check` red.
  const sameRefMoved =
    pinned.ref === upstreamRef &&
    (pinned.commit !== upstreamCommit || pinned.commitDate !== upstreamCommitDate);
  const wouldSkip =
    !options.check && !options.force && snapshotConsistent && !payloadChanged && !sameRefMoved;
  // Skipping certifies that `--check` can re-render the snapshot from the pinned ref, so the pin
  // itself is verified first; a pin that no longer resolves falls through to the repair path.
  const pinVerified = wouldSkip ? await pinStillResolves(pinned, upstreamRef, options) : true;
  summary.sameRefMoved = sameRefMoved;
  summary.pinVerified = pinVerified;
  if (wouldSkip && pinVerified) {
    // Provenance-only drift: the committed payload is still current, so the snapshot
    // keeps its pinned ref/commit and no generated file or cache version is touched.
    return { changed: false, ...summary };
  }
  const generatedSource = renderCatalog(functions, metadata);
  const updatedIndex = updateIndexVersion(currentIndex, metadata.ref, metadata.commit);
  const changed = generatedSource !== existingSource || updatedIndex !== currentIndex;
  if (options.check) {
    if (changed)
      throw new Error(
        sameRefMoved
          ? `The Wynntils function snapshot is stale: ${pinned.ref} resolves to ${upstreamCommit.slice(0, 12)} (${upstreamCommitDate || 'unknown date'}), not the pinned ${pinned.commit.slice(0, 12)} (${pinned.commitDate || 'unknown date'}). Run the sync command to re-pin it.`
          : 'The Wynntils function snapshot is stale. Run the sync command, or re-pin with --force if it reports no changes.',
      );
  } else if (changed) {
    await writeAtomicGroup([
      { target: options.output, content: generatedSource },
      { target: options.index, content: updatedIndex },
    ]);
  }
  return { changed, ...summary };
}

async function main() {
  const result = await synchronize(parseCli(process.argv.slice(2)));
  if (result.changed && !result.payloadChanged) {
    process.stdout.write(
      `Wynntils functions re-pinned: ${result.count} functions, upstream ${result.ref} @ ${result.commit.slice(0, 12)} has an identical function payload; snapshot re-pinned from ${result.pinnedRef || 'unknown'}.\n`,
    );
    return;
  }
  if (!result.changed && result.provenanceChanged) {
    const pinned = result.pinnedRef || result.ref;
    process.stdout.write(
      `Wynntils functions current: ${result.count} functions, upstream ${result.ref} @ ${result.commit.slice(0, 12)} has no function changes; snapshot stays pinned to ${pinned}.\n`,
    );
    return;
  }
  const state = result.changed ? 'updated' : 'current';
  process.stdout.write(
    `Wynntils functions ${state}: ${result.count} functions, ${result.descriptions} official zh_cn descriptions, ${result.ref} @ ${result.commit.slice(0, 12)}\n`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}
