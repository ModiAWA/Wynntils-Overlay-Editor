const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadCore() {
  const context = { AbortController, DOMException, clearTimeout, console, setTimeout, URL };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const file of [
    'js/functions.generated.js',
    'js/functions.zh.js',
    'js/resources.generated.js',
    'js/template-parser.js',
    'js/simulation-profile.js',
    'js/template-simulator.js',
    'js/draft-store.js',
    'js/canvas-renderer.js',
    'js/template-highlighter.js',
    'js/markdown-renderer.js',
    'js/ai-assistant.js',
    'js/function-catalog.js',
    'js/editor-formatting.js',
    'js/editor-core.js',
    'js/preview-controller.js',
    'js/function-browser.js',
    'js/ai-controller.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  }
  return {
    Core: context.WynntilsEditorCore,
    Canvas: context.WynntilsCanvasRenderer,
    Highlighter: context.WynntilsTemplateHighlighter,
    Markdown: context.WynntilsMarkdownRenderer,
    Ai: context.WynntilsAiAssistant,
    Simulator: context.WynntilsTemplateSimulator,
    Profile: context.WynntilsSimulationProfile,
    DraftStore: context.WynntilsDraftStore,
    Meta: context.WYNNTILS_FUNCTION_META,
    PreviewController: context.WynntilsPreviewController,
    FunctionBrowser: context.WynntilsFunctionBrowser,
    AiController: context.WynntilsAiController,
    SandboxContext: context,
  };
}

const {
  Core,
  Canvas,
  Highlighter,
  Markdown,
  Ai,
  Simulator,
  Profile,
  DraftStore,
  Meta,
  PreviewController,
  FunctionBrowser,
  AiController,
  SandboxContext,
} = loadCore();

test('extracted editor modules expose narrow, dependency-free contracts', () => {
  const details = PreviewController.warningDetails({
    unsupportedFunctions: ['fps'],
    warnings: [{ code: 'simulation-error', functionName: 'fps', start: 1, end: 6 }],
  });
  assert.equal(details.signature, 'simulation-error:fps');
  assert.equal(
    details.signature,
    PreviewController.warningDetails({
      unsupportedFunctions: ['fps'],
      warnings: [{ code: 'simulation-error', functionName: 'fps', start: 20, end: 25 }],
    }).signature,
  );
  assert.equal(details.names.length, 1);
  assert.equal(details.names[0], 'fps');
  assert.equal(details.warnings.length, 1);
  assert.equal(details.warnings[0].code, 'simulation-error');
  const browser = FunctionBrowser.create({
    search: (query, limit) => [query, limit],
    categories: (lang) => [lang],
    signature: (entry) => entry.n,
    insertion: (entry) => `{${entry.n}}`,
  });
  assert.deepEqual(browser.search('fps', 4), ['fps', 4]);
  assert.deepEqual(browser.categories('zh'), ['zh']);
  assert.equal(browser.signature({ n: 'fps' }), 'fps');
  assert.equal(browser.insertion({ n: 'fps' }), '{fps}');
  assert.equal(
    AiController.normalizeEndpoint('https://example.com/v1'),
    'https://example.com/v1/chat/completions',
  );
});

test('all bundled templates, including the general information example, validate', () => {
  assert.ok(Core.functions.length >= 300);
  assert.equal(Core.functions.length, Meta.count);
  assert.equal(Meta.repository, 'https://github.com/Wynntils/Wynntils');
  assert.match(Meta.ref, /^(?:v\d+\.\d+\.\d+|[0-9a-f]{7,40}|main)$/);
  assert.match(Meta.commit, /^[0-9a-f]{40}$/);
  assert.equal(Object.keys(Core.functions[0]).includes('d'), true);
  assert.equal(Object.keys(Core.functions[0]).includes('kw'), true);
  assert.equal(Core.functionIndex.get('fps').d, '当前FPS（每秒帧数）');
  for (const template of Core.TEMPLATES) {
    const result = Core.validateConfig(template.config, 'zh');
    assert.equal(result.valid, true, `${template.id}: ${JSON.stringify(result.errors)}`);
  }
  assert.match(Core.GENERAL_INFO_CONTENT, /\{world\}/);
  assert.match(Core.GENERAL_INFO_CONTENT, /dry_raid_reward_pulls/);
});

test('official Wynntils source parser handles aliases, required arguments, and inherited optional arguments', async () => {
  const Sync = await import(pathToFileURL(path.join(ROOT, 'scripts/sync-functions.mjs')).href);
  const managerSource = [
    'registerFunction(new DemoFunctions.SampleValueFunction());',
    'registerFunction(new DemoFunctions.AnyChoice());',
  ].join('\n');
  const javaSource = `
    public class DemoFunctions {
      public static class SampleValueFunction extends GenericFunction<String> {
        public FunctionArguments.RequiredArgumentBuilder getRequiredArgumentsBuilder() {
          return new FunctionArguments.RequiredArgumentBuilder(List.of(
            new Argument<>("name", String.class, null),
            new AnyArgumentList("values")));
        }
        protected List<String> getAliases() { return List.of("sv", "sample"); }
      }
      private abstract static class Shared<T> extends Function<T> {
        public FunctionArguments.Builder getArgumentsBuilder() {
          return new FunctionArguments.OptionalArgumentBuilder(List.of(
            new Argument<>("index", Integer.class, 0)));
        }
      }
      public static class AnyChoice extends Shared<Boolean> {}
    }
  `;
  const functions = Sync.buildCatalog({
    managerSource,
    functionSources: new Map([['DemoFunctions.java', javaSource]]),
    english: {
      'function.wynntils.generic.sampleValue.description': 'Sample value',
      'function.wynntils.anyChoice.description': 'Any choice',
    },
    chinese: {
      'function.wynntils.generic.sampleValue.description': '示例值',
    },
    minimumFunctionCount: 2,
    minimumArgumentCount: 1,
    requiredFunctions: ['sample_value', 'any_choice'],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(functions)), [
    { n: 'any_choice', a: [], r: 'Boolean', p: [['index', 'Integer', false]] },
    {
      n: 'sample_value',
      a: ['sv', 'sample'],
      r: 'String',
      p: [
        ['name', 'String', true],
        ['values', 'List', true],
      ],
      d: '示例值',
    },
  ]);
  assert.throws(
    () => Sync.validateCandidate(new Array(300), 'window.WYNNTILS_FUNCTION_META={"count":459};'),
    /Refusing to replace 459 functions with only 300/,
  );
});

test('official Wynntils sync rolls back both generated files when replacement is interrupted', async () => {
  const Sync = await import(pathToFileURL(path.join(ROOT, 'scripts/sync-functions.mjs')).href);
  const temporaryDirectory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'wynntils-editor-sync-'),
  );
  const output = path.join(temporaryDirectory, 'functions.generated.js');
  const index = path.join(temporaryDirectory, 'index.html');
  await fs.promises.writeFile(output, 'old functions', 'utf8');
  await fs.promises.writeFile(index, 'old index', 'utf8');

  try {
    await assert.rejects(
      Sync.writeAtomicGroup(
        [
          { target: output, content: 'new functions' },
          { target: index, content: 'new index' },
        ],
        {
          rename: async (source, target) => {
            if (source.endsWith('.tmp') && target === index) {
              throw new Error('simulated second-file replacement failure');
            }
            return fs.promises.rename(source, target);
          },
        },
      ),
      /simulated second-file replacement failure/,
    );
    assert.equal(await fs.promises.readFile(output, 'utf8'), 'old functions');
    assert.equal(await fs.promises.readFile(index, 'utf8'), 'old index');
  } finally {
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('official Wynntils resource parser preserves providers and rejects unsafe input', async () => {
  const Sync = await import(pathToFileURL(path.join(ROOT, 'scripts/sync-resources.mjs')).href);
  const five = Sync.parseManifest(
    JSON.stringify({
      providers: [
        {
          type: 'bitmap',
          file: 'wynntils:font/chat/five.png',
          ascent: 6,
          height: 7,
          chars: ['ABCDEFGHIJKLMNOP', 'QRSTUVWXYZ?[]\\%&', '0123456789!()<=>'],
        },
      ],
    }),
    'five',
  );
  const banners = Sync.parseManifest(
    JSON.stringify({
      providers: [
        {
          type: 'bitmap',
          file: 'wynntils:font/chat/ribbon_start.png',
          ascent: 7,
          height: 8,
          chars: ['\uE008'],
        },
      ],
    }),
    'banners',
  );
  assert.equal(five[0].sourcePath.endsWith('/five.png'), true);
  assert.equal(banners[0].codepoint, 0xe008);
  assert.equal(
    Sync.currentCommit(fs.readFileSync(path.join(ROOT, 'js/resources.generated.js'), 'utf8')),
    '0a03ed7ae17757304077134c5e60299877941e62',
  );
  const notice = fs.readFileSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  assert.match(Sync.updateNotice(notice, 'b'.repeat(40)), /上游 commit：`b{40}`/);
  const data = Sync.buildResourceData('a'.repeat(40), [five, banners], {
    five: { width: 3, height: 14 },
    ribbon_start: { width: 7, height: 8 },
  });
  assert.equal(data.assets.five.width, 3);
  assert.match(Sync.renderResources(data), /WYNNTILS_FONT_RESOURCES/);
  assert.throws(
    () =>
      Sync.parseManifest(
        JSON.stringify({
          providers: [
            {
              type: 'bitmap',
              file: 'https://evil.example/font.png',
              ascent: 1,
              height: 1,
              chars: ['x'],
            },
          ],
        }),
        'five',
      ),
    /unsupported file/,
  );
});

test('resource replacement atomically restores deleted and replaced files on failure', async () => {
  const Sync = await import(pathToFileURL(path.join(ROOT, 'scripts/sync-resources.mjs')).href);
  const temporaryDirectory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'wynntils-editor-resource-sync-'),
  );
  const output = path.join(temporaryDirectory, 'resources.generated.js');
  const stale = path.join(temporaryDirectory, 'stale.png');
  const fresh = path.join(temporaryDirectory, 'fresh.png');
  await fs.promises.writeFile(output, 'old resources');
  await fs.promises.writeFile(stale, Buffer.from('stale'));
  try {
    await assert.rejects(
      Sync.writeAtomicGroup(
        [
          { target: output, content: 'new resources' },
          { target: stale, remove: true },
          { target: fresh, content: Buffer.from('fresh') },
        ],
        {
          rename: async (source, target) => {
            if (source.endsWith('.tmp') && target === fresh) throw new Error('simulated failure');
            return fs.promises.rename(source, target);
          },
        },
      ),
      /simulated failure/,
    );
    assert.equal(await fs.promises.readFile(output, 'utf8'), 'old resources');
    assert.equal(await fs.promises.readFile(stale, 'utf8'), 'stale');
    assert.equal(fs.existsSync(fresh), false);
  } finally {
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('snapshot checks reuse the committed ref while explicit sync refs still win', async () => {
  const Sync = await import(pathToFileURL(path.join(ROOT, 'scripts/sync-functions.mjs')).href);
  const existingSource = fs.readFileSync(path.join(ROOT, 'js/functions.generated.js'), 'utf8');
  assert.equal(
    Sync.resolveRequestedRef({ check: true, ref: '', sourceDir: '' }, existingSource),
    Meta.ref,
  );
  assert.equal(
    Sync.resolveRequestedRef({ check: true, ref: 'main', sourceDir: '' }, existingSource),
    'main',
  );
  assert.equal(
    Sync.resolveRequestedRef({ check: false, ref: '', sourceDir: '' }, existingSource),
    '',
  );
});

test('semantic search understands Chinese descriptions and direct names', () => {
  assert.equal(Core.semanticSearch('帧率', 1)[0].n, 'fps');
  assert.equal(Core.semanticSearch('当前世界', 1)[0].n, 'current_world');
  assert.equal(Core.semanticSearch('fps', 1)[0].n, 'fps');
  assert.ok(
    Core.semanticSearch('生命值', 8).some(
      (entry) => entry.n === 'health' || entry.n === 'capped_health',
    ),
  );
  assert.match(Core.functionSignature(Core.functionIndex.get('adavg')), /area_damage_average/);
  assert.equal(Core.functionInsertion(Core.functionIndex.get('fps')), '{fps}');
});

test('every generated function insertion is valid editor content', () => {
  for (const entry of Core.functions) {
    const content = Core.functionInsertion(entry);
    const result = Core.validateConfig({ ...Core.defaultConfig(), content }, 'zh');
    assert.equal(result.valid, true, `${entry.n}: ${content} ${JSON.stringify(result.errors)}`);
  }
});

test('variadic function insertions use examples that match their list element types', () => {
  const expected = {
    add: '{add(1.5;2.5)}',
    and: '{and(true;false)}',
    concat: '{concat("Example";" Text")}',
    concat_styled_text: '{concat_styled_text(styled_text("Example");styled_text(" Text"))}',
    max: '{max(1.5;2.5)}',
    min: '{min(1.5;2.5)}',
    multiply: '{multiply(1.5;2.5)}',
    or: '{or(true;false)}',
    switch_case: '{switch_case("value";"default";"value";"matched")}',
  };
  for (const [name, insertion] of Object.entries(expected)) {
    const entry = Core.functionIndex.get(name);
    assert.equal(Core.functionInsertion(entry), insertion, name);
    assert.equal(Simulator.functionInsertion(entry), insertion, `${name} simulator fallback`);
  }
  for (const name of ['add', 'max', 'min', 'multiply']) {
    const insertion = Core.functionInsertion(Core.functionIndex.get(name));
    const evaluated = Simulator.evaluateExpression(insertion.slice(1, -1));
    assert.equal(Number.isFinite(evaluated.value), true, `${name}: ${insertion}`);
  }
});

test('validator provides friendly errors for the required field, color, and boolean condition', () => {
  const result = Core.validateConfig(
    {
      ...Core.defaultConfig(),
      content: '',
      backgroundColor: 'red',
      enabledTemplate: '{fps}',
    },
    'zh',
  );
  assert.ok(result.errors.some((error) => error.field === 'content' && /内容/.test(error.message)));
  assert.ok(
    result.errors.some((error) => error.field === 'backgroundColor' && /颜色/.test(error.message)),
  );
  assert.ok(
    result.errors.some(
      (error) => error.field === 'enabledTemplate' && /Boolean/.test(error.message),
    ),
  );
  assert.equal(
    Core.validateConfig({ ...Core.defaultConfig(), content: '{not_a_function}' }, 'zh').valid,
    false,
  );
});

test('Chinese and English dictionaries use the same key set', () => {
  assert.deepEqual(Object.keys(Core.I18N.zh).sort(), Object.keys(Core.I18N.en).sort());
  assert.equal(Core.tr('zh', 'copyContent'), '复制内容');
  assert.equal(Core.tr('en', 'copyContent'), 'Copy Content');
});

test('draft storage persists only the explicit Info Box configuration whitelist', () => {
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
  const store = DraftStore.create(storage);
  const config = {
    ...Core.defaultConfig(),
    content: '&b{fps}',
    apiKey: 'do-not-save',
    endpoint: 'https://private.example/v1',
    aiHistory: [{ role: 'user', content: 'private' }],
  };
  assert.equal(store.save(config).ok, true);
  const raw = storage.getItem(store.key);
  assert.doesNotMatch(raw, /do-not-save|private\.example|aiHistory/);
  assert.deepEqual(JSON.parse(JSON.stringify(store.load().config)), {
    ...Core.defaultConfig(),
    content: '&b{fps}',
  });
});

test('draft storage rejects invalid timestamps and known fields with corrupted types', () => {
  const base = {
    schemaVersion: DraftStore.VERSION,
    updatedAt: '2026-09-02T00:00:00.000Z',
    content: '{fps}',
  };
  const invalidPayloads = [
    { ...base, updatedAt: 'not-a-timestamp' },
    { ...base, content: {} },
    { ...base, colorTemplate: 1 },
    { ...base, textShadow: false },
    { ...base, fontScale: '1' },
    { ...base, fitText: 'true' },
    { ...base, backgroundColor: [] },
    { ...base, backgroundBorderWidth: null },
    { ...base, enabledTemplate: 0 },
  ];

  for (const payload of invalidPayloads) {
    const store = DraftStore.create({
      getItem: () => JSON.stringify(payload),
      setItem() {},
    });
    const loaded = store.load();
    assert.equal(loaded.ok, false, JSON.stringify(payload));
    assert.equal(loaded.reason, 'invalid', JSON.stringify(payload));
    assert.equal(store.parse(JSON.stringify(payload)), null, JSON.stringify(payload));
  }
});

test('draft session blocks incompatible schemas until the user explicitly replaces them', () => {
  const values = new Map([
    [
      DraftStore.KEY,
      JSON.stringify({
        schemaVersion: DraftStore.VERSION + 1,
        updatedAt: '2026-09-01T12:00:00.000Z',
        content: 'future draft',
      }),
    ],
  ]);
  const storage = {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
  const session = DraftStore.createSession(storage);

  const loaded = session.load();
  assert.equal(loaded.ok, false);
  assert.equal(loaded.reason, 'unsupported-schema');
  assert.equal(session.state().status, 'unsupported-schema');
  assert.equal(session.save({ ...Core.defaultConfig(), content: 'new draft' }).reason, 'blocked');
  assert.match(values.get(DraftStore.KEY), /future draft/);

  const replaced = session.keepCurrent({ ...Core.defaultConfig(), content: 'new draft' });
  assert.equal(replaced.ok, true);
  assert.equal(session.state().status, 'ready');
  assert.equal(JSON.parse(values.get(DraftStore.KEY)).content, 'new draft');
});

test('draft session preserves a newer tab update until the user resolves the conflict', () => {
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
  const session = DraftStore.createSession(storage);
  session.load();
  const local = session.save({ ...Core.defaultConfig(), content: 'local' });
  assert.equal(local.ok, true);
  const incoming = DraftStore.payloadFromConfig({ ...Core.defaultConfig(), content: 'remote' });
  incoming.updatedAt = '9999-12-31T23:59:59.999Z';

  const offered = session.offer(JSON.stringify(incoming));
  assert.equal(offered.ok, true);
  assert.equal(offered.conflict, true);
  assert.equal(session.state().status, 'conflict');
  assert.equal(
    session.save({ ...Core.defaultConfig(), content: 'pending local' }).reason,
    'blocked',
  );

  const accepted = session.acceptIncoming();
  assert.equal(accepted.ok, true);
  assert.equal(accepted.config.content, 'remote');
  assert.equal(session.state().status, 'ready');
});

test('content color picker inserts or wraps Wynntils hex formatting codes', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(Core.applyContentColor('FPS', 0, 3, '#ff3366'))), {
    value: '&#FF3366FFFPS&r',
    caret: 15,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(Core.applyContentColor('FPS', 3, 3, '#12abef'))), {
    value: 'FPS&#12ABEFFF',
    caret: 13,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(Core.applyContentColor('FPS', 0, 3, 'invalid'))), {
    value: 'FPS',
    caret: 3,
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(Core.applyContentColor('&lHello world', 2, 7, '#ff0000'))),
    {
      value: '&l&#FF0000FF&lHello&r&l world',
      caret: 23,
    },
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(Core.applyContentColor('&{fr:wynntils_five}&aHi there', 21, 23, '#123456')),
    ),
    {
      value: '&{fr:wynntils_five}&a&#123456FFHi&r&{fr:wynntils_five}&a there',
      caret: 56,
    },
  );
});

