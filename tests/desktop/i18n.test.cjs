const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../shared/i18n.js'), 'utf8');

class Element {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this._text = '';
    this._value = '';
    this.isContentEditable = false;
  }

  get childElementCount() { return this.children.length; }
  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node === this.ownerDocument;
  }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  set textContent(value) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this._text = String(value);
    if (this.tagName === 'TEXTAREA') this._value = this._text;
  }
  get value() {
    if (this.tagName === 'OPTION') return this.getAttribute('value') ?? this.textContent;
    return this._value;
  }
  set value(value) { this._value = String(value); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parentNode = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this._text = '';
    this.append(...nodes);
  }
  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((node) => node !== this);
      this.parentNode = null;
    }
  }
  querySelectorAll(selector) {
    const names = [...selector.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]);
    const found = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (names.some((name) => child.hasAttribute(name))) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(listener);
  }
  removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
  dispatch(name) {
    for (const listener of [...this.listeners.get(name) || []]) listener({ target: this });
  }
}

class Document extends Element {
  constructor() {
    super('document', null);
    this.ownerDocument = this;
    this.documentElement = this.createElement('html');
    this.body = this.createElement('body');
    this.append(this.documentElement);
    this.documentElement.append(this.body);
  }
  createElement(tagName) { return new Element(tagName, this); }
}

function load({ saved = null, storage, blockedGetter = false } = {}) {
  const document = new Document();
  const writes = [];
  const window = {
    document,
    navigator: { language: 'ja' },
    localStorage: storage || {
      getItem: (key) => key === 'jinni-locale' ? saved : null,
      setItem: (...entry) => writes.push(entry),
    },
  };
  if (blockedGetter) {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Blocked'); } });
  }
  const context = vm.createContext({ window, module: { exports: {} } });
  vm.runInContext(source, context, { filename: 'shared/i18n.js' });
  return { api: window.jinniI18n, document, writes, exported: context.module.exports };
}

function leaf(document, english, marker = 'data-i18n', tagName = 'span') {
  const node = document.createElement(tagName);
  node.textContent = english;
  node.setAttribute(marker, english);
  document.body.append(node);
  return node;
}

const catalog = {
  Language: { fr: 'Langue', ja: '\u8a00\u8a9e' },
  Compare: { fr: 'Comparer', ja: '\u6bd4\u8f03', 'zh-CN': '\u6bd4\u8f83', ru: '\u0421\u0440\u0430\u0432\u043d\u0438\u0442\u044c' },
  'Sound off': { fr: 'Son coupe' },
  'Sound on for {name}': { fr: 'Son actif pour {name}', ja: '{name} sound' },
};

test('classic browser and CommonJS share a frozen exact locale API', () => {
  const { api, exported } = load();
  assert.equal(api, exported);
  assert.deepEqual([...api.LOCALES], ['en', 'zh-CN', 'fr', 'ja', 'ru']);
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.LOCALES), true);
  const context = vm.createContext({ module: { exports: {} } });
  vm.runInContext(source, context);
  assert.equal(context.module.exports.getLocale(), 'en');
  assert.equal(context.module.exports.setLocale('fr'), true);
  assert.equal(context.module.exports.t('Plain text'), 'Plain text');
});

test('English defaults without inference; valid saved locale sets document language', () => {
  for (const saved of [null, '', 'EN', 'de', '__proto__']) {
    const { api, document } = load({ saved });
    assert.equal(api.getLocale(), 'en');
    assert.equal(document.documentElement.lang, 'en');
  }
  for (const saved of ['en', 'zh-CN', 'fr', 'ja', 'ru']) {
    const { api, document, writes } = load({ saved });
    assert.equal(api.getLocale(), saved);
    assert.equal(document.documentElement.lang, saved);
    assert.deepEqual(writes, []);
  }
});

test('blocked storage getter, reads and writes keep an in-memory locale usable', () => {
  for (const options of [
    { blockedGetter: true },
    { storage: { getItem() { throw new Error('Blocked read'); }, setItem() { throw new Error('Blocked write'); } } },
  ]) {
    const { api, document } = load(options);
    api.registerMessages(catalog);
    assert.equal(api.setLocale('fr'), true);
    assert.equal(api.t('Compare'), 'Comparer');
    assert.equal(document.documentElement.lang, 'fr');
  }
});

