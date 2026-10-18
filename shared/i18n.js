(function initialize(host) {
  'use strict';

  const LOCALES = Object.freeze(['en', 'zh-CN', 'fr', 'ja', 'ru']);
  const LANGUAGE_NAMES = Object.freeze({
    en: 'English',
    'zh-CN': '\u7b80\u4f53\u4e2d\u6587',
    fr: 'Fran\u00e7ais',
    ja: '\u65e5\u672c\u8a9e',
    ru: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439',
  });
  const STORAGE_KEY = 'jinni-locale';
  const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const MARKERS = Object.freeze({
    'data-i18n': null,
    'data-i18n-placeholder': 'placeholder',
    'data-i18n-title': 'title',
    'data-i18n-aria-label': 'aria-label',
  });
  const SELECTOR = Object.keys(MARKERS).map((attribute) => `[${attribute}]`).join(',');
  const messages = new Map();
  const bindings = new WeakMap();
  const tracked = new Set();
  const pickers = new WeakMap();
  const pickerReferences = new Set();
  const callbacks = new Set();
  const document = host.document;
  let locale = 'en';

  try {
    const saved = host.localStorage?.getItem(STORAGE_KEY);
    if (LOCALES.includes(saved)) locale = saved;
  } catch {
    // A blocked storage API does not prevent an in-memory language choice.
  }

  function parameters(value) {
    const result = Object.create(null);
    if (!value || typeof value !== 'object') return result;
    for (const name of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(name)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (descriptor && Object.hasOwn(descriptor, 'value')
          && ['string', 'number', 'boolean', 'bigint'].includes(typeof descriptor.value)) {
        result[name] = String(descriptor.value);
      }
    }
    return result;
  }

  function t(english, params = {}) {
    if (typeof english !== 'string') return '';
    const translation = locale === 'en' ? undefined : messages.get(english)?.get(locale);
    const template = translation || english;
    const values = parameters(params);
    return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (placeholder, name) => (
      !FORBIDDEN_KEYS.has(name) && Object.hasOwn(values, name) ? values[name] : placeholder
    ));
  }

  function reference(node) {
    return new WeakRef(node);
  }

  function record(node) {
    let binding = bindings.get(node);
    if (!binding) {
      binding = {
        text: null,
        attributes: new Map(),
        originalKeys: new Map(),
        reference: reference(node),
        wasConnected: Boolean(node.isConnected),
      };
      bindings.set(node, binding);
    }
    if (node.isConnected) binding.wasConnected = true;
    tracked.add(binding.reference);
    return binding;
  }

  function canWriteText(node) {
    if ((node.childElementCount || 0) > 0 || node.isContentEditable) return false;
    const tag = node.tagName?.toUpperCase();
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return false;
    return tag !== 'OPTION' || node.hasAttribute('value');
  }

  function paint(node, binding) {
    if (binding.text && canWriteText(node)) {
      node.textContent = t(binding.text.english, binding.text.params);
    }
    for (const [attribute, entry] of binding.attributes) {
      node.setAttribute(attribute, t(entry.english, entry.params));
    }
  }

  function bindText(node, english, params = {}) {
    if (!node || typeof node !== 'object' || typeof english !== 'string') return node;
    const binding = record(node);
    binding.text = { english, params: parameters(params), controlled: true };
    paint(node, binding);
    return node;
  }

  function refreshTracked() {
    for (const entry of tracked) {
      const node = entry.deref();
      const binding = node && bindings.get(node);
      if (!node || (!node.isConnected && binding?.wasConnected)) {
        tracked.delete(entry);
        continue;
      }
      if (node.isConnected && binding) binding.wasConnected = true;
      if (binding) paint(node, binding);
    }
    for (const entry of pickerReferences) {
      const select = entry.deref();
      if (!select || !select.isConnected) pickerReferences.delete(entry);
      else select.value = locale;
    }
  }

  function applyElement(node) {
    if (!node || typeof node.hasAttribute !== 'function') return;
    for (const [marker, attribute] of Object.entries(MARKERS)) {
      if (!node.hasAttribute(marker)) continue;
      const binding = record(node);
      if (!attribute && binding.text?.controlled) {
        paint(node, binding);
        continue;
      }
      const declared = node.getAttribute(marker);
      let english;
      if (declared) {
        english = declared;
      } else {
        if (!binding.originalKeys.has(marker)) {
          binding.originalKeys.set(marker, attribute ? node.getAttribute(attribute) || '' : node.textContent);
        }
        english = binding.originalKeys.get(marker);
      }
      const entry = { english, params: Object.create(null) };
      if (attribute) binding.attributes.set(attribute, entry);
      else binding.text = entry;
      paint(node, binding);
    }
  }

  function apply(root = document) {
    if (root) {
      applyElement(root);
      for (const node of root.querySelectorAll?.(SELECTOR) || []) applyElement(node);
    }
    refreshTracked();
    return root;
  }

  function updateDocumentLanguage() {
    if (document?.documentElement) document.documentElement.lang = locale;
  }

  function setLocale(id) {
    if (!LOCALES.includes(id)) return false;
    const changed = locale !== id;
    locale = id;
    try {
      host.localStorage?.setItem(STORAGE_KEY, locale);
    } catch {
      // The active choice still works when persistence is unavailable.
    }
    updateDocumentLanguage();
    apply();
    if (changed) {
      for (const callback of [...callbacks]) {
        try { callback(locale); } catch { /* Keep other registered views usable. */ }
      }
      apply();
    }
    return true;
  }

  function registerMessages(entries) {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return;
    for (const english of Object.keys(entries)) {
      if (FORBIDDEN_KEYS.has(english)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(entries, english);
      const translations = descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : null;
      if (!translations || typeof translations !== 'object' || Array.isArray(translations)) continue;
      const existing = messages.get(english) || new Map();
      for (const id of LOCALES.slice(1)) {
        const translation = Object.getOwnPropertyDescriptor(translations, id);
        if (translation && Object.hasOwn(translation, 'value')
            && typeof translation.value === 'string' && translation.value.trim()) {
          existing.set(id, translation.value);
        }
      }
      messages.set(english, existing);
    }
    apply();
  }

  function onChange(callback) {
    if (typeof callback !== 'function') throw new TypeError('A locale listener must be a function.');
    callbacks.add(callback);
    return () => callbacks.delete(callback);
  }

  function mountPicker(select) {
    const owner = select?.ownerDocument || document;
    if (!select || select.tagName?.toUpperCase() !== 'SELECT' || !owner) return select;
    const options = LOCALES.map((id) => {
      const option = owner.createElement('option');
      option.setAttribute('value', id);
      option.textContent = LANGUAGE_NAMES[id];
      return option;
    });
    select.replaceChildren(...options);
    select.value = locale;
    const previous = pickers.get(select);
    if (previous) select.removeEventListener('change', previous);
    const changed = () => setLocale(select.value);
    select.addEventListener('change', changed);
    pickers.set(select, changed);
    pickerReferences.add(record(select).reference);
    if (!select.hasAttribute('aria-label')) {
      select.setAttribute('data-i18n-aria-label', 'Language');
      applyElement(select);
    }
    return select;
  }

  updateDocumentLanguage();
  const api = Object.freeze({
    LOCALES, LANGUAGE_NAMES, registerMessages, t, bindText, apply, setLocale,
    getLocale: () => locale, onChange, mountPicker,
  });
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (host.document) host.jinniI18n = api;
}(typeof window === 'object' ? window : globalThis));