test('literal Content colors require eight hex digits and malformed format codes block readiness', () => {
  const defaults = Core.defaultConfig();
  assert.equal(Core.lintContent('&#FF3366text', 'zh').valid, false);
  assert.equal(Core.lintContent('&#FF3366FFtext', 'zh').valid, true);
  assert.equal(Core.validateConfig({ ...defaults, content: '&#FF3366text' }, 'zh').valid, false);
  assert.equal(Core.validateConfig({ ...defaults, content: '&ztext' }, 'zh').valid, false);
  assert.equal(Core.validateConfig({ ...defaults, content: '&#GGGGGGGGtext' }, 'zh').valid, false);
});

test('format-code scanning ignores braces and ampersands inside quoted expressions', () => {
  const valid = '{concat("}";"&z")}';
  assert.equal(Core.lintContent(valid, 'zh').valid, true);
  assert.equal(Core.validateConfig({ ...Core.defaultConfig(), content: valid }, 'zh').valid, true);
  assert.equal(Core.lintContent('prefix &z suffix', 'zh').valid, false);
});

test('manual content insertion replaces the selected range and advances the caret', () => {
  const replaced = Core.insertContent('ABC', 1, 2, '\uE040');
  assert.equal(replaced.value, 'A\uE040C');
  assert.equal(replaced.caret, 2);
  const appended = Core.insertContent('ABC', 3, 3, '\uE010\u2064');
  assert.equal(appended.value, 'ABC\uE010\u2064');
  assert.equal(appended.caret, 5);
});

