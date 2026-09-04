(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WynntilsPreviewController = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  function warningDetails(evaluation) {
    const warnings = Array.from(evaluation?.warnings || []).map((item) => ({
      code: String(item.code || 'simulation-warning'),
      functionName: item.functionName ? String(item.functionName) : '',
      start: Number.isFinite(item.start) ? item.start : null,
      end: Number.isFinite(item.end) ? item.end : null,
    }));
    const names = Array.from(
      new Set([
        ...(evaluation?.unsupportedFunctions || []),
        ...warnings
          .filter((item) => item.code !== 'unsupported-function')
          .map((item) => item.functionName)
          .filter(Boolean),
      ]),
    ).sort();
    const signature = warnings.length
      ? Array.from(new Set(warnings.map((item) => `${item.code}:${item.functionName}`)))
          .sort()
          .join('|')
      : names.join('|');
    return Object.freeze({
      warnings: Object.freeze(warnings),
      names: Object.freeze(names),
      signature,
    });
  }

  function create(renderer) {
    if (
      !renderer ||
      typeof renderer.render !== 'function' ||
      typeof renderer.clear !== 'function'
    ) {
      throw new TypeError('A Canvas renderer is required');
    }
    return Object.freeze({
      render: (sample, config, time) => renderer.render(sample, config, time),
      clear: () => renderer.clear(),
      warningDetails,
    });
  }

  return Object.freeze({ create, warningDetails });
});
