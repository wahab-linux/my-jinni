import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = path.resolve('dist/pages');
const prefix = '/my-jinni/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
    const filename = path.resolve(root, pathname.slice(prefix.length) || 'index.html');
    if (!filename.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
    const data = await readFile(filename);
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}${prefix}`;
await mkdir('tmp/web', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let checks = 0;
const errors = [];
const external = [];
async function check(name, action) { await action(); checks++; console.log(`PASS ${name}`); }
const context = await browser.newContext({ viewport: { width: 1280, height: 950 }, timezoneId: 'America/Los_Angeles', colorScheme: 'light', reducedMotion: 'reduce' });
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:') && !request.url().startsWith('blob:') && !request.url().startsWith('data:')) external.push(request.url()); });
const waitText = (locator, text) => locator.filter({ hasText: text }).waitFor({ state: 'visible' });
const plan = async (budget) => { await page.locator('#budget-preset').selectOption('custom'); await page.locator('#budget').fill(budget); await page.locator('#plan-submit').click(); };
const featured = page.locator('.activity.featured');
const row = (title) => page.locator('.source-item').filter({ has: page.getByText(title, { exact: true }) });
const paste = async (title, text) => {
  if (!await page.locator('#paste-form').isVisible()) await page.locator('#paste-toggle').click();
  await page.locator('#source-title').fill(title); await page.locator('#source-text').fill(text);
  await page.locator('#source-simulated').check(); await page.locator('#paste-form button[type=submit]').click();
  await row(title).waitFor();
};
const search = async (question) => { await page.locator('#question').fill(question); await page.locator('#search-form button').click(); };

function pdf(text) {
  const stream = `BT /F1 12 Tf 10 100 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let content = '%PDF-1.4\n'; const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(content)); content += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(content);
  content += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(content);
}