test('AI assistant normalizes compatible endpoints and extracts explicit proposals', () => {
  assert.equal(
    Ai.normalizeEndpoint('https://example.com/v1'),
    'https://example.com/v1/chat/completions',
  );
  assert.equal(
    Ai.normalizeEndpoint('http://127.0.0.1:11434/v1/chat/completions'),
    'http://127.0.0.1:11434/v1/chat/completions',
  );
  assert.throws(() => Ai.normalizeEndpoint('javascript:alert(1)'), /http/i);
  assert.throws(() => Ai.normalizeEndpoint('https://user:secret@example.com/v1'), /credential/i);
  assert.equal(Ai.extractProposal('建议如下：\n```wynntils\n&a{fps} FPS\n```'), '&a{fps} FPS');
  assert.equal(Ai.extractProposal('```text\n&b{current_world}\n```'), '&b{current_world}');
  assert.equal(Ai.extractProposal('```wynntils\n  &7line\n\n```'), '  &7line\n');
  assert.equal(Ai.extractProposal('```\n&a{fps} FPS\n```'), '');
  assert.equal(Ai.extractProposal('只有解释，没有代码块'), '');
});

test('AI assistant only permits plaintext HTTP for loopback endpoints', () => {
  for (const endpoint of [
    'http://localhost:11434/v1',
    'http://model.localhost/v1',
    'http://127.0.0.2:11434/v1',
    'http://[::1]:11434/v1',
  ]) {
    assert.doesNotThrow(() => Ai.normalizeEndpoint(endpoint), endpoint);
  }
  for (const endpoint of [
    'http://example.com/v1',
    'http://192.168.1.10:11434/v1',
    'http://127.example.com/v1',
    'http://127.0.0.1.example.com/v1',
  ]) {
    assert.throws(() => Ai.normalizeEndpoint(endpoint), /HTTPS|loopback/i, endpoint);
  }
});

test('AI assistant derives and parses OpenAI-compatible model lists', () => {
  assert.equal(
    Ai.normalizeModelsEndpoint('https://example.com/v1'),
    'https://example.com/v1/models',
  );
  assert.equal(
    Ai.normalizeModelsEndpoint('https://example.com/openai/v1/chat/completions'),
    'https://example.com/openai/v1/models',
  );
  assert.equal(
    Ai.normalizeModelsEndpoint('http://127.0.0.1:1234/v1/models'),
    'http://127.0.0.1:1234/v1/models',
  );
  assert.throws(() => Ai.normalizeModelsEndpoint('https://example.com/custom-chat'), /standard/i);
  assert.deepEqual(
    Array.from(
      Ai.extractModelIds({
        data: [{ id: 'gpt-10' }, { id: 'gpt-4' }, { id: 'gpt-4' }, { name: 'local' }],
      }),
    ),
    ['gpt-4', 'gpt-10', 'local'],
  );
});

test('AI assistant limits history and local function context in its prompt', () => {
  const history = Array.from({ length: 15 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `history-${index}`,
  }));
  history.splice(12, 0, { role: 'error', content: 'do not send this' });
  const functionCandidates = Array.from({ length: 12 }, (_, index) => ({
    signature: `function_${index}()`,
    description: `description-${index}`,
  }));
  const messages = Ai.buildMessages({
    language: 'zh',
    history,
    userMessage: '显示 FPS 和当前世界',
    currentConfig: { content: '&f{fps}\n{concat("A";"B")}', textShadow: 'OUTLINE' },
    functionCandidates,
  });
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /不要编造函数/);
  assert.equal(
    messages[0].content.includes('concat("\\n ...") 这类引号字符串内的转义是合法函数参数'),
    true,
  );
  assert.equal(
    messages.some((message) => message.content.includes('history-0')),
    false,
  );
  assert.equal(
    messages.some((message) => message.content.includes('do not send this')),
    false,
  );
  assert.match(messages.at(-1).content, /显示 FPS 和当前世界/);
  assert.match(
    messages.at(-1).content,
    /```wynntils-current\n&f\{fps\}\n\{concat\("A";"B"\)\}\n```/,
  );
  assert.doesNotMatch(messages.at(-1).content, /"content"\s*:/);
  assert.match(messages.at(-1).content, /"textShadow": "OUTLINE"/);
  assert.match(messages.at(-1).content, /function_0\(\).*description-0/);
  assert.match(messages.at(-1).content, /function_9\(\).*description-9/);
  assert.doesNotMatch(messages.at(-1).content, /function_10\(/);
  assert.match(messages.at(-1).content, /Wynntils 标题字形参考/);
  assert.match(messages.at(-1).content, /A=/);
  assert.match(messages.at(-1).content, /Z=/);
});

test('AI title glyph reference lists the complete A-Z alphabet and composition controls', () => {
  const reference = Ai.buildTitleGlyphReference('zh');
  for (let index = 0; index < 26; index += 1) {
    const letter = String.fromCharCode(65 + index);
    const glyph = String.fromCodePoint(0xe040 + index);
    assert.match(reference, new RegExp(`${letter}=${glyph}(?:\\s|$)`));
  }
  assert.match(reference, /⁤/);
  assert.match(reference, //);
  assert.match(reference, /⁤&#0caadfff/);
});

test('AI proposal guard rejects JSON-escaped Content before it can be applied', () => {
  const quoted = '"&a{fps}\\n{if\\_str(gte(money;64);\\"yes\\";\\"no\\")}"';
  const result = Ai.validateProposalFormat(quoted, 'zh');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /引号|JSON/.test(error.message)));
  assert.ok(result.errors.some((error) => /换行|\\n/.test(error.message)));
  assert.ok(result.errors.some((error) => /反斜杠|下划线/.test(error.message)));
  assert.equal(Ai.validateProposalFormat('&a{fps}\n&7正常文本', 'zh').valid, true);
  assert.equal(
    Ai.validateProposalFormat('{concat("\\n &7» ";string(dry_p);"&7 PULLS\\n")}', 'zh').valid,
    true,
  );
  const remainingArtifacts = Ai.validateProposalFormat(
    '&7{if\\_str(gte(money;64);"yes";"no")}\\\\&#x20;next',
    'zh',
  );
  assert.equal(remainingArtifacts.valid, false);
  assert.ok(remainingArtifacts.errors.some((error) => /下划线|标识符/.test(error.message)));
  assert.ok(remainingArtifacts.errors.some((error) => /HTML|空格/.test(error.message)));
  assert.ok(remainingArtifacts.errors.some((error) => /反斜杠/.test(error.message)));
});

test('AI agent can make two bounded corrections when the first fix is still invalid', async () => {
  const turns = [
    Ai.createTextTurn('```wynntils\n"&a{fps}\\n&7{annihilation\\_dry\\_count}"\n```'),
    Ai.createTextTurn('```wynntils\n&a{fps}\n&7{annihilation\\_dry\\_count}\n```'),
    Ai.createTextTurn('```wynntils\n&a{fps}\n&7{annihilation_dry_count}\n```'),
  ];
  const result = await Ai.runAgent({
    messages: [{ role: 'user', content: '增加 Anni 未出货次数' }],
    requestTurn: async () => turns.shift(),
    searchFunctions: () => [],
    validateProposal: (content) => Ai.validateProposalFormat(content, 'zh'),
  });
  assert.equal(result.correctionCount, 2);
  assert.equal(result.requestCount, 3);
  assert.equal(result.proposal, '&a{fps}\n&7{annihilation_dry_count}');
});

test('AI markdown tokenizer recognizes paragraphs, bold text, and fenced Wynntils Content', () => {
  const tokens = Markdown.tokenize('下面是 **完整版本**：\n\n```wynntils\n&a{fps} FPS\n```');
  assert.deepEqual(JSON.parse(JSON.stringify(tokens)), [
    {
      type: 'paragraph',
      parts: [
        { type: 'text', text: '下面是 ' },
        { type: 'strong', text: '完整版本' },
        { type: 'text', text: '：' },
      ],
    },
    { type: 'code', language: 'wynntils', text: '&a{fps} FPS' },
  ]);
});

test('AI assistant sends an OpenAI-compatible request without persisting credentials', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '完成' } }] }),
    };
  };
  const response = await Ai.requestChat(
    {
      endpoint: 'https://example.com/v1',
      apiKey: 'test-secret',
      model: 'demo-model',
      messages: [{ role: 'user', content: '设计一个 FPS 信息框' }],
    },
    fetchImpl,
  );
  assert.equal(response, '完成');
  assert.equal(request.url, 'https://example.com/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer test-secret');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.referrerPolicy, 'no-referrer');
  assert.equal(JSON.parse(request.options.body).model, 'demo-model');
});

test('AI assistant parses standard tool calls and sends the local search tool declaration', async () => {
  let request;
  const turn = await Ai.requestChatTurn(
    {
      endpoint: 'https://example.com/v1',
      model: 'demo-model',
      messages: [{ role: 'user', content: '查找 anni 保底次数' }],
      useTools: true,
    },
    async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_anni',
                    type: 'function',
                    function: {
                      name: 'search_wynntils_functions',
                      arguments: '{"query":"anni cache dry count"}',
                    },
                  },
                ],
              },
            },
          ],
        }),
      };
    },
  );
  const body = JSON.parse(request.options.body);
  assert.equal(body.tools[0].function.name, 'search_wynntils_functions');
  assert.deepEqual(JSON.parse(JSON.stringify(turn.toolCalls)), [
    {
      id: 'call_anni',
      name: 'search_wynntils_functions',
      query: 'anni cache dry count',
    },
  ]);
  assert.equal(turn.text, '');
  assert.equal(turn.message.tool_calls[0].id, 'call_anni');
});

test('AI assistant applies timeout to each individual completion request', async () => {
  await assert.rejects(
    Ai.requestChatTurn(
      {
        endpoint: 'https://example.com/v1',
        model: 'demo-model',
        messages: [{ role: 'user', content: 'hello' }],
        timeoutMs: 5,
      },
      async (_url, options) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({ choices: [{ message: { content: 'late response' } }] }),
              }),
            30,
          );
          options.signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        }),
    ),
    (error) => error?.code === 'request_timeout',
  );
});

test('AI assistant recognizes the text search fallback used by compatible endpoints', () => {
  assert.deepEqual(
    Array.from(
      Ai.extractTextSearches(
        '我需要先查函数。\n```wynntils-search\nanni cache dry count\n```\n继续等待结果。',
      ),
    ),
    ['anni cache dry count'],
  );
  assert.deepEqual(Array.from(Ai.extractTextSearches('```wynntils\n{fps}\n```')), []);
});

test('AI agent falls back when a compatible endpoint rejects standard tools', async () => {
  const toolModes = [];
  const result = await Ai.runAgent({
    messages: [{ role: 'user', content: '显示 fps' }],
    requestTurn: async ({ useTools }) => {
      toolModes.push(useTools);
      if (toolModes.length === 1) {
        const error = new Error('tools are unsupported');
        error.status = 400;
        throw error;
      }
      if (toolModes.length === 2) return Ai.createTextTurn('```wynntils-search\nfps\n```');
      return Ai.createTextTurn('```wynntils\n{fps}\n```');
    },
    searchFunctions: () => [Core.functionIndex.get('fps')],
  });
  assert.deepEqual(toolModes, [true, false, false]);
  assert.equal(result.proposal, '{fps}');
  assert.equal(result.requestCount, 3);
  assert.equal(result.usedTextFallback, true);
});

