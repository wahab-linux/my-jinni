'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CredentialStore, CredentialStoreError } = require('../../desktop/credential-store.cjs');

const KEY_ONE = 'fake-provider-one-never-a-real-key';
const KEY_TWO = 'fake-provider-two-never-a-real-key';

function fixture(t, overrides = {}, platform = 'win32') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jinni-credential-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'jinni-credentials.json');
  const encryptionKey = crypto.randomBytes(32);
  const safeStorage = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString(value) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    },
    decryptString(value) {
      const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
    },
    ...overrides,
  };
  return { directory, filePath, safeStorage, store: new CredentialStore({ filePath, safeStorage, platform }) };
}

function safeFailure(action, filePath) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof CredentialStoreError);
    assert.equal(error.code, 'CREDENTIAL_STORAGE_ERROR');
    for (const secret of [KEY_ONE, KEY_TWO, filePath]) assert.ok(!error.message.includes(secret));
    assert.equal(error.cause, undefined);
    return true;
  });
}

test('encrypted keys survive a new store instance without plaintext on disk', (t) => {
  const { store, filePath, safeStorage } = fixture(t);
  assert.deepEqual(store.load(), {});
  store.set('openai', KEY_ONE);
  store.set('deepseek', KEY_TWO);
  const bytes = fs.readFileSync(filePath, 'utf8');
  assert.ok(!bytes.includes(KEY_ONE));
  assert.ok(!bytes.includes(KEY_TWO));
  assert.deepEqual(Object.keys(JSON.parse(bytes)), ['version', 'entries']);
  assert.deepEqual(new CredentialStore({ filePath, safeStorage }).load(), { openai: KEY_ONE, deepseek: KEY_TWO });
});

test('provider updates and deletion preserve other ciphertext and keys', (t) => {
  const { store, filePath } = fixture(t);
  for (const provider of ['openai', 'deepseek', 'gemini', 'anthropic']) store.set(provider, KEY_ONE);
  const oldCiphertext = JSON.parse(fs.readFileSync(filePath, 'utf8')).entries.openai;
  store.set('deepseek', KEY_TWO);
  assert.equal(JSON.parse(fs.readFileSync(filePath, 'utf8')).entries.openai, oldCiphertext);
  store.delete('deepseek');
  assert.deepEqual(store.load(), { openai: KEY_ONE, gemini: KEY_ONE, anthropic: KEY_ONE });
  store.delete('deepseek');
  assert.equal(store.load().openai, KEY_ONE);
});

test('provider identity is authenticated inside ciphertext and swapping entries fails closed', (t) => {
  const { store, filePath } = fixture(t);
  store.set('openai', KEY_ONE);
  store.set('deepseek', KEY_TWO);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  [data.entries.openai, data.entries.deepseek] = [data.entries.deepseek, data.entries.openai];
  const swapped = JSON.stringify(data);
  fs.writeFileSync(filePath, swapped);
  safeFailure(() => store.load(), filePath);
  safeFailure(() => store.set('gemini', KEY_ONE), filePath);
  assert.equal(fs.readFileSync(filePath, 'utf8'), swapped);
});

test('unavailable system encryption rejects every operation without a file', (t) => {
  const { store, filePath } = fixture(t, { isEncryptionAvailable: () => false });
  for (const operation of [() => store.load(), () => store.set('openai', KEY_ONE), () => store.delete('openai')]) safeFailure(operation, filePath);
  assert.equal(fs.existsSync(filePath), false);
});

test('Linux basic_text never permits plaintext fallback', (t) => {
  const { store, filePath } = fixture(t, { getSelectedStorageBackend: () => 'basic_text' }, 'linux');
  safeFailure(() => store.set('openai', KEY_ONE), filePath);
  assert.equal(fs.existsSync(filePath), false);
});

