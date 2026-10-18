const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Linter } = require('eslint');

const root = path.resolve(__dirname, '../..');
const locales = ['zh-CN', 'fr', 'ja', 'ru'];
const placeholders = (value) => [...new Set(value.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) || [])].sort();

function loadCatalog(filename) {
  const messages = new Map();
  const overrides = [];
  const i18n = { registerMessages(catalog) {
    for (const [key, values] of Object.entries(catalog)) {
      if (messages.has(key)) overrides.push(key);
      messages.set(key, values);
    }
  } };
  const document = { addEventListener() {} };
  const context = vm.createContext({ document, jinniI18n: i18n, window: { document, jinniI18n: i18n } });
  const files = filename === 'web/locales.js' ? [filename] : ['web/locales.js', filename];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  return { messages, overrides };
}

function decodeAttribute(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (Object.hasOwn(named, entity)) return named[entity];
    return String.fromCodePoint(Number.parseInt(entity.slice(entity[2] === 'x' ? 3 : 2, -1), entity[2] === 'x' ? 16 : 10));
  });
}

for (const [catalog, html] of [
  ['web/locales.js', 'web/index.html'],
  ['web/desktop-locales.js', 'web/index.html'],
]) {
  test(`${catalog} supplies all four translations with exactly the English placeholders`, () => {
    const { messages } = loadCatalog(catalog);
    assert.ok(messages.size >= 30, 'The interface needs a substantive local catalog.');
    for (const [english, translations] of messages) {
      assert.ok(english.trim());
      for (const locale of locales) {
        const translated = translations[locale];
        assert.equal(typeof translated, 'string', `${locale}: ${english}`);
        assert.ok(translated.trim(), `${locale}: ${english}`);
        assert.deepEqual(placeholders(translated), placeholders(english), `${locale}: ${english}`);
      }
    }
  });

  test(`${catalog} covers every marked label in the common interface`, () => {
    const { messages } = loadCatalog(catalog);
    const markup = fs.readFileSync(path.join(root, html), 'utf8');
    const missing = new Set();
    for (const [, attribute] of markup.matchAll(/\bdata-i18n(?:-(?:placeholder|title|aria-label))?="([^"]*)"/g)) {
      const key = decodeAttribute(attribute);
      if (key && !messages.has(key)) missing.add(key);
    }
    assert.deepEqual([...missing], [], 'Every explicitly marked interface label needs all four translations.');
  });
}

test('native tools add controlled translations without overriding the shared interface catalog', () => {
  const { messages, overrides } = loadCatalog('web/desktop-locales.js');
  assert.deepEqual(overrides, []);
  const linter = new Linter();
  const source = fs.readFileSync(path.join(root, 'web/desktop-ai.mjs'), 'utf8');
  assert.deepEqual(linter.verify(source, { languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }), []);
  const visited = new WeakSet();
  const keys = new Set();
  function phrase(node) {
    if (node?.type === 'Literal' && typeof node.value === 'string' && /[a-zA-Z]/.test(node.value)) keys.add(node.value);
    if (node?.type === 'ConditionalExpression') { phrase(node.consequent); phrase(node.alternate); }
  }
  function visit(node) {
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
      const indexes = { make: 2, bind: 1, feedback: 0, button: 1, label: 1 };
      if (Object.hasOwn(indexes, node.callee.name)) phrase(node.arguments[indexes[node.callee.name]]);
    }
    if (node.type === 'NewExpression' && node.callee.name === 'Error') phrase(node.arguments[0]);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(linter.getSourceCode().ast);
  const missing = [...keys].filter((key) => !messages.has(key) && !/^\{\w+\}$/.test(key));
  assert.deepEqual(missing, [], 'Native controlled UI phrases need four translations.');
});
