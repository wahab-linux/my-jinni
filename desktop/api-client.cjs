'use strict';

const { validateBackendUrl, validateSessionKey, validateProvider, validateSessionKeySetting } = require('./validation.cjs');

class ApiClient {
  #sessionApiKeys = new Map();

  constructor({ baseUrl = 'http://127.0.0.1:8000', fetchImpl = globalThis.fetch,
    timeoutMs = 5000, chatTimeoutMs = 40000, maxResponseBytes = 4 * 1024 * 1024 } = {}) {
    this.baseUrl = validateBackendUrl(baseUrl);
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.chatTimeoutMs = chatTimeoutMs;
    this.maxResponseBytes = maxResponseBytes;
  }

  setSessionApiKey(value) {
    const setting = validateSessionKeySetting(value);
    const provider = typeof setting === 'string' ? 'openai' : setting.provider;
    const key = validateSessionKey(typeof setting === 'string' ? setting : setting.key);
    if (key) this.#sessionApiKeys.set(provider, key);
    else this.#sessionApiKeys.delete(provider);
    return this.getSessionSettings(provider);
  }

  clearSessionApiKey(provider = 'openai') {
    this.#sessionApiKeys.delete(validateProvider(provider));
    return this.getSessionSettings(provider);
  }

  clearAllSessionApiKeys() {
    this.#sessionApiKeys.clear();
    return { configured: false };
  }

  getSessionSettings(provider = 'openai') {
    return { configured: this.#sessionApiKeys.has(validateProvider(provider)) };
  }

  async request(path, { method = 'GET', json, body, headers = {}, timeoutMs } = {}) {
    const allowed = {
      GET: /^\/(?:health|openapi\.json|api\/v1\/(?:options|decision-scenarios(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?|sources(?:\/[a-zA-Z0-9_-]{1,100})?))$/,
      POST: /^\/api\/v1\/(?:recommendations|decisions\/evaluate|sources(?:\/upload)?|chat)$/,
      DELETE: /^\/api\/v1\/sources\/[a-zA-Z0-9_-]{1,100}$/,
    };
    if (!Object.hasOwn(allowed, method) || typeof path !== 'string' || !allowed[method].test(path)) {
      throw new Error('This local API operation is not supported.');
    }
    const provider = path === '/api/v1/chat'
      ? validateProvider(json && Object.hasOwn(json, 'provider') ? json.provider : 'openai')
      : null;
    const controller = new AbortController();
    const deadline = timeoutMs ?? (path === '/api/v1/chat' ? this.chatTimeoutMs : this.timeoutMs);
    if (!Number.isFinite(deadline) || deadline <= 0) throw new Error('The request deadline must be positive and finite.');
    const aborted = new Promise((resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('Request timed out.')), { once: true });
    });
    const timer = setTimeout(() => controller.abort(), deadline);
    let response;
    try {
      const requestHeaders = { Accept: 'application/json', ...headers };
      for (const header of Object.keys(requestHeaders)) {
        if (['x-openai-api-key', 'x-ai-api-key'].includes(header.toLowerCase())) delete requestHeaders[header];
      }
      if (provider && this.#sessionApiKeys.has(provider)) {
        requestHeaders['X-AI-API-Key'] = this.#sessionApiKeys.get(provider);
      }
      if (json !== undefined) requestHeaders['Content-Type'] = 'application/json';
      response = await Promise.race([this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: requestHeaders,
        body: json === undefined ? body : JSON.stringify(json),
        signal: controller.signal,
        redirect: 'error',
      }), aborted]);
      const length = response.headers.get('content-length');
      if (length && Number(length) > this.maxResponseBytes) {
        await response.body?.cancel();
        return { status: response.status, body: null, connectionError: 'The backend response exceeded the size limit.' };
      }
      const reader = response.body?.getReader();
      const chunks = [];
      let size = 0;
      if (reader) {
        try {
          while (true) {
            const { value, done } = await Promise.race([reader.read(), aborted]);
            if (done) break;
            size += value.length;
            if (size > this.maxResponseBytes) {
              await reader.cancel();
              return { status: response.status, body: null, connectionError: 'The backend response exceeded the size limit.' };
            }
            chunks.push(Buffer.from(value));
          }
        } finally {
          reader.releaseLock();
        }
      }
      try {
        return { status: response.status, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
      } catch {
        return { status: response.status, body: null, connectionError: 'The backend returned an unreadable response.' };
      }
    } catch {
      return {
        status: 0,
        body: null,
        connectionError: controller.signal.aborted
          ? 'The local backend request timed out. Please retry.'
          : 'Cannot connect to the local backend. Check its status and retry.',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { ApiClient };
