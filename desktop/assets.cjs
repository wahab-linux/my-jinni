'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readFile, realpath } = require('node:fs/promises');

const DOCUMENT_URL = 'jinni://app/index.html';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
  '.md': 'text/plain; charset=utf-8',
};
const PREFERENCE_VALUES = Object.freeze({
  'jinni-locale': ['en', 'zh-CN', 'fr', 'ja', 'ru'],
  'my-jinni-theme': ['light', 'dark', 'system'],
  'my-jinni-sound': ['on', 'off'],
  'my-jinni-waves': ['on', 'off'],
});
const INERT_HTML = '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; style-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>Jinni</title></head><body></body></html>';

function isTrustedDocument(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search) return false;
    url.hash = '';
    return url.href === DOCUMENT_URL;
  } catch { return false; }
}

function validPreferences(values) {
  const result = {};
  for (const [key, allowed] of Object.entries(PREFERENCE_VALUES)) {
    if (Object.hasOwn(values || {}, key) && allowed.includes(values[key])) result[key] = values[key];
  }
  return result;
}

function preferenceReadScript() {
  return `(() => { const result = {}; const allowed = ${JSON.stringify(PREFERENCE_VALUES)}; for (const [key, values] of Object.entries(allowed)) { try { const value = localStorage.getItem(key); if (values.includes(value)) result[key] = value; } catch {} } return result; })()`;
}

function preferenceSeedScript(values) {
  return `(() => { const values = ${JSON.stringify(validPreferences(values))}; for (const [key, value] of Object.entries(values)) { try { if (localStorage.getItem(key) === null) localStorage.setItem(key, value); } catch {} } })()`;
}

function createAssetHandler(rootDir, { migration = () => false } = {}) {
  const manifest = new Map();
  const addTree = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) addTree(filename, `${prefix}${entry.name}/`);
      else if (entry.isFile() && Object.hasOwn(TYPES, path.extname(entry.name).toLowerCase()) && path.extname(entry.name).toLowerCase() !== '.md') manifest.set(`${prefix}${entry.name}`, filename);
    }
  };
  addTree(path.join(rootDir, 'web'), '/');
  addTree(path.join(rootDir, 'shared'), '/shared/');
  manifest.set('/venue-guide.md', path.join(rootDir, 'contracts', 'fixtures', 'venue-guide.md'));
  const error = (status) => new Response('This local resource is unavailable.', { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  return async (request) => {
    if (request.method !== 'GET') return error(405);
    let url;
    try {
      const rawPath = String(request.url).replace(/^jinni:\/\/[^/]+/i, '').split(/[?#]/)[0];
      if (/%(?:2f|5c)/i.test(rawPath) || /[\\%]/.test(decodeURIComponent(rawPath)) || decodeURIComponent(rawPath).split('/').some((part) => part === '..' || part === '.')) return error(403);
      url = new URL(request.url);
      if (url.protocol !== 'jinni:' || url.host !== 'app' || url.username || url.password || url.search || url.hash) return error(403);
      const origin = request.headers?.get('origin');
      if (origin && origin !== 'jinni://app') return error(403);
    } catch { return error(403); }
    if (url.pathname === '/index.html' && migration()) return new Response(INERT_HTML, { headers: { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' } });
    const filename = manifest.get(decodeURIComponent(url.pathname));
    if (!filename) return error(404);
    try {
      const canonical = await realpath(filename);
      const normal = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
      if (normal(canonical) !== normal(filename)) return error(403);
      const bytes = await readFile(canonical);
      return new Response(bytes, { headers: { 'Content-Type': TYPES[path.extname(filename).toLowerCase()], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    } catch { return error(404); }
  };
}

module.exports = { DOCUMENT_URL, INERT_HTML, createAssetHandler, isTrustedDocument, validPreferences, preferenceReadScript, preferenceSeedScript };