test('unsupported provider IDs and malformed keys never persist', (t) => {
  const { store, filePath } = fixture(t);
  for (const provider of ['vertex', '__proto__', 'constructor', 'unknown']) safeFailure(() => store.set(provider, KEY_ONE), filePath);
  for (const key of ['', 'contains space', 'line\nbreak', 'x'.repeat(1025), null]) safeFailure(() => store.set('openai', key), filePath);
  assert.equal(fs.existsSync(filePath), false);
});

test('corrupt or unsupported files fail closed and remain unchanged', (t) => {
  const { store, filePath } = fixture(t);
  for (const text of [
    '{broken',
    JSON.stringify({ version: 2, entries: {} }),
    JSON.stringify({ version: 1, entries: {}, extra: true }),
    JSON.stringify({ version: 1, entries: { vertex: 'AAAA' } }),
    JSON.stringify({ version: 1, entries: { openai: 'bad base64!' } }),
    JSON.stringify({ version: 1, entries: { openai: 'AAAA' } }),
    'x'.repeat(49 * 1024),
  ]) {
    fs.writeFileSync(filePath, text);
    safeFailure(() => store.load(), filePath);
    safeFailure(() => store.set('deepseek', KEY_TWO), filePath);
    safeFailure(() => store.delete('openai'), filePath);
    assert.equal(fs.readFileSync(filePath, 'utf8'), text);
  }
});

test('decrypt failure cannot silently erase saved providers', (t) => {
  const setup = fixture(t);
  setup.store.set('openai', KEY_ONE);
  const original = fs.readFileSync(setup.filePath);
  setup.safeStorage.decryptString = () => { throw new Error(KEY_ONE + setup.filePath); };
  safeFailure(() => setup.store.set('deepseek', KEY_TWO), setup.filePath);
  safeFailure(() => setup.store.delete('openai'), setup.filePath);
  assert.deepEqual(fs.readFileSync(setup.filePath), original);
});

test('atomic rename failure preserves old file and removes only temporary bytes', (t) => {
  const { store, filePath, directory } = fixture(t);
  store.set('openai', KEY_ONE);
  const original = fs.readFileSync(filePath);
  const rename = fs.renameSync;
  fs.renameSync = () => { throw new Error('private path ' + filePath); };
  try {
    safeFailure(() => store.set('deepseek', KEY_TWO), filePath);
  } finally {
    fs.renameSync = rename;
  }
  assert.deepEqual(fs.readFileSync(filePath), original);
  assert.deepEqual(fs.readdirSync(directory), ['jinni-credentials.json']);
  assert.deepEqual(store.load(), { openai: KEY_ONE });
});

test('invalid decrypted contents fail safely and restrictive modes apply where supported', (t) => {
  const { store, safeStorage, filePath } = fixture(t);
  store.set('openai', KEY_ONE);
  safeStorage.decryptString = () => 'not a valid key';
  safeFailure(() => store.load(), filePath);
  if (process.platform !== 'win32') assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
});

test('encryption and partial-write failures preserve prior file without plaintext or temporary residue', (t) => {
  const { store, safeStorage, filePath, directory } = fixture(t);
  store.set('openai', KEY_ONE);
  const original = fs.readFileSync(filePath);
  const encrypt = safeStorage.encryptString;
  safeStorage.encryptString = () => { throw new Error(KEY_TWO + filePath); };
  safeFailure(() => store.set('deepseek', KEY_TWO), filePath);
  assert.deepEqual(fs.readFileSync(filePath), original);
  safeStorage.encryptString = encrypt;
  const write = fs.writeFileSync;
  fs.writeFileSync = () => { throw new Error(KEY_TWO + filePath); };
  try {
    safeFailure(() => store.set('deepseek', KEY_TWO), filePath);
  } finally {
    fs.writeFileSync = write;
  }
  assert.deepEqual(fs.readFileSync(filePath), original);
  assert.deepEqual(fs.readdirSync(directory), ['jinni-credentials.json']);
});
