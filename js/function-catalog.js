(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WynntilsFunctionCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  const POPULAR = Object.freeze([
    'fps',
    'current_world',
    'current_territory',
    'ping',
    'health',
    'mana',
    'my_location',
    'clock',
  ]);
  const TYPE_CATEGORIES = Object.freeze([
    {
      id: 'numeric',
      labelKey: 'catNumeric',
      types: ['Float', 'Double', 'Integer', 'Long', 'Number', 'RangedValue'],
    },
    { id: 'boolean', labelKey: 'catBoolean', types: ['Boolean'] },
    { id: 'string', labelKey: 'catString', types: ['String'] },
    { id: 'capped', labelKey: 'catCapped', types: ['CappedValue'] },
    { id: 'time', labelKey: 'catTime', types: ['Time'] },
    { id: 'location', labelKey: 'catLocation', types: ['Location'] },
    { id: 'color', labelKey: 'catColor', types: ['CustomColor'] },
    { id: 'styled', labelKey: 'catStyled', types: ['StyledText'] },
    { id: 'named', labelKey: 'catNamed', types: ['NamedValue'] },
    { id: 'other', labelKey: 'catOther', types: ['Object'] },
  ]);
  const SEMANTIC_CATEGORIES = Object.freeze([
    { id: 'dry', labelKey: 'catDry', test: (name) => name.startsWith('dry_') },
    { id: 'current', labelKey: 'catCurrent', test: (name) => name.startsWith('current_') },
    {
      id: 'cappedSem',
      labelKey: 'catCappedSem',
      test: (name) => name.startsWith('capped_') || name.startsWith('cap_'),
    },
    {
      id: 'format',
      labelKey: 'catFormat',
      test: (name) => name.startsWith('format_') || name === 'format',
    },
    { id: 'lootrun', labelKey: 'catLootrun', test: (name) => name.startsWith('lootrun_') },
  ]);
  const ARGUMENT_EXAMPLES = Object.freeze({
    String: '"Example"',
    Integer: '1',
    Long: '1',
    Float: '1.5',
    Double: '1.5',
    Number: '1.5',
    Boolean: 'true',
    CustomColor: 'from_hex("#55FFFF")',
    StyledText: 'styled_text("Example")',
    CappedValue: 'capped_health',
    RangedValue: 'tower_dps',
    NamedValue: 'named_value("Speed";3)',
    Location: 'my_location',
    Time: 'now',
    Object: '"Example"',
    Any: '"Example"',
    List: '"Example"',
  });
  const LIST_ARGUMENT_EXAMPLES = Object.freeze({
    add: '1.5;2.5',
    and: 'true;false',
    concat: '"Example";" Text"',
    concat_styled_text: 'styled_text("Example");styled_text(" Text")',
    max: '1.5;2.5',
    min: '1.5;2.5',
    multiply: '1.5;2.5',
    or: 'true;false',
  });
  const INSERTION_OVERRIDES = Object.freeze({
    to_background_text:
      '{to_background_text("WYNN";from_hex("#FFFFFF");from_hex("#8A2BE2");"PILL";"PILL")}',
    to_fancy_text: '{to_fancy_text("WYNNCRAFT")}',
    wynncraft_shader: '{wynncraft_shader("RAINBOW")}',
    gradient_shader: '{gradient_shader(1)}',
    fade_shader: '{fade_shader}',
    blink_shader: '{blink_shader}',
    rainbow_shader: '{rainbow_shader}',
    shine_shader: '{shine_shader}',
    switch_case: '{switch_case("value";"default";"value";"matched")}',
    warp_shader: '{warp_shader}',
  });

  function grams(value) {
    const normalized = String(value || '').toLowerCase();
    const result = new Set();
    for (let index = 0; index < normalized.length - 1; index += 1)
      result.add(normalized.slice(index, index + 2));
    return result;
  }

  function cosine(left, right) {
    if (!left.size || !right.size) return 0;
    let dot = 0;
    left.forEach((gram) => {
      if (right.has(gram)) dot += 1;
    });
    return dot / Math.sqrt(left.size * right.size);
  }

  function create(functionData, chineseData, translate) {
    const tr = typeof translate === 'function' ? translate : (_lang, key) => key;
    const functions = (functionData || []).map((entry) => {
      const translation = (chineseData || {})[entry.n] || {
        d: `获取或计算“${entry.n}”。`,
        kw: [entry.n],
      };
      return Object.freeze({ ...entry, d: translation.d, kw: [...translation.kw] });
    });
    const functionIndex = new Map();
    functions.forEach((entry) => {
      functionIndex.set(entry.n.toLowerCase(), entry);
      entry.a.forEach((alias) => functionIndex.set(alias.toLowerCase(), entry));
    });

    function semanticSearch(query, limit) {
      const maximum = Math.max(1, Number(limit) || 12);
      const raw = String(query || '')
        .trim()
        .toLowerCase();
      if (!raw)
        return POPULAR.map((name) => functionIndex.get(name))
          .filter(Boolean)
          .slice(0, maximum);
      const queryGrams = grams(raw);
      return functions
        .map((entry) => {
          const names = [entry.n, ...entry.a].map((name) => name.toLowerCase());
          let score = 0;
          if (names.includes(raw)) score += 12;
          if (names.some((name) => name.startsWith(raw))) score += 7;
          if (names.some((name) => name.includes(raw))) score += 4;
          entry.kw.forEach((keyword) => {
            const normalized = keyword.toLowerCase();
            if (normalized === raw) score += 8;
            else if (normalized.includes(raw) || raw.includes(normalized)) score += 3;
          });
          score += cosine(queryGrams, grams(`${entry.d} ${entry.kw.join(' ')}`)) * 6;
          return { entry, score };
        })
        .filter((item) => item.score > 0.15)
        .sort(
          (left, right) => right.score - left.score || left.entry.n.localeCompare(right.entry.n),
        )
        .slice(0, maximum)
        .map((item) => item.entry);
    }

    function functionSignature(entry) {
      const parameters = entry.p
        .map(([name, type, required]) => `${name}: ${type}${required ? '' : '?'}`)
        .join('; ');
      return `${entry.n}(${parameters}) -> ${entry.r}`;
    }

    function functionInsertion(entry) {
      if (!entry) return '';
      if (INSERTION_OVERRIDES[entry.n]) return INSERTION_OVERRIDES[entry.n];
      const required = entry.p.filter((parameter) => parameter[2]);
      const parameters = required.map(([, type]) =>
        type === 'List'
          ? LIST_ARGUMENT_EXAMPLES[entry.n] || ARGUMENT_EXAMPLES.List
          : ARGUMENT_EXAMPLES[type] || '"Example"',
      );
      return `{${entry.n}${parameters.length ? `(${parameters.join(';')})` : ''}}`;
    }

    function buildFunctionCategories(lang) {
      const groups = [];
      TYPE_CATEGORIES.forEach((category) => {
        const list = functions.filter((entry) => category.types.includes(entry.r));
        if (list.length)
          groups.push({
            id: category.id,
            kind: 'type',
            label: tr(lang, category.labelKey),
            functions: list.slice().sort((a, b) => a.n.localeCompare(b.n)),
          });
      });
      SEMANTIC_CATEGORIES.forEach((category) => {
        const list = functions.filter((entry) => category.test(entry.n));
        if (list.length)
          groups.push({
            id: category.id,
            kind: 'semantic',
            label: tr(lang, category.labelKey),
            functions: list.slice().sort((a, b) => a.n.localeCompare(b.n)),
          });
      });
      return groups;
    }

    return Object.freeze({
      functions: Object.freeze(functions),
      functionIndex,
      semanticSearch,
      functionSignature,
      functionInsertion,
      buildFunctionCategories,
    });
  }

  return Object.freeze({ create });
});
