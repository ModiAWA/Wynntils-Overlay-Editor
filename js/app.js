(function () {
  'use strict';

  const Core = window.WynntilsEditorCore;
  const Canvas = window.WynntilsCanvasRenderer;
  const TemplateHighlighter = window.WynntilsTemplateHighlighter;
  const MarkdownRenderer = window.WynntilsMarkdownRenderer;
  const AiController = window.WynntilsAiController || window.WynntilsAiAssistant;
  const PreviewController = window.WynntilsPreviewController;
  const FunctionBrowser = window.WynntilsFunctionBrowser;
  const DraftStore = window.WynntilsDraftStore;
  const requiredModules = {
    WynntilsEditorCore: Core,
    WynntilsCanvasRenderer: Canvas,
    WynntilsTemplateHighlighter: TemplateHighlighter,
    WynntilsMarkdownRenderer: MarkdownRenderer,
    WynntilsAiController: window.WynntilsAiController,
    WynntilsPreviewController: PreviewController,
    WynntilsFunctionBrowser: FunctionBrowser,
    WynntilsDraftStore: DraftStore,
  };
  const missingModules = Object.entries(requiredModules)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missingModules.length) {
    const error = document.getElementById('startupError');
    if (error) {
      error.hidden = false;
      error.textContent = `Wynntils editor could not start. Missing modules: ${missingModules.join(', ')}`;
    }
    console.error(`[wynntils-editor] Missing required modules: ${missingModules.join(', ')}`);
    return;
  }
  const draftSession = (() => {
    if (!DraftStore) return null;
    try {
      return DraftStore.createSession(window.localStorage);
    } catch (_error) {
      return DraftStore.createSession(null);
    }
  })();
  const state = {
    lang: 'zh',
    config: Core.defaultConfig(),
    validation: { valid: false, errors: [] },
    aiHistory: [],
    aiProposal: '',
    aiBusy: false,
    aiModelsBusy: false,
    undoConfig: null,
    draftNotice: null,
  };
  let aiRequestController = null;
  let aiModelsController = null;
  let aiModelsTimer = 0;
  let aiModelsTimedOut = false;
  let contentSelection = { start: 0, end: 0 };
  let renderFrame = 0;
  let draftSaveTimer = 0;
  let functionActiveIndex = -1;
  let functionOptionCounter = 0;
  let previewAnimationFrame = 0;
  let previewHasDynamicShader = false;
  let previewSample = '';
  let previewLastValid = null;
  let previewMode = 'empty';
  let previewVisible = true;
  let previewWarningSignature = '';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const TITLE_CONTROL_INSERTS = Object.freeze([
    Object.freeze({ labelKey: 'glyphControlStart', value: '\uE010\u2064' }),
    Object.freeze({ labelKey: 'glyphControlCell', value: '\uE00F\uE012' }),
    Object.freeze({ labelKey: 'glyphControlEnd', value: '\u2064\uE011' }),
  ]);

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const fields = {
    content: $('#contentInput'),
    colorTemplate: $('#colorTemplateInput'),
    textShadow: $('#textShadowInput'),
    fontScale: $('#fontScaleInput'),
    fitText: $('#fitTextInput'),
    backgroundColor: $('#backgroundColorInput'),
    backgroundBorderWidth: $('#borderWidthInput'),
    enabledTemplate: $('#enabledTemplateInput'),
  };
  const ADVANCED_FIELDS = [
    'colorTemplate',
    'textShadow',
    'fontScale',
    'fitText',
    'backgroundColor',
    'backgroundBorderWidth',
  ];
  const contentHighlight = $('#contentHighlight');
  const contentHighlightLayer = contentHighlight.parentElement;
  const previewRenderer = new Canvas.MinecraftCanvasRenderer($('#overlayPreview'));
  const previewController = PreviewController
    ? PreviewController.create(previewRenderer)
    : previewRenderer;
  const functionBrowser = FunctionBrowser
    ? FunctionBrowser.create({
        search: (query, limit) => Core.semanticSearch(query, limit),
        categories: (lang) => Core.buildFunctionCategories(lang),
        signature: (entry) => Core.functionSignature(entry),
        insertion: (entry) => Core.functionInsertion(entry),
      })
    : {
        search: (query, limit) => Core.semanticSearch(query, limit),
        categories: (lang) => Core.buildFunctionCategories(lang),
        signature: (entry) => Core.functionSignature(entry),
        insertion: (entry) => Core.functionInsertion(entry),
      };

  function t(key, vars) {
    return Core.tr(state.lang, key, vars);
  }

  function applyLanguage() {
    document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
    $$('[data-i18n]').forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    $$('[data-i18n-placeholder]').forEach((node) => {
      node.placeholder = t(node.dataset.i18nPlaceholder);
    });
    $$('[data-i18n-aria-label]').forEach((node) => {
      node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
    });
    $('#languageButton').textContent = state.lang === 'zh' ? 'EN' : '中';
    $('#languageButton').setAttribute('aria-label', t('languageLabel'));
    $('#functionCount').textContent = String(Core.functions.length);
    renderTemplateOptions();
    renderFunctions($('#functionSearch').value);
    renderGlyphPalette();
    renderValidation();
    renderPreview();
    updateAiKeyToggle();
    updateAiModelSelectPlaceholder();
    renderAiMessages();
    updateAiProposalBar();
    updatePreviewToggle();
    setAiBusy(state.aiBusy);
    setAiModelsBusy(state.aiModelsBusy);
    const undoButton = $('#undoConfigButton');
    if (undoButton) undoButton.disabled = !state.undoConfig;
    renderDraftNotice();
  }

  function renderTemplateOptions() {
    const select = $('#templateSelect');
    const current = select.value;
    select.replaceChildren();
    Core.TEMPLATES.forEach((template) => {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = t(template.nameKey);
      select.append(option);
    });
    if (Core.TEMPLATES.some((template) => template.id === current)) select.value = current;
  }

  function configFromForm() {
    return {
      content: fields.content.value,
      colorTemplate: fields.colorTemplate.value.trim(),
      textShadow: fields.textShadow.value,
      fontScale: Number(fields.fontScale.value),
      fitText: fields.fitText.checked,
      backgroundColor: fields.backgroundColor.value.trim(),
      backgroundBorderWidth: Number(fields.backgroundBorderWidth.value),
      enabledTemplate: fields.enabledTemplate.value.trim(),
    };
  }

  function loadConfig(config, announce) {
    if (announce && state.config) {
      state.undoConfig = Core.clone(configFromForm());
      const undoButton = $('#undoConfigButton');
      if (undoButton) undoButton.disabled = false;
    }
    state.config = { ...Core.defaultConfig(), ...Core.clone(config) };
    Object.entries(fields).forEach(([name, field]) => {
      if (field.type === 'checkbox') field.checked = Boolean(state.config[name]);
      else field.value = state.config[name] == null ? '' : String(state.config[name]);
    });
    rememberContentSelection();
    renderContentHighlight();
    renderValidation();
    renderPreview();
    if (announce) showToast(t('templateLoaded', { name: announce }));
  }

  function renderDraftNotice() {
    const notice = $('#draftNotice');
    if (!notice) return;
    const details = state.draftNotice;
    notice.hidden = !details;
    if (!details) return;
    $('#draftNoticeMessage').textContent = t(details.messageKey);
    const load = $('#loadIncomingDraftButton');
    load.hidden = !details.canLoad;
    load.textContent = t('draftLoadIncoming');
    const keep = $('#keepCurrentDraftButton');
    keep.hidden = !details.canKeep;
    keep.textContent = t(details.keepKey || 'draftKeepCurrent');
  }

  function setDraftNotice(messageKey, options) {
    state.draftNotice = { messageKey, ...(options || {}) };
    renderDraftNotice();
  }

  function clearDraftNotice() {
    state.draftNotice = null;
    renderDraftNotice();
  }

  function saveDraftNow(options) {
    if (!draftSession) return;
    const config = configFromForm();
    state.config = config;
    const result = options?.force ? draftSession.keepCurrent(config) : draftSession.save(config);
    if (result.ok) {
      if (state.draftNotice?.messageKey === 'draftSaveFailed') clearDraftNotice();
    } else if (result.reason === 'unavailable') {
      setDraftNotice('draftUnavailable');
    } else if (result.reason !== 'blocked') {
      setDraftNotice('draftSaveFailed');
    }
    return result;
  }

  function scheduleDraftSave() {
    window.clearTimeout(draftSaveTimer);
    if (draftSession?.state().status === 'conflict') return;
    draftSaveTimer = window.setTimeout(saveDraftNow, 300);
  }

  function renderNow() {
    const parsed = Core.parseTemplateSyntax(fields.content.value);
    state.config = configFromForm();
    renderContentHighlight(parsed);
    renderValidation();
    scheduleDraftSave();
    renderPreview(parsed);
  }

  function scheduleRender() {
    if (renderFrame) return;
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0;
      renderNow();
    });
  }

  function flushScheduledRender() {
    if (!renderFrame) return;
    window.cancelAnimationFrame(renderFrame);
    renderFrame = 0;
    renderNow();
  }

  function syncContentHighlightScroll() {
    contentHighlightLayer.scrollTop = fields.content.scrollTop;
    contentHighlightLayer.scrollLeft = fields.content.scrollLeft;
  }

  function renderContentHighlight(parsedTemplate) {
    TemplateHighlighter.render(
      contentHighlight,
      fields.content.value,
      parsedTemplate || Core.parseTemplateSyntax(fields.content.value),
    );
    syncContentHighlightScroll();
    document.documentElement.classList.add('syntax-highlighting');
  }

  function applySelectedContentColor() {
    const input = fields.content;
    const color = $('#contentColorPicker').value;
    const result = Core.applyContentColor(
      input.value,
      input.selectionStart,
      input.selectionEnd,
      color,
    );
    input.value = result.value;
    input.focus({ preventScroll: true });
    input.setSelectionRange(result.caret, result.caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    showToast(t('contentColorApplied', { color: color.toUpperCase() }));
  }

  function rememberContentSelection() {
    const input = fields.content;
    const fallback = input.value.length;
    contentSelection = {
      start: Number.isInteger(input.selectionStart) ? input.selectionStart : fallback,
      end: Number.isInteger(input.selectionEnd) ? input.selectionEnd : fallback,
    };
  }

  function codepointLabel(value) {
    return Array.from(
      String(value || ''),
      (character) => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
    ).join(' ');
  }

  function makeGlyphButton(entry, control) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = control ? 'glyph-control-button' : 'glyph-button';
    button.dataset.glyphInsertion = entry.value;
    button.dataset.glyphLabel = entry.label;
    const label = document.createElement('strong');
    label.textContent = entry.label;
    const codepoint = document.createElement('small');
    codepoint.textContent = codepointLabel(entry.value);
    button.append(label, codepoint);
    button.setAttribute('aria-label', `${entry.label} · ${codepoint.textContent}`);
    return button;
  }

  function renderGlyphPalette() {
    const entries = TemplateHighlighter.listWynntilsGlyphs();
    const letters = entries.filter((entry) => /^[A-Z]$/.test(entry.label));
    const symbols = entries.filter((entry) => !/^[A-Z]$/.test(entry.label));
    $('#glyphLetterGrid').replaceChildren(
      ...letters.map((entry) => makeGlyphButton({ label: entry.label, value: entry.glyph })),
    );
    $('#glyphSymbolGrid').replaceChildren(
      ...symbols.map((entry) => makeGlyphButton({ label: entry.label, value: entry.glyph })),
    );
    $('#glyphControlGrid').replaceChildren(
      ...TITLE_CONTROL_INSERTS.map((entry) =>
        makeGlyphButton({ label: t(entry.labelKey), value: entry.value }, true),
      ),
    );
  }

  function setGlyphPickerOpen(open) {
    const picker = $('#glyphPicker');
    const toggle = $('#toggleGlyphPickerButton');
    picker.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }

  function insertGlyph(entry) {
    const input = fields.content;
    const result = Core.insertContent(
      input.value,
      contentSelection.start,
      contentSelection.end,
      entry.value,
    );
    input.value = result.value;
    input.focus({ preventScroll: true });
    input.setSelectionRange(result.caret, result.caret);
    rememberContentSelection();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    showToast(t('glyphInserted', { label: entry.label }));
  }

  function updateAiKeyToggle() {
    const keyInput = $('#aiApiKeyInput');
    const toggle = $('#toggleAiKeyButton');
    if (!keyInput || !toggle) return;
    toggle.textContent = t(keyInput.type === 'password' ? 'aiShowKey' : 'aiHideKey');
  }

  function updateAiModelSelectPlaceholder() {
    const placeholder = $('#aiModelSelect option[value=""]');
    if (placeholder) placeholder.textContent = t('aiModelSelectPlaceholder');
  }

  function setAiModelsStatus(message) {
    const status = $('#aiModelsStatus');
    if (status) status.textContent = message || '';
  }

  function clearAiModelOptions() {
    const select = $('#aiModelSelect');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = t('aiModelSelectPlaceholder');
    select.replaceChildren(placeholder);
    select.hidden = true;
    setAiModelsStatus('');
  }

  function renderAiModelOptions(models) {
    const select = $('#aiModelSelect');
    const currentModel = $('#aiModelInput').value.trim();
    clearAiModelOptions();
    models.forEach((model) => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      select.append(option);
    });
    if (!models.length) return;
    select.hidden = false;
    select.value = models.includes(currentModel) ? currentModel : '';
  }

  function renderAiMessages() {
    const container = $('#aiMessages');
    if (!container) return;
    container.replaceChildren();
    const messages = state.aiHistory.length
      ? state.aiHistory
      : [{ role: 'assistant', content: t('aiWelcome') }];
    messages.forEach((message) => {
      const article = document.createElement('article');
      article.className = `ai-message ${message.role}`;
      const label = document.createElement('span');
      label.className = 'ai-message-label';
      label.textContent = t(
        message.role === 'user'
          ? 'aiUserRole'
          : message.role === 'error'
            ? 'aiErrorRole'
            : 'aiAssistantRole',
      );
      const body = document.createElement('div');
      body.className = 'ai-message-body';
      if (message.role === 'assistant') MarkdownRenderer.render(body, message.content);
      else body.textContent = message.content;
      article.append(label, body);
      container.append(article);
    });
    container.scrollTop = container.scrollHeight;
  }

  function updateAiProposalBar() {
    const bar = $('#aiProposalBar');
    if (bar) bar.hidden = !state.aiProposal;
  }

  function setAiStatus(message) {
    const status = $('#aiStatus');
    if (status) status.textContent = message || '';
  }

  function updateAiAgentStatus(event) {
    if (event?.type === 'request') {
      setAiStatus(t('aiContinuingRequest', { current: event.requestCount }));
    } else if (event?.type === 'search') {
      setAiStatus(t('aiSearchingFunctions', { query: event.query }));
    } else if (event?.type === 'correction') {
      setAiStatus(
        t('aiCorrectingProposal', {
          current: event.correctionCount,
          maximum: event.maximum,
        }),
      );
    } else if (event?.type === 'text-fallback') {
      setAiStatus(t('aiUsingTextFallback'));
    }
  }

  function updateAiRequestControls() {
    const send = $('#aiSendButton');
    const cancel = $('#cancelAiRequestButton');
    const clear = $('#clearAiChatButton');
    const fetchModels = $('#fetchAiModelsButton');
    if (send) {
      send.disabled = state.aiBusy || state.aiModelsBusy;
      send.textContent = t(state.aiBusy ? 'aiSending' : 'aiSend');
    }
    if (cancel) cancel.hidden = !state.aiBusy;
    if (clear) clear.disabled = state.aiBusy || state.aiModelsBusy;
    if (fetchModels) {
      fetchModels.disabled = state.aiBusy || state.aiModelsBusy;
      fetchModels.textContent = t(state.aiModelsBusy ? 'aiFetchingModels' : 'aiFetchModels');
    }
  }

  function setAiBusy(busy) {
    state.aiBusy = Boolean(busy);
    updateAiRequestControls();
  }

  function setAiModelsBusy(busy) {
    state.aiModelsBusy = Boolean(busy);
    updateAiRequestControls();
  }

  function openAiAssistant() {
    const dialog = $('#aiAssistantDialog');
    if (!dialog.open) dialog.showModal();
    renderAiMessages();
    updateAiProposalBar();
    const endpoint = $('#aiEndpointInput');
    const model = $('#aiModelInput');
    const prompt = $('#aiPromptInput');
    window.setTimeout(() => {
      if (!endpoint.value) endpoint.focus();
      else if (!model.value) model.focus();
      else prompt.focus();
    }, 0);
  }

  function toggleAiKeyVisibility() {
    const keyInput = $('#aiApiKeyInput');
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    updateAiKeyToggle();
    keyInput.focus();
  }

  function clearAiConversation() {
    state.aiHistory = [];
    state.aiProposal = '';
    $('#aiPromptInput').value = '';
    setAiStatus('');
    renderAiMessages();
    updateAiProposalBar();
  }

  function cancelAiRequest() {
    if (aiRequestController) aiRequestController.abort();
  }

  async function fetchAiModels() {
    if (state.aiBusy || state.aiModelsBusy) return;
    const endpointInput = $('#aiEndpointInput');
    const apiKeyInput = $('#aiApiKeyInput');
    if (!endpointInput.value.trim()) {
      setAiModelsStatus(t('aiModelsEndpointInvalid'));
      endpointInput.focus();
      return;
    }
    try {
      AiController.normalizeModelsEndpoint(endpointInput.value);
    } catch (_error) {
      setAiModelsStatus(t('aiModelsEndpointInvalid'));
      endpointInput.focus();
      return;
    }

    setAiModelsStatus('');
    setAiModelsBusy(true);
    const endpointValue = endpointInput.value;
    const controller = new AbortController();
    aiModelsController = controller;
    aiModelsTimedOut = false;
    aiModelsTimer = window.setTimeout(() => {
      aiModelsTimedOut = true;
      controller.abort();
    }, 20000);
    try {
      const models = await AiController.requestModels({
        endpoint: endpointValue,
        apiKey: apiKeyInput.value,
        signal: controller.signal,
      });
      if (endpointInput.value !== endpointValue) return;
      renderAiModelOptions(models);
      setAiModelsStatus(
        models.length ? t('aiModelsLoaded', { count: models.length }) : t('aiModelsEmpty'),
      );
    } catch (error) {
      let message;
      if (error?.name === 'AbortError') {
        message = t(aiModelsTimedOut ? 'aiModelsTimeout' : 'aiCanceled');
      } else if (error instanceof TypeError) message = t('aiNetworkError');
      else message = `${t('aiModelsFailed')}：${String(error?.message || error)}`;
      setAiModelsStatus(message);
    } finally {
      window.clearTimeout(aiModelsTimer);
      if (aiModelsController === controller) aiModelsController = null;
      setAiModelsBusy(false);
    }
  }

  async function sendAiRequest(event) {
    event.preventDefault();
    if (state.aiBusy) return;
    const endpointInput = $('#aiEndpointInput');
    const modelInput = $('#aiModelInput');
    const apiKeyInput = $('#aiApiKeyInput');
    const promptInput = $('#aiPromptInput');
    const prompt = promptInput.value.trim();
    if (!endpointInput.value.trim() || !modelInput.value.trim() || !prompt) {
      setAiStatus(t('aiEndpointInvalid'));
      (!endpointInput.value.trim()
        ? endpointInput
        : !modelInput.value.trim()
          ? modelInput
          : promptInput
      ).focus();
      return;
    }
    try {
      AiController.normalizeEndpoint(endpointInput.value);
    } catch (_error) {
      setAiStatus(t('aiEndpointInvalid'));
      endpointInput.focus();
      return;
    }

    const history = state.aiHistory.filter((message) =>
      ['user', 'assistant'].includes(message.role),
    );
    const functionCandidates = functionBrowser.search(prompt, 8).map((entry) => ({
      signature: functionBrowser.signature(entry),
      description: entry.d || '',
    }));
    const messages = AiController.buildMessages({
      language: state.lang,
      history,
      userMessage: prompt,
      currentConfig: configFromForm(),
      functionCandidates,
    });
    state.aiHistory.push({ role: 'user', content: prompt });
    promptInput.value = '';
    state.aiProposal = '';
    renderAiMessages();
    updateAiProposalBar();
    setAiStatus('');
    setAiBusy(true);

    const controller = new AbortController();
    aiRequestController = controller;
    try {
      const result = await AiController.runAgent({
        language: state.lang,
        endpoint: endpointInput.value,
        apiKey: apiKeyInput.value,
        model: modelInput.value,
        messages,
        signal: controller.signal,
        requestTimeoutMs: 120000,
        searchFunctions: (query, limit) => functionBrowser.search(query, limit),
        validateProposal: (content) => {
          const formatting = AiController.validateProposalFormat(content, state.lang);
          if (!formatting.valid) return formatting;
          const validation = Core.analyzeTemplate(content, state.lang);
          return {
            valid: validation.valid,
            errors: validation.valid ? [] : [{ message: validation.message }],
          };
        },
        onStatus: updateAiAgentStatus,
      });
      state.aiHistory.push({ role: 'assistant', content: result.text });
      state.aiProposal = result.proposal;
      setAiStatus(result.validation && !result.validation.valid ? t('aiInvalidProposal') : '');
      $('#aiSettings').open = false;
      renderAiMessages();
      updateAiProposalBar();
    } catch (error) {
      let message;
      if (error?.code === 'request_timeout') message = t('aiTimeout');
      else if (error?.name === 'AbortError') message = t('aiCanceled');
      else if (error instanceof TypeError) message = t('aiNetworkError');
      else if (error?.code === 'agent_limit') message = t('aiAgentLimit');
      else message = `${t('aiProviderError')}：${String(error?.message || error)}`;
      state.aiHistory.push({ role: 'error', content: message });
      renderAiMessages();
    } finally {
      if (aiRequestController === controller) aiRequestController = null;
      setAiBusy(false);
    }
  }

  function applyAiProposal() {
    if (!state.aiProposal) return;
    state.undoConfig = Core.clone(configFromForm());
    $('#undoConfigButton').disabled = false;
    fields.content.value = state.aiProposal;
    fields.content.dispatchEvent(new Event('input', { bubbles: true }));
    $('#aiAssistantDialog').close();
    fields.content.focus({ preventScroll: true });
    showToast(t('aiApplied'));
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('visible'), 2200);
  }

  function renderValidation() {
    state.config = configFromForm();
    state.validation = Core.validateConfig(state.config, state.lang);
    $('#validationDot').classList.toggle('invalid', !state.validation.valid);
    if (state.validation.errors.some((item) => ADVANCED_FIELDS.includes(item.field))) {
      $('#advancedSettings').open = true;
    }
    $('#validationMessage').textContent = state.validation.valid
      ? t('validationReady')
      : t('validationIssues', { count: state.validation.errors.length });
    Object.keys(fields).forEach((name) => {
      const field = fields[name];
      const error = $(`#${name}Error`);
      const issue = state.validation.errors.find((item) => item.field === name);
      field.toggleAttribute('aria-invalid', Boolean(issue));
      if (issue && error) field.setAttribute('aria-errormessage', error.id);
      else field.removeAttribute('aria-errormessage');
      if (error) error.textContent = issue ? issue.message : '';
    });
  }

  function renderPreview(parsedTemplate) {
    const preview = $('#overlayPreview');
    const evaluation = state.validation.valid
      ? Core.evaluateTemplate(state.config.content, parsedTemplate)
      : { text: '', warnings: [], unsupportedFunctions: [] };
    const sample = evaluation.text;
    const decision = Core.resolvePreviewState({
      content: state.config.content,
      valid: state.validation.valid,
      sample,
      lastValidSample: previewLastValid?.sample,
    });
    const colorNote = $('#previewColorNote');
    previewMode = decision.mode;

    if (decision.mode === 'empty') {
      previewWarningSignature = '';
      stopPreviewAnimation();
      previewHasDynamicShader = false;
      previewSample = '';
      previewLastValid = null;
      colorNote.hidden = true;
      preview.setAttribute('aria-label', t('previewEmpty'));
      renderPreviewStatus('previewEmpty', 'empty');
      try {
        previewController.clear();
      } catch (_error) {
        handlePreviewRenderFailure();
      }
      return;
    }

    if (decision.mode === 'paused') {
      previewWarningSignature = '';
      stopPreviewAnimation();
      previewHasDynamicShader = false;
      previewSample = decision.sample;
      preview.setAttribute(
        'aria-label',
        decision.sample
          ? decision.sample.replace(/[&§](?:#[0-9a-f]{6,8}|[0-9a-fklmnor])/gi, '')
          : t('previewPaused'),
      );
      renderPreviewStatus('previewPaused', 'paused');
      if (!previewLastValid) {
        colorNote.hidden = true;
        try {
          previewController.clear();
        } catch (_error) {
          handlePreviewRenderFailure();
        }
      }
      return;
    }

    preview.setAttribute(
      'aria-label',
      decision.sample.replace(/[&§](?:#[0-9a-f]{6,8}|[0-9a-fklmnor])/gi, ''),
    );
    previewSample = decision.sample;
    try {
      const rendering = previewController.render(decision.sample, state.config, 0);
      previewHasDynamicShader = Boolean(rendering?.hasDynamicShader);
      previewLastValid = {
        sample: decision.sample,
        config: Core.clone(state.config),
      };
      renderPreviewStatus(null, 'ready');
      renderPreviewWarning(evaluation);
      colorNote.hidden = !state.config.colorTemplate || rendering?.colorTemplateResolved !== false;
      syncPreviewAnimation();
    } catch (_error) {
      handlePreviewRenderFailure();
    }
  }

  function renderPreviewStatus(messageKey, mode) {
    const status = $('#previewStatus');
    const frame = $('.preview-frame');
    if (messageKey) {
      status.hidden = false;
      status.textContent = t(messageKey);
    } else if (mode !== 'ready') {
      status.hidden = true;
      status.textContent = '';
    }
    status.classList.toggle('is-error', mode === 'error');
    status.classList.toggle('is-warning', mode === 'warning');
    frame.classList.toggle('is-paused', mode === 'paused');
    frame.classList.toggle('is-error', mode === 'error');
  }

  function renderPreviewWarning(evaluation) {
    const details = PreviewController?.warningDetails
      ? PreviewController.warningDetails(evaluation)
      : {
          warnings: Array.from(evaluation?.warnings || []),
          names: evaluation?.unsupportedFunctions || [],
          signature: '',
        };
    const { warnings, names, signature } = details;
    if (!names.length && !warnings.length) {
      previewWarningSignature = '';
      const status = $('#previewStatus');
      status.hidden = true;
      status.textContent = '';
      status.classList.remove('is-warning');
      return;
    }
    const status = $('#previewStatus');
    const frame = $('.preview-frame');
    const localizedSignature = `${state.lang}:${signature}`;
    status.hidden = false;
    if (localizedSignature !== previewWarningSignature) {
      status.textContent = t('previewUnsupported', { functions: names.join(', ') });
    }
    status.hidden = false;
    status.classList.add('is-warning');
    status.classList.remove('is-error');
    frame.classList.remove('is-error');
    previewWarningSignature = localizedSignature;
  }

  function handlePreviewRenderFailure() {
    stopPreviewAnimation();
    previewMode = 'error';
    previewHasDynamicShader = false;
    $('#previewColorNote').hidden = true;
    $('#overlayPreview').setAttribute('aria-label', t('previewFailed'));
    try {
      if (previewLastValid) {
        previewSample = previewLastValid.sample;
        previewController.render(previewLastValid.sample, previewLastValid.config, 0);
      } else {
        previewSample = '';
        previewController.clear();
      }
    } catch (_fallbackError) {
      previewSample = '';
    }
    renderPreviewStatus('previewFailed', 'error');
  }

  function previewCanAnimate() {
    return (
      previewHasDynamicShader &&
      previewVisible &&
      !reducedMotion.matches &&
      !document.hidden &&
      !$('#previewBody').hidden
    );
  }

  function stopPreviewAnimation() {
    if (!previewAnimationFrame) return;
    window.cancelAnimationFrame(previewAnimationFrame);
    previewAnimationFrame = 0;
  }

  function drawAnimatedPreview(time) {
    previewAnimationFrame = 0;
    if (!previewCanAnimate()) return;
    try {
      previewController.render(previewSample, previewLastValid?.config || state.config, time);
      previewAnimationFrame = window.requestAnimationFrame(drawAnimatedPreview);
    } catch (_error) {
      handlePreviewRenderFailure();
    }
  }

  function syncPreviewAnimation() {
    stopPreviewAnimation();
    if (previewCanAnimate()) {
      previewAnimationFrame = window.requestAnimationFrame(drawAnimatedPreview);
    }
  }

  function updatePreviewToggle() {
    const body = $('#previewBody');
    const panel = $('.preview-panel');
    const button = $('#togglePreviewButton');
    if (!body || !panel || !button) return;
    panel.classList.toggle('is-collapsed', body.hidden);
    button.setAttribute('aria-expanded', String(!body.hidden));
    button.setAttribute('aria-label', t(body.hidden ? 'previewExpand' : 'previewCollapse'));
  }

  function makeFunctionButton(entry, container, isSearchOption = true) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'function-result';
    if (entry.n) button.dataset.function = entry.n;
    if (isSearchOption) {
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', 'false');
      button.id = `function-option-${entry.n || 'unknown'}-${functionOptionCounter++}`;
    }
    const name = document.createElement('strong');
    name.textContent = entry.n || String(entry);
    const description = document.createElement('span');
    description.textContent = entry.d || '';
    const signature = document.createElement('small');
    signature.textContent = entry.r
      ? `${t('resultType')} ${entry.r} · ${functionBrowser.signature(entry)}`
      : '';
    button.append(name, description, signature);
    container.append(button);
  }

  function renderFunctions(query) {
    const container = $('#functionResults');
    const normalizedQuery = String(query || '').trim();
    container.replaceChildren();
    container.hidden = false;
    functionActiveIndex = -1;
    functionOptionCounter = 0;
    $('#functionSearch').removeAttribute('aria-activedescendant');
    $('#functionSearch').setAttribute('aria-expanded', 'false');
    if (!normalizedQuery) {
      container.removeAttribute('role');
      // 分类浏览：按类型/语义分组展示全部函数
      const cats = functionBrowser.categories(state.lang);
      cats.forEach((cat) => {
        const details = document.createElement('details');
        details.className = 'function-category';
        if (!cat.functions.length) return;
        const summary = document.createElement('summary');
        summary.className = 'function-category-summary';
        summary.textContent = `${cat.label} (${cat.functions.length})`;
        details.append(summary);
        const list = document.createElement('div');
        list.className = 'category-results';
        details.append(list);
        details.dataset.rendered = 'false';
        details.addEventListener('toggle', () => {
          if (!details.open || details.dataset.rendered === 'true') return;
          details.dataset.rendered = 'true';
          const visible = cat.functions.slice(0, 30);
          visible.forEach((fn) => makeFunctionButton(fn, list, false));
          if (cat.functions.length <= visible.length) return;
          const more = document.createElement('button');
          more.type = 'button';
          more.className = 'show-more-functions';
          more.textContent = t('showMore', { count: cat.functions.length - visible.length });
          more.addEventListener('click', () => {
            cat.functions
              .slice(visible.length)
              .forEach((fn) => makeFunctionButton(fn, list, false));
            more.remove();
          });
          details.append(more);
        });
        container.append(details);
      });
      $('#functionResultsStatus').textContent = t('functionResultsLabel');
      return;
    }
    container.setAttribute('role', 'listbox');
    const results = functionBrowser.search(normalizedQuery, 24);
    $('#functionSearch').setAttribute('aria-expanded', 'true');
    if (!results.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-results';
      empty.textContent = t('noResults');
      container.append(empty);
      $('#functionResultsStatus').textContent = t('noResults');
      return;
    }
    results.forEach((entry) => makeFunctionButton(entry, container));
    $('#functionResultsStatus').textContent = `${results.length} ${t('functionResultsLabel')}`;
  }

  function closeFunctionResults() {
    const container = $('#functionResults');
    functionActiveIndex = -1;
    setFunctionActiveOption($$('#functionResults [role="option"]'), -1);
    container.hidden = true;
    $('#functionSearch').setAttribute('aria-expanded', 'false');
    $('#functionResultsStatus').textContent = '';
  }

  function setFunctionActiveOption(options, index) {
    options.forEach((option, optionIndex) => {
      option.setAttribute('aria-selected', String(optionIndex === index));
    });
    if (index < 0 || !options[index]) {
      $('#functionSearch').removeAttribute('aria-activedescendant');
      return;
    }
    $('#functionSearch').setAttribute('aria-activedescendant', options[index].id);
    options[index].scrollIntoView({ block: 'nearest' });
  }

  function insertFunction(name) {
    const entry = Core.functions.find((item) => item.n === name);
    if (!entry) return;
    const insertion = functionBrowser.insertion(entry);
    const input = fields.content;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.setRangeText(insertion, start, end, 'end');
    rememberContentSelection();
    scheduleRender();
    input.focus();
    showToast(t('inserted', { name: entry.n }));
  }

  async function copyContent() {
    if (!fields.content.value) {
      fields.content.focus();
      return;
    }
    try {
      await navigator.clipboard.writeText(fields.content.value);
      showToast(t('contentCopied'));
    } catch (_error) {
      fields.content.focus();
      fields.content.select();
      showToast(t('contentCopyFailed'));
    }
  }

  function init() {
    renderTemplateOptions();
    $('#templateSelect').value = 'fps';
    loadConfig(Core.TEMPLATES.find((template) => template.id === 'fps').config);
    if (draftSession) {
      const draft = draftSession.load();
      if (draft.ok && draft.config) {
        loadConfig(draft.config);
        window.setTimeout(() => showToast(t('draftRestored')), 0);
      } else if (draft.reason === 'unsupported-schema') {
        setDraftNotice('draftIncompatible', {
          canKeep: true,
          keepKey: 'draftReplaceStored',
        });
      } else if (['invalid', 'read-failed'].includes(draft.reason)) {
        setDraftNotice('draftInvalid', {
          canKeep: true,
          keepKey: 'draftReplaceStored',
        });
      } else if (draft.reason === 'unavailable') {
        setDraftNotice('draftUnavailable');
      }
    }
    $('#templateSelect').addEventListener('change', (event) => {
      const template = Core.TEMPLATES.find((item) => item.id === event.target.value);
      if (!template) return;
      loadConfig(template.config, t(template.nameKey));
      scheduleDraftSave();
    });
    $('#configForm').addEventListener('input', (event) => {
      if (event.target === fields.content) {
        rememberContentSelection();
      }
      scheduleRender();
    });
    $('#configForm').addEventListener('change', scheduleRender);
    fields.content.addEventListener('scroll', syncContentHighlightScroll, { passive: true });
    for (const eventName of ['click', 'keyup', 'select']) {
      fields.content.addEventListener(eventName, rememberContentSelection);
    }
    $('#applyContentColorButton').addEventListener('click', applySelectedContentColor);
    $('#copyContentButton').addEventListener('click', copyContent);
    $('#toggleGlyphPickerButton').addEventListener('click', () => {
      setGlyphPickerOpen($('#glyphPicker').hidden);
    });
    $('#closeGlyphPickerButton').addEventListener('click', () => {
      setGlyphPickerOpen(false);
      $('#toggleGlyphPickerButton').focus();
    });
    $('#glyphPicker').addEventListener('click', (event) => {
      const button = event.target.closest('[data-glyph-insertion]');
      if (!button) return;
      insertGlyph({ label: button.dataset.glyphLabel, value: button.dataset.glyphInsertion });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || $('#glyphPicker').hidden || $('#aiAssistantDialog').open)
        return;
      event.preventDefault();
      setGlyphPickerOpen(false);
      $('#toggleGlyphPickerButton').focus();
    });
    $('#openAiAssistantButton').addEventListener('click', openAiAssistant);
    $('#closeAiAssistantButton').addEventListener('click', () => $('#aiAssistantDialog').close());
    $('#toggleAiKeyButton').addEventListener('click', toggleAiKeyVisibility);
    $('#fetchAiModelsButton').addEventListener('click', fetchAiModels);
    $('#aiModelSelect').addEventListener('change', (event) => {
      if (event.target.value) $('#aiModelInput').value = event.target.value;
    });
    $('#aiEndpointInput').addEventListener('input', clearAiModelOptions);
    $('#clearAiChatButton').addEventListener('click', clearAiConversation);
    $('#cancelAiRequestButton').addEventListener('click', cancelAiRequest);
    $('#applyAiProposalButton').addEventListener('click', applyAiProposal);
    $('#aiChatForm').addEventListener('submit', sendAiRequest);
    $('#aiPromptInput').addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        $('#aiChatForm').requestSubmit();
      }
    });
    $('#aiAssistantDialog').addEventListener('click', (event) => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });
    $('#aiAssistantDialog').addEventListener('close', () => {
      if (aiRequestController) aiRequestController.abort();
      if (aiModelsController) aiModelsController.abort();
    });
    $('#functionSearch').addEventListener('input', (event) => renderFunctions(event.target.value));
    $('#functionSearch').setAttribute('role', 'combobox');
    $('#functionSearch').setAttribute('aria-controls', 'functionResults');
    $('#functionSearch').setAttribute('aria-haspopup', 'listbox');
    $('#functionSearch').setAttribute('aria-autocomplete', 'list');
    const fmtBtn = document.getElementById('formatContentButton');
    if (fmtBtn)
      fmtBtn.addEventListener('click', () => {
        const content = fields.content.value;
        try {
          const formatted = Core.formatContentDetailed(content);
          if (!formatted.valid) {
            showToast(t('formatInvalid'));
            renderValidation();
            return;
          }
          if (!formatted.changed) {
            showToast(t('formatNoChanges'));
            return;
          }
          state.undoConfig = Core.clone(configFromForm());
          $('#undoConfigButton').disabled = false;
          fields.content.value = formatted.value;
          scheduleRender();
          showToast(t('formatSuccess'));
        } catch (_error) {
          showToast(t('formatInvalid'));
        }
      });
    const lintBtn = document.getElementById('lintContentButton');
    if (lintBtn)
      lintBtn.addEventListener('click', () => {
        flushScheduledRender();
        const res = Core.lintContent(fields.content.value, state.lang);
        const msg = document.getElementById('validationMessage');
        if (msg) {
          if (res.valid) {
            msg.className = 'validation-message valid';
            msg.textContent = t('lintClear');
          } else {
            msg.className = 'validation-message error';
            const issues = res.issues || [];
            const summary = document.createElement('div');
            summary.textContent = t('lintIssues', { count: issues.length });
            const list = document.createElement('ul');
            issues.slice(0, 6).forEach((iss) => {
              const li = document.createElement('li');
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'lint-issue-button';
              button.textContent = iss.message;
              button.addEventListener('click', () => {
                const contentLength = fields.content.value.length;
                const start = Math.max(0, Math.min(contentLength, Number(iss.position) || 0));
                const length = Math.max(1, Number(iss.length) || 1);
                const end = Math.min(contentLength, start + length);
                fields.content.focus({ preventScroll: true });
                fields.content.setSelectionRange(start, end);
                fields.content.scrollIntoView({ block: 'center', behavior: 'smooth' });
              });
              li.append(button);
              list.append(li);
            });
            msg.replaceChildren(summary, list);
          }
        }
      });
    $('#functionResults').addEventListener('click', (event) => {
      const button = event.target.closest('[data-function]');
      if (button) insertFunction(button.dataset.function);
    });
    $('#functionSearch').addEventListener('keydown', (event) => {
      if (!event.currentTarget.value.trim()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeFunctionResults();
        return;
      }
      const options = $$('#functionResults [role="option"]');
      if (!options.length) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        $('#functionResults').hidden = false;
        $('#functionSearch').setAttribute('aria-expanded', 'true');
        functionActiveIndex =
          (functionActiveIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) %
          options.length;
        setFunctionActiveOption(options, functionActiveIndex);
      } else if (event.key === 'Enter' && functionActiveIndex >= 0) {
        event.preventDefault();
        insertFunction(options[functionActiveIndex].dataset.function);
      }
    });
    $('#togglePreviewButton').addEventListener('click', () => {
      const body = $('#previewBody');
      body.hidden = !body.hidden;
      updatePreviewToggle();
      if (!body.hidden) renderPreview();
      else syncPreviewAnimation();
    });
    $('#undoConfigButton').addEventListener('click', () => {
      if (!state.undoConfig) {
        showToast(t('undoUnavailable'));
        return;
      }
      const previous = state.undoConfig;
      state.undoConfig = null;
      $('#undoConfigButton').disabled = true;
      loadConfig(previous);
      scheduleDraftSave();
    });
    $('#loadIncomingDraftButton').addEventListener('click', () => {
      const accepted = draftSession?.acceptIncoming();
      if (!accepted?.ok) return;
      state.undoConfig = Core.clone(configFromForm());
      $('#undoConfigButton').disabled = false;
      loadConfig(accepted.config);
      clearDraftNotice();
      showToast(t('draftLoadedIncoming'));
    });
    $('#keepCurrentDraftButton').addEventListener('click', () => {
      const result = saveDraftNow({ force: true });
      if (!result?.ok) return;
      clearDraftNotice();
      showToast(t('draftKeptCurrent'));
    });
    window.addEventListener('pagehide', () => {
      window.clearTimeout(draftSaveTimer);
      stopPreviewAnimation();
      saveDraftNow();
    });
    document.addEventListener('visibilitychange', syncPreviewAnimation);
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches && previewMode === 'ready' && previewLastValid) {
        try {
          previewController.render(previewSample, previewLastValid.config, 0);
        } catch (_error) {
          handlePreviewRenderFailure();
        }
      }
      syncPreviewAnimation();
    });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        previewVisible = entries.some((entry) => entry.isIntersecting);
        syncPreviewAnimation();
      });
      observer.observe($('.preview-panel'));
    }
    window.addEventListener('storage', (event) => {
      if (!draftSession || event.key !== draftSession.key || !event.newValue) return;
      const offered = draftSession.offer(event.newValue);
      if (!offered.conflict) return;
      window.clearTimeout(draftSaveTimer);
      setDraftNotice('draftConflict', { canLoad: true, canKeep: true });
    });
    $('#languageButton').addEventListener('click', () => {
      state.lang = state.lang === 'zh' ? 'en' : 'zh';
      applyLanguage();
    });
    let resizeFrame = 0;
    window.addEventListener('resize', () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(renderPreview);
    });
    applyLanguage();
  }

  init();
})();