test('AI agent executes at most three unique local searches', async () => {
  let capturedToolMessages = [];
  let requestIndex = 0;
  const result = await Ai.runAgent({
    messages: [{ role: 'user', content: '查一些函数' }],
    requestTurn: async ({ messages }) => {
      requestIndex += 1;
      if (requestIndex === 1) {
        const calls = ['fps', 'ping', 'world', 'health'].map((query, index) => ({
          id: `call_${index}`,
          type: 'function',
          function: {
            name: 'search_wynntils_functions',
            arguments: JSON.stringify({ query }),
          },
        }));
        return {
          text: '',
          message: { role: 'assistant', content: null, tool_calls: calls },
          toolCalls: calls.map((call) => ({
            id: call.id,
            name: call.function.name,
            query: JSON.parse(call.function.arguments).query,
          })),
        };
      }
      capturedToolMessages = messages.filter((message) => message.role === 'tool');
      return Ai.createTextTurn('没有需要应用的修改。');
    },
    searchFunctions: (query) => Core.semanticSearch(query, 1),
  });
  assert.equal(result.searchCount, 3);
  assert.equal(capturedToolMessages.length, 4);
  assert.match(capturedToolMessages[3].content, /search limit/i);
});

test('AI agent can recover the Anni function from a second-round local search', async () => {
  const prompt = '你帮我在现在的版本上 增加anni的未出cache次数';
  assert.equal(
    Core.semanticSearch(prompt, 8).some((entry) => entry.n === 'annihilation_dry_count'),
    false,
  );
  const seenMessages = [];
  const result = await Ai.runAgent({
    messages: Ai.buildMessages({
      language: 'zh',
      history: [],
      userMessage: prompt,
      currentConfig: Core.defaultConfig(),
      functionCandidates: [],
    }),
    requestTurn: async ({ messages }) => {
      seenMessages.push(JSON.parse(JSON.stringify(messages)));
      if (seenMessages.length === 1) {
        return Ai.createTextTurn('```wynntils-search\nanni cache dry count\n```');
      }
      assert.match(JSON.stringify(messages), /annihilation_dry_count/);
      return Ai.createTextTurn(
        '已增加：\n```wynntils\n&6Anni 未出 Cache：&f{annihilation_dry_count}\n```',
      );
    },
    searchFunctions: (query) => Core.semanticSearch(query, 12),
    validateProposal: (content) => {
      const validation = Core.analyzeTemplate(content, 'zh');
      return {
        valid: validation.valid,
        errors: validation.valid ? [] : [{ message: validation.message }],
      };
    },
  });
  assert.equal(result.proposal, '&6Anni 未出 Cache：&f{annihilation_dry_count}');
  assert.equal(result.searchCount, 1);
  assert.equal(result.requestCount, 2);
});

test('AI agent deduplicates searches and stops after two invalid corrections', async () => {
  let searches = 0;
  const turns = [
    Ai.createTextTurn('```wynntils-search\nfps\n```'),
    Ai.createTextTurn('```wynntils-search\n FPS \n```'),
    Ai.createTextTurn('```wynntils\n{invented_function}\n```'),
    Ai.createTextTurn('```wynntils\n{still_invented}\n```'),
    Ai.createTextTurn('```wynntils\n{still_invalid_after_two_corrections}\n```'),
  ];
  const result = await Ai.runAgent({
    messages: [{ role: 'user', content: '显示帧率' }],
    requestTurn: async () => turns.shift(),
    searchFunctions: () => {
      searches += 1;
      return [Core.functionIndex.get('fps')];
    },
    validateProposal: (content) => {
      const validation = Core.analyzeTemplate(content, 'zh');
      return {
        valid: validation.valid,
        errors: validation.valid ? [] : [{ message: validation.message }],
      };
    },
  });
  assert.equal(searches, 1);
  assert.equal(result.searchCount, 1);
  assert.equal(result.requestCount, 5);
  assert.equal(result.correctionCount, 2);
  assert.equal(result.proposal, '');
  assert.equal(result.validation.valid, false);
});

test('AI agent forwards tool results and aborts the entire multi-turn loop', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    Ai.runAgent({
      messages: [{ role: 'user', content: '查找 fps' }],
      signal: controller.signal,
      requestTurn: async ({ messages }) => {
        calls += 1;
        if (calls === 1) {
          return Ai.createToolTurn('call_fps', 'search_wynntils_functions', 'fps');
        }
        assert.equal(messages.at(-1).role, 'tool');
        assert.equal(messages.at(-1).tool_call_id, 'call_fps');
        controller.abort();
        throw new DOMException('Aborted', 'AbortError');
      },
      searchFunctions: () => [Core.functionIndex.get('fps')],
    }),
    (error) => error?.name === 'AbortError',
  );
  assert.equal(calls, 2);
});

test('AI assistant fetches model lists with the same optional authorization boundary', async () => {
  let request;
  const models = await Ai.requestModels(
    {
      endpoint: 'https://example.com/v1/chat/completions',
      apiKey: 'test-secret',
    },
    async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({ data: [{ id: 'model-b' }, { id: 'model-a' }] }),
      };
    },
  );
  assert.deepEqual(Array.from(models), ['model-a', 'model-b']);
  assert.equal(request.url, 'https://example.com/v1/models');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers.Authorization, 'Bearer test-secret');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.referrerPolicy, 'no-referrer');
  assert.equal('body' in request.options, false);
});

test('AI assistant omits authorization when no key is supplied and reports endpoint errors', async () => {
  let requestOptions;
  const success = await Ai.requestChat(
    {
      endpoint: 'https://example.com/v1/chat/completions',
      model: 'local-model',
      messages: [{ role: 'user', content: 'hello' }],
    },
    async (_url, options) => {
      requestOptions = options;
      return {
        ok: true,
        json: async () => ({ output_text: 'local response' }),
      };
    },
  );
  assert.equal(success, 'local response');
  assert.equal(Object.hasOwn(requestOptions.headers, 'Authorization'), false);

  await assert.rejects(
    Ai.requestChat(
      {
        endpoint: 'https://example.com/v1',
        model: 'demo-model',
        messages: [{ role: 'user', content: 'hello' }],
      },
      async () => ({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'rate limited' } }),
      }),
    ),
    /rate limited/,
  );
  await assert.rejects(
    Ai.requestChat(
      {
        endpoint: 'https://example.com/v1',
        model: 'demo-model',
        messages: [{ role: 'user', content: 'hello' }],
      },
      async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError('invalid JSON');
        },
      }),
    ),
    /invalid JSON/,
  );
});

test('Canvas parser preserves Minecraft colors, formatting, alpha, resets, and literal text', () => {
  const parsed = Canvas.parseFormattedText('&aA&#12ab34ccB&lC\\n&r<b>D</b>');
  assert.equal(parsed.lines.length, 2);
  assert.equal(parsed.lines[0][0].char, 'A');
  assert.equal(parsed.lines[0][0].style.color, '#55FF55FF');
  assert.equal(parsed.lines[0][1].style.color, '#12AB34CC');
  assert.equal(parsed.lines[0][2].style.bold, true);
  assert.equal(parsed.lines[1].map((glyph) => glyph.char).join(''), '<b>D</b>');
  assert.equal(parsed.lines[1][3].style.color, '#FFFFFFFF');
});

test('Canvas parser retains Wynntils shader sentinels as dynamic styles', () => {
  const parsed = Canvas.parseFormattedText('&#00F000FFRGB &#00F014FFshine');
  assert.equal(parsed.lines[0][0].style.shader, 'RAINBOW');
  assert.equal(parsed.lines[0][4].style.shader, 'SHINE');
  assert.equal(parsed.hasDynamicShader, true);

  const first = Canvas.resolveShaderAppearance('RAINBOW', 2, 1, 250);
  assert.deepEqual(first, Canvas.resolveShaderAppearance('RAINBOW', 2, 1, 250));
  assert.notEqual(first.color, Canvas.resolveShaderAppearance('RAINBOW', 2, 1, 750).color);
});

test('Canvas consumes structured styled-text controls emitted by simulated functions', () => {
  const evaluate = (expression) => Profile.displayValue(Simulator.evaluateExpression(expression));
  const atlas = Canvas.parseFormattedText(
    evaluate('with_atlas_sprite_font(styled_text("A");"wynntils";"sprite")'),
  );
  const player = Canvas.parseFormattedText(
    evaluate(
      'with_player_sprite_font(styled_text("B");"00000000-0000-0000-0000-000000000000";true)',
    ),
  );
  const shadow = Canvas.parseFormattedText(
    evaluate('with_shadow_color(styled_text("C");from_hex("#123456"))'),
  );
  assert.equal(atlas.lines[0].map((token) => token.char).join(''), 'A');
  assert.equal(player.lines[0].map((token) => token.char).join(''), 'B');
  assert.equal(shadow.lines[0].map((token) => token.char).join(''), 'C');
  assert.equal(atlas.lines[0][0].style.fontId, 'atlas:wynntils;sprite');
  assert.equal(player.lines[0][0].style.fontId, 'player:00000000-0000-0000-0000-000000000000;true');
  assert.equal(shadow.lines[0][0].style.shadowColor, '#123456FF');
});

test('Canvas parser uses resolvable Color Templates as its initial text color', () => {
  const direct = Canvas.resolveColorTemplate('#12ab34');
  assert.equal(direct.color, '#12AB34FF');
  assert.equal(direct.resolved, true);
  const fromRgb = Canvas.resolveColorTemplate('{from_rgb(18;171;52)}');
  assert.equal(fromRgb.color, '#12AB34FF');
  assert.equal(fromRgb.resolved, true);
  const legacy = Canvas.resolveColorTemplate('&a');
  assert.equal(legacy.color, '#55FF55FF');
  assert.equal(legacy.resolved, true);
  const dynamic = Canvas.resolveColorTemplate('{activity_color}');
  assert.equal(dynamic.color, '#FFFFFFFF');
  assert.equal(dynamic.resolved, false);
  const parsed = Canvas.parseFormattedText('A&rB&cC', undefined, '#12AB34FF');
  assert.equal(parsed.lines[0][0].style.color, '#12AB34FF');
  assert.equal(parsed.lines[0][1].style.color, '#12AB34FF');
  assert.equal(parsed.lines[0][2].style.color, '#FF5555FF');
});

