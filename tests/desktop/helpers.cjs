const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const SCREENSHOTS = path.join(ROOT, 'tmp/desktop');
const TEST_KEY = 'sk-desktop-test-placeholder';

function tempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'my-jinni-desktop-'));
}

function pythonExecutable() {
  const filename = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
  const executable = path.join(ROOT, '.venv', filename);
  if (!fs.existsSync(executable)) throw new Error('Run uv sync before desktop tests.');
  return executable;
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitUntil(check, { timeout = 15000, message = 'Timed out waiting for application.' } = {}) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(lastError ? `${message} ${lastError.message}` : message);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await exited;
  }
}

async function startMockBackend({ directory = tempDirectory(), port } = {}) {
  const selectedPort = port || await freePort();
  const baseUrl = `http://127.0.0.1:${selectedPort}`;
  const child = spawn(
    pythonExecutable(),
    ['-c', "import runpy;runpy.run_path('tests/desktop/mock_backend.py',run_name='__main__')", '--port', String(selectedPort)],
    {
      cwd: ROOT,
      env: { ...process.env, OPENAI_API_KEY: '', MY_JINNI_DATA_DIR: directory },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  let diagnostic = '';
  child.stderr.on('data', (chunk) => { diagnostic += chunk.toString().slice(0, 2000); });
  try {
    await waitUntil(async () => {
      if (child.exitCode !== null) throw new Error(`Test backend exited. ${diagnostic}`);
      return (await fetch(`${baseUrl}/health`)).ok;
    }, { message: 'Test backend did not start.' });
  } catch (error) {
    await stopProcess(child);
    throw error;
  }
  return { baseUrl, directory, child, stop: () => stopProcess(child) };
}

async function launchDesktop(electron, baseUrl, directory) {
  const env = { ...process.env, OPENAI_API_KEY: '', MY_JINNI_DATA_DIR: directory, MY_JINNI_BACKEND_URL: baseUrl };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({
    args: [path.join(ROOT, 'desktop/main.cjs'), '--disable-gpu'],
    cwd: ROOT,
    env,
    timeout: 30000,
  });
  try {
    const page = await application.firstWindow();
    page.setDefaultTimeout(15000);
    return { application, page };
  } catch (error) {
    await application.close().catch(() => {});
    throw error;
  }
}

async function screenshot(page, name) {
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOTS, name), fullPage: true });
}

module.exports = {
  ROOT, SCREENSHOTS, TEST_KEY, tempDirectory, pythonExecutable, freePort,
  waitUntil, stopProcess, startMockBackend, launchDesktop, screenshot,
};
