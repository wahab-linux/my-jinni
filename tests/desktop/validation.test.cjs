const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateBackendUrl, validatePreferences, validateTextSource, validateChatRequest,
  validateSourceId, validateImportOptions, validateSessionKey, validateIpcInput,
  validateProvider, validateSessionKeySetting,
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

test('provider allowlist is fixed and chat remains compatible with omitted provider/model', () => {
  const legacy = { question: 'Opening hours?', source_ids: ['source-1'] };
  assert.deepEqual(validateChatRequest(legacy), legacy);
  for (const provider of ['openai', 'deepseek', 'gemini', 'anthropic']) {
    assert.equal(validateProvider(provider), provider);
    const chat = { ...legacy, provider, model: 'editable-model:1' };
    assert.deepEqual(validateChatRequest(chat), chat);
  }
  for (const provider of [null, undefined, '', 'unknown', 'https://example.com', 1, {}]) {
    assert.throws(() => validateProvider(provider));
    assert.throws(() => validateChatRequest({ ...legacy, provider }));
  }
  for (const model of [null, undefined, '', 'name with spaces', 'x'.repeat(101)]) {
    assert.throws(() => validateChatRequest({ ...legacy, model }));
  }
  assert.throws(() => validateChatRequest({ ...legacy, provider: 'deepseek', base_url: 'https://example.com' }));
});

test('session IPC accepts provider-key objects and preserves legacy OpenAI-only inputs', () => {
  assert.equal(validateIpcInput('setSessionApiKey', 'legacy-openai-key'), 'legacy-openai-key');
  assert.equal(validateSessionKeySetting(''), '');
  for (const provider of ['openai', 'deepseek', 'gemini', 'anthropic']) {
    const value = { provider, key: 'provider-test-key' };
    assert.deepEqual(validateSessionKeySetting(value), value);
    assert.deepEqual(validateIpcInput('setSessionApiKey', value), value);
    assert.equal(validateIpcInput('getSessionSettings', provider), provider);
    assert.equal(validateIpcInput('clearSessionApiKey', provider), provider);
  }
  assert.equal(validateIpcInput('getSessionSettings'), undefined);
  assert.equal(validateIpcInput('clearSessionApiKey'), undefined);
  for (const input of [{ provider: 'unknown', key: 'secret' }, { provider: 'deepseek', key: 'bad key' }, { provider: 'deepseek' }, { provider: 'openai', key: 'x', base_url: 'https://example.com' }, null]) {
    assert.throws(() => validateIpcInput('setSessionApiKey', input));
  }
  assert.throws(() => validateIpcInput('getSessionSettings', null));
  assert.throws(() => validateIpcInput('clearSessionApiKey', {}));
  assert.throws(() => validateIpcInput('clearAllSessionApiKeys'));
});

test('ADC bridge settings allow only project and location, with no token, credential file or URLs', () => {
  const vertex={project_id:'my-trial-project',location:'europe-west2'};
  const value={provider:'vertex',model:'gemini-test',vertex,question:'Explain',source_ids:[],decision_request:{scenario_id:'travel'}};
  assert.deepEqual(validateChatRequest(value),value);
  assert.deepEqual(validateIpcInput('checkVertexAdc',vertex),vertex);
  assert.deepEqual(validateIpcInput('checkVertexAdc',{project_id:'my-trial-project'}),{project_id:'my-trial-project',location:'global'});
  for(const changed of [{...vertex,token:'secret'},{...vertex,credential_file:'/private.json'},{...vertex,location:'global.evil.example'},{...vertex,project_id:'../private'}]) assert.throws(()=>validateIpcInput('checkVertexAdc',changed));
  assert.throws(()=>validateChatRequest({...value,vertex:undefined}));
  assert.throws(()=>validateChatRequest({...value,provider:'openai'}));
});

test('option suggestions preserve evidence, provider and exact comparison while rejecting unknown intents', () => {
  const request = { question: 'Find a low cost journey', source_ids: ['selected-source'], provider: 'deepseek', model: 'deepseek-flash', decision_request: { scenario_id: 'travel', constraints: [{ criterion_id: 'cost-pence', operator: 'lte', value: 800 }] } };
  for (const intent of ['answer', 'options']) {
    const value = { ...request, intent };
    assert.deepEqual(validateIpcInput('askQuestion', value), value);
  }
  assert.deepEqual(validateChatRequest(request), request);
  for (const intent of [null, undefined, '', 'execute', 'OPTIONS', {}, 1]) {
    assert.throws(() => validateChatRequest({ ...request, intent }));
  }
  assert.throws(() => validateChatRequest({ ...request, intent: 'options', api_key: 'must-not-enter-json' }));
  assert.throws(() => validateChatRequest({ question: 'Find choices', source_ids: [], intent: 'options' }));
});