try {
  await check('project-path deployment loads data, controls and independent local library', async () => {
    await page.goto(base);
    await waitText(page.locator('#setup-status'), 'Ready.');
    await waitText(page.locator('#library-status'), 'Library ready.');
    assert.equal(await page.locator('#origin option').count(), 2);
    assert.match(await page.locator('.demo-banner').innerText(), /fictional|simulated/i);
    assert.equal(await page.locator('#depart').inputValue(), '16:00');
  });
  await check('theme follows device preference until the user chooses and persists across reload', async () => {
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('my-jinni-theme')), 'light');
    await page.reload(); await waitText(page.locator('#setup-status'), 'Ready.');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.locator('#theme-toggle').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.reload(); await waitText(page.locator('#setup-status'), 'Ready.');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.locator('#theme-toggle').click();
  });
  await check('theme changes sync to another tab without resetting its planner', async () => {
    const other = await context.newPage(); await other.goto(base);
    await waitText(other.locator('#setup-status'), 'Ready.');
    await other.locator('#depart').fill('15:30');
    await page.locator('#theme-toggle').click();
    await other.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await other.locator('#depart').inputValue(), '15:30');
    await page.locator('#theme-toggle').click(); await other.close();
  });
  await check('budget presets and custom amount update actual results and clear stale cards', async () => {
    await page.locator('#budget-preset').selectOption('5'); await page.locator('#plan-submit').click();
    await waitText(featured, 'Board Game Night');
    assert.equal(await page.locator('#custom-budget').isVisible(), false);
    await page.locator('#budget-preset').selectOption('0'); assert.equal(await featured.count(), 0);
    await page.locator('#plan-submit').click(); await waitText(page.locator('#plan-status'), 'No activity fits');
    await plan('4'); await waitText(featured, 'Acoustic Hour');
    assert.equal(await page.locator('#custom-budget').isVisible(), true);
  });
  await check('interest and navigation dropdowns support keyboard operation and Escape returns focus', async () => {
    const summary = page.locator('#interest-picker summary');
    await summary.focus(); await page.keyboard.press('Enter');
    await page.locator('#interests input[value=music]').check();
    await waitText(page.locator('#interest-summary'), 'Music');
    await page.keyboard.press('Escape');
    assert.equal(await summary.evaluate((element) => element === document.activeElement), true);
    assert.equal(await page.locator('#interest-picker').getAttribute('open'), null);
    await summary.click(); await page.locator('#interests input[value=music]').uncheck(); await page.keyboard.press('Escape');
    const explore = page.locator('.nav-dropdown summary'); await explore.focus(); await page.keyboard.press('Enter');
    await page.locator('.nav-dropdown a').first().waitFor(); await page.keyboard.press('Escape');
    assert.equal(await explore.evaluate((element) => element === document.activeElement), true);
    await explore.click(); await page.locator('#title').click();
    assert.equal(await page.locator('.nav-dropdown').getAttribute('open'), null);
  });
  await check('campus GBP 10 / 4 / 0 produces calculated best fit, changed result and no match', async () => {
    await plan('10'); await waitText(featured, 'Board Game Night'); await waitText(featured, '£5.00');
    await waitText(featured, '18:15'); await waitText(page.locator('.provenance'), 'Travel Demo');
    await plan('4'); await waitText(featured, 'Acoustic Hour');
    await plan('0'); await waitText(page.locator('#plan-status'), 'No activity fits'); assert.equal(await featured.count(), 0);
  });
  await check('city-centre origin uses its own travel and excludes the missed Board Game Night', async () => {
    await page.locator('#origin').selectOption('glasgow-city-centre'); await plan('10');
    await waitText(featured, 'Short Film Club'); await waitText(featured, '£6.00');
    await waitText(page.locator('.provenance'), 'City Centre Travel Demo');
  });
  await check('exact outbound and return boundaries pass; a minute late fails', async () => {
    await page.locator('#origin').selectOption('glasgow-main-campus');
    await page.locator('#depart').fill('16:15'); await page.locator('#return').fill('18:15');
    await plan('5'); await waitText(featured, 'Board Game Night');
    await page.locator('#depart').fill('16:16'); await page.locator('#plan-submit').click();
    await waitText(page.locator('#plan-status'), 'No activity fits');
  });
  await check('invalid pence, interests and reversed window show errors and clear previous success', async () => {
    await page.locator('#depart').fill('16:00'); await page.locator('#return').fill('19:00'); await plan('10');
    await page.locator('#budget').fill('1.001'); assert.equal(await featured.count(), 0);
    await page.locator('#plan-submit').click(); await waitText(page.locator('#plan-status.error'), 'two decimal');
    await page.locator('#interest-picker summary').click();
    await page.locator('#interests input:checked').uncheck(); await plan('10');
    await waitText(page.locator('#plan-status.error'), 'interests');
    await page.locator('#interest-picker summary').click();
    await page.locator('#interests input[value=games]').check(); await page.locator('#return').fill('15:00');
    await page.locator('#plan-submit').click(); await waitText(page.locator('#plan-status.error'), 'ordered time');
    await page.locator('#return').fill('19:00'); await plan('10');
  });
  await check('fictional demo guide imports, searches selected text and opens exact original passage', async () => {
    await page.locator('#demo-source').click(); await row('Fictional venue guide').waitFor();
    await search('beginner board games'); await page.locator('.excerpt').first().waitFor();
    const quote = await page.locator('.excerpt blockquote').first().innerText();
    await page.locator('.excerpt button').first().click();
    assert.ok((await page.locator('#viewer-content').innerText()).includes(quote));
    await waitText(page.locator('#viewer-meta'), 'Fictional'); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#viewer').isVisible(), false);
  });
  await check('pasted HTML stays inert and unselected sources cannot contribute search evidence', async () => {
    await paste('Unselected secret', 'Octopus secret code. <img src=x onerror="window.compromised=true">');
    await row('Unselected secret').locator('input[type=checkbox]').uncheck();
    await row('Unselected secret').locator('input[type=checkbox]').focus();
    await page.keyboard.press('Space');
    assert.equal(await row('Unselected secret').locator('input[type=checkbox]').evaluate((input) => input === document.activeElement), true);
    await page.keyboard.press('Space');
    await search('octopus'); await waitText(page.locator('#search-status'), 'No matching evidence');
    await row('Unselected secret').getByText('View original text').click();
    assert.equal(await page.locator('#viewer-content img').count(), 0);
    assert.equal(await page.evaluate(() => window.compromised), undefined);
    await page.locator('#viewer-close').click();
  });
  await check('TXT/Markdown import is local and simulation labels persist', async () => {
    await page.locator('#import-simulated').check();
    await page.locator('#file').setInputFiles({ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('A fictional beginner guide to acoustic music.') });
    await row('notes.md').waitFor(); await waitText(row('notes.md'), 'Fictional');
  });
  await check('real PDF extraction runs in a local worker and preserves one-based page citations', async () => {
    await page.locator('#file').setInputFiles({ name: 'guide.pdf', mimeType: 'application/pdf', buffer: pdf('Fictional telescope sessions welcome beginners.') });
    await row('guide.pdf').waitFor(); await search('telescope');
    await waitText(page.locator('.excerpt'), 'Page 1'); await waitText(page.locator('.excerpt'), 'telescope');
    await page.locator('.excerpt button').click(); await waitText(page.locator('#viewer-content'), 'Page 1');
    await page.locator('#viewer-close').click();
  });
  await check('unsupported, corrupt, non-UTF8 and oversized files fail without a partial import', async () => {
    const before = await page.locator('.source-item').count();
    for (const [name, bytes, message] of [['bad.pdf', Buffer.from('not a pdf'), 'invalid or corrupted'], ['notes.txt', Buffer.from([0xff, 0xfe]), 'UTF-8'], ['large.txt', Buffer.alloc(5 * 1024 * 1024 + 1), '5 MiB'], ['bad.exe', Buffer.from('no'), 'Choose a UTF-8']]) {
      await page.locator('#file').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: bytes });
      await waitText(page.locator('#library-status.error'), message);
      assert.equal(await page.locator('.source-item').count(), before);
    }
  });
  await check('encrypted, textless and over-40-page PDFs fail with clear limits', async () => {
    const interpreter = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
    for (const [mode, message] of [['encrypted', 'Password-protected'], ['blank', 'No readable text'], ['long', '40 pages']]) {
      const script = 'from pypdf import PdfWriter\nimport sys, io\nw=PdfWriter()\nfor _ in range(41 if sys.argv[1]=="long" else 1): w.add_blank_page(width=300,height=300)\nif sys.argv[1]=="encrypted": w.encrypt("test-password")\nb=io.BytesIO()\nw.write(b)\nsys.stdout.buffer.write(b.getvalue())';
      const bytes = execFileSync(interpreter, ['-c', script, mode]);
      await page.locator('#file').setInputFiles({ name: `${mode}.pdf`, mimeType: 'application/pdf', buffer: bytes });
      await waitText(page.locator('#library-status.error'), message);
    }
  });
  await check('source text can be downloaded before browser data is cleared', async () => {
    await row('notes.md').getByText('View original text').click();
    const downloadPromise = page.waitForEvent('download'); await page.locator('#download-source').click();
    const download = await downloadPromise; assert.equal(download.suggestedFilename(), 'my-jinni-source.txt');
    const file = await download.path(); assert.match(await readFile(file, 'utf8'), /acoustic music/);
    await page.locator('#viewer-close').click();
  });
  await check('IndexedDB survives reload; delete removes source and search results', async () => {
    await page.reload(); await waitText(page.locator('#library-status'), 'Library ready.');
    await row('guide.pdf').waitFor();
    await row('guide.pdf').locator('input').check(); await search('telescope'); await page.locator('.excerpt').waitFor();
    await row('guide.pdf').getByRole('button', { name: 'Delete guide.pdf', exact: true }).click();
    await waitText(page.locator('#library-status'), 'Source deleted'); assert.equal(await page.locator('.excerpt').count(), 0);
    await page.reload(); await waitText(page.locator('#library-status'), 'Library ready.'); assert.equal(await row('guide.pdf').count(), 0);
  });
  await check('source sort dropdown orders saved documents without losing selection', async () => {
    await row('notes.md').locator('input').check();
    await page.locator('#source-sort').selectOption('title');
    const titles = await page.locator('.source-item .check').allTextContents();
    assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b)));
    assert.equal(await row('notes.md').locator('input').isChecked(), true);
  });
  await check('light and dark layouts fit at mobile, tablet and desktop widths', async () => {
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 }); await plan('10');
        const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.width > 0 && (bounds.right > window.innerWidth + 1 || bounds.left < -1);
        }).map((element) => `${element.tagName}.${element.className}#${element.id}`));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${theme} ${width}px overflow: ${overflow.join(', ')}`);
        await page.screenshot({ path: `tmp/web/browser-${theme}-${width}.png`, fullPage: true });
      }
    }
  });
  await check('primary controls and common text meet WCAG AA contrast in both themes', async () => {
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
      const failures = await page.evaluate(() => {
        const luminance = (rgb) => rgb.slice(0, 3).map((part) => {
          const channel = part / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        }).reduce((total, channel, i) => total + channel * [.2126, .7152, .0722][i], 0);
        const parse = (color) => color.match(/[\d.]+/g).map(Number);
        const failures = [];
        for (const selector of ['.lead', '.hero-badge', '.demo-banner', '.hint', '.eyebrow', '.primary', '.nav-link', '.local-badge', '.theme-toggle', 'label', 'select', '.activity .price', '.featured .muted', '.source-actions .text-button']) {
          for (const element of document.querySelectorAll(selector)) {
            if (!element.getClientRects().length) continue;
            const foreground = parse(getComputedStyle(element).color);
            let ancestor = element; let background;
            while (ancestor) {
              const candidate = parse(getComputedStyle(ancestor).backgroundColor);
              if (candidate.length < 4 || candidate[3] === 1) { background = candidate; break; }
              ancestor = ancestor.parentElement;
            }
            if (!background) continue;
            const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
            const contrast = (values[0] + .05) / (values[1] + .05);
            if (contrast < 4.5) failures.push(`${selector}: ${contrast.toFixed(2)}`);
          }
        }
        return failures;
      });
      assert.deepEqual(failures, [], `${theme} text contrast`);
    }
  });
  await check('theme remains usable when preference storage is blocked', async () => {
    const restricted = await browser.newContext({ colorScheme: 'dark' });
    await restricted.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage disabled'); } }));
    const tab = await restricted.newPage(); await tab.goto(base);
    await waitText(tab.locator('#setup-status'), 'Ready.');
    assert.equal(await tab.locator('html').getAttribute('data-theme'), 'dark');
    await tab.getByRole('button', { name: 'Dark mode', exact: true }).click();
    assert.equal(await tab.locator('html').getAttribute('data-theme'), 'light');
    await tab.locator('#plan-submit').click(); await waitText(tab.locator('.activity.featured'), 'Board Game Night');
    await restricted.close();
  });
  await check('failed scenario load cannot display a plan; retry recovers', async () => {
    const broken = await context.newPage();
    await broken.route('**/scenario.json', (route) => route.abort()); await broken.goto(base);
    await waitText(broken.locator('#setup-status.error'), 'could not be loaded');
    assert.equal(await broken.locator('#plan-submit').isDisabled(), true);
    await broken.unroute('**/scenario.json'); await broken.locator('#reload').click();
    await waitText(broken.locator('#setup-status'), 'Ready.'); await broken.close();
  });
  await check('blocked browser storage leaves planner fully usable and reports the library issue', async () => {
    const blocked = await context.newPage();
    await blocked.addInitScript(() => Object.defineProperty(window, 'indexedDB', { get() { throw new Error('Storage disabled'); } }));
    await blocked.goto(base); await waitText(blocked.locator('#setup-status'), 'Ready.');
    await blocked.locator('#plan-submit').click(); await waitText(blocked.locator('.activity.featured'), 'Board Game Night');
    await blocked.locator('#demo-source').click(); await waitText(blocked.locator('#library-status.error'), 'Planning still works'); await blocked.close();
  });
  assert.deepEqual(errors, [], 'Uncaught browser errors'); assert.deepEqual(external, [], 'Documents/search must never leave this origin');
  console.log(`BROWSER E2E PASSED: ${checks} checks. No backend, API keys or cloud mocks used.`);
} catch (error) {
  await page.screenshot({ path: 'tmp/web/failure.png', fullPage: true }).catch(() => {});
  console.error(error); process.exitCode = 1;
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
