(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WynntilsMarkdownRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  function inlineParts(value) {
    const source = String(value || '');
    const parts = [];
    const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
    let cursor = 0;
    for (const match of source.matchAll(pattern)) {
      if (match.index > cursor)
        parts.push({ type: 'text', text: source.slice(cursor, match.index) });
      const token = match[0];
      parts.push(
        token.startsWith('**')
          ? { type: 'strong', text: token.slice(2, -2) }
          : { type: 'code', text: token.slice(1, -1) },
      );
      cursor = match.index + token.length;
    }
    if (cursor < source.length) parts.push({ type: 'text', text: source.slice(cursor) });
    return parts.length ? parts : [{ type: 'text', text: source }];
  }

  function tokenize(value) {
    const lines = String(value || '')
      .replace(/\r\n?/g, '\n')
      .split('\n');
    const tokens = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }
      const fence = line.match(/^```([\w-]*)[ \t]*$/);
      if (fence) {
        const content = [];
        index += 1;
        while (index < lines.length && !/^```[ \t]*$/.test(lines[index])) {
          content.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        tokens.push({ type: 'code', language: fence[1].toLowerCase(), text: content.join('\n') });
        continue;
      }
      const heading = line.match(/^(#{1,3})[ \t]+(.+)$/);
      if (heading) {
        tokens.push({ type: 'heading', level: heading[1].length, parts: inlineParts(heading[2]) });
        index += 1;
        continue;
      }
      if (/^[ \t]*[-*][ \t]+/.test(line)) {
        const items = [];
        while (index < lines.length && /^[ \t]*[-*][ \t]+/.test(lines[index])) {
          items.push(inlineParts(lines[index].replace(/^[ \t]*[-*][ \t]+/, '')));
          index += 1;
        }
        tokens.push({ type: 'list', items });
        continue;
      }
      const paragraph = [line];
      index += 1;
      while (
        index < lines.length &&
        lines[index].trim() &&
        !/^```/.test(lines[index]) &&
        !/^(?:#{1,3}|[ \t]*[-*])[ \t]+/.test(lines[index])
      ) {
        paragraph.push(lines[index]);
        index += 1;
      }
      tokens.push({ type: 'paragraph', parts: inlineParts(paragraph.join('\n')) });
    }
    return tokens;
  }

  function appendInline(parent, parts, documentRef) {
    parts.forEach((part) => {
      if (part.type === 'strong') {
        const strong = documentRef.createElement('strong');
        strong.textContent = part.text;
        parent.append(strong);
      } else if (part.type === 'code') {
        const code = documentRef.createElement('code');
        code.className = 'ai-inline-code';
        code.textContent = part.text;
        parent.append(code);
      } else {
        parent.append(documentRef.createTextNode(part.text));
      }
    });
  }

  function render(container, value, documentImplementation) {
    const documentRef = documentImplementation || document;
    container.replaceChildren();
    tokenize(value).forEach((token) => {
      if (token.type === 'code') {
        const pre = documentRef.createElement('pre');
        pre.className = 'ai-markdown-code';
        const code = documentRef.createElement('code');
        if (token.language) code.dataset.language = token.language;
        code.textContent = token.text;
        pre.append(code);
        container.append(pre);
        return;
      }
      if (token.type === 'list') {
        const list = documentRef.createElement('ul');
        token.items.forEach((parts) => {
          const item = documentRef.createElement('li');
          appendInline(item, parts, documentRef);
          list.append(item);
        });
        container.append(list);
        return;
      }
      const element = documentRef.createElement(
        token.type === 'heading' ? `h${Math.min(4, token.level + 2)}` : 'p',
      );
      appendInline(element, token.parts, documentRef);
      container.append(element);
    });
  }

  return Object.freeze({ inlineParts, tokenize, render });
});
