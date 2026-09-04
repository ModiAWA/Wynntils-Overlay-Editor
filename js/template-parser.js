(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WynntilsTemplateParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  const SIMPLE_FORMAT = /^[0-9a-fklmnor]$/i;
  const IDENTIFIER_START = /[A-Za-z_]/;
  const IDENTIFIER_PART = /[A-Za-z0-9_]/;

  function diagnostic(code, start, end, details) {
    return { code, start, end: Math.max(start + 1, end), severity: 'error', ...(details || {}) };
  }

  function readFormatCode(source, index) {
    if (source[index] !== '&' && source[index] !== '§') return '';
    if (source[index + 1] === '#') {
      const match = source.slice(index + 2).match(/^[0-9a-f]{8}/i);
      return match ? source.slice(index, index + match[0].length + 2) : '';
    }
    return SIMPLE_FORMAT.test(source[index + 1] || '') ? source.slice(index, index + 2) : '';
  }

  function tokenizeTemplate(value) {
    const source = String(value == null ? '' : value);
    const tokens = [];
    const braceStack = [];
    const expressionHeads = [];
    let depth = 0;
    let index = 0;

    function push(type, tokenValue, start, end) {
      if (!tokenValue) return -1;
      const previous = tokens[tokens.length - 1];
      if (
        previous &&
        previous.type === type &&
        previous.end === start &&
        !['brace', 'punctuation', 'error'].includes(type)
      ) {
        previous.value += tokenValue;
        previous.end = end;
        return tokens.length - 1;
      }
      tokens.push({ type, value: tokenValue, start, end });
      return tokens.length - 1;
    }

    while (index < source.length) {
      const char = source[index];
      const formatCode = readFormatCode(source, index);
      if (formatCode) {
        push('format', formatCode, index, index + formatCode.length);
        index += formatCode.length;
        continue;
      }
      if (char === '\\' && source[index + 1] === 'n') {
        push('escape', '\\n', index, index + 2);
        index += 2;
        continue;
      }
      if (char === '{') {
        const tokenIndex = push('brace', char, index, index + 1);
        braceStack.push(tokenIndex);
        expressionHeads.push(true);
        depth += 1;
        index += 1;
        continue;
      }
      if (char === '}') {
        if (depth === 0) push('error', char, index, index + 1);
        else {
          push('brace', char, index, index + 1);
          braceStack.pop();
          expressionHeads.pop();
          depth -= 1;
        }
        index += 1;
        continue;
      }
      if (depth === 0) {
        const start = index;
        while (
          index < source.length &&
          source[index] !== '{' &&
          source[index] !== '}' &&
          !(source[index] === '\\' && source[index + 1] === 'n') &&
          !readFormatCode(source, index)
        ) {
          index += 1;
        }
        push('text', source.slice(start, index), start, index);
        continue;
      }
      if (char === '"') {
        const start = index;
        let closed = false;
        index += 1;
        while (index < source.length) {
          if (source[index] === '\\') {
            index = Math.min(source.length, index + 2);
            continue;
          }
          if (source[index] === '"') {
            index += 1;
            closed = true;
            break;
          }
          index += 1;
        }
        push(closed ? 'string' : 'error', source.slice(start, index), start, index);
        continue;
      }
      if (/\s/.test(char)) {
        const start = index;
        while (index < source.length && /\s/.test(source[index])) index += 1;
        push('text', source.slice(start, index), start, index);
        continue;
      }
      const number = source.slice(index).match(/^-?(?:\d+(?:\.\d*)?|\.\d+)/);
      if (number) {
        push('number', number[0], index, index + number[0].length);
        index += number[0].length;
        continue;
      }
      if (IDENTIFIER_START.test(char)) {
        const start = index;
        index += 1;
        while (index < source.length && IDENTIFIER_PART.test(source[index])) index += 1;
        const identifier = source.slice(start, index);
        let next = index;
        while (next < source.length && /\s/.test(source[next])) next += 1;
        const isBoolean = /^(?:true|false)$/i.test(identifier);
        const isExpressionHead = expressionHeads[expressionHeads.length - 1];
        expressionHeads[expressionHeads.length - 1] = false;
        const type = isBoolean
          ? 'boolean'
          : source[next] === '(' || isExpressionHead
            ? 'function'
            : 'variable';
        push(type, identifier, start, index);
        continue;
      }
      if ('();:'.includes(char)) {
        push('punctuation', char, index, index + 1);
        index += 1;
        continue;
      }
      push('text', char, index, index + 1);
      index += 1;
    }

    braceStack.forEach((tokenIndex) => {
      if (tokens[tokenIndex]) tokens[tokenIndex].type = 'error';
    });
    return tokens;
  }

  function parseExpression(value, baseOffset) {
    const source = String(value == null ? '' : value);
    const offset = Number(baseOffset) || 0;
    const diagnostics = [];
    let index = 0;

    function absolute(position) {
      return offset + position;
    }

    function skipWhitespace() {
      while (index < source.length && /\s/.test(source[index])) index += 1;
    }

    function parseString() {
      const start = index;
      index += 1;
      let escaped = false;
      while (index < source.length) {
        const character = source[index];
        if (character === '"' && !escaped) {
          index += 1;
          return {
            type: 'Literal',
            kind: 'String',
            value: source.slice(start + 1, index - 1),
            raw: source.slice(start, index),
            start: absolute(start),
            end: absolute(index),
          };
        }
        escaped = character === '\\' && !escaped;
        if (character !== '\\') escaped = false;
        index += 1;
      }
      diagnostics.push(diagnostic('unclosedString', absolute(start), absolute(source.length)));
      return {
        type: 'ErrorNode',
        raw: source.slice(start),
        start: absolute(start),
        end: absolute(source.length),
      };
    }

    function parseNumber() {
      const start = index;
      const match = source.slice(index).match(/^-?(?:\d+(?:\.\d*)?|\.\d+)/);
      index += match[0].length;
      const isInteger = /^-?\d+$/.test(match[0]);
      return {
        type: 'Literal',
        kind: isInteger ? 'Integer' : 'Double',
        value: Number(match[0]),
        raw: match[0],
        start: absolute(start),
        end: absolute(index),
      };
    }

    function readFormatSuffix(node) {
      if (source[index] !== ':') return node;
      const suffixStart = index;
      index += 1;
      const match = source.slice(index).match(/^(?:F)?\d*/);
      const format = match ? match[0] : '';
      index += format.length;
      node.format = format;
      node.formatStart = absolute(suffixStart);
      node.end = absolute(index);
      node.raw = source.slice(node.start - offset, index);
      return node;
    }

    function parseIdentifier() {
      const start = index;
      index += 1;
      while (index < source.length && IDENTIFIER_PART.test(source[index])) index += 1;
      const name = source.slice(start, index);
      const afterName = index;
      const parenthesized = source[index] === '(';
      const args = [];
      let closed = true;
      if (parenthesized) {
        index += 1;
        skipWhitespace();
        if (source[index] === ')') index += 1;
        else {
          while (index < source.length) {
            const argumentStart = index;
            const argument = parseNode();
            if (!argument) {
              diagnostics.push(
                diagnostic('expectedArgument', absolute(argumentStart), absolute(index + 1)),
              );
              closed = false;
              break;
            }
            args.push(argument);
            skipWhitespace();
            if (source[index] === ';') {
              index += 1;
              skipWhitespace();
              continue;
            }
            if (source[index] === ')') {
              index += 1;
              break;
            }
            diagnostics.push(
              diagnostic('unclosedParen', absolute(start), absolute(Math.max(index, start + 1))),
            );
            closed = false;
            break;
          }
          if (index >= source.length && source[index - 1] !== ')') {
            diagnostics.push(diagnostic('unclosedParen', absolute(start), absolute(source.length)));
            closed = false;
          }
        }
      } else {
        index = afterName;
      }
      const node = {
        type: 'Call',
        name,
        args,
        format: '',
        parenthesized,
        closed,
        start: absolute(start),
        nameStart: absolute(start),
        nameEnd: absolute(afterName),
        end: absolute(index),
        raw: source.slice(start, index),
      };
      return readFormatSuffix(node);
    }

    function parseNode() {
      skipWhitespace();
      if (index >= source.length || source[index] === ';' || source[index] === ')') return null;
      if (source[index] === '"') return parseString();
      if (/[-.\d]/.test(source[index]) && /^-?(?:\d+(?:\.\d*)?|\.\d+)/.test(source.slice(index))) {
        return parseNumber();
      }
      if (IDENTIFIER_START.test(source[index])) {
        const start = index;
        const node = parseIdentifier();
        if (/^(?:true|false)$/i.test(node.name) && !node.parenthesized && !node.format) {
          return {
            type: 'Literal',
            kind: 'Boolean',
            value: node.name.toLowerCase() === 'true',
            raw: source.slice(start, index),
            start: node.start,
            end: node.end,
          };
        }
        return node;
      }
      const start = index;
      while (index < source.length && ![';', ')'].includes(source[index])) index += 1;
      diagnostics.push(diagnostic('syntax', absolute(start), absolute(index)));
      return {
        type: 'ErrorNode',
        raw: source.slice(start, index),
        start: absolute(start),
        end: absolute(index),
      };
    }

    skipWhitespace();
    const node = parseNode();
    skipWhitespace();
    if (index < source.length) {
      diagnostics.push(diagnostic('trailingContent', absolute(index), absolute(source.length)));
      return {
        source,
        node: {
          type: 'ErrorNode',
          raw: source,
          parsed: node,
          start: offset,
          end: offset + source.length,
        },
        diagnostics,
      };
    }
    if (!node) diagnostics.push(diagnostic('emptyExpression', offset, offset + source.length));
    return { source, node, diagnostics };
  }

  function parseTemplate(value) {
    const source = String(value == null ? '' : value);
    const nodes = [];
    const expressions = [];
    const diagnostics = [];
    let textStart = 0;
    let index = 0;

    function pushText(end) {
      if (end <= textStart) return;
      nodes.push({
        type: 'Text',
        value: source.slice(textStart, end),
        raw: source.slice(textStart, end),
        start: textStart,
        end,
      });
    }

    while (index < source.length) {
      if (source[index] === '}') {
        pushText(index);
        diagnostics.push(diagnostic('unmatchedBrace', index, index + 1));
        nodes.push({ type: 'ErrorNode', raw: '}', start: index, end: index + 1 });
        index += 1;
        textStart = index;
        continue;
      }
      if (source[index] !== '{') {
        index += 1;
        continue;
      }
      pushText(index);
      const open = index;
      index += 1;
      const bodyStart = index;
      let depth = 1;
      let quoted = false;
      let escaped = false;
      while (index < source.length && depth > 0) {
        const character = source[index];
        if (character === '"' && !escaped) quoted = !quoted;
        if (!quoted) {
          if (character === '{') depth += 1;
          else if (character === '}') depth -= 1;
        }
        if (depth > 0) {
          escaped = character === '\\' && !escaped;
          if (character !== '\\') escaped = false;
          index += 1;
        }
      }
      if (depth > 0) {
        const error = diagnostic(quoted ? 'unclosedString' : 'unclosedBrace', open, source.length);
        diagnostics.push(error);
        nodes.push({ type: 'ErrorNode', raw: source.slice(open), start: open, end: source.length });
        textStart = source.length;
        index = source.length;
        break;
      }
      const close = index;
      const rawBody = source.slice(bodyStart, close);
      const parsed = parseExpression(rawBody, bodyStart);
      diagnostics.push(...parsed.diagnostics);
      const expression = {
        type: 'Expression',
        raw: source.slice(open, close + 1),
        body: rawBody,
        expression: parsed.node,
        start: open,
        bodyStart,
        end: close + 1,
      };
      nodes.push(expression);
      expressions.push(expression);
      index = close + 1;
      textStart = index;
    }
    pushText(source.length);
    return {
      type: 'Template',
      source,
      nodes,
      expressions,
      diagnostics,
      tokens: tokenizeTemplate(source),
      valid: diagnostics.length === 0,
    };
  }

  return Object.freeze({ readFormatCode, tokenizeTemplate, parseExpression, parseTemplate });
});
