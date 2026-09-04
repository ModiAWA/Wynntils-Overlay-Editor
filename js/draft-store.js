(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WynntilsDraftStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  const KEY = 'wynntils-overlay-studio:draft:v1';
  const VERSION = 1;
  const FIELDS = Object.freeze([
    'content',
    'colorTemplate',
    'textShadow',
    'fontScale',
    'fitText',
    'backgroundColor',
    'backgroundBorderWidth',
    'enabledTemplate',
  ]);
  const FIELD_VALIDATORS = Object.freeze({
    content: (value) => typeof value === 'string',
    colorTemplate: (value) => typeof value === 'string',
    textShadow: (value) => typeof value === 'string',
    fontScale: (value) => typeof value === 'number' && Number.isFinite(value),
    fitText: (value) => typeof value === 'boolean',
    backgroundColor: (value) => typeof value === 'string',
    backgroundBorderWidth: (value) => typeof value === 'number' && Number.isFinite(value),
    enabledTemplate: (value) => typeof value === 'string',
  });

  function isValidTimestamp(value) {
    if (typeof value !== 'string') return false;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
  }

  function payloadFromConfig(config) {
    const source = config || {};
    const payload = { schemaVersion: VERSION, updatedAt: new Date().toISOString() };
    FIELDS.forEach((field) => {
      if (source[field] !== undefined) payload[field] = source[field];
    });
    return payload;
  }

  function isValid(payload) {
    return Boolean(
      payload &&
        payload.schemaVersion === VERSION &&
        isValidTimestamp(payload.updatedAt) &&
        FIELDS.some((field) => Object.prototype.hasOwnProperty.call(payload, field)) &&
        FIELDS.every(
          (field) =>
            !Object.prototype.hasOwnProperty.call(payload, field) ||
            FIELD_VALIDATORS[field](payload[field]),
        ),
    );
  }

  function configFromPayload(payload) {
    if (!isValid(payload)) return null;
    return FIELDS.reduce((config, field) => {
      if (Object.prototype.hasOwnProperty.call(payload, field)) config[field] = payload[field];
      return config;
    }, {});
  }

  function create(storage) {
    const backend = storage || null;
    return Object.freeze({
      key: KEY,
      fields: FIELDS,
      serialize(config) {
        return JSON.stringify(payloadFromConfig(config));
      },
      save(config) {
        if (!backend) return { ok: false, reason: 'unavailable' };
        try {
          const payload = payloadFromConfig(config);
          backend.setItem(KEY, JSON.stringify(payload));
          return { ok: true, payload };
        } catch (error) {
          return { ok: false, reason: 'write-failed', error };
        }
      },
      load() {
        if (!backend) return { ok: false, reason: 'unavailable' };
        try {
          const raw = backend.getItem(KEY);
          if (!raw) return { ok: true, payload: null, config: null };
          const payload = JSON.parse(raw);
          if (payload?.schemaVersion !== VERSION) {
            return { ok: false, reason: 'unsupported-schema', payload, raw };
          }
          if (!isValid(payload)) return { ok: false, reason: 'invalid', payload, raw };
          return { ok: true, payload, config: configFromPayload(payload) };
        } catch (error) {
          return { ok: false, reason: 'read-failed', error };
        }
      },
      parse(raw) {
        try {
          const payload = JSON.parse(String(raw || ''));
          return isValid(payload) ? { payload, config: configFromPayload(payload) } : null;
        } catch (_error) {
          return null;
        }
      },
    });
  }

  function createSession(storage) {
    const store = create(storage);
    let status = 'ready';
    let latestPayload = null;
    let pending = null;

    function isBlocked() {
      return ['conflict', 'invalid', 'read-failed', 'unsupported-schema'].includes(status);
    }

    function load() {
      const result = store.load();
      if (result.ok) {
        status = 'ready';
        latestPayload = result.payload;
        pending = null;
      } else {
        status = result.reason;
      }
      return result;
    }

    function save(config, options) {
      const force = Boolean(options?.force);
      if (isBlocked() && !force) return { ok: false, reason: 'blocked', status };
      const result = store.save(config);
      if (result.ok) {
        status = 'ready';
        latestPayload = result.payload;
        pending = null;
      } else {
        status = result.reason;
      }
      return result;
    }

    function offer(raw) {
      const incoming = store.parse(raw);
      if (!incoming) return { ok: false, reason: 'invalid' };
      const newestKnown = pending?.payload || latestPayload;
      if (incoming.payload.updatedAt <= (newestKnown?.updatedAt || '')) {
        return { ok: true, conflict: false, stale: true };
      }
      pending = incoming;
      status = 'conflict';
      return { ok: true, conflict: true, payload: incoming.payload };
    }

    function acceptIncoming() {
      if (!pending) return { ok: false, reason: 'unavailable' };
      const accepted = pending;
      pending = null;
      latestPayload = accepted.payload;
      status = 'ready';
      return { ok: true, payload: accepted.payload, config: accepted.config };
    }

    function keepCurrent(config) {
      return save(config, { force: true });
    }

    function state() {
      return Object.freeze({ status, latestPayload, pending });
    }

    return Object.freeze({
      key: store.key,
      fields: store.fields,
      load,
      save,
      offer,
      acceptIncoming,
      keepCurrent,
      state,
    });
  }

  return Object.freeze({
    KEY,
    VERSION,
    FIELDS,
    payloadFromConfig,
    configFromPayload,
    create,
    createSession,
  });
});
