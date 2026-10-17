const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateBackendUrl, validatePreferences, validateTextSource, validateChatRequest,
  validateSourceId, validateImportOptions, validateSessionKey, validateIpcInput,
} = require('../../desktop/validation.cjs');

const preferences = JSON.parse(fs.readFileSync(path.join(__dirname, '../../contracts/fixtures/recommendation-request.json'), 'utf8'));

for (const url of ['http://127.0.0.1:8000', 'http://localhost:8765', 'http://[::1]:8765/']) {
  test(`accepts explicit loopback origin ${url}`, () => {
    assert.equal(new URL(validateBackendUrl(url)).origin, new URL(url).origin);
  });
}

for (const url of [
  'https://example.com', 'http://example.com', 'http://192.168.1.1:8000', 'http://0.0.0.0:8000',
  'file:///private/file', 'http://user:password@127.0.0.1:8000',
  'http://127.0.0.1:8000/api', 'http://127.0.0.1:8000?key=x', 'http://127.0.0.1:8000/#fragment',
]) {
  test(`rejects nonlocal or ambiguous backend URL ${url}`, () => {
    assert.throws(() => validateBackendUrl(url));
  });
}

test('preserves the coordinated planner request and rejects unsafe mutations', () => {
  assert.deepEqual(validatePreferences(preferences), preferences);
  for (const changes of [
    { budget_pence: true }, { budget_pence: 1.5 }, { budget_pence: -1 },
    { interests: [] }, { interests: ['games', 'games'] }, { extra: 'uncontracted' },
  ]) assert.throws(() => validatePreferences({ ...preferences, ...changes }));
});

test('source and chat inputs preserve explicit selection and reject arbitrary paths', () => {
  assert.equal(validateSourceId('source_123-abc'), 'source_123-abc');
  for (const id of ['../private', 'a/b', 'a?key=x', '', '/']) assert.throws(() => validateSourceId(id));
  assert.deepEqual(validateImportOptions({ is_simulated: true }), { is_simulated: true });
  assert.throws(() => validateImportOptions({ path: 'C:/private/file.txt' }));
  assert.equal(validateTextSource({ title: 'Guide', text: 'Original fact.', is_simulated: true }).text, 'Original fact.');
  assert.throws(() => validateTextSource({ title: 'Guide', text: '  ' }));
  const chat = { question: 'What does the guide say?', source_ids: ['source-123'], model: 'gpt-4.1-mini' };
  assert.deepEqual(validateChatRequest(chat), chat);
  assert.throws(() => validateChatRequest({ ...chat, source_ids: ['source-123', 'source-123'] }));
  assert.throws(() => validateChatRequest({ ...chat, api_key: 'never-in-json' }));
  assert.throws(() => validateIpcInput('arbitrary-shell', {}));
});

test('session key validation exposes no key in error text and permits clearing', () => {
  assert.equal(validateSessionKey('sk-test-placeholder'), 'sk-test-placeholder');
  assert.equal(validateSessionKey(''), '');
  for (const key of ['bad key', 'bad\nkey', 'x'.repeat(1025), '\u2603']) {
    assert.throws(() => validateSessionKey(key), (error) => !error.message.includes(key));
  }
});