test('only a supported locale is persisted, and no other state is written', () => {
  const { api, writes } = load();
  api.registerMessages(catalog);
  assert.equal(api.setLocale('de'), false);
  assert.deepEqual(writes, []);
  api.setLocale('ru');
  api.t('Question', { question: 'Private note' });
  assert.deepEqual(writes, [['jinni-locale', 'ru']]);
});

test('registration merges supported own strings with English fallback', () => {
  const { api } = load();
  api.registerMessages(catalog);
  api.registerMessages({ Compare: { en: 'Ignored base', fr: '', de: 'Ignored locale', ja: 'New Japanese' } });
  api.setLocale('fr');
  assert.equal(api.t('Compare'), 'Comparer');
  assert.equal(api.t('Missing'), 'Missing');
  api.setLocale('ja');
  assert.equal(api.t('Compare'), 'New Japanese');
  api.setLocale('en');
  assert.equal(api.t('Compare'), 'Compare');
  api.registerMessages(null);
  api.registerMessages([]);
  assert.equal(api.t(null), '');
});

test('safe primitive parameters cannot read inherited values, getters or prototypes', () => {
  const { api } = load();
  let getterCalls = 0;
  const params = Object.create({ inherited: 'Secret' });
  Object.assign(params, { name: '<img src=x onerror=alert(1)>', count: 0, enabled: false, big: 10n, object: {} });
  Object.defineProperty(params, 'getter', { enumerable: true, get() { getterCalls += 1; return 'Secret'; } });
  Object.defineProperty(params, '__proto__', { enumerable: true, value: 'Bad' });
  assert.equal(api.t('{name} {count} {enabled} {big} {object} {inherited} {getter} {__proto__} {constructor}', params),
    '<img src=x onerror=alert(1)> 0 false 10 {object} {inherited} {getter} {__proto__} {constructor}');
  assert.equal(getterCalls, 0);
  const entries = JSON.parse('{"__proto__":{"fr":"Bad"},"constructor":{"fr":"Bad"}}');
  Object.defineProperty(entries, 'Getter key', { enumerable: true, get() { getterCalls += 1; return { fr: 'Bad' }; } });
  api.registerMessages(entries);
  api.setLocale('fr');
  assert.equal(api.t('constructor'), 'constructor');
  assert.equal(api.t('__proto__'), '__proto__');
  assert.equal(api.t('Getter key'), 'Getter key');
  assert.equal(getterCalls, 0);
  assert.equal(Object.prototype.polluted, undefined);
});

test('only explicit text and attribute markers change; evidence and input values stay original', () => {
  const { api, document } = load();
  api.registerMessages(catalog);
  const translated = leaf(document, 'Compare');
  const evidence = document.createElement('p');
  evidence.textContent = 'Compare';
  document.body.append(evidence);
  const input = leaf(document, 'Compare', 'data-i18n', 'input');
  input.value = 'Private source title';
  for (const name of ['placeholder', 'title', 'aria-label']) {
    input.setAttribute(`data-i18n-${name}`, 'Compare');
  }
  const textarea = leaf(document, 'Private source text', 'data-i18n', 'textarea');
  textarea.value = 'Keep exact quotation';
  const editable = leaf(document, 'Compare');
  editable.isContentEditable = true;
  const option = leaf(document, 'Compare', 'data-i18n', 'option');
  api.setLocale('fr');
  assert.equal(translated.textContent, 'Comparer');
  assert.equal(evidence.textContent, 'Compare');
  assert.equal(input.value, 'Private source title');
  assert.equal(input.textContent, 'Compare');
  assert.equal(textarea.value, 'Keep exact quotation');
  assert.equal(textarea.textContent, 'Private source text');
  assert.equal(editable.textContent, 'Compare');
  assert.equal(option.value, 'Compare');
  for (const name of ['placeholder', 'title', 'aria-label']) assert.equal(input.getAttribute(name), 'Comparer');
});

test('empty markers retain their original English key through repeated changes', () => {
  const { api, document } = load();
  api.registerMessages(catalog);
  const node = leaf(document, 'Compare');
  node.setAttribute('data-i18n', '');
  node.setAttribute('title', 'Compare');
  node.setAttribute('data-i18n-title', '');
  api.setLocale('fr');
  assert.equal(node.textContent, 'Comparer');
  assert.equal(node.getAttribute('title'), 'Comparer');
  api.apply();
  api.setLocale('ja');
  assert.equal(node.textContent, '\u6bd4\u8f03');
  api.setLocale('en');
  assert.equal(node.textContent, 'Compare');
  assert.equal(node.getAttribute('title'), 'Compare');
});

