const test = require('node:test');
const assert = require('node:assert/strict');
const { ApiClient } = require('../../desktop/api-client.cjs');
const { CredentialStoreError } = require('../../desktop/credential-store.cjs');

test('persisted provider keys restore after memory clearing and only the selected key is sent', async () => {
  const records = {};
  const store = { load: () => ({ ...records }), set: (p, k) => { records[p] = k; }, delete: (p) => { delete records[p]; } };
  const first = new ApiClient({ credentialStore: store });
  first.setSessionApiKey({ provider: 'openai', key: 'fake-openai-key' });
  first.setSessionApiKey({ provider: 'deepseek', key: 'fake-deepseek-key' });
  first.clearAllSessionApiKeys();
  assert.deepEqual(first.getSessionSettings('deepseek'), { configured: false });
  let sent;
  const next = new ApiClient({ credentialStore: store, fetchImpl: async (_, options) => { sent = options; return Response.json({}); } });
  assert.deepEqual(next.getSessionSettings('deepseek'), { configured: true });
  await next.request('/api/v1/chat', { method: 'POST', json: { provider: 'deepseek' } });
  assert.equal(sent.headers['X-AI-API-Key'], 'fake-deepseek-key');
  assert.equal(sent.body.includes('fake-'), false);
  next.clearSessionApiKey('deepseek');
  const afterDelete = new ApiClient({ credentialStore: store });
  assert.deepEqual(afterDelete.getSessionSettings('deepseek'), { configured: false });
  assert.deepEqual(afterDelete.getSessionSettings('openai'), { configured: true });
});

test('failed persistent save does not configure the key or expose the underlying error', () => {
  const client = new ApiClient({ credentialStore: { load: () => ({}), set: () => { throw new Error('private-placeholder'); } } });
  assert.throws(() => client.setSessionApiKey({ provider: 'deepseek', key: 'fake-key' }), (error) => error instanceof CredentialStoreError && !error.message.includes('private-placeholder'));
  assert.deepEqual(client.getSessionSettings('deepseek'), { configured: false });
});

test('unreadable encrypted storage fails closed for AI while keyless operations still work', async () => {
  const client = new ApiClient({ credentialStore: { load: () => { throw new Error('private-placeholder'); } }, fetchImpl: async () => Response.json({ data: {} }) });
  assert.throws(() => client.getSessionSettings('deepseek'), CredentialStoreError);
  await assert.rejects(client.request('/api/v1/chat', { method: 'POST', json: { provider: 'deepseek' } }), CredentialStoreError);
  assert.equal((await client.request('/health')).status, 200);
});
