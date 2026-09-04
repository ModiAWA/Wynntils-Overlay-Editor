(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WynntilsFunctionBrowser = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  function create(options) {
    const config = options || {};
    if (typeof config.search !== 'function' || typeof config.categories !== 'function') {
      throw new TypeError('Function search and category callbacks are required');
    }
    return Object.freeze({
      search: (query, limit) => config.search(query, limit),
      categories: (lang) => config.categories(lang),
      signature: (entry) => (config.signature ? config.signature(entry) : ''),
      insertion: (entry) => (config.insertion ? config.insertion(entry) : ''),
    });
  }

  return Object.freeze({ create });
});
