const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const locales = ['zh-CN', 'fr', 'ja', 'ru'];
const placeholders = (value) => [...new Set(value.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) || [])].sort();

function loadCatalog(filename) {
  const messages = new Map();
  const i18n = { registerMessages(catalog) {
    for (const [key, values] of Object.entries(catalog)) messages.set(key, values);
  } };
  const document = { addEventListener() {} };
  const context = { document, jinniI18n: i18n, window: { document, jinniI18n: i18n } };
  vm.runInNewContext(fs.readFileSync(path.join(root, filename), 'utf8'), context, { filename });
  return messages;
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
  ['desktop/renderer/locales.js', 'desktop/renderer/index.html'],
]) {
  test(`${catalog} supplies all four translations with exactly the English placeholders`, () => {
    const messages = loadCatalog(catalog);
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

  test(`${html} has translations for every explicitly marked interface label`, () => {
    const messages = loadCatalog(catalog);
    const markup = fs.readFileSync(path.join(root, html), 'utf8');
    const missing = new Set();
    for (const [, attribute] of markup.matchAll(/\bdata-i18n(?:-(?:placeholder|title|aria-label))?="([^"]*)"/g)) {
      const key = decodeAttribute(attribute);
      if (key && !messages.has(key)) missing.add(key);
    }
    assert.deepEqual([...missing], [], 'Every explicitly marked interface label needs all four translations.');
  });
}
