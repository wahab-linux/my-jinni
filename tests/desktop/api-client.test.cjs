const test = require('node:test');
const assert = require('node:assert/strict');
const { ApiClient } = require('../../desktop/api-client.cjs');

for (const status of [200, 201, 401, 413, 422, 429, 502, 503, 504]) {
  test(`HTTP ${status} and its JSON envelope survive the bridge client`, async () => {
    const body = status < 400
      ? { data: { status: 'test-result' }, error: null, warnings: [] }
      : { data: null, error: { code: 'TEST_ERROR', message: 'Safe error', details: [] }, warnings: [] };
    const client = new ApiClient({ fetchImpl: async () => Response.json(body, { status }) });
    assert.deepEqual(await client.request('/api/v1/options'), { status, body });
  });
}

test('key header stays outside chat JSON and redirects are disallowed', async () => {
  let observed;
  const client = new ApiClient({
    baseUrl: 'http://127.0.0.1:8765',
    fetchImpl: async (url, options) => {
      observed = { url, ...options };
      return Response.json({ data: {}, error: null, warnings: [] });
    },
  });
  const key = 'sk-test-placeholder';
  client.setSessionApiKey(key);
  await client.request('/api/v1/chat', {
    method: 'POST', json: { question: 'Test', source_ids: ['one'] },
    headers: { 'X-OpenAI-API-Key': 'untrusted-legacy-key', 'x-ai-api-key': 'untrusted-generic-key' },
  });
  assert.equal(observed.url, 'http://127.0.0.1:8765/api/v1/chat');
  assert.equal(observed.headers['X-AI-API-Key'], key);
  assert.equal(Object.keys(observed.headers).some((header) => header.toLowerCase() === 'x-openai-api-key'), false);
  assert.equal(observed.body.includes(key), false);
  assert.equal(observed.redirect, 'error');
});

test('session settings reveal only a boolean and the key is sent only for chat', async () => {
  const requests = [];
  const client = new ApiClient({ fetchImpl: async (_url, options) => {
    requests.push(options);
    return Response.json({ data: {}, error: null, warnings: [] });
  } });
  assert.deepEqual(client.getSessionSettings(), { configured: false });
  assert.deepEqual(client.setSessionApiKey('sk-only-for-chat'), { configured: true });
  assert.equal(JSON.stringify(client).includes('sk-only-for-chat'), false);
  await client.request('/api/v1/options', { headers: { 'x-openai-api-key': 'manual-key', 'X-AI-API-Key': 'other-manual-key' } });
  await client.request('/api/v1/chat', { method: 'POST', json: {} });
  assert.equal(Object.keys(requests[0].headers).some((key) => ['x-openai-api-key', 'x-ai-api-key'].includes(key.toLowerCase())), false);
  assert.equal(requests[1].headers['X-AI-API-Key'], 'sk-only-for-chat');
  assert.deepEqual(client.clearSessionApiKey(), { configured: false });
  await client.request('/api/v1/chat', { method: 'POST', json: {} });
  assert.equal(Object.hasOwn(requests[2].headers, 'X-AI-API-Key'), false);
});

test('provider session keys are isolated and never returned or persisted in enumerable state', async () => {
  const requests = [];
  const client = new ApiClient({ fetchImpl: async (_url, options) => {
    requests.push(options);
    return Response.json({ data: {}, error: null, warnings: [] });
  } });
  const providers = ['openai', 'deepseek', 'gemini', 'anthropic'];
  for (const provider of providers) {
    assert.deepEqual(client.getSessionSettings(provider), { configured: false });
    assert.deepEqual(client.setSessionApiKey({ provider, key: `test-key-for-${provider}` }), { configured: true });
  }
  for (const provider of providers) {
    await client.request('/api/v1/chat', { method: 'POST', json: { provider } });
    assert.equal(requests.at(-1).headers['X-AI-API-Key'], `test-key-for-${provider}`);
    assert.equal(Object.hasOwn(requests.at(-1).headers, 'X-OpenAI-API-Key'), false);
    assert.equal(requests.at(-1).body.includes('test-key-for-'), false);
    assert.deepEqual(client.getSessionSettings(provider), { configured: true });
    assert.equal(JSON.stringify(client).includes(`test-key-for-${provider}`), false);
  }
});

test('clearing one provider preserves other keys and clearing all removes every key', async () => {
  const requests = [];
  const client = new ApiClient({ fetchImpl: async (_url, options) => {
    requests.push(options);
    return Response.json({ data: {}, error: null, warnings: [] });
  } });
  client.setSessionApiKey('legacy-openai-only');
  client.setSessionApiKey({ provider: 'deepseek', key: 'deepseek-only' });
  assert.deepEqual(client.clearSessionApiKey('deepseek'), { configured: false });
  assert.deepEqual(client.getSessionSettings(), { configured: true });
  await client.request('/api/v1/chat', { method: 'POST', json: { provider: 'deepseek' }, headers: { 'X-AI-API-Key': 'manual', 'X-OpenAI-API-Key': 'manual' } });
  assert.equal(Object.keys(requests.at(-1).headers).some((header) => ['x-ai-api-key', 'x-openai-api-key'].includes(header.toLowerCase())), false);
  await client.request('/api/v1/chat', { method: 'POST', json: {} });
  assert.equal(requests.at(-1).headers['X-AI-API-Key'], 'legacy-openai-only');
  client.setSessionApiKey({ provider: 'deepseek', key: 'deepseek-again' });
  assert.deepEqual(client.clearAllSessionApiKeys(), { configured: false });
  for (const provider of ['openai', 'deepseek', 'gemini', 'anthropic']) {
    assert.deepEqual(client.getSessionSettings(provider), { configured: false });
    await client.request('/api/v1/chat', { method: 'POST', json: { provider } });
    assert.equal(Object.hasOwn(requests.at(-1).headers, 'X-AI-API-Key'), false);
  }
});