test('template highlighter distinguishes text, formatting codes, functions, and arguments', () => {
  const source = '伤害 &a{if_str(gte(money;4096);"够";"不够")}\\n{fps:0}';
  const tokens = Highlighter.tokenizeTemplate(source);
  assert.equal(tokens.map((token) => token.value).join(''), source);
  assert.deepEqual(
    Array.from(
      tokens.filter((token) => token.type === 'function'),
      (token) => token.value,
    ),
    ['if_str', 'gte', 'fps'],
  );
  assert.ok(tokens.some((token) => token.type === 'format' && token.value === '&a'));
  assert.ok(tokens.some((token) => token.type === 'variable' && token.value === 'money'));
  assert.ok(tokens.some((token) => token.type === 'number' && token.value === '4096'));
  assert.ok(tokens.some((token) => token.type === 'string' && token.value === '"够"'));
  assert.ok(tokens.some((token) => token.type === 'escape' && token.value === '\\n'));
  assert.ok(
    Highlighter.tokenizeTemplate('{concat("oops)}').some((token) => token.type === 'error'),
  );
});

test('template highlighter exposes readable labels for Wynntils private-use glyphs', () => {
  const glyphs = '\uE051\uE044\uE056\uE040\uE051\uE043 \uE04F\uE054\uE04B\uE04B\uE052 \uE060';
  assert.equal(Highlighter.readableWynntilsGlyphs(glyphs), 'REWARD PULLS 0');
  assert.equal(Highlighter.readableWynntilsGlyphs('\uE06D\uE06E\uE06F'), '<=>');
  assert.equal(
    Highlighter.readableWynntilsGlyphs('\uE010\u2064\uE00F\uE012\u2064\uE011'),
    '[TITLE START][CHARACTER CELL][TITLE END]',
  );
  assert.equal(Highlighter.readableWynntilsGlyphs('normal text'), 'normal text');
});

test('template highlighter groups title controls while preserving their raw layout text', () => {
  const documentRef = {
    createDocumentFragment() {
      return {
        children: [],
        append(...children) {
          this.children.push(...children);
        },
      };
    },
    createElement() {
      return {
        className: '',
        dataset: {},
        textContent: '',
      };
    },
    createTextNode(textContent) {
      return { textContent };
    },
  };
  const container = {
    ownerDocument: documentRef,
    children: [],
    replaceChildren(fragment) {
      this.children = fragment.children;
    },
  };
  const controls = '\uE010\u2064\uE00F\uE012\u2064\uE011';
  Highlighter.render(container, controls);
  const glyphs = container.children.filter((node) => node.className.includes('syntax-glyph'));
  assert.deepEqual(
    glyphs.map((node) => node.textContent),
    ['\uE010\u2064', '\uE00F\uE012', '\u2064\uE011'],
  );
  assert.equal(
    glyphs.map((node) => node.textContent).join(''),
    controls,
    'the hidden raw text must continue to determine layout width',
  );
  assert.deepEqual(
    glyphs.map((node) => node.dataset.glyph),
    ['{', '[]', '}'],
  );
  assert.deepEqual(
    glyphs.map((node) => node.dataset.glyphLabel),
    ['[TITLE START]', '[CHARACTER CELL]', '[TITLE END]'],
  );
});

test('template highlighter exposes the complete generated glyph catalog for manual insertion', () => {
  const entries = Highlighter.listWynntilsGlyphs();
  assert.equal(entries.length, 48);
  assert.equal(
    entries
      .filter((entry) => /^[A-Z]$/.test(entry.label))
      .map((entry) => entry.label)
      .join(''),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  );
  assert.equal(new Set(entries.map((entry) => entry.glyph)).size, entries.length);
  assert.ok(entries.every((entry) => entry.codepoint === entry.glyph.codePointAt(0)));
});

test('Canvas glyph resolver keeps font namespace and treats background controls as layout glyphs', () => {
  const background = Canvas.resolveGlyph('\uE00F', 'minecraft:default');
  const negative = Canvas.resolveGlyph('\uE012', 'minecraft:default');
  const fancy = Canvas.resolveGlyph('\uE040', 'minecraft:default');
  const boxedEdge = Canvas.resolveGlyph('\uE00C', 'minecraft:default');
  assert.equal(background.kind, 'background');
  assert.equal(negative.kind, 'space');
  assert.ok(negative.advance < 0);
  assert.equal(fancy.kind, 'bitmap');
  assert.equal(fancy.asset, 'five');
  assert.equal(boxedEdge.asset, 'box_start');
  assert.equal(Canvas.resolveGlyph('\uE00F', 'minecraft:banner/box').kind, 'unsupported');
  assert.ok(
    Canvas.resolveGlyph('W', 'minecraft:default').advance > Canvas.resolveGlyph('i').advance,
  );
});

test('Canvas layout applies negative advance and only fits text when requested', () => {
  const parsed = Canvas.parseFormattedText('\uE00F\uE012\uE040');
  const natural = Canvas.layoutParsedText(parsed, { fontScale: 1, fitText: false, maxWidth: 4 });
  const fitted = Canvas.layoutParsedText(parsed, { fontScale: 1, fitText: true, maxWidth: 4 });
  assert.equal(natural.width, 6);
  assert.equal(natural.scale, 1);
  assert.equal(fitted.scale, 4 / 6);
});

test('bundled resource manifest identifies upstream Wynntils providers and local assets', () => {
  const resources = Canvas.resources;
  assert.match(resources.source.repository, /Wynntils\/Wynntils/);
  assert.equal(resources.fonts['wynntils:five'].providers[0].type, 'bitmap');
  assert.deepEqual(Array.from(resources.fonts['wynntils:five'].providers[0].labels), [
    'ABCDEFGHIJKLMNOP',
    'QRSTUVWXYZ?[]\\%&',
    '0123456789!()<=>',
  ]);
  assert.equal(resources.fonts['wynntils:banners'].providers.length, 6);
  for (const asset of Object.values(resources.assets)) {
    assert.equal(fs.existsSync(path.join(ROOT, asset.path)), true, `missing ${asset.path}`);
  }
});

test('deprecated horse functions are reported as friendly validation errors', () => {
  for (const name of ['horse_level', 'h_lvl', 'h_mlvl', 'horse_xp']) {
    const result = Core.validateConfig({ ...Core.defaultConfig(), content: `{${name}}` }, 'zh');
    assert.equal(result.valid, false, `${name} should be invalid`);
    assert.ok(
      result.errors.some(
        (error) =>
          error.field === 'content' && error.message.includes(name) && /移除/.test(error.message),
      ),
      `${name} error should mention the function and removal`,
    );
  }
  // The general information template does not reference any deprecated function.
  assert.equal(
    Core.validateConfig({ ...Core.defaultConfig(), content: Core.GENERAL_INFO_CONTENT }, 'zh')
      .valid,
    true,
  );
});

test('deprecated detection only fires on real function calls, not strings or plain text', () => {
  // String arguments inside a real function call must not be flagged as deprecated.
  assert.equal(Core.analyzeTemplate('{concat("horse_level")}', 'zh').valid, true);
  // Plain text containing a deprecated function name is not a function call.
  assert.equal(Core.analyzeTemplate('text horse_level text', 'zh').valid, true);
  // Real function calls still trigger the friendly deprecated error, regardless of case/format.
  for (const content of ['{horse_level}', '{horse_level:2}', '{HORSE_LEVEL}']) {
    const result = Core.analyzeTemplate(content, 'zh');
    assert.equal(result.valid, false, `${content} should be invalid`);
    assert.match(result.message, /移除/);
  }
  // Similar identifiers are unknown functions, not deprecated ones.
  for (const content of ['{horse_levels}', '{myhorse_level}']) {
    const result = Core.analyzeTemplate(content, 'zh');
    assert.equal(result.valid, false, `${content} should be invalid`);
    assert.match(result.message, /找不到模板函数/);
    assert.doesNotMatch(result.message, /移除/);
  }
});

test('sampleText substitutes known functions, format suffixes, and nested expressions', () => {
  const location = '&f{world}\n&cX {x(my_loc):0} &aY {y(my_loc):0} &9Z {z(my_loc):0}';
  const rendered = Core.sampleText(location);
  assert.match(rendered, /WC1/);
  assert.match(rendered, /123/);
  assert.match(rendered, /64/);
  assert.match(rendered, /-42/);
  assert.match(rendered, /\n/);
  assert.doesNotMatch(rendered, /x\(my_loc\)|y\(my_loc\)|z\(my_loc\)/);
  assert.equal(Core.sampleText('{fps}'), '144');
  assert.equal(Core.sampleText('{fps:0}'), '144');
  assert.equal(
    Core.sampleText('{health:F2}'),
    (1000).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  );
  assert.equal(Core.sampleText('{current_world}'), 'WC1');
  assert.equal(Core.sampleText('{current_territory}'), 'Ragni');
  assert.match(Core.sampleText('{divide(adavg(2);1000):2}'), /0/);
  assert.equal(Core.sampleText('{if_string(true;"a";"b")}'), 'a');
  assert.equal(Core.sampleText('{concat("&a";string(dry_p);" pulls")}'), '&a7 pulls');
  assert.equal(Core.sampleText('{gte(money;4096)}'), 'true');
  assert.equal(
    Core.sampleText('{if_str(gte(money;4096);concat("&7";str(le);"&7\\L ");"")}'),
    '&73&7¼ ',
  );
});

test('template simulator executes supported string and numeric semantics', () => {
  const evaluate = (expression) => Simulator.evaluateExpression(expression);
  assert.equal(evaluate('string_equals("a";"b")').value, false);
  assert.equal(evaluate('string_equals("a";"a")').value, true);
  assert.equal(evaluate('safe_divide(4;0;99)').value, 99);
  assert.equal(evaluate('safe_divide(4;2;99)').value, 2);
  assert.equal(evaluate('round(1.234;2)').value, 1.23);
  assert.equal(Profile.displayValue(evaluate('repeat("x";3)')), 'xxx');
  assert.equal(Profile.displayValue(evaluate('repeat_styled_text(styled_text("x");3)')), 'xxx');
});

test('template simulation and Canvas enforce a shared preview text budget', () => {
  const budget = 4096;
  const marker = '…⟦preview truncated⟧';
  const oversized = [
    Simulator.evaluateTemplate('{leading_zeros(1;10000)}'),
    Simulator.evaluateTemplate('{repeat(repeat("x";100);100)}'),
    Simulator.evaluateTemplate(`${'a'.repeat(3000)}{repeat("b";3000)}`),
    Simulator.evaluateTemplate('x'.repeat(5000)),
  ];

  for (const evaluation of oversized) {
    assert.equal(evaluation.text.length, budget);
    assert.equal(evaluation.text.endsWith(marker), true);
    assert.equal(
      evaluation.warnings.filter((warning) => warning.code === 'output-limit').length,
      1,
    );
  }

  assert.equal(Simulator.MAX_OUTPUT_LENGTH, budget);
  assert.equal(Profile.MAX_PREVIEW_TEXT_LENGTH, budget);
  assert.equal(Canvas.MAX_RENDER_INPUT_LENGTH, budget);
  const parsed = Canvas.parseFormattedText('x'.repeat(budget + 1000));
  assert.equal(
    parsed.lines.reduce((count, line) => count + line.length, 0),
    budget,
  );
});

