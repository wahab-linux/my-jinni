'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { open } = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const { ApiClient } = require('./api-client.cjs');
const { BackendManager } = require('./backend.cjs');
const { ValidationError, validateBackendUrl, validateIpcInput } = require('./validation.cjs');

const ROOT_DIR = path.resolve(__dirname, '..');
const RENDERER_PATH = path.join(__dirname, 'renderer', 'index.html');
const RENDERER_URL = pathToFileURL(RENDERER_PATH).href;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
let mainWindow = null;
let backend = null;
let api = null;
let configurationError = null;
let quitting = false;

app.setName('my-jinni');
if (process.env.MY_JINNI_DATA_DIR) {
  const userData = path.join(path.resolve(process.env.MY_JINNI_DATA_DIR), 'desktop');
  fs.mkdirSync(userData, { recursive: true });
  app.setPath('userData', userData);
}

function localError(status, code, message) {
  return { status, body: { data: null, error: { code, message, details: [] }, warnings: [] } };
}

function backendStatus() {
  return configurationError
    ? { state: 'error', message: configurationError, owned: false }
    : backend.getStatus();
}

async function ready() {
  if (configurationError) return false;
  return (await backend.start()).state === 'ready';
}

async function request(pathname, options) {
  if (!await ready()) {
    return { status: 0, body: null, connectionError: backendStatus().message };
  }
  const result = await api.request(pathname, options);
  if (result.status === 0) {
    backend.state = 'error';
    backend.message = 'The local backend could not be reached. Retry the backend connection.';
  }
  return result;
}

async function importSource(options) {
  if (!await ready()) {
    return { status: 0, body: null, connectionError: backendStatus().message };
  }
  const selection = await dialog.showOpenDialog(mainWindow, {
    title: 'Import a source',
    properties: ['openFile'],
    filters: [{ name: 'Text, Markdown and PDF documents', extensions: ['txt', 'md', 'pdf'] }],
  });
  if (selection.canceled || selection.filePaths.length !== 1) {
    return { status: 0, body: null, cancelled: true };
  }
  const selectedPath = selection.filePaths[0];
  const filename = path.basename(selectedPath);
  if (!['.txt', '.md', '.pdf'].includes(path.extname(filename).toLowerCase())) {
    return localError(415, 'UNSUPPORTED_SOURCE_TYPE', 'Choose a UTF-8 text, Markdown or text PDF document.');
  }
  let handle;
  let bytes;
  try {
    handle = await open(selectedPath, 'r');
    const details = await handle.stat();
    if (!details.isFile()) return localError(422, 'INVALID_DOCUMENT', 'Choose a regular document file.');
    if (details.size > MAX_UPLOAD_BYTES) {
      return localError(413, 'SOURCE_TOO_LARGE', 'The document exceeds the five-megabyte limit.');
    }
    const buffer = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    let count = 0;
    while (count < buffer.length) {
      const result = await handle.read(buffer, count, buffer.length - count, null);
      if (result.bytesRead === 0) break;
      count += result.bytesRead;
    }
    if (count > MAX_UPLOAD_BYTES) {
      return localError(413, 'SOURCE_TOO_LARGE', 'The document exceeds the five-megabyte limit.');
    }
    bytes = buffer.subarray(0, count);
  } catch {
    return localError(422, 'INVALID_DOCUMENT', 'The selected document could not be read. Choose it again.');
  } finally {
    await handle?.close();
  }
  const multipart = new FormData();
  multipart.append('file', new Blob([bytes]), filename);
  multipart.append('is_simulated', String(options.is_simulated));
  return request('/api/v1/sources/upload', { method: 'POST', body: multipart });
}

function registerBridge() {
  const operations = {
    getOptions: () => request('/api/v1/options'),
    recommend: (preferences) => request('/api/v1/recommendations', { method: 'POST', json: preferences }),
    listSources: () => request('/api/v1/sources'),
    addTextSource: (source) => request('/api/v1/sources', { method: 'POST', json: source }),
    importSource,
    getSource: (id) => request(`/api/v1/sources/${id}`),
    deleteSource: (id) => request(`/api/v1/sources/${id}`, { method: 'DELETE' }),
    askQuestion: (question) => request('/api/v1/chat', { method: 'POST', json: question }),
    setSessionApiKey: (key) => api.setSessionApiKey(key),
    clearSessionApiKey: (provider) => api.clearSessionApiKey(provider),
    getSessionSettings: (provider) => api.getSessionSettings(provider),
    getBackendStatus: backendStatus,
    retryBackend: async () => {
      if (configurationError) return backendStatus();
      return backend.retry();
    },
  };
  for (const [method, operation] of Object.entries(operations)) {
    ipcMain.handle(`my-jinni:${method}`, async (event, ...values) => {
      if (!mainWindow || event.sender !== mainWindow.webContents
          || !event.senderFrame || event.senderFrame !== mainWindow.webContents.mainFrame
          || event.senderFrame.url !== RENDERER_URL) {
        throw new Error('This desktop operation is not available from this page.');
      }
      try {
        if (values.length > 1) throw new ValidationError('This operation accepts only its documented input.');
        const input = validateIpcInput(method, values[0]);
        return await operation(input);
      } catch (error) {
        return error instanceof ValidationError
          ? localError(422, 'VALIDATION_ERROR', error.message)
          : localError(500, 'INTERNAL_ERROR', 'The desktop operation failed. Please retry.');
      }
    });
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'my-jinni', width: 1440, height: 980, minWidth: 860, minHeight: 650,
    backgroundColor: '#f4f5f7', show: false, autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true, webviewTag: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-redirect', (event) => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadFile(RENDERER_PATH);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    let baseUrl = 'http://127.0.0.1:8000';
    try {
      baseUrl = validateBackendUrl(process.env.MY_JINNI_BACKEND_URL || baseUrl);
    } catch {
      configurationError = 'MY_JINNI_BACKEND_URL must be a loopback HTTP origin without a path or credentials.';
    }
    api = new ApiClient({ baseUrl });
    backend = new BackendManager({ baseUrl, rootDir: ROOT_DIR,
      dataDir: process.env.MY_JINNI_DATA_DIR });
    registerBridge();
    if (!configurationError) void backend.start();
    await createWindow();
  }).catch(() => {
    dialog.showErrorBox('my-jinni could not start', 'The desktop interface could not be loaded. Check the project setup and try again.');
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    api?.clearAllSessionApiKeys();
    Promise.resolve(backend?.stop()).finally(() => app.quit());
  });
}
