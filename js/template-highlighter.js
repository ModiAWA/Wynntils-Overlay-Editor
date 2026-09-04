(function (root, factory) {
  const api = factory(root.WYNNTILS_FONT_RESOURCES || { fonts: {} }, root.WynntilsTemplateParser);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WynntilsTemplateHighlighter = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function (resources, Parser) {
  'use strict';

  if (!Parser) throw new Error('WynntilsTemplateParser must load before template-highlighter.js');
  const fiveProvider = resources.fonts?.['wynntils:five']?.providers?.find(
    (provider) => provider.type === 'bitmap',
  );
  const WYNNTILS_FIVE_GLYPHS = new Map();
  (fiveProvider?.chars || []).forEach((glyphRow, rowIndex) => {
    const labelRow = fiveProvider?.labels?.[rowIndex] || '';
    Array.from(glyphRow).forEach((glyph, columnIndex) => {
      const label = Array.from(labelRow)[columnIndex];
      if (label) WYNNTILS_FIVE_GLYPHS.set(glyph, label);
    });
  });
  const TITLE_CONTROL_SEQUENCES = Object.freeze([
    Object.freeze({ value: '\uE010\u2064', label: '[TITLE START]', marker: '{' }),
    Object.freeze({ value: '\uE00F\uE012', label: '[CHARACTER CELL]', marker: '[]' }),
    Object.freeze({ value: '\u2064\uE011', label: '[TITLE END]', marker: '}' }),
  ]);
  const TITLE_CONTROL_GLYPHS = new Map([
    ['\uE010', Object.freeze({ label: '[TITLE START]', marker: '{' })],
    ['\u2064', Object.freeze({ label: '[TITLE SPACING]', marker: '·' })],
    ['\uE00F', Object.freeze({ label: '[CHARACTER CELL]', marker: '[' })],
    ['\uE012', Object.freeze({ label: '[CHARACTER OVERLAY]', marker: ']' })],
    ['\uE011', Object.freeze({ label: '[TITLE END]', marker: '}' })],
  ]);

  function readableWynntilsGlyph(character) {
    const glyph = String(character || '');
    return TITLE_CONTROL_GLYPHS.get(glyph)?.label || WYNNTILS_FIVE_GLYPHS.get(glyph) || '';
  }

  function segmentWynntilsGlyphs(value) {
    const source = String(value == null ? '' : value);
    const segments = [];
    for (let index = 0; index < source.length; ) {
      const sequence = TITLE_CONTROL_SEQUENCES.find((entry) =>
        source.startsWith(entry.value, index),
      );
      if (sequence) {
        segments.push(sequence);
        index += sequence.value.length;
        continue;
      }
      const codepoint = source.codePointAt(index);
      const glyph = String.fromCodePoint(codepoint);
      const control = TITLE_CONTROL_GLYPHS.get(glyph);
      const label = control?.label || WYNNTILS_FIVE_GLYPHS.get(glyph) || '';
      segments.push({ value: glyph, label, marker: control?.marker || label });
      index += glyph.length;
    }
    return segments;
  }

  function readableWynntilsGlyphs(value) {
    return segmentWynntilsGlyphs(value)
      .map((segment) => segment.label || segment.value)
      .join('');
  }

  function listWynntilsGlyphs() {
    return Array.from(WYNNTILS_FIVE_GLYPHS, ([glyph, label]) =>
      Object.freeze({ glyph, label, codepoint: glyph.codePointAt(0) }),
    );
  }

  const tokenizeTemplate = Parser.tokenizeTemplate;

  function appendToken(fragment, documentRef, token) {
    let plainText = '';

    function flushPlainText() {
      if (!plainText) return;
      if (token.type === 'text') fragment.append(documentRef.createTextNode(plainText));
      else {
        const span = documentRef.createElement('span');
        span.className = `syntax-${token.type}`;
        span.textContent = plainText;
        fragment.append(span);
      }
      plainText = '';
    }

    segmentWynntilsGlyphs(token.value).forEach((segment) => {
      const readableGlyph = segment.label;
      if (!readableGlyph) {
        plainText += segment.value;
        return;
      }
      flushPlainText();
      const glyph = documentRef.createElement('span');
      glyph.className = `syntax-${token.type} syntax-glyph`;
      glyph.textContent = segment.value;
      glyph.dataset.glyph = segment.marker;
      glyph.dataset.glyphLabel = readableGlyph;
      fragment.append(glyph);
    });
    flushPlainText();
  }

  function render(container, value, parsedTemplate) {
    const tokens =
      parsedTemplate?.source === String(value == null ? '' : value)
        ? parsedTemplate.tokens
        : tokenizeTemplate(value);
    const documentRef = container.ownerDocument;
    const fragment = documentRef.createDocumentFragment();
    tokens.forEach((token) => appendToken(fragment, documentRef, token));
    if (String(value || '').endsWith('\n')) fragment.append(documentRef.createTextNode('\u200b'));
    container.replaceChildren(fragment);
    return tokens;
  }

  return Object.freeze({ tokenizeTemplate, readableWynntilsGlyphs, listWynntilsGlyphs, render });
});
