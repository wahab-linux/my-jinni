'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const PROVIDERS = new Set(['openai', 'deepseek', 'gemini', 'anthropic']);
const MAX_FILE_BYTES = 48 * 1024;
const MAX_CIPHERTEXT_BYTES = 8192;

class CredentialStoreError extends Error {
  constructor() {
    super('Saved API keys could not be accessed securely. Check system encryption and try again.');
    this.name = 'CredentialStoreError';
    this.code = 'CREDENTIAL_STORAGE_ERROR';
  }
}

function validKey(value) {
  return typeof value === 'string' && /^[\x21-\x7e]{1,1024}$/.test(value);
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

class CredentialStore {
  constructor({ filePath, safeStorage, platform = process.platform }) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new CredentialStoreError();
    this.filePath = filePath;
    this.safeStorage = safeStorage;
    this.platform = platform;
  }

  _available() {
    if (!this.safeStorage || !this.safeStorage.isEncryptionAvailable()) throw new CredentialStoreError();
    if (this.platform === 'linux' && (
      typeof this.safeStorage.getSelectedStorageBackend !== 'function'
      || this.safeStorage.getSelectedStorageBackend() === 'basic_text'
    )) throw new CredentialStoreError();
  }

  _read() {
    this._available();
    let stat;
    try {
      stat = fs.lstatSync(this.filePath);
    } catch (error) {
      if (error.code === 'ENOENT') return { entries: {}, keys: {} };
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) throw new CredentialStoreError();
    const descriptor = fs.openSync(this.filePath, 'r');
    const bytes = Buffer.alloc(MAX_FILE_BYTES + 1);
    let length = 0;
    try {
      while (length < bytes.length) {
        const count = fs.readSync(descriptor, bytes, length, bytes.length - length, null);
        if (!count) break;
        length += count;
      }
    } finally {
      fs.closeSync(descriptor);
    }
    if (length > MAX_FILE_BYTES) throw new CredentialStoreError();
    const data = JSON.parse(bytes.subarray(0, length).toString('utf8'));
    if (!object(data) || data.version !== 1 || Object.keys(data).length !== 2 || !object(data.entries)) {
      throw new CredentialStoreError();
    }
    const keys = {};
    for (const [provider, encoded] of Object.entries(data.entries)) {
      if (!PROVIDERS.has(provider) || typeof encoded !== 'string'
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
        || !encoded || encoded.length > Math.ceil(MAX_CIPHERTEXT_BYTES / 3) * 4) {
        throw new CredentialStoreError();
      }
      const ciphertext = Buffer.from(encoded, 'base64');
      if (!ciphertext.length || ciphertext.length > MAX_CIPHERTEXT_BYTES
        || ciphertext.toString('base64') !== encoded) throw new CredentialStoreError();
      const payload = JSON.parse(this.safeStorage.decryptString(ciphertext));
      if (!object(payload) || Object.keys(payload).length !== 2
        || payload.provider !== provider || !validKey(payload.key)) throw new CredentialStoreError();
      keys[provider] = payload.key;
    }
    return { entries: data.entries, keys };
  }

  load() {
    try {
      return this._read().keys;
    } catch {
      throw new CredentialStoreError();
    }
  }

  _write(entries) {
    const directory = path.dirname(this.filePath);
    const temporary = path.join(directory, `.${path.basename(this.filePath)}.${randomUUID()}.tmp`);
    let descriptor;
    let created = false;
    try {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      descriptor = fs.openSync(temporary, 'wx', 0o600);
      created = true;
      fs.writeFileSync(descriptor, JSON.stringify({ version: 1, entries }), 'utf8');
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporary, this.filePath);
    } finally {
      if (descriptor !== undefined) {
        try { fs.closeSync(descriptor); } catch { /* Preserve the original safe failure. */ }
      }
      if (created) {
        try { fs.unlinkSync(temporary); } catch { /* Only the owned temporary file is removed. */ }
      }
    }
  }

  set(provider, key) {
    try {
      if (!PROVIDERS.has(provider) || !validKey(key)) throw new CredentialStoreError();
      const { entries } = this._read();
      const encrypted = this.safeStorage.encryptString(JSON.stringify({ provider, key }));
      if (!Buffer.isBuffer(encrypted) || !encrypted.length || encrypted.length > MAX_CIPHERTEXT_BYTES) {
        throw new CredentialStoreError();
      }
      this._write({ ...entries, [provider]: encrypted.toString('base64') });
    } catch {
      throw new CredentialStoreError();
    }
  }

  delete(provider) {
    try {
      if (!PROVIDERS.has(provider)) throw new CredentialStoreError();
      const { entries } = this._read();
      if (!Object.hasOwn(entries, provider)) return;
      delete entries[provider];
      this._write(entries);
    } catch {
      throw new CredentialStoreError();
    }
  }
}

module.exports = { CredentialStore, CredentialStoreError };
