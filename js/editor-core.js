(function (root, factory) {
  const api = factory(
    root.WYNNTILS_FUNCTIONS || [],
    root.WYNNTILS_FUNCTIONS_ZH || {},
    root.WynntilsTemplateParser,
    root.WynntilsTemplateSimulator,
    root.WynntilsFunctionCatalog,
    root.WynntilsEditorFormatting,
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WynntilsEditorCore = api;
})(
  typeof globalThis !== 'undefined' ? globalThis : window,
  function (functionData, chineseData, Parser, Simulator, FunctionCatalog, Formatting) {
    'use strict';

    if (!Parser) throw new Error('WynntilsTemplateParser must load before editor-core.js');
    if (!Simulator) throw new Error('WynntilsTemplateSimulator must load before editor-core.js');

    const I18N = Object.freeze({
      zh: {
        languageLabel: '切换为英文',
        pageTitle: 'Wynntils Overlay Studio',
        advancedSettings: '高级设置',
        formTitle: '编辑信息框（Info Box）',
        templateLabel: '选择示例',
        templateHelp: '先载入一个接近需求的示例，再按自己的想法修改。',
        contentLabel: '信息框内容',
        requiredMark: '必填',
        contentHelp: '普通文字和 {fps} 这类函数可以混合使用；换行请直接回车。',
        contentPlaceholder: '例如：&a{fps} FPS',
        contentColorLabel: '文字颜色',
        applyContentColorLabel: '应用颜色',
        contentColorApplied: '已应用颜色 {color}',
        copyContent: '复制内容',
        contentCopied: '信息框内容已复制',
        contentCopyFailed: '无法访问剪贴板，已选中内容，请手动复制。',
        glyphOpen: '插入字符',
        glyphTitle: 'Wynntils 特殊字符',
        glyphHelp:
          '点击字符会替换当前选区；连续点击会从上次插入位置继续。标题结构字符本身不可见，高亮层会显示其可读标记。',
        glyphClose: '收起字符工具',
        glyphLetters: '标题字母 A–Z',
        glyphSymbols: '数字与符号',
        glyphControls: '标题结构',
        glyphControlStart: '标题开始',
        glyphControlCell: '字符槽',
        glyphControlEnd: '标题结束',
        glyphInserted: '已插入 {label}',
        aiOpen: 'AI 帮我设计',
        aiDialogTitle: 'AI 信息框设计助手',
        aiDialogSubtitle: '使用你自己的兼容端点，把想法整理成可填写的 Info Box 内容。',
        aiClose: '关闭 AI 助手',
        aiSettings: '连接设置',
        aiEndpointLabel: 'OpenAI 兼容接口地址（Endpoint）',
        aiEndpointPlaceholder: '例如：https://api.openai.com/v1',
        aiEndpointHelp:
          '可直接填写 /v1；发送消息时会自动补全 /chat/completions。远程端点须使用 HTTPS，localhost 可使用 HTTP。',
        aiModelLabel: '模型',
        aiModelPlaceholder: '例如：gpt-4.1-mini',
        aiFetchModels: '读取模型列表',
        aiFetchingModels: '获取中…',
        aiModelSelectLabel: '已获取的模型',
        aiModelSelectPlaceholder: '选择已获取的模型',
        aiModelsLoaded: '已获取 {count} 个模型，请从下拉框选择。',
        aiModelsEmpty: '端点没有返回可用模型，请继续手动填写模型名。',
        aiModelsEndpointInvalid:
          '无法从该地址推导模型列表，请填写标准 /v1 或 /chat/completions 端点。',
        aiModelsFailed: '获取模型失败',
        aiModelsTimeout: '获取模型超过 20 秒，已取消。',
        aiApiKeyLabel: 'API Key（按端点要求填写）',
        aiApiKeyPlaceholder: '本地或已代理端点通常可留空',
        aiShowKey: '显示',
        aiHideKey: '隐藏',
        aiSecurity:
          'Key 不会保存到浏览器存储。获取模型时只请求模型列表；发送消息时，对话、当前 Overlay 配置与少量本地函数检索结果会传给你填写的端点。请只使用可信且允许浏览器 CORS 请求的服务。',
        aiWelcome: '描述你希望显示的信息，我会结合当前配置和本地 Wynntils 函数帮你设计。',
        aiPromptLabel: '设计需求',
        aiPromptPlaceholder: '例如：显示当前世界、FPS 和生命值，整体使用青绿色。',
        aiSend: '发送',
        aiSending: '正在生成…',
        aiCancel: '取消',
        aiClear: '清空对话',
        aiProposalReady: '检测到可以应用的 Content',
        aiApplyProposal: '应用到信息框',
        aiUserRole: '你',
        aiAssistantRole: 'AI 助手',
        aiErrorRole: '请求提示',
        aiEndpointInvalid: '请填写有效端点和模型；远程端点必须使用 HTTPS，localhost 可使用 HTTP。',
        aiNetworkError: '无法连接端点。请检查地址、网络以及服务端是否允许浏览器 CORS。',
        aiTimeout: '单次模型请求超过 120 秒，已取消；之前完成的本地检索不会计入该时限。',
        aiCanceled: '请求已取消。',
        aiProviderError: '端点返回错误',
        aiContinuingRequest: 'AI 正在继续生成（第 {current}/6 轮）…',
        aiSearchingFunctions: '正在检索 Wynntils 函数：{query}',
        aiCorrectingProposal: '建议未通过本地校验，正在请求 AI 修正（第 {current}/{maximum} 次）…',
        aiUsingTextFallback: '端点不支持标准工具调用，已切换为兼容检索模式…',
        aiInvalidProposal: 'AI 连续修正两次后仍未通过本地校验，已禁止直接应用。',
        aiAgentLimit: 'AI 在限定轮次内没有完成方案，请换个更短、更明确的说法重试。',
        aiApplied: 'AI 建议已应用到信息框内容',
        colorTemplateLabel: '整体文字颜色（Color Template）',
        colorTemplateHelp: '可留空使用游戏默认颜色，也可填写 #RRGGBB、#RRGGBBAA 或颜色函数。',
        colorTemplatePlaceholder: '例如：#FFFFFF 或 {from_rgb(255;255;255)}',
        textShadowLabel: '文本阴影',
        textShadowHelp: 'Outline 最清晰，Normal 更轻，None 不加阴影。',
        fontScaleLabel: '字体大小',
        fontScaleHelp: '1.0 是游戏默认大小，建议先在 0.8–1.5 之间尝试。',
        fitTextLabel: '自动缩放（Fit Text）',
        fitTextToggle: '开启自动缩放',
        fitTextHelp: '开启后文字会自动缩放以适应信息框；内容超出时完整显示，不会被红框裁剪。',
        backgroundColorLabel: '背景颜色（Background Color）',
        backgroundColorHelp: '使用 #RRGGBB 或 #RRGGBBAA；最后两位是透明度。',
        backgroundColorPlaceholder: '例如：#00000080',
        borderWidthLabel: '背景边距（Background Border Width）',
        borderWidthHelp: '背景四周的留白宽度；0 表示不留边。',
        enabledTemplateLabel: '显示条件（Enabled Template）',
        optionalMark: '可选',
        enabledTemplateHelp: '留空则总是显示；填写时必须是返回 Boolean 的单个表达式。',
        enabledTemplatePlaceholder: '例如：{greater_than(health;0)}',
        searchTitle: '查找函数',
        searchFunctions: '用中文描述或函数名搜索',
        searchHelp: '试试“帧率”“当前世界”“生命值”或 fps；点击结果即可插入内容。',
        functionResultsLabel: '函数结果',
        showMore: '显示更多（还有 {count} 个）',
        resultType: '返回',
        noResults: '没有找到相近函数，换个更短的说法试试。',
        previewEyebrow: '实时预览',
        previewTitle: '游戏内效果参考',
        previewCollapse: '收起游戏内效果参考',
        previewExpand: '展开游戏内效果参考',
        previewNote: '预览使用内置模拟数据和浏览器渲染，不代表游戏中的实时数值。',
        previewEmpty: '内容为空，预览已清空。',
        previewPaused: '预览已暂停：内容存在语法或配置问题。',
        previewFailed: '预览渲染失败，编辑和草稿保存仍可继续。',
        previewUnsupported: '预览包含占位值：{functions}',
        previewColorFallback:
          '动态 Color Template 无法在游戏外求值，预览暂用白色；静态十六进制、from_hex 和 from_rgb 可直接模拟。',
        validationReady: '内容格式有效，可以复制。',
        validationIssues: '还有 {count} 处需要调整。',
        templateLoaded: '已载入“{name}”示例',
        inserted: '已插入 {name}',
        required: '请填写信息框内容。',
        functionUnknown: '找不到模板函数“{name}”，请从右侧函数列表选择。',
        deprecatedFunction: '函数“{name}”已被 Wynntils 移除，请改用替代函数，否则游戏内会报错。',
        functionArgs: '函数“{name}”需要 {range} 个参数，目前是 {count} 个。',
        functionSyntax: '无法识别表达式“{expr}”，请检查括号、分号和引号。',
        functionArgType: '函数“{name}”的参数“{arg}”需要 {expected}，目前得到 {actual}。',
        braces: '花括号没有成对闭合。',
        booleanTemplate: 'Enabled Template 必须是返回 Boolean 的单个表达式。',
        color: '颜色格式应为 #RRGGBB 或 #RRGGBBAA。',
        colorTemplate: 'Color Template 应填写十六进制颜色或返回 CustomColor 的函数。',
        positiveNumber: '请输入大于 0 的数字。',
        nonNegativeNumber: '请输入不小于 0 的数字。',
        templateGeneral: '综合信息（完整示例）',
        templateGeneralDesc: '世界、货币、延迟、FPS、伤害与 Lootrun 未出货计数。',
        templateFps: '简洁 FPS',
        templateFpsDesc: '适合第一次尝试的单行帧率显示。',
        templateLocation: '坐标与世界',
        templateLocationDesc: '显示当前世界和玩家 XYZ 坐标。',
        templateBlank: '空白信息框',
        templateBlankDesc: '从最少字段开始自己填写。',
        shadowOutline: 'Outline（描边）',
        shadowNormal: 'Normal（普通阴影）',
        shadowNone: 'None（无阴影）',
        catNumeric: '数值计算',
        catBoolean: '条件判断',
        catString: '文本',
        catCapped: '状态值',
        catTime: '时间',
        catLocation: '位置',
        catColor: '颜色',
        catStyled: '样式文本',
        catNamed: '命名值',
        catOther: '其他',
        catDry: '未出货计数',
        catCurrent: '当前状态',
        catCappedSem: '封顶值函数',
        catFormat: '格式化',
        catLootrun: 'Lootrun',
        categoryEyebrow: '分类浏览',
        categoryTitle: '函数分类',
        categoryHelp: '按返回类型与语义前缀分组，点击即可插入；搜索仍可作为辅助。',
        formatContent: '格式化内容',
        lintContent: '检查语法',
        formatSuccess: '已美化内容（逻辑等价）。',
        formatNoChanges: '内容格式已经整齐，无需修改。',
        formatInvalid: '内容存在语法问题，未进行格式化。',
        undoConfig: '撤销替换',
        undoUnavailable: '没有可撤销的替换。',
        draftRestored: '已恢复上次编辑的草稿。',
        draftSaveFailed: '草稿无法持久保存，本次编辑仍会保留在当前页面。',
        draftUnavailable: '当前浏览器不允许保存草稿，本次编辑仅保留在页面中。',
        draftConflict: '另一标签页有较新的草稿。请选择载入该版本或保留当前内容。',
        draftIncompatible: '发现由其他版本创建的草稿；确认替换前不会覆盖它。',
        draftInvalid: '现有草稿无法读取；确认替换前不会覆盖原始数据。',
        draftLoadIncoming: '载入另一标签页版本',
        draftKeepCurrent: '保留当前内容',
        draftReplaceStored: '用当前内容替换旧草稿',
        draftLoadedIncoming: '已载入另一标签页的草稿，可使用“撤销替换”恢复。',
        draftKeptCurrent: '已保留并保存当前内容。',
        lintClear: '未发现语法问题。',
        lintIssues: '发现 {count} 处问题。',
        illegalColorCode: '非法的颜色码“{code}”，应为 &# 加 8 位十六进制（RRGGBBAA）。',
        illegalFormatCode: '非法的格式码“{code}”，应为 &0-9a-f、&k/o/l/m/n/r 或 &#RRGGBBAA。',
        parenError: '括号没有成对闭合。',
        unclosedString: '字符串引号没有闭合。',
      },
      en: {
        languageLabel: 'Switch to Chinese',
        pageTitle: 'Wynntils Overlay Studio',
        advancedSettings: 'Advanced settings',
        formTitle: 'Edit the Info Box',
        templateLabel: 'Choose an example',
        templateHelp: 'Load a close example first, then make it yours.',
        contentLabel: 'Overlay content',
        requiredMark: 'Required',
        contentHelp: 'Mix plain text with functions such as {fps}; press Enter for a new line.',
        contentPlaceholder: 'Example: &a{fps} FPS',
        contentColorLabel: 'Text color',
        applyContentColorLabel: 'Apply color',
        contentColorApplied: 'Applied {color}',
        copyContent: 'Copy Content',
        contentCopied: 'Content copied',
        contentCopyFailed: 'Clipboard access failed. Content is selected; copy it manually.',
        glyphOpen: 'Insert glyph',
        glyphTitle: 'Wynntils special glyphs',
        glyphHelp:
          'Click a glyph to replace the current selection. Repeated clicks continue from the last insertion point. Title controls are invisible; the highlighter shows readable markers for them.',
        glyphClose: 'Collapse glyph tools',
        glyphLetters: 'Title letters A–Z',
        glyphSymbols: 'Numbers and symbols',
        glyphControls: 'Title structure',
        glyphControlStart: 'Title start',
        glyphControlCell: 'Character cell',
        glyphControlEnd: 'Title end',
        glyphInserted: 'Inserted {label}',
        aiOpen: 'Design with AI',
        aiDialogTitle: 'AI Info Box designer',
        aiDialogSubtitle: 'Use your own compatible endpoint to turn an idea into Info Box content.',
        aiClose: 'Close AI assistant',
        aiSettings: 'Connection settings',
        aiEndpointLabel: 'OpenAI-compatible endpoint',
        aiEndpointPlaceholder: 'Example: https://api.openai.com/v1',
        aiEndpointHelp:
          'You can enter /v1 directly; /chat/completions is added when sending. Remote endpoints require HTTPS; localhost may use HTTP.',
        aiModelLabel: 'Model',
        aiModelPlaceholder: 'Example: gpt-4.1-mini',
        aiFetchModels: 'Read model list',
        aiFetchingModels: 'Fetching…',
        aiModelSelectLabel: 'Fetched models',
        aiModelSelectPlaceholder: 'Select a fetched model',
        aiModelsLoaded: 'Fetched {count} models. Choose one from the list.',
        aiModelsEmpty: 'The endpoint returned no usable models. Enter the model name manually.',
        aiModelsEndpointInvalid:
          'Cannot derive a model list from this address. Use a standard /v1 or /chat/completions endpoint.',
        aiModelsFailed: 'Could not fetch models',
        aiModelsTimeout: 'Fetching models exceeded 20 seconds and was canceled.',
        aiApiKeyLabel: 'API Key (as required by endpoint)',
        aiApiKeyPlaceholder: 'Usually blank for local or pre-authorized endpoints',
        aiShowKey: 'Show',
        aiHideKey: 'Hide',
        aiSecurity:
          'The key is never saved to browser storage. Fetching models requests only the model list; sending a message shares the conversation, current Overlay configuration, and small local function-search results with your endpoint. Use only a trusted service that allows browser CORS requests.',
        aiWelcome:
          'Describe what you want to display. I will use the current configuration and local Wynntils function references to help design it.',
        aiPromptLabel: 'Design request',
        aiPromptPlaceholder: 'Example: Show the current world, FPS, and health in cyan and green.',
        aiSend: 'Send',
        aiSending: 'Generating…',
        aiCancel: 'Cancel',
        aiClear: 'Clear chat',
        aiProposalReady: 'Applicable Content detected',
        aiApplyProposal: 'Apply to Info Box',
        aiUserRole: 'You',
        aiAssistantRole: 'AI assistant',
        aiErrorRole: 'Request notice',
        aiEndpointInvalid:
          'Enter a valid endpoint and model. Remote endpoints require HTTPS; localhost may use HTTP.',
        aiNetworkError:
          'Could not reach the endpoint. Check its address, your network, and whether the service allows browser CORS.',
        aiTimeout:
          'One model request exceeded 120 seconds and was canceled; completed local searches do not count toward that limit.',
        aiCanceled: 'The request was canceled.',
        aiProviderError: 'Endpoint error',
        aiContinuingRequest: 'AI is continuing (request {current} of 6)…',
        aiSearchingFunctions: 'Searching Wynntils functions: {query}',
        aiCorrectingProposal:
          'The proposal failed local validation. Asking AI for correction {current} of {maximum}…',
        aiUsingTextFallback:
          'This endpoint does not support standard tool calls. Using compatible search mode…',
        aiInvalidProposal:
          'The Content still failed local validation after two corrections, so direct apply is disabled.',
        aiAgentLimit:
          'AI did not finish within the bounded turns. Retry with a shorter, more specific request.',
        aiApplied: 'Applied the AI proposal to the Info Box content',
        colorTemplateLabel: 'Color Template',
        colorTemplateHelp:
          'Leave blank for the game default, or use #RRGGBB, #RRGGBBAA, or a color function.',
        colorTemplatePlaceholder: 'Example: #FFFFFF or {from_rgb(255;255;255)}',
        textShadowLabel: 'Text shadow',
        textShadowHelp: 'Outline is clearest, Normal is lighter, and None disables the shadow.',
        fontScaleLabel: 'Font size',
        fontScaleHelp: '1.0 is the game default; start between 0.8 and 1.5.',
        fitTextLabel: 'Fit Text',
        fitTextToggle: 'Enable Fit Text',
        fitTextHelp:
          'When enabled, the text auto-scales to fit the box; overflowing content is fully shown instead of being clipped.',
        backgroundColorLabel: 'Background Color',
        backgroundColorHelp: 'Use #RRGGBB or #RRGGBBAA; the last two digits control opacity.',
        backgroundColorPlaceholder: 'Example: #00000080',
        borderWidthLabel: 'Background Border Width',
        borderWidthHelp: 'Padding around the background; use 0 for none.',
        enabledTemplateLabel: 'Enabled Template',
        optionalMark: 'Optional',
        enabledTemplateHelp:
          'Leave blank to always show; otherwise use one expression returning Boolean.',
        enabledTemplatePlaceholder: 'Example: {greater_than(health;0)}',
        searchTitle: 'Find a function',
        searchFunctions: 'Search by description or function name',
        searchHelp: 'Try “frame rate”, “world”, “health”, or fps; click a result to insert it.',
        functionResultsLabel: 'Function results',
        showMore: 'Show more ({count} remaining)',
        resultType: 'Returns',
        noResults: 'No close functions found. Try a shorter phrase.',
        previewEyebrow: 'Live preview',
        previewTitle: 'Approximate in-game appearance',
        previewCollapse: 'Collapse in-game preview',
        previewExpand: 'Expand in-game preview',
        previewNote:
          'The preview uses built-in sample data and browser rendering; it does not show live game values.',
        previewEmpty: 'Content is empty, so the preview has been cleared.',
        previewPaused: 'Preview paused because the content or configuration has an issue.',
        previewFailed: 'Preview rendering failed; editing and draft saving can continue.',
        previewUnsupported: 'Preview contains placeholders for: {functions}',
        previewColorFallback:
          'Dynamic Color Templates cannot be evaluated outside the game, so the preview uses white. Static hex, from_hex, and from_rgb colors are simulated.',
        validationReady: 'Content is valid and ready to copy.',
        validationIssues: '{count} item(s) still need attention.',
        templateLoaded: 'Loaded the “{name}” example',
        inserted: 'Inserted {name}',
        required: 'Enter overlay content.',
        functionUnknown: 'Unknown template function “{name}”. Choose one from the function list.',
        deprecatedFunction:
          'Function “{name}” has been removed by Wynntils. Use a replacement, otherwise it will error in-game.',
        functionArgs: 'Function “{name}” expects {range} argument(s); it currently has {count}.',
        functionSyntax: 'Cannot parse “{expr}”. Check parentheses, semicolons, and quotes.',
        functionArgType: 'Function “{name}” parameter “{arg}” expects {expected}; got {actual}.',
        braces: 'Curly braces are not balanced.',
        booleanTemplate: 'Enabled Template must be one expression returning Boolean.',
        color: 'Use #RRGGBB or #RRGGBBAA.',
        colorTemplate: 'Color Template must be a hex color or a function returning CustomColor.',
        positiveNumber: 'Enter a number greater than 0.',
        nonNegativeNumber: 'Enter a number of 0 or greater.',
        templateGeneral: 'General information (full example)',
        templateGeneralDesc: 'World, money, ping, FPS, damage, and lootrun dry statistics.',
        templateFps: 'Simple FPS',
        templateFpsDesc: 'A one-line frame-rate display for a first attempt.',
        templateLocation: 'Location and world',
        templateLocationDesc: 'Shows the current world and player XYZ coordinates.',
        templateBlank: 'Blank Info Box',
        templateBlankDesc: 'Start with only the essential fields.',
        shadowOutline: 'Outline',
        shadowNormal: 'Normal',
        shadowNone: 'None',
        catNumeric: 'Numeric',
        catBoolean: 'Boolean',
        catString: 'Text',
        catCapped: 'Capped value',
        catTime: 'Time',
        catLocation: 'Location',
        catColor: 'Color',
        catStyled: 'Styled text',
        catNamed: 'Named value',
        catOther: 'Other',
        catDry: 'Dry streak',
        catCurrent: 'Current',
        catCappedSem: 'Capped prefix',
        catFormat: 'Formatting',
        catLootrun: 'Lootrun',
        categoryEyebrow: 'Categories',
        categoryTitle: 'Function catalog',
        categoryHelp:
          'Grouped by return type and name prefix; click to insert. Search stays as a helper.',
        formatContent: 'Beautify',
        lintContent: 'Check syntax',
        formatSuccess: 'Content beautified (logic-equivalent).',
        formatNoChanges: 'Content is already formatted; no changes were needed.',
        formatInvalid: 'Content has syntax issues and was not formatted.',
        undoConfig: 'Undo replacement',
        undoUnavailable: 'There is no replacement to undo.',
        draftRestored: 'The last edited draft was restored.',
        draftSaveFailed: 'The draft could not be persisted; this page still keeps your edits.',
        draftUnavailable: 'This browser cannot save drafts; edits remain only on this page.',
        draftConflict: 'Another tab has a newer draft. Load it or keep the current content.',
        draftIncompatible:
          'A draft from another version was found and will not be overwritten without confirmation.',
        draftInvalid:
          'The saved draft cannot be read and will not be overwritten without confirmation.',
        draftLoadIncoming: 'Load the other tab version',
        draftKeepCurrent: 'Keep current content',
        draftReplaceStored: 'Replace the saved draft',
        draftLoadedIncoming:
          'Loaded the other tab draft. Use Undo replacement to restore this one.',
        draftKeptCurrent: 'Kept and saved the current content.',
        lintClear: 'No syntax issues found.',
        lintIssues: 'Found {count} issue(s).',
        illegalColorCode: 'Invalid color code “{code}”; expected &# plus 8 hex digits (RRGGBBAA).',
        illegalFormatCode:
          'Invalid format code “{code}”; expected &0-9a-f, &k/o/l/m/n/r, or &#RRGGBBAA.',
        parenError: 'Parentheses are not balanced.',
        unclosedString: 'String quote is not closed.',
      },
    });

    function tr(lang, key, vars) {
      const dictionary = I18N[lang] || I18N.en;
      let text = dictionary[key] || I18N.en[key] || key;
      Object.entries(vars || {}).forEach(([name, value]) => {
        text = text.replaceAll(`{${name}}`, String(value));
      });
      return text;
    }

    const functionCatalog = FunctionCatalog?.create(functionData, chineseData, tr);
    const functions = functionCatalog
      ? functionCatalog.functions
      : functionData.map((entry) => {
          const translation = chineseData[entry.n] || {
            d: `获取或计算“${entry.n}”。`,
            kw: [entry.n],
          };
          return Object.freeze({ ...entry, d: translation.d, kw: [...translation.kw] });
        });

    const functionIndex = functionCatalog?.functionIndex || new Map();
    if (!functionCatalog) {
      functions.forEach((entry) => {
        functionIndex.set(entry.n.toLowerCase(), entry);
        entry.a.forEach((alias) => functionIndex.set(alias.toLowerCase(), entry));
      });
    }

    const GENERAL_INFO_CONTENT = String.raw`&#f3bc16ff⁤&0&#f3bc16ff&0&#f3bc16ff&0&#f3bc16ff&0&#f3bc16ff&0&#f3bc16ff&0&#f3bc16ff&0&#f3bc16ff&0⁤&#f3bc16ff &7» &#f9e094ff{world} &7({territory})\n&#54c20aff⁤&0&#54c20aff&0&#54c20aff&0&#54c20aff&0&#54c20aff&0&#54c20aff&0&#54c20aff&0&#54c20aff&0⁤&#54c20aff &7» &#87f53dff{money} &7({if_str(gte(money;4096);concat("&7";str(le);"&7\L ");"")}{if_str(gte(money;64);concat("&7";str(eb);"&7\B");"")}&7) \n&#8525f4ff⁤&f&#8525f4ff&f&#8525f4ff&f&#8525f4ff&f⁤&#8525f4ff &7» &#bb86f9ff{ping}\n&#0caadfff⁤&f&#0caadfff&f&#0caadfff&f⁤&#0caadfff &7» &#5acff6ff{fps}\n&#b30909ff⁤&f&#b30909ff&f&#b30909ff&f&#b30909ff&f&#b30909ff&f&#b30909ff&f⁤&#b30909ff &7» &#f65a5aff{divide(adavg(2);1000):2}\n&#0047abff⁤&f&#0047abff&f&#0047abff&f&#0047abff&f&#0047abff&f&#0047abff&f&#0047abff&f&#0047abff &#0047abff&f&#0047abff&f&#0047abff&f&#0047abff &#0047abff&f&#0047abff&f&#0047abff&f&#0047abff&f&#0047abff&f&#0047abff&f⁤&#0047abff\n &7» &#1476ffff&l{dry_b}&7  &8 &#1476ffff&l{dry_s}&7 {concat("\n &7» &#7ab2ffff&l"; string(dry_p); "&7  ")}\n\n{concat("&#bd33a4ff⁤&f&#bd33a4ff&f&#bd33a4ff&f&#bd33a4ff&f&#bd33a4ff &#bd33a4ff&f&#bd33a4ff&f&#bd33a4ff&f&#bd33a4ff &#bd33a4ff&f&#bd33a4ff&f&#bd33a4ff&f&#bd33a4ff&f&#bd33a4ff&f&#bd33a4ff&f⁤&#bd33a4ff")}\n{concat(" &7» &#dc7acaff&l"; string(dry_raid_reward_pulls); " &7  &8 "; "&#dc7acaff&l"; string(dry_raids_tomes); "&7 \n"; " &7» &#f1cbeaff&l"; string(dry_aspects); " &7  &8 "; "&#f1cbeaff&l"; string(dry_raids_aspects); "&7 ")}`;

    const DEPRECATED_FUNCTIONS = Object.freeze({
      horse_level: Object.freeze({ removed: true, replacement: null }),
      h_lvl: Object.freeze({ removed: true, replacement: null }),
      h_mlvl: Object.freeze({ removed: true, replacement: null }),
      horse_xp: Object.freeze({ removed: true, replacement: null }),
    });

    function defaultConfig() {
      return {
        content: '&a{fps} FPS',
        colorTemplate: '',
        textShadow: 'OUTLINE',
        fontScale: 1,
        fitText: false,
        backgroundColor: '#00000080',
        backgroundBorderWidth: 1,
        enabledTemplate: '',
      };
    }

    const TEMPLATES = Object.freeze([
      {
        id: 'general-info',
        nameKey: 'templateGeneral',
        descKey: 'templateGeneralDesc',
        config: { ...defaultConfig(), content: GENERAL_INFO_CONTENT, backgroundColor: '#00000000' },
      },
      {
        id: 'fps',
        nameKey: 'templateFps',
        descKey: 'templateFpsDesc',
        config: { ...defaultConfig(), content: '&a{fps} FPS' },
      },
      {
        id: 'location',
        nameKey: 'templateLocation',
        descKey: 'templateLocationDesc',
        config: {
          ...defaultConfig(),
          content: '&f{world}\n&cX {x(my_loc):0} &aY {y(my_loc):0} &9Z {z(my_loc):0}',
        },
      },
      {
        id: 'blank',
        nameKey: 'templateBlank',
        descKey: 'templateBlankDesc',
        config: { ...defaultConfig(), content: '{world}' },
      },
    ]);

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    let parsedTemplateCache = { source: null, parsed: null };

    function parseTemplateSyntax(template) {
      const source = String(template == null ? '' : template);
      if (parsedTemplateCache.source !== source) {
        parsedTemplateCache = { source, parsed: Parser.parseTemplate(source) };
      }
      return parsedTemplateCache.parsed;
    }

    function parserDiagnosticMessage(issue, raw, lang) {
      if (issue.code === 'unclosedString') return tr(lang, 'unclosedString');
      if (issue.code === 'unclosedParen') return tr(lang, 'parenError');
      if (issue.code === 'unclosedBrace' || issue.code === 'unmatchedBrace')
        return tr(lang, 'braces');
      return tr(lang, 'functionSyntax', { expr: raw });
    }

    const NUMERIC_TYPES = new Set(['Number', 'Integer', 'Long', 'Float', 'Double']);
    let formattingModule = null;

    function analyzeParsedExpression(node, raw, lang, parserIssues) {
      if ((parserIssues || []).length || !node || node.type === 'ErrorNode') {
        const issue = (parserIssues || [])[0] || { code: 'syntax', start: node?.start || 0 };
        return {
          valid: false,
          returnType: null,
          message: parserDiagnosticMessage(issue, raw, lang),
          issues: [
            {
              code: issue.code,
              message: parserDiagnosticMessage(issue, raw, lang),
              position: issue.start || 0,
              length: Math.max(1, (issue.end || 1) - (issue.start || 0)),
              expr: raw,
            },
          ],
        };
      }
      if (node.type === 'Literal') return { valid: true, returnType: node.kind, issues: [] };
      if (node.type !== 'Call') {
        return {
          valid: false,
          returnType: null,
          message: tr(lang, 'functionSyntax', { expr: raw }),
          issues: [
            {
              code: 'syntax',
              message: tr(lang, 'functionSyntax', { expr: raw }),
              position: node.start || 0,
              length: Math.max(1, (node.end || 1) - (node.start || 0)),
              expr: raw,
            },
          ],
        };
      }

      const lowerName = node.name.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(DEPRECATED_FUNCTIONS, lowerName)) {
        const message = tr(lang, 'deprecatedFunction', { name: node.name });
        return {
          valid: false,
          returnType: null,
          message,
          issues: [
            {
              code: 'deprecated',
              message,
              position: node.nameStart || node.start || 0,
              length: node.name.length,
              expr: raw,
            },
          ],
        };
      }
      const entry = functionIndex.get(lowerName);
      if (!entry) {
        const message = tr(lang, 'functionUnknown', { name: node.name });
        return {
          valid: false,
          returnType: null,
          message,
          issues: [
            {
              code: 'unknown',
              message,
              position: node.nameStart || node.start || 0,
              length: node.name.length,
              expr: raw,
            },
          ],
        };
      }
      const required = entry.p.filter((parameter) => parameter[2]).length;
      const hasList = entry.p.some((parameter) => parameter[1] === 'List');
      const maximum = hasList ? Infinity : entry.p.length;
      if (node.args.length < required || node.args.length > maximum) {
        const range =
          maximum === Infinity
            ? `${required}+`
            : required === maximum
              ? String(required)
              : `${required}-${maximum}`;
        const message = tr(lang, 'functionArgs', {
          name: entry.n,
          range,
          count: node.args.length,
        });
        return {
          valid: false,
          returnType: null,
          message,
          issues: [
            {
              code: 'args',
              message,
              position: node.start || 0,
              length: Math.max(1, (node.end || 1) - (node.start || 0)),
              expr: raw,
            },
          ],
        };
      }
      for (let index = 0; index < node.args.length; index += 1) {
        const argument = node.args[index];
        const nested = analyzeParsedExpression(argument, argument.raw, lang, []);
        if (!nested.valid) return nested;
        const parameter = entry.p[Math.min(index, entry.p.length - 1)];
        const expected = parameter && parameter[1];
        const compatible =
          !expected ||
          ['Object', 'Any', 'List'].includes(expected) ||
          expected === nested.returnType ||
          (NUMERIC_TYPES.has(expected) && NUMERIC_TYPES.has(nested.returnType));
        if (!compatible) {
          const message = tr(lang, 'functionArgType', {
            name: entry.n,
            arg: parameter[0],
            expected,
            actual: nested.returnType,
          });
          return {
            valid: false,
            returnType: null,
            message,
            issues: [
              {
                code: 'argType',
                message,
                position: argument.start || 0,
                length: Math.max(1, (argument.end || 1) - (argument.start || 0)),
                expr: raw,
              },
            ],
          };
        }
      }
      return { valid: true, returnType: entry.r, function: entry.n, entry, issues: [] };
    }

    function analyzeExpression(rawExpression, lang) {
      const raw = String(rawExpression == null ? '' : rawExpression).trim();
      const parsed = Parser.parseExpression(raw, 0);
      return analyzeParsedExpression(parsed.node, raw, lang, parsed.diagnostics);
    }

    function analyzeTemplate(template, lang, parsedTemplate) {
      const text = String(template == null ? '' : template);
      const parsed = parsedTemplate?.source === text ? parsedTemplate : parseTemplateSyntax(text);
      if (parsed.diagnostics.length) {
        const issue = parsed.diagnostics[0];
        return { valid: false, message: parserDiagnosticMessage(issue, text, lang), parsed };
      }
      const analyses = parsed.expressions.map((expression) =>
        analyzeParsedExpression(expression.expression, expression.body, lang, []),
      );
      const failed = analyses.find((analysis) => !analysis.valid);
      if (failed) return { ...failed, parsed };
      return {
        valid: true,
        expressions: analyses,
        returnType:
          analyses.length === 1 &&
          parsed.nodes.length === 1 &&
          parsed.nodes[0].type === 'Expression'
            ? analyses[0].returnType
            : 'String',
        parsed,
      };
    }

    function validateConfig(config, lang) {
      const source = config || {};
      const errors = [];
      const add = (field, key, message) =>
        errors.push({ field, key, message: message || tr(lang, key) });
      if (!String(source.content || '').trim()) add('content', 'required');
      else {
        const result = analyzeTemplate(source.content, lang);
        if (!result.valid) add('content', 'template', result.message);
        else {
          const formatIssues = [];
          (formattingModule?.scanFormatCodes || scanFormatCodes)(
            String(source.content),
            lang,
            formatIssues,
            result.parsed,
          );
          if (formatIssues.length) add('content', formatIssues[0].code, formatIssues[0].message);
        }
      }
      if (source.enabledTemplate) {
        const result = analyzeTemplate(source.enabledTemplate, lang);
        if (!result.valid) add('enabledTemplate', 'template', result.message);
        else if (result.returnType !== 'Boolean') add('enabledTemplate', 'booleanTemplate');
        else {
          const formatIssues = [];
          (formattingModule?.scanFormatCodes || scanFormatCodes)(
            String(source.enabledTemplate),
            lang,
            formatIssues,
            result.parsed,
          );
          if (formatIssues.length)
            add('enabledTemplate', formatIssues[0].code, formatIssues[0].message);
        }
      }
      const hexColor = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
      if (source.backgroundColor && !hexColor.test(source.backgroundColor))
        add('backgroundColor', 'color');
      if (source.colorTemplate) {
        const colorValue = String(source.colorTemplate).trim();
        const shortCode = /^&[0-9a-f]$/i.test(colorValue);
        const result = analyzeTemplate(colorValue, lang);
        if (
          !hexColor.test(colorValue) &&
          !shortCode &&
          (!result.valid || result.returnType !== 'CustomColor')
        ) {
          add('colorTemplate', 'colorTemplate');
        }
      }
      if (!Number.isFinite(Number(source.fontScale)) || Number(source.fontScale) <= 0)
        add('fontScale', 'positiveNumber');
      if (
        !Number.isFinite(Number(source.backgroundBorderWidth)) ||
        Number(source.backgroundBorderWidth) < 0
      ) {
        add('backgroundBorderWidth', 'nonNegativeNumber');
      }
      if (!['OUTLINE', 'NORMAL', 'NONE'].includes(source.textShadow))
        add('textShadow', 'template', tr(lang, 'functionSyntax', { expr: source.textShadow }));
      return { valid: errors.length === 0, errors };
    }

    function grams(value) {
      const normalized = String(value || '')
        .toLowerCase()
        .replace(/[\s\p{P}\p{S}_]+/gu, '');
      if (normalized.length < 2) return normalized ? [normalized] : [];
      const result = [];
      for (let index = 0; index < normalized.length - 1; index += 1)
        result.push(normalized.slice(index, index + 2));
      return result;
    }

    function cosine(left, right) {
      const leftCounts = new Map();
      const rightCounts = new Map();
      left.forEach((gram) => leftCounts.set(gram, (leftCounts.get(gram) || 0) + 1));
      right.forEach((gram) => rightCounts.set(gram, (rightCounts.get(gram) || 0) + 1));
      let dot = 0;
      let leftLength = 0;
      let rightLength = 0;
      leftCounts.forEach((count, gram) => {
        leftLength += count * count;
        dot += count * (rightCounts.get(gram) || 0);
      });
      rightCounts.forEach((count) => {
        rightLength += count * count;
      });
      return leftLength && rightLength ? dot / Math.sqrt(leftLength * rightLength) : 0;
    }

    const POPULAR = [
      'fps',
      'current_world',
      'current_territory',
      'ping',
      'health',
      'mana',
      'my_location',
      'clock',
    ];
    function semanticSearch(query, limit) {
      if (functionCatalog) return functionCatalog.semanticSearch(query, limit);
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
      if (functionCatalog) return functionCatalog.functionSignature(entry);
      const parameters = entry.p
        .map(([name, type, required]) => `${name}: ${type}${required ? '' : '?'}`)
        .join('; ');
      return `${entry.n}(${parameters}) -> ${entry.r}`;
    }

    function functionInsertion(entry) {
      if (functionCatalog) return functionCatalog.functionInsertion(entry);
      return Simulator.functionInsertion(entry);
    }

    function sampleText(content, parsedTemplate) {
      const text = String(content == null ? '' : content);
      return Simulator.sampleText(
        text,
        parsedTemplate?.source === text ? parsedTemplate : parseTemplateSyntax(text),
      );
    }

    function evaluateTemplate(content, parsedTemplate) {
      const text = String(content == null ? '' : content);
      return Simulator.evaluateTemplate(
        text,
        parsedTemplate?.source === text ? parsedTemplate : parseTemplateSyntax(text),
      );
    }

    function resolvePreviewState(options) {
      const details = options || {};
      if (!String(details.content == null ? '' : details.content).trim()) {
        return Object.freeze({ mode: 'empty', sample: '' });
      }
      if (!details.valid) {
        return Object.freeze({ mode: 'paused', sample: String(details.lastValidSample || '') });
      }
      return Object.freeze({ mode: 'ready', sample: String(details.sample || '') });
    }

    // ---- A. Function category browsing ---------------------------------------
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

    function buildFunctionCategories(lang) {
      if (functionCatalog) return functionCatalog.buildFunctionCategories(lang);
      const groups = [];
      TYPE_CATEGORIES.forEach((category) => {
        const list = functions.filter((entry) => category.types.includes(entry.r));
        if (list.length)
          groups.push({
            id: category.id,
            kind: 'type',
            label: tr(lang, category.labelKey),
            functions: list.sort((a, b) => a.n.localeCompare(b.n)),
          });
      });
      SEMANTIC_CATEGORIES.forEach((category) => {
        const list = functions.filter((entry) => category.test(entry.n));
        if (list.length)
          groups.push({
            id: category.id,
            kind: 'semantic',
            label: tr(lang, category.labelKey),
            functions: list.sort((a, b) => a.n.localeCompare(b.n)),
          });
      });
      return groups;
    }

    // ---- B. Content beautifier & syntax linter --------------------------------

    function scanFormatCodes(text, lang, issues, parsedTemplate) {
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
                message: tr(lang, 'illegalColorCode', { code: `&#${rest.slice(0, 6)}` }),
                position: index,
                length: Math.min(rest.length + 2, 10),
              });
            }
          } else if (next && /^[0-9a-fklmnor]$/i.test(next)) {
            // Valid legacy color/format code.
          } else {
            issues.push({
              code: 'formatCode',
              message: tr(lang, 'illegalFormatCode', { code: `&${next || ''}` }),
              position: index,
              length: next ? 2 : 1,
            });
          }
        }
      }
    }

    function analyzeExpressionFromParserDetailed(rawExpression, lang, baseOffset) {
      const raw = String(rawExpression == null ? '' : rawExpression);
      const parsed = Parser.parseExpression(raw, Number(baseOffset) || 0);
      return analyzeParsedExpression(parsed.node, raw, lang, parsed.diagnostics);
    }

    function analyzeExpressionDetailed(rawExpression, lang) {
      return analyzeExpressionFromParserDetailed(rawExpression, lang, 0);
    }

    function lintContent(content, lang, parsedTemplate) {
      const text = String(content == null ? '' : content);
      const parsed = parsedTemplate?.source === text ? parsedTemplate : parseTemplateSyntax(text);
      const issues = parsed.diagnostics.map((issue) => ({
        code: issue.code,
        message: parserDiagnosticMessage(issue, text, lang),
        position: issue.start,
        length: Math.max(1, issue.end - issue.start),
      }));
      (formattingModule?.scanFormatCodes || scanFormatCodes)(text, lang, issues, parsed);
      parsed.expressions.forEach((expression) => {
        if (expression.expression?.type === 'ErrorNode') return;
        const result = analyzeParsedExpression(expression.expression, expression.body, lang, []);
        if (!result.valid) {
          result.issues.forEach((issue) => {
            issues.push({
              ...issue,
              position: issue.position,
            });
          });
        }
      });
      issues.sort((a, b) => a.position - b.position);
      return { valid: issues.length === 0, issues, parsed };
    }

    function formatParsedNode(node, indentLevel) {
      if (!node || node.type === 'ErrorNode') return node?.raw || '';
      if (node.type === 'Literal') return node.raw;
      const suffix = node.formatStart == null ? '' : `:${node.format || ''}`;
      if (!node.args.length) return `${node.name}${node.parenthesized ? '()' : ''}${suffix}`;
      const baseIndent = '  '.repeat(indentLevel);
      const argIndent = '  '.repeat(indentLevel + 1);
      const formatted = node.args.map((argument) => formatParsedNode(argument, indentLevel + 1));
      const oneLine = `${node.name}(${formatted.join('; ')})${suffix}`;
      const shouldWrap =
        node.args.length > 1 ||
        node.args.some((argument) => argument.type === 'Call') ||
        oneLine.length > 60;
      if (!shouldWrap) return oneLine;
      return `${node.name}(\n${formatted.map((argument) => `${argIndent}${argument}`).join(';\n')}\n${baseIndent})${suffix}`;
    }

    formattingModule =
      Formatting?.create({
        parser: Parser,
        parseTemplateSyntax,
        lintContent,
        translate: tr,
        formatParsedNode,
      }) || null;

    function formatContentDetailed(content) {
      if (formattingModule) return formattingModule.formatContentDetailed(content);
      const text = String(content == null ? '' : content);
      if (!text) return { value: '', valid: true, changed: false };
      const parsed = parseTemplateSyntax(text);
      const lint = lintContent(text, 'zh', parsed);
      if (!lint.valid) return { value: text, valid: false, changed: false, issues: lint.issues };
      if (!parsed.expressions.length) return { value: text, valid: true, changed: false };
      let result = '';
      let cursor = 0;
      parsed.expressions.forEach((expression) => {
        result += text.slice(cursor, expression.start);
        result += `{${formatParsedNode(expression.expression, 0)}}`;
        cursor = expression.end;
      });
      result += text.slice(cursor);
      const reparsed = Parser.parseTemplate(result);
      if (reparsed.diagnostics.length) {
        return {
          value: text,
          valid: false,
          changed: false,
          issues: reparsed.diagnostics,
        };
      }
      return { value: result, valid: true, changed: result !== text };
    }

    function formatContent(content) {
      if (formattingModule) return formattingModule.formatContent(content);
      return formatContentDetailed(content).value;
    }

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

      function resetDecorations() {
        state.bold = false;
        state.italic = false;
        state.underline = false;
        state.strike = false;
        state.obfuscated = false;
      }

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
      if (Formatting)
        return Formatting.applyContentColor(content, selectionStart, selectionEnd, pickedColor);
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
      if (Formatting)
        return Formatting.insertContent(content, selectionStart, selectionEnd, insertion);
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

    return Object.freeze({
      I18N,
      TEMPLATES,
      GENERAL_INFO_CONTENT,
      functions,
      functionIndex,
      DEPRECATED_FUNCTIONS,
      tr,
      clone,
      parseTemplateSyntax,
      defaultConfig,
      analyzeExpression,
      analyzeTemplate,
      validateConfig,
      semanticSearch,
      functionSignature,
      functionInsertion,
      sampleText,
      evaluateTemplate,
      resolvePreviewState,
      buildFunctionCategories,
      formatContent,
      formatContentDetailed,
      applyContentColor,
      insertContent,
      lintContent,
      analyzeExpressionDetailed,
    });
  },
);
