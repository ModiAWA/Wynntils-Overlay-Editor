(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WynntilsEditorFormatting = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  function formattingStateAt(content, endIndex) {
    const source = String(content == null ? '' : content);
    const limit = Math.max(0, Math.min(source.length, Number(endIndex) || 0));
    const state = {
      colorCode: '',
      fontCode: '',
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      obfuscated: false,
    };
    const resetDecorations = () => {
      state.bold = false;
      state.italic = false;
      state.underline = false;
      state.strike = false;
      state.obfuscated = false;
    };
    for (let index = 0; index < limit; ) {
      const prefix = source[index];
      if (prefix !== '&' && prefix !== '§') {
        index += 1;
        continue;
      }
      const tail = source.slice(index, limit);
      const hex = tail.match(/^[&§]#[0-9a-f]{8}/i);
      if (hex) {
        state.colorCode = hex[0];
        resetDecorations();
        index += hex[0].length;
        continue;
      }
      const font = tail.match(/^[&§]\{fr:[^}]+\}/i);
      if (font) {
        state.fontCode = font[0];
        index += font[0].length;
        continue;
      }
      const legacy = tail.match(/^[&§]([0-9a-fklmnor])/i);
      if (!legacy) {
        index += 1;
        continue;
      }
      const code = legacy[1].toLowerCase();
      if (/^[0-9a-f]$/.test(code)) {
        state.colorCode = legacy[0];
        resetDecorations();
      } else if (code === 'k') state.obfuscated = true;
      else if (code === 'l') state.bold = true;
      else if (code === 'm') state.strike = true;
      else if (code === 'n') state.underline = true;
      else if (code === 'o') state.italic = true;
      else if (code === 'r') {
        state.colorCode = '';
        state.fontCode = '';
        resetDecorations();
      }
      index += legacy[0].length;
    }
    return state;
  }

  function decorationCodes(state) {
    return [
      state.obfuscated ? '&k' : '',
      state.bold ? '&l' : '',
      state.strike ? '&m' : '',
      state.underline ? '&n' : '',
      state.italic ? '&o' : '',
    ].join('');
  }

  function restoreFormattingCodes(state) {
    return `&r${state.fontCode || ''}${state.colorCode || ''}${decorationCodes(state)}`;
  }

  function applyContentColor(content, selectionStart, selectionEnd, pickedColor) {
    const value = String(content == null ? '' : content);
    const color = String(pickedColor || '');
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      const fallbackCaret = Math.max(0, Math.min(value.length, Number(selectionEnd) || 0));
      return { value, caret: fallbackCaret };
    }
    const rawStart = Number.isFinite(Number(selectionStart))
      ? Math.trunc(Number(selectionStart))
      : 0;
    const rawEnd = Number.isFinite(Number(selectionEnd))
      ? Math.trunc(Number(selectionEnd))
      : rawStart;
    const start = Math.max(0, Math.min(value.length, Math.min(rawStart, rawEnd)));
    const end = Math.max(start, Math.min(value.length, Math.max(rawStart, rawEnd)));
    const code = `&#${color.slice(1).toUpperCase()}FF`;
    const selected = value.slice(start, end);
    const replacement = selected
      ? `${code}${decorationCodes(formattingStateAt(value, start))}${selected}${restoreFormattingCodes(formattingStateAt(value, end))}`
      : code;
    return {
      value: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
      caret: start + replacement.length,
    };
  }

  function insertContent(content, selectionStart, selectionEnd, insertion) {
    const value = String(content == null ? '' : content);
    const inserted = String(insertion == null ? '' : insertion);
    const rawStart = Number.isFinite(Number(selectionStart))
      ? Math.trunc(Number(selectionStart))
      : value.length;
    const rawEnd = Number.isFinite(Number(selectionEnd))
      ? Math.trunc(Number(selectionEnd))
      : rawStart;
    const start = Math.max(0, Math.min(value.length, Math.min(rawStart, rawEnd)));
    const end = Math.max(start, Math.min(value.length, Math.max(rawStart, rawEnd)));
    return {
      value: `${value.slice(0, start)}${inserted}${value.slice(end)}`,
      caret: start + inserted.length,
    };
  }

  function scanFormatCodes(text, lang, issues, translate, parsedTemplate) {
    const ranges = [];
    let cursor = 0;
    for (const expression of parsedTemplate?.expressions || []) {
      if (expression.start > cursor) ranges.push([cursor, expression.start]);
      cursor = Math.max(cursor, expression.end);
    }
    if (cursor < text.length) ranges.push([cursor, text.length]);
    if (!ranges.length && !parsedTemplate?.expressions?.length) ranges.push([0, text.length]);
    for (const [rangeStart, rangeEnd] of ranges) {
      for (let index = rangeStart; index < rangeEnd; index += 1) {
        const character = text[index];
        if (character !== '&' && character !== '§') continue;
        const next = text[index + 1];
        if (next === '#') {
          const rest = text.slice(index + 2);
          const hexMatch = rest.match(/^([0-9a-f]{8})/i);
          if (!hexMatch) {
            issues.push({
              code: 'colorCode',
              message: translate(lang, 'illegalColorCode', { code: `&#${rest.slice(0, 6)}` }),
              position: index,
              length: Math.min(rest.length + 2, 10),
            });
          }
        } else if (!next || !/^[0-9a-fklmnor]$/i.test(next)) {
          issues.push({
            code: 'formatCode',
            message: translate(lang, 'illegalFormatCode', { code: `&${next || ''}` }),
            position: index,
            length: next ? 2 : 1,
          });
        }
      }
    }
  }

  function create(options) {
    const config = options || {};
    if (
      typeof config.parseTemplateSyntax !== 'function' ||
      typeof config.lintContent !== 'function' ||
      typeof config.parser?.parseTemplate !== 'function' ||
      typeof config.translate !== 'function' ||
      typeof config.formatParsedNode !== 'function'
    ) {
      throw new TypeError('Formatting parser, linter, translator, and formatter are required');
    }
    function formatContentDetailed(content) {
      const text = String(content == null ? '' : content);
      if (!text) return { value: '', valid: true, changed: false };
      const parsed = config.parseTemplateSyntax(text);
      const lint = config.lintContent(text, 'zh', parsed);
      if (!lint.valid) return { value: text, valid: false, changed: false, issues: lint.issues };
      if (!parsed.expressions.length) return { value: text, valid: true, changed: false };
      let result = '';
      let cursor = 0;
      parsed.expressions.forEach((expression) => {
        result += text.slice(cursor, expression.start);
        result += `{${config.formatParsedNode(expression.expression, 0)}}`;
        cursor = expression.end;
      });
      result += text.slice(cursor);
      const reparsed = config.parser.parseTemplate(result);
      if (reparsed.diagnostics.length) {
        return { value: text, valid: false, changed: false, issues: reparsed.diagnostics };
      }
      return { value: result, valid: true, changed: result !== text };
    }
    return Object.freeze({
      scanFormatCodes: (text, lang, issues, parsedTemplate) =>
        scanFormatCodes(text, lang, issues, config.translate, parsedTemplate),
      formatContentDetailed,
      formatContent: (content) => formatContentDetailed(content).value,
      applyContentColor,
      insertContent,
    });
  }

  return Object.freeze({
    create,
    formattingStateAt,
    applyContentColor,
    insertContent,
    scanFormatCodes,
  });
});
