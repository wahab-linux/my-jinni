const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { createAssetHandler, isTrustedDocument, validPreferences, preferenceReadScript, preferenceSeedScript } = require('../../desktop/assets.cjs');
const root = path.resolve(__dirname, '../..');

test('only the canonical trusted main document, with an optional fragment, is accepted', () => {
  for (const url of ['jinni://app/index.html', 'jinni://app/index.html#planner']) assert.equal(isTrustedDocument(url), true);
  for (const url of ['https://app/index.html', 'file:///index.html', 'jinni://app/', 'jinni://app/other.html', 'jinni://app/index.html?x=1', 'jinni://other/index.html', 'jinni://user@app/index.html', 'jinni://app:80/index.html']) assert.equal(isTrustedDocument(url), false);
});

test('native asset handler serves exact shared frontend and no backend, credentials or directory traversal', async () => {
  const handler = createAssetHandler(root);
  const invoke = (url, method = 'GET', origin) => handler({ url, method, headers: new Headers(origin ? { origin } : {}) });
  const page = await invoke('jinni://app/index.html');
  assert.equal(page.status, 200); assert.match(page.headers.get('Content-Type'), /text\/html/);
  assert.match(await page.text(), /Content-Security-Policy/);
  assert.equal((await invoke('jinni://app/shared/i18n.js')).status, 200);
  assert.equal((await invoke('jinni://app/venue-guide.md')).status, 200);
  for (const url of ['jinni://other/index.html', 'jinni://user@app/index.html', 'jinni://app/index.html?x=1', 'jinni://app/../app/main.py', 'jinni://app/%2e%2e/app/main.py', 'jinni://app/%252e%252e/app/main.py', 'jinni://app/%2fapp/main.py', 'jinni://app/..\\app/main.py']) assert.equal((await invoke(url)).status, 403);
  assert.equal((await invoke('jinni://app/index.html', 'POST')).status, 405);
  assert.equal((await invoke('jinni://app/index.html', 'GET', 'https://evil.invalid')).status, 403);
  assert.equal((await invoke('jinni://app/app/main.py')).status, 404);
  assert.equal((await invoke('jinni://app/package.json')).status, 404);
});

test('preference migration reads only validated appearance/locale keys and never overwrites new-origin choices', () => {
  const previous = new Map([['jinni-locale', 'fr'], ['my-jinni-theme', 'dark'], ['private-api-key', 'never-read'], ['my-jinni-sound', 'invalid']]);
  const reads = [];
  const values = vm.runInNewContext(preferenceReadScript(), { localStorage: { getItem(key) { reads.push(key); return previous.get(key) ?? null; } } });
  assert.deepEqual(JSON.parse(JSON.stringify(values)), { 'jinni-locale': 'fr', 'my-jinni-theme': 'dark' });
  assert.equal(reads.includes('private-api-key'), false);
  const next = new Map([['jinni-locale', 'ja']]);
  vm.runInNewContext(preferenceSeedScript({ ...values, secret: 'never-copy' }), { localStorage: { getItem: (key) => next.get(key) ?? null, setItem: (key, value) => next.set(key, value) } });
  assert.deepEqual(Object.fromEntries(next), { 'jinni-locale': 'ja', 'my-jinni-theme': 'dark' });
  assert.deepEqual(validPreferences({ 'jinni-locale': 'bad', 'my-jinni-theme': 'dark', secret: 'no' }), { 'my-jinni-theme': 'dark' });
});

test('migration document is inert and unavailable preference storage does not throw', async () => {
  const response = await createAssetHandler(root, { migration: () => true })({ url: 'jinni://app/index.html', method: 'GET', headers: new Headers() });
  const html = await response.text();
  assert.match(html, /script-src 'none'/); assert.doesNotMatch(html, /<script/);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInNewContext(preferenceReadScript(), { localStorage: blocked }))), {});
  assert.doesNotThrow(() => vm.runInNewContext(preferenceSeedScript({ 'jinni-locale': 'fr' }), { localStorage: blocked }));
});