test('template simulator never constructs a RegExp from user input', () => {
  vm.runInContext(
    `
      globalThis.__nativeRegExp = RegExp;
      globalThis.__regexConstructions = 0;
      globalThis.RegExp = function (...args) {
        globalThis.__regexConstructions += 1;
        return new globalThis.__nativeRegExp(...args);
      };
      globalThis.RegExp.prototype = globalThis.__nativeRegExp.prototype;
    `,
    SandboxContext,
  );

  try {
    const evaluation = Simulator.evaluateTemplate('{regex_match("abc";"a.*")}');
    assert.match(evaluation.text, /⟦regex_match⟧/);
    assert.deepEqual(Array.from(evaluation.unsupportedFunctions), ['regex_match']);
    assert.deepEqual(
      JSON.parse(JSON.stringify(evaluation.warnings)).map(({ code, functionName }) => ({
        code,
        functionName,
      })),
      [{ code: 'unsupported-function', functionName: 'regex_match' }],
    );
    assert.equal(vm.runInContext('globalThis.__regexConstructions', SandboxContext), 0);
  } finally {
    vm.runInContext(
      `
        globalThis.RegExp = globalThis.__nativeRegExp;
        delete globalThis.__nativeRegExp;
        delete globalThis.__regexConstructions;
      `,
      SandboxContext,
    );
  }
});

test('template simulator formats only top-level calls and preserves declared conditional types', () => {
  const conditional = Simulator.evaluateExpression('if_number(true;1;2)');
  assert.equal(conditional.type, 'Number');
  assert.equal(conditional.value, 1);
  assert.notEqual(conditional.simulated, false);

  const nested = Simulator.evaluateExpression('add(health:F2;1)');
  assert.equal(nested.type, 'Double');
  assert.equal(nested.value, 1001);
  assert.equal(Core.sampleText('{health:F2}'), '1,000.00');
});

test('template simulator matches deterministic upstream math, value, string, and time semantics', () => {
  const evaluate = (expression) => Simulator.evaluateExpression(expression);
  const cases = [
    ['abs(-3)', 3],
    ['clamp(5;10;0)', 5],
    ['map(5;0;10;0;100)', 50],
    ['map(5;1;1;9;20)', 9],
    ['wrap(-1;0;10)', 9],
    ['dec_to_hex(255)', 'FF'],
    ['hex_to_dec("#FF")', 255],
    ['current(capped(3;8))', 3],
    ['cap(capped(3;8))', 8],
    ['remaining(capped(3;8))', 5],
    ['percentage(capped(3;8))', 37.5],
    ['range_low(ranged(2;9))', 2],
    ['range_high(ranged(2;9))', 9],
    ['to_roman_numerals(14)', 'XIV'],
    ['transcribe_gavellian("abc")', 'ⓐⓑⓒ'],
    ['transcribe_wynnic("abc 12")', '⒜⒝⒞ ⑽⑵'],
    ['timestamp(time(1234))', 1234],
    ['seconds_between(time(1000);time(6000))', 5],
    ['timestamp(time_offset(time(1000);2))', 3000],
  ];
  for (const [expression, expected] of cases) {
    assert.equal(
      evaluate(expression).value,
      expected,
      `${expression} should match the pinned Wynntils implementation`,
    );
  }
  assert.equal(evaluate('is_infinite(divide(1;0))').value, true);
  assert.equal(evaluate('is_nan(square_root(-1))').value, true);
  assert.match(
    Profile.displayValue(evaluate('with_shadow_color(styled_text("x");from_hex("#123456"))')),
    /\{sc:#123456FF\}/,
  );
  assert.equal(evaluate('format_duration(90061)').value, '25h 01m 01s');
  assert.equal(evaluate('format_date(1788266096000)').value, '2026-09-01 12:34');
  assert.equal(evaluate('absolute_time(time(1788266096000))').value, '2026-09-01 12:34');
  assert.equal(evaluate('time_string(time_offset(now;-60))').value, '1 minute ago');
  assert.equal(evaluate('time_string(time_offset(now;7200))').value, 'in 2 hours');
});

test('simulation preserves Wynntils escape mappings and applies profile arguments', () => {
  const escaped = Profile.decodeString(String.raw`\n\E\B\L\M\H\&\q`);
  assert.equal(escaped[0], '\n');
  assert.notEqual(escaped, '\nEBLMH&q');
  assert.match(escaped, /\\q/);
  assert.equal(Simulator.evaluateExpression('class(true;false)').value, 'MAGE');
  assert.equal(Simulator.evaluateExpression('class(false;false)').value, 'Mage');
});

test('template simulator evaluates deterministic conditional, color, and styled-text semantics', () => {
  const evaluate = (expression) => Simulator.evaluateExpression(expression);
  assert.equal(evaluate('switch_case("x";"default";"x";"matched")').value, 'matched');
  assert.equal(evaluate('switch_case("x";"default";"y";"other")').value, 'default');
  assert.equal(evaluate('switch_case("x";"default";"x")').value, 'default');

  const percent = evaluate('from_rgb_percent(1;0;0)');
  assert.equal(percent.value, '#FF0000');
  assert.equal(
    percent.value,
    Canvas.resolveColorTemplate('{from_rgb_percent(1;0;0)}').color.slice(0, 7),
  );
  const half = evaluate('from_rgb_percent(0.5;0;0)');
  assert.equal(half.value, '#7F0000');
  assert.equal(
    half.value,
    Canvas.resolveColorTemplate('{from_rgb_percent(0.5;0;0)}').color.slice(0, 7),
  );

  assert.equal(evaluate('hue_shift(from_hex("#FF0000");0.3333333333)').value, '#00FF00');
  assert.equal(evaluate('saturation_shift(from_hex("#808080");0.5)').value, '#804040');
  assert.equal(evaluate('brightness_shift(from_hex("#800000");0.25)').value, '#BF0000');

  const gradient = evaluate('gradient_shader(2)');
  assert.equal(gradient.shader, 'GRADIENT_2');
  assert.equal(gradient.value, Profile.SHADER_COLORS.GRADIENT_2);
  assert.equal(evaluate('gradient_shader(1)').shader, 'GRADIENT');

  assert.equal(evaluate('value(named_value("Speed";1.5))').value, 1.5);
  assert.equal(
    Profile.displayValue(
      evaluate('concat_styled_text(with_bold(styled_text("A");true);styled_text("B"))'),
    ),
    '&lA&rB',
  );
  const nestedStyle = Profile.displayValue(
    evaluate(
      'with_color(concat_styled_text(with_bold(styled_text("A");true);styled_text("B"));from_hex("#FF0000"))',
    ),
  );
  const nestedGlyphs = Canvas.parseFormattedText(nestedStyle).lines[0];
  assert.equal(nestedGlyphs[0].style.bold, true);
  assert.equal(nestedGlyphs[0].style.color, '#FF0000FF');
  assert.equal(nestedGlyphs[1].style.bold, false);
  assert.equal(nestedGlyphs[1].style.color, '#FF0000FF');
});

test('template simulator serializes top-level CustomColor values as formatting codes', () => {
  const shader = Simulator.evaluateTemplate('{rainbow_shader}Text');
  assert.equal(shader.text, '§#00F000FFText');
  const shaderGlyphs = Canvas.parseFormattedText(shader.text).lines[0];
  assert.equal(shaderGlyphs.map((glyph) => glyph.char).join(''), 'Text');
  assert.equal(shaderGlyphs[0].style.shader, 'RAINBOW');

  const direct = Simulator.evaluateTemplate('{from_hex("#FF0000")}Text');
  assert.equal(direct.text, '§#FF0000FFText');
  const directGlyphs = Canvas.parseFormattedText(direct.text).lines[0];
  assert.equal(directGlyphs.map((glyph) => glyph.char).join(''), 'Text');
  assert.equal(directGlyphs[0].style.color, '#FF0000FF');
});

test('detailed template evaluation reports unsupported calls and isolates handler failures', () => {
  const source = 'A {ability_cooldown("Meteor";true)} B {ability_cooldown("Heal";false)} C {fps}';
  const detailed = Simulator.evaluateTemplate(source);
  assert.match(detailed.text, /⟦ability_cooldown⟧/);
  assert.match(detailed.text, /144/);
  assert.deepEqual(Array.from(detailed.unsupportedFunctions), ['ability_cooldown']);
  const warnings = JSON.parse(JSON.stringify(detailed.warnings));
  assert.equal(warnings.length, 2);
  assert.deepEqual(
    warnings.map(({ code, functionName }) => ({ code, functionName })),
    [
      { code: 'unsupported-function', functionName: 'ability_cooldown' },
      { code: 'unsupported-function', functionName: 'ability_cooldown' },
    ],
  );
  assert.equal(warnings[0].start, source.indexOf('{ability_cooldown'));
  assert.equal(warnings[0].end, source.indexOf('} B') + 1);
  assert.equal(Simulator.sampleText(source), detailed.text);
});

test('simulation result validation rejects declared type and shape mismatches without rewriting them', () => {
  const ranged = Core.functions.find((entry) => entry.n === 'ranged');
  assert.equal(
    Simulator.validateResult(Profile.typed('String', 'wrong'), ranged).code,
    'invalid-result-type',
  );
  assert.equal(
    Simulator.validateResult(Profile.typed('RangedValue', { minimum: 1 }), ranged).code,
    'invalid-result-shape',
  );
  assert.equal(
    Simulator.validateResult(Profile.typed('RangedValue', { minimum: 1, maximum: 2 }), ranged)
      .valid,
    true,
  );
});

test('every catalog function has one explicit simulation coverage status', () => {
  const coverage = Simulator.simulationCoverage();
  assert.deepEqual(Array.from(coverage.missing), []);
  assert.deepEqual(Array.from(coverage.overlap), []);
  assert.deepEqual(Array.from(coverage.staleUnsupported), []);
  assert.ok(
    coverage.implemented.length > 100,
    'deterministic and common profile coverage regressed',
  );
  for (const [name, reason] of Object.entries(Profile.UNSUPPORTED_FUNCTIONS)) {
    assert.ok(name);
    assert.ok(String(reason).trim(), `${name} needs a non-empty unsupported reason`);
  }
});

test('every generated insertion has a non-empty result with the declared return type', () => {
  for (const entry of Core.functions) {
    const insertion = Simulator.functionInsertion(entry);
    const evaluated = Simulator.evaluateExpression(insertion.slice(1, -1));
    assert.equal(
      evaluated.type,
      entry.r,
      `${entry.n} returned ${evaluated.type}, expected ${entry.r}`,
    );
    assert.notEqual(Profile.displayValue(evaluated), '', `${entry.n} rendered an empty sample`);
  }
  const repeated = Simulator.evaluateExpression('repeat_styled_text(styled_text("x");2)');
  assert.notEqual(repeated.simulated, false);
  assert.equal(Profile.displayValue(repeated), 'xx');
});

test('simulation profile keeps related health and currency values internally consistent', () => {
  assert.equal(Profile.PROFILE.health.value, Profile.PROFILE.capped_health.value.current);
  assert.equal(Profile.PROFILE.health_max.value, Profile.PROFILE.capped_health.value.maximum);
  assert.equal(
    Profile.PROFILE.health_pct.value,
    (Profile.PROFILE.health.value / Profile.PROFILE.health_max.value) * 100,
  );
  assert.equal(
    Profile.PROFILE.money.value,
    Profile.PROFILE.le.value * 4096 +
      Profile.PROFILE.eb.value * 64 +
      Profile.PROFILE.emeralds.value,
  );
  assert.equal(Profile.PROFILE.wynntils_version.value, Meta.ref.replace(/^v/i, ''));
});

test('preview state clears empty content and preserves the last valid sample on errors', () => {
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        Core.resolvePreviewState({
          content: '   ',
          valid: false,
          sample: 'ignored',
          lastValidSample: 'old',
        }),
      ),
    ),
    { mode: 'empty', sample: '' },
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        Core.resolvePreviewState({
          content: '{fps',
          valid: false,
          sample: '',
          lastValidSample: '144 FPS',
        }),
      ),
    ),
    { mode: 'paused', sample: '144 FPS' },
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        Core.resolvePreviewState({
          content: '{fps}',
          valid: true,
          sample: '144',
          lastValidSample: 'old',
        }),
      ),
    ),
    { mode: 'ready', sample: '144' },
  );
});

