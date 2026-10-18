const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { BackendManager, resolveBackendCommand } = require('../../desktop/backend.cjs');

function readyResponse(route, { compatible = true } = {}) {
  return route === '/health'
    ? { status: 200, body: { data: { status: 'ok', recommendations_ready: true } } }
    : { status: 200, body: { info: { title: compatible ? 'my-jinni API' : 'Another service' } } };
}

function fakeChild() {
  return Object.assign(new EventEmitter(), { pid: 987654, exitCode: null });
}

test('an existing compatible backend is reused and never terminated', async () => {
  let spawned = 0;
  let terminated = 0;
  const manager = new BackendManager({
    apiClient: { request: async (route) => readyResponse(route) },
    spawnImpl: () => { spawned++; throw new Error('Must not spawn'); },
    terminateImpl: async () => { terminated++; },
  });
  assert.deepEqual(await manager.start(), { state: 'ready', message: 'Connected to the local Jinni backend.', owned: false });
  await manager.stop();
  assert.equal(spawned, 0);
  assert.equal(terminated, 0);
});

test('an occupied incompatible port is reported without spawning or killing anything', async () => {
  let spawned = 0;
  let terminated = 0;
  const manager = new BackendManager({
    apiClient: { request: async (route) => readyResponse(route, { compatible: false }) },
    spawnImpl: () => { spawned++; },
    terminateImpl: async () => { terminated++; },
  });
  assert.equal((await manager.start()).state, 'error');
  await manager.stop();
  assert.equal(spawned, 0);
  assert.equal(terminated, 0);
});

test('concurrent startup owns one child and shutdown terminates only that child', async () => {
  const child = fakeChild();
  let ready = false;
  let spawnOptions;
  let spawnArguments;
  let spawned = 0;
  const terminated = [];
  const manager = new BackendManager({
    baseUrl: 'http://127.0.0.1:8765', rootDir: process.cwd(), dataDir: '/isolated/test-data',
    apiClient: { request: async (route) => ready ? readyResponse(route) : { status: 0, body: null } },
    spawnImpl: (_command, args, options) => {
      spawned++; spawnArguments = args; spawnOptions = options; ready = true; return child;
    },
    terminateImpl: async (owned) => { terminated.push(owned); owned.exitCode = 0; owned.emit('exit', 0); },
  });
  const statuses = await Promise.all([manager.start(), manager.start(), manager.start()]);
  assert.ok(statuses.every((status) => status.state === 'ready' && status.owned));
  assert.equal(spawned, 1);
  assert.equal(spawnOptions.shell, false);
  assert.equal(spawnOptions.windowsHide, true);
  assert.equal(spawnOptions.env.MY_JINNI_DATA_DIR, '/isolated/test-data');
  assert.equal(Object.hasOwn(spawnOptions.env, 'OPENAI_API_KEY'), false);
  assert.equal(spawnArguments.includes('--reload'), false);
  assert.ok(spawnArguments.includes('8765'));
  await Promise.all([manager.stop(), manager.stop()]);
  assert.deepEqual(terminated, [child]);
  assert.equal(manager.getStatus().owned, false);
});

test('failed readiness cleans up its owned child and returns a safe retryable error', async () => {
  const child = fakeChild();
  let terminated = 0;
  const manager = new BackendManager({
    startupTimeoutMs: 5, pollIntervalMs: 1,
    apiClient: { request: async () => ({ status: 0, body: null }) },
    spawnImpl: () => child,
    terminateImpl: async () => { terminated++; child.exitCode = 1; child.emit('exit', 1); },
  });
  assert.equal((await manager.start()).state, 'error');
  assert.equal(terminated, 1);
  assert.equal(manager.getStatus().owned, false);
});

test('spawn failure does not expose private diagnostics and can be retried', async () => {
  let attempts = 0;
  const manager = new BackendManager({
    apiClient: { request: async () => ({ status: 0, body: null }) },
    spawnImpl: () => { attempts++; throw new Error('private-path-or-secret'); },
  });
  assert.equal((await manager.start()).state, 'error');
  assert.equal(JSON.stringify(manager.getStatus()).includes('private-path-or-secret'), false);
  await manager.retry();
  assert.equal(attempts, 2);
});

test('closing while the initial probe is pending never starts a late child', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let spawned = 0;
  const manager = new BackendManager({
    apiClient: { request: async () => { await gate; return { status: 0, body: null }; } },
    spawnImpl: () => { spawned++; return fakeChild(); },
  });
  const starting = manager.start();
  const stopping = manager.stop();
  release();
  await Promise.all([starting, stopping]);
  assert.equal(spawned, 0);
  assert.equal(manager.getStatus().owned, false);
});

test('an unexpected owned-child exit changes status and retry starts a fresh child', async () => {
  let ready = false;
  const children = [];
  const manager = new BackendManager({
    apiClient: { request: async (route) => ready ? readyResponse(route) : { status: 0, body: null } },
    spawnImpl: () => { const child = fakeChild(); children.push(child); ready = true; return child; },
    terminateImpl: async (child) => { child.exitCode = 0; child.emit('exit', 0); },
  });
  assert.equal((await manager.start()).state, 'ready');
  ready = false;
  children[0].exitCode = 1;
  children[0].emit('exit', 1);
  assert.equal(manager.getStatus().state, 'error');
  assert.equal((await manager.retry()).owned, true);
  assert.equal(children.length, 2);
  await manager.stop();
});

test('portable backend commands use the project interpreter or uv without a shell/reload', () => {
  const root = path.resolve('portable-project');
  const local = resolveBackendCommand(root, { platform: 'win32', existsSync: () => true, port: '8765' });
  assert.equal(local.command, path.join(root, '.venv', 'Scripts', 'python.exe'));
  assert.ok(local.args.includes('8765'));
  assert.equal(local.args.includes('--reload'), false);
  const fallback = resolveBackendCommand(root, { existsSync: () => false });
  assert.equal(fallback.command, 'uv');
  assert.deepEqual(fallback.args.slice(0, 3), ['run', '--no-sync', 'python']);
});
