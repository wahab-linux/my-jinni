import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Linter } from 'eslint';
import { displayMeasure } from '../../web/presentation.mjs';

const catalog = (() => {
  let messages;
  vm.runInNewContext(readFileSync('web/locales.js', 'utf8'), {
    window: { jinniI18n: { registerMessages(value) { messages = value; } } },
    document: { addEventListener() {} },
  });
  return messages;
})();
const languages = ['zh-CN', 'fr', 'ja', 'ru'];
const tokens = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

test('all browser catalog entries supply four translations with unchanged parameter names', () => {
  assert.ok(Object.keys(catalog).length > 400);
  for (const [key, translations] of Object.entries(catalog)) {
    assert.deepEqual(Object.keys(translations).sort(), [...languages].sort());
    for (const language of languages) {
      assert.ok(translations[language].trim(), `${language}: ${key}`);
      assert.deepEqual(tokens(translations[language]), tokens(key), `${language}: ${key}`);
    }
  }
});

test('controlled dynamic UI keys and ingestion errors cannot silently miss a translation', () => {
  const keys = new Set();
  const visited = new WeakSet();
  const literal = (item) => {
    if (item?.type === 'Literal' && typeof item.value === 'string' && /[a-zA-Z]/.test(item.value)
      && !/^\{\w+\}$/.test(item.value)) keys.add(item.value);
    if (item?.type === 'ConditionalExpression') { literal(item.consequent); literal(item.alternate); }
  };
  const walk = (item) => {
    if (!item || typeof item !== 'object' || visited.has(item)) return;
    visited.add(item);
    if (item.type === 'CallExpression' && item.callee.type === 'Identifier') {
      const indexes = { t: 0, node: 1, bind: 1, option: 0, status: 1, feedback: 1, fail: 0 };
      if (Object.hasOwn(indexes, item.callee.name)) literal(item.arguments[indexes[item.callee.name]]);
    }
    if (item.type === 'NewExpression' && item.callee.name === 'Error') literal(item.arguments[0]);
    for (const value of Object.values(item)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  };
  const linter = new Linter();
  for (const file of ['web/app.mjs', 'web/decision-app.mjs', 'web/library.mjs', 'web/presentation.mjs', 'web/decisions.mjs']) {
    const messages = linter.verify(readFileSync(file, 'utf8'), { languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } });
    assert.deepEqual(messages, [], `${file} parses successfully`);
    walk(linter.getSourceCode().ast);
  }
  for (const key of keys) assert.ok(Object.hasOwn(catalog, key), `Missing dynamic translation: ${key}`);
});

test('localized presentation keeps custom labels and units original while formatting GBP and numbers', () => {
  const prior = globalThis.jinniI18n;
  globalThis.jinniI18n = { getLocale: () => 'fr', t: (key, params = {}) => (catalog[key]?.fr ?? key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`) };
  try {
    assert.equal(displayMeasure(8, 'hours', true), '8 hours');
    assert.equal(displayMeasure(31, 'Price', true), '31 Price');
    assert.equal(displayMeasure(31, 'score', true), '31 score');
    assert.equal(displayMeasure(31, 'score'), '31 points');
    assert.match(displayMeasure(2500, 'pence'), /25,00/);
    assert.match(displayMeasure(2500, 'pence'), /£/);
    assert.equal(displayMeasure(null, 'hours', true), 'Inconnu');
  } finally { if (prior) globalThis.jinniI18n = prior; else delete globalThis.jinniI18n; }
});
