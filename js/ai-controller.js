(function (root, factory) {
  const api = factory(root.WynntilsAiAssistant);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WynntilsAiController = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function (Assistant) {
  'use strict';

  if (!Assistant) throw new Error('WynntilsAiAssistant must load before ai-controller.js');

  return Object.freeze({
    normalizeEndpoint: (...args) => Assistant.normalizeEndpoint(...args),
    normalizeModelsEndpoint: (...args) => Assistant.normalizeModelsEndpoint(...args),
    requestModels: (...args) => Assistant.requestModels(...args),
    buildMessages: (...args) => Assistant.buildMessages(...args),
    runAgent: (...args) => Assistant.runAgent(...args),
    validateProposalFormat: (...args) => Assistant.validateProposalFormat(...args),
  });
});