test('apply includes a marked root and marked descendants but preserves nested markup', () => {
  const { api, document } = load();
  api.registerMessages(catalog);
  api.setLocale('fr');
  const root = leaf(document, 'Compare');
  api.apply(root);
  assert.equal(root.textContent, 'Comparer');
  const wrapper = leaf(document, 'Compare');
  const icon = document.createElement('svg');
  const label = document.createElement('span');
  label.setAttribute('data-i18n', 'Compare');
  wrapper.append(icon, label);
  api.apply(wrapper);
  assert.equal(wrapper.children[0], icon);
  assert.equal(label.textContent, 'Comparer');
  assert.equal(wrapper.children.length, 2);
});

test('explicit dynamic binding owns text over a stale marker and preserves parameters', () => {
  const { api, document } = load();
  api.registerMessages(catalog);
  const button = leaf(document, 'Sound off', 'data-i18n', 'button');
  const params = { name: '<lamp>' };
  api.bindText(button, 'Sound on for {name}', params);
  params.name = 'Changed after binding';
  api.apply();
  api.setLocale('fr');
  assert.equal(button.textContent, 'Son actif pour <lamp>');
  assert.equal(button.children.length, 0);
  api.setLocale('ja');
  assert.equal(button.textContent, '<lamp> sound');
  api.setLocale('en');
  assert.equal(button.textContent, 'Sound on for <lamp>');
});

test('new detached bindings survive initial apply and previously attached removals are pruned', () => {
  const { api, document } = load();
  api.registerMessages(catalog);
  const fresh = document.createElement('span');
  api.bindText(fresh, 'Compare');
  api.apply();
  document.body.append(fresh);
  api.setLocale('fr');
  assert.equal(fresh.textContent, 'Comparer');
  fresh.remove();
  api.setLocale('ja');
  assert.equal(fresh.textContent, 'Comparer');
  document.body.append(fresh);
  api.bindText(fresh, 'Compare');
  assert.equal(fresh.textContent, '\u6bd4\u8f03');
  api.setLocale('en');
  assert.equal(fresh.textContent, 'Compare');
});

test('native pickers use fixed autonyms and values, synchronize and do not duplicate listeners', () => {
  const { api, document, writes } = load({ saved: 'ja' });
  api.registerMessages(catalog);
  const first = document.createElement('select');
  const second = document.createElement('select');
  document.body.append(first, second);
  api.mountPicker(first);
  api.mountPicker(first);
  api.mountPicker(second);
  assert.equal(first.value, 'ja');
  assert.equal(first.getAttribute('aria-label'), '\u8a00\u8a9e');
  assert.deepEqual(first.children.map((option) => option.value), ['en', 'zh-CN', 'fr', 'ja', 'ru']);
  assert.deepEqual(first.children.map((option) => option.textContent),
    ['English', '\u7b80\u4f53\u4e2d\u6587', 'Fran\u00e7ais', '\u65e5\u672c\u8a9e', '\u0420\u0443\u0441\u0441\u043a\u0438\u0439']);
  first.value = 'fr';
  first.dispatch('change');
  assert.equal(api.getLocale(), 'fr');
  assert.equal(second.value, 'fr');
  assert.equal(document.documentElement.lang, 'fr');
  assert.equal(first.getAttribute('aria-label'), 'Langue');
  assert.deepEqual(writes, [['jinni-locale', 'fr']]);
});

test('change listeners receive locale once, unsubscribe, and isolate listener errors', () => {
  const { api } = load();
  const calls = [];
  const unsubscribe = api.onChange((id) => calls.push(id));
  api.onChange(() => { throw new Error('View failed'); });
  api.onChange((id) => calls.push(`Other ${id}`));
  api.setLocale('fr');
  api.setLocale('fr');
  unsubscribe();
  api.setLocale('ja');
  assert.deepEqual(calls, ['fr', 'Other fr', 'Other ja']);
  assert.throws(() => api.onChange(null), /locale listener/);
});