test('legacy setter and omitted provider never authenticate a different provider', async () => {
  const requests = [];
  const client = new ApiClient({ fetchImpl: async (_url, options) => {
    requests.push(options);
    return Response.json({ data: {}, error: null, warnings: [] });
  } });
  client.setSessionApiKey('only-openai');
  await client.request('/api/v1/chat', { method: 'POST', json: { provider: 'deepseek' } });
  assert.equal(Object.hasOwn(requests[0].headers, 'X-AI-API-Key'), false);
  await client.request('/api/v1/chat', { method: 'POST', json: {} });
  assert.equal(requests[1].headers['X-AI-API-Key'], 'only-openai');
  client.setSessionApiKey({ provider: 'deepseek', key: 'only-deepseek' });
  assert.deepEqual(client.setSessionApiKey(''), { configured: false });
  assert.deepEqual(client.getSessionSettings('deepseek'), { configured: true });
});

test('invalid providers fail safely before fetch without sharing an available key', async () => {
  let requests = 0;
  const client = new ApiClient({ fetchImpl: async () => { requests++; return Response.json({}); } });
  client.setSessionApiKey('private-placeholder');
  for (const provider of [null, '', 'unknown', 'https://example.com', {}, 123]) {
    assert.throws(() => client.setSessionApiKey({ provider, key: 'test-key' }));
    assert.throws(() => client.clearSessionApiKey(provider));
    assert.throws(() => client.getSessionSettings(provider));
    await assert.rejects(client.request('/api/v1/chat', { method: 'POST', json: { provider } }));
  }
  assert.equal(requests, 0);
  assert.deepEqual(client.getSessionSettings(), { configured: true });
});

test('all non-chat operations strip both credential header aliases', async () => {
  const requests = [];
  const client = new ApiClient({ fetchImpl: async (_url, options) => {
    requests.push(options);
    return Response.json({ data: {}, error: null, warnings: [] });
  } });
  client.setSessionApiKey('private-openai-placeholder');
  client.setSessionApiKey({ provider: 'deepseek', key: 'private-deepseek-placeholder' });
  for (const [path, method] of [['/health', 'GET'], ['/api/v1/sources', 'GET'], ['/api/v1/recommendations', 'POST'], ['/api/v1/sources/source-1', 'DELETE']]) {
    await client.request(path, { method, headers: { 'X-AI-API-Key': 'manual', 'x-OPENAI-api-key': 'manual' } });
    assert.equal(Object.keys(requests.at(-1).headers).some((header) => ['x-ai-api-key', 'x-openai-api-key'].includes(header.toLowerCase())), false);
  }
});

test('arbitrary URLs, paths and HTTP operations never reach fetch', async () => {
  let calls = 0;
  const client = new ApiClient({ fetchImpl: async () => { calls++; return Response.json({}); } });
  for (const path of ['https://example.com', '//example.com', '/../private', '/__test__/anything']) {
    await assert.rejects(client.request(path));
  }
  await assert.rejects(client.request('/api/v1/options', { method: 'PUT' }));
  assert.equal(calls, 0);
});

test('network errors are safe connection failures without fabricated successful bodies', async () => {
  const secret = 'private-header-value';
  const client = new ApiClient({ fetchImpl: async () => { throw new Error(secret); } });
  const result = await client.request('/api/v1/options');
  assert.equal(result.status, 0);
  assert.equal(result.body, null);
  assert.ok(result.connectionError);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('request deadline aborts a stalled fetch and reports a retryable timeout', async () => {
  const client = new ApiClient({
    timeoutMs: 5,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }),
  });
  const result = await client.request('/api/v1/options');
  assert.equal(result.status, 0);
  assert.match(result.connectionError, /timed out/i);
});

test('wall-clock deadline also bounds transports and body readers that ignore abort', async () => {
  const stalledFetch = new ApiClient({ timeoutMs: 5, fetchImpl: () => new Promise(() => {}) });
  assert.equal((await stalledFetch.request('/api/v1/options')).status, 0);
  const stalledBody = new ApiClient({
    timeoutMs: 5,
    fetchImpl: async () => new Response(new ReadableStream({ start() {} })),
  });
  assert.equal((await stalledBody.request('/api/v1/options')).status, 0);
});

test('invalid JSON and oversized response bytes are rejected with status preserved', async () => {
  const unreadable = new ApiClient({ fetchImpl: async () => new Response('<html>', { status: 502 }) });
  const bad = await unreadable.request('/api/v1/options');
  assert.equal(bad.status, 502);
  assert.equal(bad.body, null);
  const large = new ApiClient({ maxResponseBytes: 10, fetchImpl: async () => new Response('x'.repeat(100)) });
  assert.equal((await large.request('/api/v1/options')).body, null);
});