test('analyzeTemplate ignores curly braces inside quoted arguments', () => {
  assert.equal(
    Core.validateConfig(
      {
        ...Core.defaultConfig(),
        content: '{concat("{";"a}")}',
        enabledTemplate: '',
      },
      'zh',
    ).valid,
    true,
  );
  assert.equal(
    Core.validateConfig(
      {
        ...Core.defaultConfig(),
        content: '{concat("{";"a")}',
        enabledTemplate: '',
      },
      'zh',
    ).valid,
    true,
  );
  assert.equal(Core.analyzeTemplate('{concat("a}";"b")}', 'zh').valid, true);
});

test('plain-text quotes cannot hide following template expressions from validation', () => {
  assert.equal(Core.analyzeTemplate('plain " quote', 'zh').valid, true);
  assert.equal(Core.lintContent('plain " quote', 'zh').valid, true);
  for (const content of ['prefix " {not_a_function}', 'prefix " {fps']) {
    assert.equal(Core.analyzeTemplate(content, 'zh').valid, false, content);
    assert.equal(Core.lintContent(content, 'zh').valid, false, content);
  }
});

test('function catalog is lazy and Escape fully closes searchable results', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert.doesNotMatch(html, /id="functionResults"[^>]*role="listbox"/);
  assert.match(app, /details\.addEventListener\(['"]toggle['"]/);
  assert.match(app, /details\.dataset\.rendered/);
  assert.match(app, /makeFunctionButton\(fn, list, false\)/);
  assert.match(
    app,
    /function closeFunctionResults[\s\S]*container\.hidden = true[\s\S]*aria-expanded['"], ['"]false/,
  );
  assert.match(css, /\.function-results\[hidden\][^{]*\{[^}]*display:\s*none/);
});

test('static entry point is offline-safe and loads translation data in order', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const packageSource = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  const license = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  const notices = fs.readFileSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  const licenseGuide = fs.readFileSync(path.join(ROOT, 'LICENSES', 'README.md'), 'utf8');
  const ci = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const resourceWorkflow = fs.readFileSync(
    path.join(ROOT, '.github', 'workflows', 'sync-wynntils-resources.yml'),
    'utf8',
  );
  const dependabot = fs.readFileSync(path.join(ROOT, '.github', 'dependabot.yml'), 'utf8');
  const functionsSource = fs.readFileSync(path.join(ROOT, 'js/functions.generated.js'), 'utf8');
  for (const file of [
    'js/function-catalog.js',
    'js/editor-formatting.js',
    'js/preview-controller.js',
    'js/function-browser.js',
    'js/ai-controller.js',
    'scripts/sync-resources.mjs',
    'playwright.config.js',
  ]) {
    assert.equal(
      fs.existsSync(path.join(ROOT, file)),
      true,
      `missing static editor resource: ${file}`,
    );
  }
  const playwrightConfig = fs.readFileSync(path.join(ROOT, 'playwright.config.js'), 'utf8');
  assert.match(playwrightConfig, /WYNNTILS_EDITOR_PORT/);
  assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//);
  assert.match(html, /functions\.generated\.js\?v=4\.2\.8/);
  assert.match(functionsSource, /Generated only from https:\/\/github\.com\/Wynntils\/Wynntils/);
  assert.doesNotMatch(functionsSource, /ryanzhou|wynntils-functions/i);
  assert.match(
    html,
    /functions\.generated\.js[\s\S]*functions\.zh\.js[\s\S]*resources\.generated\.js[\s\S]*template-parser\.js[\s\S]*simulation-profile\.js[\s\S]*template-simulator\.js[\s\S]*draft-store\.js[\s\S]*canvas-renderer\.js[\s\S]*template-highlighter\.js[\s\S]*markdown-renderer\.js[\s\S]*ai-assistant\.js[\s\S]*function-catalog\.js[\s\S]*editor-formatting\.js[\s\S]*editor-core\.js/,
  );
  assert.doesNotMatch(html, /@font-face|Minecraft\.woff2/);
  assert.match(html, /<canvas[^>]+id="overlayPreview"/);
  assert.ok(
    html.indexOf('id="previewTitle"') < html.indexOf('id="formTitle"'),
    'the preview must precede the form so it remains visible above the mobile keyboard',
  );
  assert.match(html, /id="togglePreviewButton"[\s\S]*aria-expanded="true"/);
  assert.match(html, /class="content-editor"[\s\S]*id="contentHighlight"[\s\S]*id="contentInput"/);
  assert.doesNotMatch(
    html,
    /第一个 Overlay|Wynntils Info Box 新手配置助手|完全离线|WYNNTILS OVERLAY STUDIO|不用导入 JSON|第 [123] 步/,
  );
  assert.match(html, /<textarea[\s\S]*id="contentInput"[\s\S]*rows="18"/);
  assert.match(
    html,
    /<details[^>]+id="advancedSettings"[\s\S]*id="colorTemplateInput"[\s\S]*id="textShadowInput"[\s\S]*id="fontScaleInput"[\s\S]*id="fitTextInput"[\s\S]*id="backgroundColorInput"[\s\S]*id="borderWidthInput"[\s\S]*<\/details>/,
  );
  assert.match(html, /id="contentColorPicker"[\s\S]*type="color"/);
  assert.match(html, /id="applyContentColorButton"/);
  assert.match(
    html,
    /id="toggleGlyphPickerButton"[\s\S]*id="glyphPicker"[\s\S]*id="glyphLetterGrid"[\s\S]*id="glyphSymbolGrid"[\s\S]*id="glyphControlGrid"/,
  );
  assert.match(html, /template-highlighter\.js\?v=8/);
  assert.match(html, /template-parser\.js\?v=3/);
  assert.match(html, /simulation-profile\.js\?v=5/);
  assert.match(html, /template-simulator\.js\?v=7/);
  assert.match(html, /draft-store\.js\?v=3/);
  assert.match(html, /canvas-renderer\.js\?v=7/);
  assert.match(html, /function-catalog\.js\?v=2/);
  assert.match(html, /editor-formatting\.js\?v=3/);
  assert.match(html, /editor-core\.js\?v=24/);
  assert.match(html, /preview-controller\.js\?v=2/);
  assert.match(html, /function-browser\.js\?v=1/);
  assert.match(html, /ai-controller\.js\?v=1/);
  assert.match(html, /styles\.css\?v=21/);
  assert.match(html, /app\.js\?v=23/);
  assert.match(html, /<dialog[^>]+id="aiAssistantDialog"/);
  assert.match(html, /id="aiEndpointInput"[\s\S]*id="aiModelInput"[\s\S]*id="aiApiKeyInput"/);
  assert.match(
    html,
    /id="aiEndpointInput"[\s\S]*placeholder="例如：https:\/\/api\.openai\.com\/v1"/,
  );
  assert.match(html, /data-i18n="aiEndpointHelp"[\s\S]*自动补全 \/chat\/completions/);
  assert.match(html, /id="fetchAiModelsButton"[\s\S]*id="aiModelSelect"/);
  assert.match(html, /id="aiMessages"[\s\S]*id="aiPromptInput"[\s\S]*id="aiSendButton"/);
  assert.match(html, /id="copyContentButton"/);
  assert.match(
    html,
    /id="draftNotice"[\s\S]*id="loadIncomingDraftButton"[\s\S]*id="keepCurrentDraftButton"/,
  );
  assert.doesNotMatch(
    html,
    /guideTitle|guideOutput|generateGuideButton|copyGuideButton|downloadGuideButton/,
  );
  assert.match(app, /state\.lang = state\.lang === 'zh' \? 'en' : 'zh'/);
  assert.match(app, /Missing required modules/);
  assert.match(html, /id="startupError"[^>]+role="alert"/);
  assert.match(app, /previewController\.render\(/);
  assert.match(
    app,
    /function saveDraftNow[\s\S]*const config = configFromForm\(\)[\s\S]*draftSession\.save\(config\)/,
  );
  assert.match(app, /draftSession\.offer\(event\.newValue\)/);
  assert.match(app, /prefers-reduced-motion/);
  assert.match(app, /aria-selected/);
  assert.match(app, /TemplateHighlighter\.render\(/);
  assert.match(app, /applyContentColor/);
  assert.match(app, /TemplateHighlighter\.listWynntilsGlyphs\(\)/);
  assert.match(app, /Core\.insertContent\(/);
  assert.match(app, /navigator\.clipboard\.writeText\(fields\.content\.value\)/);
  assert.doesNotMatch(app, /generateGuide|copyGuide|downloadGuide|state\.guide/);
  assert.match(css, /\.preview-panel\s*\{[^}]*position:\s*sticky/s);
  assert.match(packageSource, /"test:frontend":\s*"node --test tests\/editor\.test\.js"/);
  assert.match(packageSource, /"license":\s*"MIT"/);
  assert.match(packageSource, /"private":\s*true/);
  assert.match(license, /MIT License/);
  assert.match(notices, /工具代码[\s\S]*MIT/);
  assert.match(licenseGuide, /MIT/);
  assert.match(licenseGuide, /LGPL-3\.0/);
  const syncSource = fs.readFileSync(path.join(ROOT, 'scripts/sync-functions.mjs'), 'utf8');
  const resourceSyncSource = fs.readFileSync(path.join(ROOT, 'scripts/sync-resources.mjs'), 'utf8');
  assert.match(syncSource, /wynntils-editor-function-sync/);
  assert.match(ci, /pnpm check:wynntils-functions/);
  assert.match(ci, /pnpm check:wynntils-resources/);
  assert.match(resourceWorkflow, /node scripts\/sync-resources\.mjs/);
  assert.match(resourceWorkflow, /GITHUB_TOKEN/);
  assert.match(
    resourceSyncSource,
    /CONTENTS_URL\s*=\s*`https:\/\/api\.github\.com\/repos\/\$\{REPOSITORY\}\/contents`/,
  );
  assert.match(resourceSyncSource, /wynntils-editor-resource-sync/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(app, /AiController\.runAgent/);
  assert.match(app, /MarkdownRenderer\.render/);
  assert.match(app, /event\?\.type === 'request'[\s\S]*aiContinuingRequest/);
  assert.match(app, /requestTimeoutMs:\s*120000/);
  assert.doesNotMatch(app, /aiRequestTimer|aiRequestTimedOut/);
  assert.match(app, /AiController\.requestModels/);
  assert.match(css, /\.content-color-tool/);
  assert.match(css, /\.glyph-picker/);
  assert.match(css, /\.ai-dialog/);
  assert.match(
    css,
    /\.ai-setting[^{]*\{[^}]*grid-template-columns:\s*148px minmax\(0, 1fr\)/,
    'desktop AI settings should share one aligned label and input grid',
  );
  assert.match(css, /\.ai-model-fetch[^{]*\{[^}]*width:\s*96px/);
  assert.match(css, /\.ai-key-toggle[^{]*\{[^}]*width:\s*96px/);
  assert.match(
    css,
    /\.toggle-row input:focus-visible \+ \.toggle[^{]*\{[^}]*outline:\s*2px solid var\(--cyan\)/,
  );
  const aiSource = fs.readFileSync(path.join(ROOT, 'js/ai-assistant.js'), 'utf8');
  assert.doesNotMatch(aiSource, /localStorage|sessionStorage/);
  assert.match(app, /DraftStore\.createSession\(window\.localStorage\)/);
  const loadConfigSource = app.slice(
    app.indexOf('function loadConfig'),
    app.indexOf('function renderDraftNotice'),
  );
  assert.match(loadConfigSource, /state\.undoConfig = Core\.clone\(configFromForm\(\)\)/);
  const templateChangeSource = app.slice(
    app.indexOf("$('#templateSelect').addEventListener('change'"),
    app.indexOf("$('#configForm').addEventListener('input'"),
  );
  assert.match(templateChangeSource, /loadConfig\(template\.config[\s\S]*scheduleDraftSave\(\)/);
  assert.doesNotMatch(app, /\.innerHTML\s*=/);
  assert.match(app, /ADVANCED_FIELDS[\s\S]*advancedSettings['"]\)\.open = true/);
  assert.doesNotMatch(app, /preview\.innerHTML/);
  assert.doesNotMatch(app, /示例值/);
  assert.ok(
    app.includes('`#${name}Error`'),
    'validation error ids should map directly by field name',
  );
  assert.match(css, /\.overlay-preview[^{]*\{[^}]*image-rendering:\s*pixelated/);
  assert.match(css, /textarea\[name='content'\][^{]*\{[^}]*min-height:\s*420px/);
  assert.match(
    css,
    /\.content-highlight[^{]*\{[^}]*position:\s*absolute[^}]*inset:\s*0/,
    'highlight layer must not grow the textarea when content is long',
  );
  assert.match(css, /\.syntax-glyph::before[^{]*\{[^}]*content:\s*attr\(data-glyph\)/);
  assert.doesNotMatch(
    css,
    /\.syntax-glyph[^{]*\{[^}]*width:\s*1ch/,
    'readable glyph overlays must retain the textarea fallback glyph width',
  );
  assert.doesNotMatch(
    css,
    /\.syntax-glyph[^{]*\{[^}]*display:\s*inline-block/,
    'glyph labels must preserve the textarea line-breaking behavior',
  );
  assert.match(
    css,
    /\.content-highlight,[\s\S]*#contentInput[^{]*\{[^}]*scrollbar-gutter:\s*stable/,
    'both text layers must reserve the same scrollbar gutter',
  );
  assert.match(css, /#contentHighlight[^{]*\{[^}]*font:\s*inherit/);
  for (const syntaxClass of ['format', 'brace']) {
    assert.doesNotMatch(
      css,
      new RegExp(`\\.syntax-${syntaxClass}[^\\{]*\\{[^}]*font-weight`),
      `${syntaxClass} highlighting must not change textarea character widths`,
    );
  }
  assert.match(
    app,
    /contentHighlightLayer\s*=\s*contentHighlight\.parentElement[\s\S]*contentHighlightLayer\.scrollTop\s*=\s*fields\.content\.scrollTop/,
    'the highlight pre layer must follow textarea scrolling',
  );
  assert.match(css, /\.preview-color-note\[hidden\][^{]*\{[^}]*display:\s*none/);
  assert.match(
    fs.readFileSync(path.join(ROOT, 'js/template-highlighter.js'), 'utf8'),
    /dataset\.glyph/,
  );
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /:focus-visible/);
  for (const match of html.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)) {
    assert.ok(match[1] in Core.I18N.zh, `missing i18n key: ${match[1]}`);
  }
});

test('independent repository ignores local dependency and test artifacts', () => {
  const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(ignore, /^node_modules\/$/m);
});

test('buildFunctionCategories groups functions by type and semantic prefix', () => {
  const cats = Core.buildFunctionCategories('zh');
  const labels = cats.map((c) => c.label);
  // 至少包含类型分类和语义分类
  assert.ok(cats.length >= 4, 'should have multiple categories');
  // 每个函数属于某个分组且排序
  for (const c of cats) {
    assert.ok(Array.isArray(c.functions) && c.functions.length >= 0);
    for (const fn of c.functions) {
      assert.ok(typeof fn === 'string' || typeof fn === 'object');
    }
  }
  // 中文标签能在 I18N 找到
  for (const c of cats) {
    assert.ok(typeof c.label === 'string' && c.label.length > 0, `label missing for ${c.id}`);
  }
});

test('buildFunctionCategories covers every bundled function at least once', () => {
  const cats = Core.buildFunctionCategories('zh');
  const covered = new Set();
  cats.forEach((c) => c.functions.forEach((fn) => covered.add(fn.n)));
  const missing = Core.functions.filter((e) => !covered.has(e.n));
  assert.equal(missing.length, 0, `uncovered functions: ${missing.map((e) => e.n).join(', ')}`);
});

test('formatContent beautifies nested template without breaking equivalence', () => {
  const input = '{concat(a;b;c)}';
  const out = Core.formatContent(input);
  assert.ok(typeof out === 'string' && out.length > 0);
  // 不破坏普通文本
  const plain = 'hello &a{world}\\nworld';
  assert.equal(Core.formatContent(plain), plain);
});

test('lintContent detects unknown functions, bad color, unclosed paren/string', () => {
  const r1 = Core.lintContent('{not_a_function}', 'zh');
  assert.equal(r1.valid, false);
  const r2 = Core.lintContent('{fps(', 'zh');
  assert.equal(r2.valid, false);
  const r3 = Core.lintContent('{concat("a}', 'zh');
  assert.equal(r3.valid, false);
  const r4 = Core.lintContent('{greater_than(1)}', 'zh');
  assert.equal(r4.valid, false);
  const r5 = Core.lintContent(Core.GENERAL_INFO_CONTENT, 'zh');
  assert.equal(r5.valid, true);
});

test('parser rejects client-invalid whitespace and lowercase formatting flags', () => {
  for (const content of [
    '{greater_than (1;0)}',
    '{fps :F2}',
    '{greater_than(1;0) :2}',
    '{fps:f2}',
  ]) {
    assert.equal(Core.lintContent(content, 'zh').valid, false, content);
    assert.equal(
      Core.validateConfig({ ...Core.defaultConfig(), content }, 'zh').valid,
      false,
      content,
    );
  }
  for (const content of ['{greater_than(1;0)}', '{fps:F2}', '{fps:2}']) {
    assert.equal(Core.lintContent(content, 'zh').valid, true, content);
  }
});

test('formatContent keeps expressions logic-equivalent after whitespace stripping', () => {
  const strip = (s) => s.replace(/\s+/g, '');
  const cases = [
    '{concat(a;b;c)}',
    '{concat(a;concat(b;c);d)}',
    '{divide(adavg(2);1000):2}',
    '{fps:0}',
    '{if_str(gte(money;4096);concat("&7";str(le);"&7\\L ");"")}',
    '&a{fps} &lX',
    '{concat("{";"a}")}',
    '{concat("a;b";c)}',
  ];
  for (const input of cases) {
    const out = Core.formatContent(input);
    assert.equal(strip(out), strip(input), `not logic-equivalent: ${input} -> ${out}`);
  }
});

test('formatContent preserves malformed call suffixes instead of dropping user content', () => {
  const malformed = '{concat("a";"b")oops}';
  assert.equal(Core.formatContent(malformed), malformed);
});

test('formatContentDetailed distinguishes invalid, unchanged, and replaced content', () => {
  const invalid = Core.formatContentDetailed('{concat("a";)}');
  assert.equal(invalid.valid, false);
  assert.equal(invalid.changed, false);
  assert.equal(invalid.value, '{concat("a";)}');

  const unchanged = Core.formatContentDetailed('&a{fps} FPS');
  assert.equal(unchanged.valid, true);
  assert.equal(unchanged.changed, false);

  const formatted = Core.formatContentDetailed('{from_rgb(1;2;3)}');
  assert.equal(formatted.valid, true);
  assert.equal(formatted.changed, true);
  assert.match(formatted.value, /from_rgb\(\n/);
});

test('lintContent does not flag ampersands inside template expressions', () => {
  // A literal '&' inside a template string argument is data, not a format code.
  assert.equal(Core.lintContent('{concat("R&D";"x")}', 'zh').valid, true);
  assert.equal(Core.lintContent('{concat("&7";"&z")}', 'zh').valid, true);
  // A real invalid code in the literal display text is still flagged.
  const r = Core.lintContent('&z plain', 'zh');
  assert.equal(r.valid, false);
  assert.ok(r.issues.some((i) => i.code === 'formatCode'));
});

test('legacy DOM glyph renderer and fake font asset are removed', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert.doesNotMatch(css, /\.wynn-(?:banner-)?glyph/);
  assert.equal(fs.existsSync(path.join(ROOT, 'assets/fonts/Minecraft.woff2')), false);
});
