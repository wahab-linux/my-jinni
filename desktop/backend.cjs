'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ApiClient } = require('./api-client.cjs');
const { validateBackendUrl } = require('./validation.cjs');

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function resolveBackendCommand(rootDir, { platform = process.platform, existsSync = fs.existsSync,
  host = '127.0.0.1', port = '8000' } = {}) {
  const interpreter = path.join(rootDir, '.venv', platform === 'win32' ? 'Scripts' : 'bin',
    platform === 'win32' ? 'python.exe' : 'python');
  const serverArgs = ['-m', 'uvicorn', 'app.main:app', '--host', host, '--port', String(port),
    '--no-access-log', '--log-level', 'error'];
  return existsSync(interpreter)
    ? { command: interpreter, args: serverArgs }
    : { command: 'uv', args: ['run', '--no-sync', 'python', ...serverArgs] };
}

async function waitForExit(child, timeoutMs) {
  if ((child.exitCode !== null && child.exitCode !== undefined) || child.signalCode) return true;
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); resolve(true); };
    const timer = setTimeout(() => { child.off('exit', done); resolve(false); }, timeoutMs);
    child.once('exit', done);
  });
}

async function terminateOwnedProcess(child, platform = process.platform) {
  if (!child || !Number.isInteger(child.pid) || child.pid <= 0
      || (child.exitCode !== null && child.exitCode !== undefined) || child.signalCode) return;
  if (platform === 'win32') {
    await new Promise((resolve) => {
      let killer;
      const done = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { killer?.kill(); resolve(); }, 3000);
      try {
        killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          shell: false, windowsHide: true, stdio: 'ignore',
        });
        killer.once('exit', done);
        killer.once('error', done);
      } catch {
        done();
      }
    });
    if (!await waitForExit(child, 1000)) child.kill('SIGKILL');
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
    if (!await waitForExit(child, 2000)) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }
  }
  await waitForExit(child, 1000);
}

class BackendManager {
  constructor({ baseUrl = 'http://127.0.0.1:8000', rootDir = path.resolve(__dirname, '..'),
    dataDir, spawnImpl = spawn, apiClient, startupTimeoutMs = 20000, pollIntervalMs = 200,
    platform = process.platform, terminateImpl } = {}) {
    this.baseUrl = validateBackendUrl(baseUrl);
    this.rootDir = path.resolve(rootDir);
    this.dataDir = dataDir;
    this.spawnImpl = spawnImpl;
    this.apiClient = apiClient ?? new ApiClient({ baseUrl: this.baseUrl });
    this.startupTimeoutMs = startupTimeoutMs;
    this.pollIntervalMs = pollIntervalMs;
    this.platform = platform;
    this.terminateImpl = terminateImpl ?? ((child) => terminateOwnedProcess(child, platform));
    this.child = null;
    this.state = 'starting';
    this.message = 'Starting the local backend...';
    this._startPromise = null;
    this._stopPromise = null;
    this._stopping = false;
    this._childExited = false;
  }

  getStatus() {
    return { state: this.state, message: this.message, owned: this.child !== null };
  }

  async _probe() {
    const health = await this.apiClient.request('/health', { timeoutMs: 1000 });
    if (health.status === 0) return 'absent';
    if (health.status !== 200 || health.body?.data?.status !== 'ok'
        || health.body?.data?.recommendations_ready !== true) return 'occupied';
    const schema = await this.apiClient.request('/openapi.json', { timeoutMs: 1000 });
    return schema.status === 200 && schema.body?.info?.title === 'my-jinni API'
      ? 'ready' : 'occupied';
  }

  start() {
    if (this._startPromise) return this._startPromise;
    if (this.state === 'ready') return Promise.resolve(this.getStatus());
    this._stopping = false;
    this._startPromise = this._start().catch(async () => {
      await this._stopChild();
      this.state = 'error';
      this.message = 'The backend could not start. Run uv sync in the project folder, then retry.';
      return this.getStatus();
    }).finally(() => { this._startPromise = null; });
    return this._startPromise;
  }

  async _start() {
    this.state = 'starting';
    this.message = 'Starting the local backend...';
    const existing = await this._probe();
    if (this._stopping) return this.getStatus();
    if (existing === 'ready') {
      this.state = 'ready';
      this.message = 'Connected to the local Jinni backend.';
      return this.getStatus();
    }
    if (existing === 'occupied') {
      this.state = 'error';
      this.message = 'This local port belongs to another or incompatible service. Close it or choose another backend port.';
      return this.getStatus();
    }
    if (!this.child) {
      const url = new URL(this.baseUrl);
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const command = resolveBackendCommand(this.rootDir, { platform: this.platform,
        host, port: url.port || '80' });
      const environment = { ...process.env, PYTHONUTF8: '1', PYTHONUNBUFFERED: '1' };
      if (this.dataDir) environment.MY_JINNI_DATA_DIR = this.dataDir;
      delete environment.OPENAI_API_KEY;
      this._childExited = false;
      this.child = this.spawnImpl(command.command, command.args, {
        cwd: this.rootDir, env: environment, shell: false, windowsHide: true,
        detached: this.platform !== 'win32', stdio: ['ignore', 'ignore', 'ignore'],
      });
      const ownedChild = this.child;
      const exited = () => {
        if (this.child !== ownedChild) return;
        this._childExited = true;
        this.child = null;
        if (!this._stopping && this.state === 'ready') {
          this.state = 'error';
          this.message = 'The local backend stopped. Retry to start it again.';
        }
      };
      ownedChild.once('error', exited);
      ownedChild.once('exit', exited);
    }
    const deadline = Date.now() + this.startupTimeoutMs;
    while (!this._stopping && !this._childExited && Date.now() < deadline) {
      const state = await this._probe();
      if (state === 'ready') {
        this.state = 'ready';
        this.message = 'The local Jinni backend is ready.';
        return this.getStatus();
      }
      if (state === 'occupied') break;
      await pause(this.pollIntervalMs);
    }
    await this._stopChild();
    this.state = 'error';
    this.message = this._stopping ? 'The local backend has stopped.'
      : 'The backend did not become ready. Run uv sync and check that the local port is available, then retry.';
    return this.getStatus();
  }

  async retry() {
    if (this._startPromise) return this._startPromise;
    this.state = 'starting';
    return this.start();
  }

  async _stopChild() {
    const child = this.child;
    if (!child) return;
    await this.terminateImpl(child);
    if (this.child === child) this.child = null;
  }

  stop() {
    if (this._stopPromise) return this._stopPromise;
    this._stopping = true;
    this._stopPromise = (async () => {
      await this._stopChild();
      if (this._startPromise) await this._startPromise;
      this.state = 'error';
      this.message = 'The local backend has stopped.';
    })().finally(() => { this._stopPromise = null; });
    return this._stopPromise;
  }
}

module.exports = { BackendManager, resolveBackendCommand, terminateOwnedProcess };
