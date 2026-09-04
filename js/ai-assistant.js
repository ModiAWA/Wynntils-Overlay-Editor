(function (root, factory) {
  const api = factory(root.WYNNTILS_FONT_RESOURCES || { fonts: {} });
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WynntilsAiAssistant = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function (resources) {
  'use strict';

  const SEARCH_TOOL_NAME = 'search_wynntils_functions';
  const MAX_AGENT_REQUESTS = 6;
  const MAX_PROPOSAL_CORRECTIONS = 2;
  const MAX_FUNCTION_SEARCHES = 3;
  const MAX_SEARCH_RESULTS = 12;
  const SEARCH_TOOL = Object.freeze({
    type: 'function',
    function: {
      name: SEARCH_TOOL_NAME,
      description:
        'Search the bundled official Wynntils function catalog by a short name or concept. Use this before guessing any function that is not already in context.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'A short search phrase such as "anni dry count", "current world", or "生命值".',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  });

  const SYSTEM_PROMPTS = Object.freeze({
    zh: [
      '你是 Wynntils Overlay Info Box 设计助手，服务对象是第一次配置 Overlay 的玩家。',
      '请先用简洁中文确认用户想展示的信息，再提供可直接粘贴到 Content 字段的内容。',
      '只能使用上下文或本地搜索结果给出的 Wynntils 函数；不要编造函数。',
      '首轮给出的函数只是粗检索候选，可能与需求无关；如果没有可靠匹配，不要据此拒绝需求，先使用本地搜索工具。',
      `缺少可靠函数时必须调用 ${SEARCH_TOOL_NAME}，可以换更短的关键词继续搜索。最多搜索 3 次。`,
      '如果端点不能调用工具，请只输出 ```wynntils-search 代码块，块内放一个简短查询词，然后等待本地结果；不要同时给最终方案。',
      'Minecraft 颜色可以使用 &a、&7 或 &#RRGGBBAA，重置使用 &r。',
      '“当前 Content”代码块是原始文本，不是 JSON。如果用户只要求新增或修改一项，必须逐字保留其余内容、私用区图标字符、颜色码、空格和真实换行。',
      '需要创建类似“一般信息显示”的胶囊标题时，只能使用本轮提供的 Wynntils 标题字形参考和组装规则；不要用普通英文字母或猜测私用区字符。',
      '最终 Content 不得用引号包住整段；函数引号字符串外不得输出字面量 \\n 或多余反斜杠，不得把下划线或引号写成 Markdown/JSON 转义。concat("\\n ...") 这类引号字符串内的转义是合法函数参数，未被要求修改时必须保留。无参数占位符优先使用 {function_name} 形式。',
      '不要输出完整 Overlay JSON，也不要声称可以自动写入游戏。',
      '当方案可应用时，把完整 Content 单独放入一个 ```wynntils 代码块；代码块外可以解释。',
    ].join('\n'),
    en: [
      'You are a Wynntils Overlay Info Box design assistant for first-time Overlay users.',
      'Briefly confirm what the user wants to display, then provide content that can be pasted into the Content field.',
      'Use only Wynntils functions supplied in context or returned by local search. Never invent functions.',
      'Functions included in the first turn are only rough candidates and may be irrelevant. If none is reliable, search locally instead of rejecting the request.',
      `When a reliable function is missing, call ${SEARCH_TOOL_NAME}. You may retry with a shorter query, up to three searches.`,
      'If tool calling is unavailable, output only a ```wynntils-search block containing one short query and wait for local results; do not provide a final proposal in the same response.',
      'Minecraft colors may use &a, &7, or &#RRGGBBAA; use &r to reset formatting.',
      'The Current Content block is raw text, not JSON. When the user asks to add or change one item, preserve every other character, private-use glyph, color code, space, and real line break verbatim.',
      'When creating a pill title like the General Information example, use only the supplied Wynntils title glyph reference and composition recipe. Do not substitute ordinary Latin letters or guess private-use characters.',
      'Never wrap the whole Content in quotes, output a literal \\n or extra backslash outside a quoted function argument, or Markdown/JSON-escape underscores or quotes. Escapes inside quoted function arguments, such as concat("\\n ..."), are valid and must be preserved unless the user asks to change them. Prefer {function_name} for a zero-argument placeholder.',
      'Do not output complete Overlay JSON or claim that you can write into the game automatically.',
      'When a proposal is ready, put the complete Content in one ```wynntils code block. Explanations may stay outside it.',
    ].join('\n'),
  });

  function parseEndpoint(value) {
    const source = String(value || '').trim();
    if (!source) throw new Error('An HTTP endpoint is required.');
    const endpoint = new URL(source);
    if (!['http:', 'https:'].includes(endpoint.protocol)) {
      throw new Error('The endpoint must use HTTP or HTTPS.');
    }
    if (endpoint.username || endpoint.password) {
      throw new Error('Endpoint credentials are not allowed in the URL.');
    }
    const hostname = endpoint.hostname.toLowerCase().replace(/\.$/, '');
    const ipv4Parts = hostname.split('.');
    const isIpv4Loopback =
      ipv4Parts.length === 4 &&
      ipv4Parts[0] === '127' &&
      ipv4Parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
    const isLoopback =
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '[::1]' ||
      hostname === '::1' ||
      isIpv4Loopback;
    if (endpoint.protocol === 'http:' && !isLoopback) {
      throw new Error('Remote endpoints must use HTTPS; HTTP is only allowed for loopback hosts.');
    }
    endpoint.hash = '';
    return endpoint;
  }

  function normalizeEndpoint(value) {
    const endpoint = parseEndpoint(value);
    const pathname = endpoint.pathname.replace(/\/+$/, '');
    if (/(?:^|\/)v1$/i.test(pathname)) endpoint.pathname = `${pathname}/chat/completions`;
    return endpoint.toString();
  }

  function normalizeModelsEndpoint(value) {
    const endpoint = parseEndpoint(value);
    const pathname = endpoint.pathname.replace(/\/+$/, '');
    if (/(?:^|\/)models$/i.test(pathname)) endpoint.pathname = pathname;
    else if (/(?:^|\/)v1$/i.test(pathname)) endpoint.pathname = `${pathname}/models`;
    else if (/\/chat\/completions$/i.test(pathname)) {
      endpoint.pathname = pathname.replace(/\/chat\/completions$/i, '/models');
    } else {
      throw new Error('A standard /v1 or /chat/completions endpoint is required.');
    }
    return endpoint.toString();
  }

  function extractModelIds(payload) {
    const entries = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : Array.isArray(payload)
          ? payload
          : [];
    const models = entries
      .slice(0, 500)
      .map((entry) =>
        typeof entry === 'string' ? entry : entry?.id || entry?.name || entry?.model || '',
      )
      .map((value) => String(value).trim().slice(0, 200))
      .filter(Boolean);
    return [...new Set(models)].sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }),
    );
  }

  function textFromContent(content) {
    if (typeof content === 'string' && content.trim()) return content.trim();
    if (Array.isArray(content)) {
      const text = content
        .map((part) => (typeof part === 'string' ? part : part?.text || part?.content || ''))
        .join('')
        .trim();
      if (text) return text;
    }
    return '';
  }

  function parseToolArguments(value) {
    try {
      const parsed = JSON.parse(String(value || '{}'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  function extractAssistantTurn(payload) {
    if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
      return createTextTurn(payload.output_text);
    }
    const source = payload?.choices?.[0]?.message;
    const text = textFromContent(source?.content);
    const rawCalls = Array.isArray(source?.tool_calls) ? source.tool_calls : [];
    const messageCalls = rawCalls.map((call, index) => ({
      id: String(call?.id || `call_${index + 1}`),
      type: 'function',
      function: {
        name: String(call?.function?.name || ''),
        arguments: String(call?.function?.arguments || '{}'),
      },
    }));
    const toolCalls = messageCalls.map((call) => {
      const args = parseToolArguments(call.function.arguments);
      return {
        id: call.id,
        name: call.function.name,
        query: String(args.query || '')
          .trim()
          .slice(0, 240),
      };
    });
    if (!text && !toolCalls.length) {
      throw new Error('The endpoint returned no assistant message.');
    }
    const message = { role: 'assistant', content: text || null };
    if (messageCalls.length) message.tool_calls = messageCalls;
    return { text, message, toolCalls };
  }

  function extractAssistantText(payload) {
    const turn = extractAssistantTurn(payload);
    if (turn.text) return turn.text;
    throw new Error('The endpoint returned no assistant message.');
  }

  function createTextTurn(value) {
    const text = String(value || '').trim();
    return { text, message: { role: 'assistant', content: text }, toolCalls: [] };
  }

  function createToolTurn(id, name, query) {
    const toolCall = {
      id: String(id || 'call_1'),
      type: 'function',
      function: {
        name: String(name || ''),
        arguments: JSON.stringify({ query: String(query || '') }),
      },
    };
    return {
      text: '',
      message: { role: 'assistant', content: null, tool_calls: [toolCall] },
      toolCalls: [
        {
          id: toolCall.id,
          name: toolCall.function.name,
          query: String(query || '').trim(),
        },
      ],
    };
  }

  function extractTextSearches(value) {
    const searches = [];
    const pattern = /```wynntils-search[ \t]*\r?\n([\s\S]*?)```/gi;
    for (const match of String(value || '').matchAll(pattern)) {
      const query = match[1].trim().slice(0, 240);
      if (query) searches.push(query);
    }
    return searches;
  }

  function extractProposal(value) {
    const source = String(value || '');
    const match = source.match(/```(?:wynntils|text)[ \t]*\r?\n([\s\S]*?)```/i);
    return match ? match[1].replace(/\r?\n$/, '') : '';
  }

  function titleGlyphEntries() {
    const provider = resources.fonts?.['wynntils:five']?.providers?.find(
      (entry) => entry.type === 'bitmap',
    );
    const entries = [];
    (provider?.chars || []).forEach((glyphRow, rowIndex) => {
      const labels = Array.from(provider?.labels?.[rowIndex] || '');
      Array.from(glyphRow).forEach((glyph, columnIndex) => {
        const label = labels[columnIndex] || '';
        if (/^[A-Z]$/.test(label)) entries.push([label, glyph]);
      });
    });
    return entries;
  }

  function buildTitleGlyphReference(language) {
    const entries = titleGlyphEntries();
    if (entries.length !== 26) return '';
    const alphabet = entries.map(([letter, glyph]) => `${letter}=${glyph}`).join(' ');
    const example = '&#0caadfff⁤&f&#0caadfff&f&#0caadfff&f⁤&#0caadfff';
    if (language === 'en') {
      return [
        'A-Z private-use glyphs (copy the glyph after = exactly):',
        alphabet,
        'Composition: start with background color + ⁤; add the first cell as  + foreground color + glyph; for every later cell restore the background color before , then set the foreground color and glyph; finish with ⁤ + background color + . Use a normal space as the glyph for a title space.',
        `Exact FPS example: ${example}`,
      ].join('\n');
    }
    return [
      'A–Z 私用区字形（必须逐字复制等号后的字符）：',
      alphabet,
      '组装：背景色 + ⁤ 开头；首字符使用  + 前景色 + 字形；后续每个字符先恢复背景色，再接  + 前景色 + 字形；最后使用 ⁤ + 背景色 + 。标题中的空格用普通空格作为字形。',
      `完整 FPS 示例：${example}`,
    ].join('\n');
  }

  function buildMessages(options) {
    const settings = options || {};
    const language = settings.language === 'en' ? 'en' : 'zh';
    const history = Array.isArray(settings.history) ? settings.history.slice(-12) : [];
    const messages = [{ role: 'system', content: SYSTEM_PROMPTS[language] }];
    history.forEach((message) => {
      if (!['user', 'assistant'].includes(message?.role)) return;
      const content = String(message.content || '')
        .trim()
        .slice(0, 12000);
      if (content) messages.push({ role: message.role, content });
    });

    const config = settings.currentConfig || {};
    const configWithoutContent = { ...config };
    delete configWithoutContent.content;
    const currentContent = String(config.content || '');
    const functions = Array.isArray(settings.functionCandidates)
      ? settings.functionCandidates.slice(0, 10)
      : [];
    const labels =
      language === 'en'
        ? {
            request: 'Current request',
            content: 'Current Content (raw text; preserve verbatim unless requested)',
            config: 'Other current Info Box settings',
            functions: 'Relevant verified Wynntils functions',
            titleGlyphs: 'Wynntils title glyph reference',
            none: 'The initial pass found no close function. Use local search before asking.',
          }
        : {
            request: '本轮需求',
            content: '当前 Content（原始文本；除非用户要求，否则逐字保留）',
            config: '当前 Info Box 的其他设置',
            functions: '本地检索到的可靠 Wynntils 函数',
            titleGlyphs: 'Wynntils 标题字形参考',
            none: '首轮粗检索没有相近函数，请先使用本地搜索，不要自行编造。',
          };
    const references = functions.length
      ? functions
          .map(
            (entry) => `- ${entry.signature}${entry.description ? `：${entry.description}` : ''}`,
          )
          .join('\n')
      : labels.none;
    const titleGlyphReference = buildTitleGlyphReference(language);
    messages.push({
      role: 'user',
      content: [
        `${labels.request}：${String(settings.userMessage || '').trim()}`,
        `${labels.content}：\n\`\`\`wynntils-current\n${currentContent}\n\`\`\``,
        `${labels.config}：\n${JSON.stringify(configWithoutContent, null, 2)}`,
        `${labels.functions}：\n${references}`,
        titleGlyphReference ? `${labels.titleGlyphs}：\n${titleGlyphReference}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    });
    return messages;
  }

  function validateProposalFormat(value, language) {
    const source = String(value || '');
    const trimmed = source.trim();
    const errors = [];
    const isEnglish = language === 'en';
    if (/^"[\s\S]*"$/.test(trimmed)) {
      errors.push({
        code: 'quoted-content',
        message: isEnglish
          ? 'Content is wrapped as a JSON string. Return raw Content without outer quotes.'
          : 'Content 被整段引号包裹，像 JSON 字符串；请返回不带外层引号的原始 Content。',
      });
    }
    const jsonWrapped = /^"[\s\S]*"$/.test(trimmed);
    let escapedNewline = false;
    let escapedIdentifier = false;
    let externalBackslash = false;
    let inString = false;
    const scanStart = jsonWrapped ? source.indexOf('"') + 1 : 0;
    const scanEnd = jsonWrapped ? source.lastIndexOf('"') : source.length;
    for (let index = scanStart; index < scanEnd; index += 1) {
      const character = source[index];
      if (!jsonWrapped && character === '"') {
        inString = !inString;
        continue;
      }
      if (character !== '\\') continue;
      const next = source[index + 1] || '';
      if (!jsonWrapped && inString) {
        index += 1;
        continue;
      }
      if (next === 'n') escapedNewline = true;
      else if (next === '_' && /[a-z0-9]/i.test(source[index + 2] || '')) {
        escapedIdentifier = true;
      } else {
        externalBackslash = true;
      }
      index += 1;
    }
    if (escapedNewline) {
      errors.push({
        code: 'escaped-newline',
        message: isEnglish
          ? 'Content contains literal \\n escapes. Use real line breaks instead.'
          : 'Content 包含字面量 \\n 转义；请直接使用真实换行。',
      });
    }
    if (escapedIdentifier) {
      errors.push({
        code: 'escaped-identifier',
        message: isEnglish
          ? 'A function identifier contains a backslash-escaped underscore. Copy function names without Markdown escaping.'
          : '函数标识符包含反斜杠转义的下划线；请原样复制函数名，不要使用 Markdown 转义。',
      });
    }
    if (/&(?:#x0*20|nbsp);/i.test(source)) {
      errors.push({
        code: 'html-space-entity',
        message: isEnglish
          ? 'Content contains an HTML space entity. Use an ordinary space character instead.'
          : 'Content 包含 HTML 空格实体；请直接使用普通空格字符。',
      });
    }
    if (externalBackslash) {
      errors.push({
        code: 'external-backslash',
        message: isEnglish
          ? 'Content contains a backslash outside a quoted function argument. Remove JSON or Markdown escaping.'
          : 'Content 在函数的引号字符串外包含反斜杠；请移除 JSON 或 Markdown 转义。',
      });
    }
    return { valid: errors.length === 0, errors };
  }

  function functionSearchRecord(entry) {
    const parameters = Array.isArray(entry?.p)
      ? entry.p.map(([name, type, required]) => ({
          name,
          type,
          required: Boolean(required),
        }))
      : Array.isArray(entry?.parameters)
        ? entry.parameters
        : [];
    const canonicalName = String(entry?.n || entry?.canonicalName || entry?.name || '');
    const aliases = Array.isArray(entry?.a)
      ? entry.a
      : Array.isArray(entry?.aliases)
        ? entry.aliases
        : [];
    const returnType = String(entry?.r || entry?.returnType || 'Unknown');
    const signature = String(
      entry?.signature ||
        `${canonicalName}(${parameters
          .map((parameter) =>
            Array.isArray(parameter)
              ? `${parameter[0]}: ${parameter[1]}${parameter[2] ? '' : '?'}`
              : `${parameter.name}: ${parameter.type}${parameter.required ? '' : '?'}`,
          )
          .join('; ')}) -> ${returnType}`,
    );
    return {
      canonical_name: canonicalName,
      aliases: aliases.map(String).slice(0, 20),
      signature,
      parameters,
      return_type: returnType,
      description: String(entry?.d || entry?.description || ''),
      keywords: (Array.isArray(entry?.kw) ? entry.kw : entry?.keywords || [])
        .map(String)
        .slice(0, 30),
    };
  }

  function formatSearchResults(query, entries) {
    const matches = (Array.isArray(entries) ? entries : [])
      .slice(0, MAX_SEARCH_RESULTS)
      .map(functionSearchRecord);
    return JSON.stringify({ query, matches }, null, 2);
  }

  function normalizedQuery(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function throwIfAborted(signal) {
    if (!signal?.aborted) return;
    if (typeof signal.throwIfAborted === 'function') signal.throwIfAborted();
    const error = new Error('The request was aborted.');
    error.name = 'AbortError';
    throw error;
  }

  function compatibilityError(error) {
    if (![400, 422, 501].includes(Number(error?.status))) return false;
    return /tool|function|unsupported|unknown (?:field|parameter|property)|unrecognized|extra (?:field|input)|extra_forbidden/i.test(
      String(error?.message || ''),
    );
  }

  function correctionMessage(validation, language, current, maximum) {
    const errors = (validation?.errors || [])
      .map((entry) => String(entry?.message || entry))
      .filter(Boolean)
      .slice(0, 8);
    if (language === 'en') {
      return `The proposed Content failed local validation (correction ${current} of ${maximum}):\n- ${errors.join('\n- ')}\nCorrect only the reported formatting problems. Preserve every other character verbatim, use only verified functions, and return the complete corrected Content in one \`\`\`wynntils block.`;
    }
    return `你给出的 Content 未通过本地校验（第 ${current}/${maximum} 次修正）：\n- ${errors.join('\n- ')}\n请只修复上述格式问题，逐字保留其他内容，只能使用已验证函数，并在一个 \`\`\`wynntils 代码块中返回完整修正版。`;
  }

  async function runAgent(options) {
    const settings = options || {};
    const language = settings.language === 'en' ? 'en' : 'zh';
    const messages = (Array.isArray(settings.messages) ? settings.messages : []).map((message) => ({
      ...message,
    }));
    if (!messages.length) throw new Error('At least one chat message is required.');
    if (typeof settings.searchFunctions !== 'function') {
      throw new Error('A local Wynntils function search is required.');
    }
    const requestTurn =
      settings.requestTurn ||
      ((turnOptions) =>
        requestChatTurn(
          {
            endpoint: settings.endpoint,
            apiKey: settings.apiKey,
            model: settings.model,
            signal: settings.signal,
            timeoutMs: settings.requestTimeoutMs,
            ...turnOptions,
          },
          settings.fetchImplementation,
        ));
    const searched = new Set();
    let requestCount = 0;
    let searchCount = 0;
    let correctionCount = 0;
    let useTools = true;
    let usedTextFallback = false;
    let lastTurn = null;

    while (requestCount < MAX_AGENT_REQUESTS) {
      throwIfAborted(settings.signal);
      settings.onStatus?.({ type: 'request', requestCount: requestCount + 1 });
      requestCount += 1;
      let turn;
      try {
        turn = await requestTurn({ messages, useTools, signal: settings.signal });
      } catch (error) {
        if (useTools && compatibilityError(error) && requestCount < MAX_AGENT_REQUESTS) {
          useTools = false;
          usedTextFallback = true;
          settings.onStatus?.({ type: 'text-fallback' });
          continue;
        }
        throw error;
      }
      throwIfAborted(settings.signal);
      lastTurn = turn;
      const standardCalls = Array.isArray(turn?.toolCalls) ? turn.toolCalls : [];
      const textSearches = standardCalls.length ? [] : extractTextSearches(turn?.text);
      if (textSearches.length) usedTextFallback = true;
      const calls = standardCalls.length
        ? standardCalls
        : textSearches.map((query, index) => ({
            id: `text_search_${requestCount}_${index + 1}`,
            name: SEARCH_TOOL_NAME,
            query,
          }));

      if (calls.length) {
        messages.push(turn.message || { role: 'assistant', content: turn.text || '' });
        const textResults = [];
        for (const call of calls) {
          throwIfAborted(settings.signal);
          let result;
          const query = String(call.query || '')
            .trim()
            .slice(0, 240);
          const key = normalizedQuery(query);
          if (call.name !== SEARCH_TOOL_NAME) {
            result = JSON.stringify({ error: `Unknown local tool: ${call.name || '(empty)'}` });
          } else if (!key) {
            result = JSON.stringify({ error: 'A non-empty search query is required.' });
          } else if (searched.has(key)) {
            result = JSON.stringify({
              query,
              error:
                'This query was already searched. Use the previous results or try different keywords.',
            });
          } else if (searchCount >= MAX_FUNCTION_SEARCHES) {
            result = JSON.stringify({
              query,
              error: `The local search limit of ${MAX_FUNCTION_SEARCHES} has been reached.`,
            });
          } else {
            searched.add(key);
            searchCount += 1;
            settings.onStatus?.({ type: 'search', query, searchCount });
            const entries = await settings.searchFunctions(query, MAX_SEARCH_RESULTS);
            throwIfAborted(settings.signal);
            result = formatSearchResults(query, entries);
          }
          if (standardCalls.length) {
            messages.push({
              role: 'tool',
              tool_call_id: String(call.id || ''),
              name: String(call.name || SEARCH_TOOL_NAME),
              content: result,
            });
          } else {
            textResults.push(result);
          }
        }
        if (textResults.length) {
          messages.push({
            role: 'user',
            content: [
              'LOCAL_WYNNTILS_SEARCH_RESULTS',
              ...textResults,
              'Continue using only functions verified above. Search again with different short keywords if needed.',
            ].join('\n\n'),
          });
        }
        continue;
      }

      const text = String(turn?.text || '').trim();
      if (!text) throw new Error('The endpoint returned no assistant message.');
      const proposal = extractProposal(text);
      let validation = null;
      if (proposal && typeof settings.validateProposal === 'function') {
        validation = settings.validateProposal(proposal);
        if (
          !validation?.valid &&
          correctionCount < MAX_PROPOSAL_CORRECTIONS &&
          requestCount < MAX_AGENT_REQUESTS
        ) {
          correctionCount += 1;
          messages.push(turn.message || { role: 'assistant', content: text });
          messages.push({
            role: 'user',
            content: correctionMessage(
              validation,
              language,
              correctionCount,
              MAX_PROPOSAL_CORRECTIONS,
            ),
          });
          settings.onStatus?.({
            type: 'correction',
            correctionCount,
            maximum: MAX_PROPOSAL_CORRECTIONS,
          });
          continue;
        }
      }
      return {
        text,
        proposal: validation && !validation.valid ? '' : proposal,
        validation,
        requestCount,
        searchCount,
        correctionCount,
        usedTextFallback,
      };
    }

    const error = new Error(
      lastTurn
        ? 'The assistant reached the request limit before producing a final answer.'
        : 'The assistant could not start a request.',
    );
    error.code = 'agent_limit';
    throw error;
  }

  async function requestChatTurn(options, fetchImplementation) {
    const settings = options || {};
    const endpoint = normalizeEndpoint(settings.endpoint);
    const model = String(settings.model || '').trim();
    if (!model) throw new Error('A model name is required.');
    const messages = Array.isArray(settings.messages) ? settings.messages : [];
    if (!messages.length) throw new Error('At least one chat message is required.');
    const fetchRef = fetchImplementation || fetch;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const apiKey = String(settings.apiKey || '').trim();
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const body = { model, messages, temperature: 0.35 };
    if (settings.useTools !== false) body.tools = [SEARCH_TOOL];
    const timeoutMs = Math.min(600000, Math.max(1, Number(settings.timeoutMs) || 120000));
    const controller = new AbortController();
    const externalSignal = settings.signal;
    let timedOut = false;
    const relayAbort = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) relayAbort();
    else externalSignal?.addEventListener('abort', relayAbort, { once: true });
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetchRef(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      });
      let payload;
      try {
        payload = await response.json();
      } catch (_error) {
        throw new Error(
          response.ok ? 'The endpoint returned invalid JSON.' : 'The request failed.',
        );
      }
      if (!response.ok) {
        const providerMessage = String(
          payload?.error?.message ||
            (typeof payload?.error === 'string' ? payload.error : '') ||
            payload?.message ||
            '',
        ).slice(0, 400);
        const error = new Error(
          providerMessage || `The endpoint returned HTTP ${response.status || 'error'}.`,
        );
        error.status = response.status;
        throw error;
      }
      return extractAssistantTurn(payload);
    } catch (error) {
      if (timedOut && error?.name === 'AbortError') {
        const timeoutError = new Error(`The completion request exceeded ${timeoutMs} ms.`);
        timeoutError.code = 'request_timeout';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', relayAbort);
    }
  }

  async function requestChat(options, fetchImplementation) {
    const turn = await requestChatTurn(options, fetchImplementation);
    if (turn.text) return turn.text;
    throw new Error('The endpoint returned no assistant message.');
  }

  async function requestModels(options, fetchImplementation) {
    const settings = options || {};
    const endpoint = normalizeModelsEndpoint(settings.endpoint);
    const fetchRef = fetchImplementation || fetch;
    const headers = { Accept: 'application/json' };
    const apiKey = String(settings.apiKey || '').trim();
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetchRef(endpoint, {
      method: 'GET',
      headers,
      signal: settings.signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    let payload;
    try {
      payload = await response.json();
    } catch (_error) {
      throw new Error(response.ok ? 'The endpoint returned invalid JSON.' : 'The request failed.');
    }
    if (!response.ok) {
      const providerMessage = String(payload?.error?.message || payload?.message || '').slice(
        0,
        400,
      );
      throw new Error(
        providerMessage || `The endpoint returned HTTP ${response.status || 'error'}.`,
      );
    }
    return extractModelIds(payload);
  }

  return Object.freeze({
    normalizeEndpoint,
    normalizeModelsEndpoint,
    extractModelIds,
    extractAssistantTurn,
    extractAssistantText,
    extractProposal,
    extractTextSearches,
    createTextTurn,
    createToolTurn,
    buildTitleGlyphReference,
    buildMessages,
    validateProposalFormat,
    formatSearchResults,
    runAgent,
    requestChatTurn,
    requestChat,
    requestModels,
  });
});
