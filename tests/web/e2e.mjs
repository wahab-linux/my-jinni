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
const openLegacy = async (tab = page) => {
  if (await tab.locator('#library-dialog').isVisible()) await tab.locator('#library-close').click();
  if (!await tab.locator('#legacy-planner').evaluate((element) => element.open)) await tab.locator('#legacy-planner > summary').click();
};
const openTools = async (tab = page) => { if (!await tab.locator('#library-dialog').isVisible()) await tab.locator('#library-open').click(); };
const plan = async (budget) => { await openLegacy(); await page.locator('#budget-preset').selectOption('custom'); await page.locator('#budget').fill(budget); await page.locator('#plan-submit').click(); };
const appearance = async (target, mode) => {
  if (!await target.locator('#appearance-picker').evaluate((element) => element.open)) await target.locator('#theme-toggle').click();
  await target.locator(`[name=appearance][value=${mode}]`).check();
  await target.locator('#appearance-done').click();
};
const addSourceAction = async (target, id) => {
  await openTools(target);
  if (!await target.locator('#add-source-picker').evaluate((element) => element.open)) await target.locator('#add-source-picker > summary').click();
  await target.locator(`#${id}`).click();
};
const chooseTopic = async (id) => page.locator(`#scenario-tabs button[data-id="${id}"]`).click();
const moreLimits = async () => { if (!await page.locator('#extra-limits').evaluate((element) => element.open)) await page.locator('#extra-limits > summary').click(); };
const featured = page.locator('.activity.featured');
const row = (title) => page.locator('.source-item').filter({ has: page.getByText(title, { exact: true }) });
const paste = async (title, text) => {
  await openTools();
  if (!await page.locator('#paste-form').isVisible()) await addSourceAction(page, 'paste-toggle');
  await page.locator('#source-title').fill(title); await page.locator('#source-text').fill(text);
  await page.locator('#source-simulated').check(); await page.locator('#paste-form button[type=submit]').click();
  await row(title).waitFor();
};
const search = async (question) => { await openTools(); await page.locator('#question').fill(question); await page.locator('#search-form button').click(); };

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
  await check('general decisions are primary while library, questions and itinerary start closed', async () => {
    await page.goto(base);
    await waitText(page.locator('#decision-load-status'), 'Ready to explore');
    assert.equal(await page.locator('.brand').innerText(), 'jinni');
    assert.equal(await page.locator('.brand').getAttribute('aria-label'), 'jinni home');
    assert.match(await page.title(), /^jinni ·/);
    assert.equal(await page.locator('.brand .lamp-mark path').count(), 3);
    assert.match(await page.locator('.footer').innerText(), /^jinni ·/);
    assert.equal(await page.locator('#scenario-tabs button').count(), 5);
    assert.equal(await page.locator('#library-dialog').isVisible(), false);
    assert.equal(await page.locator('#question').isVisible(), false);
    assert.equal(await page.locator('#legacy-planner').evaluate((element) => element.open), false);
    assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#decision-workspace').getAttribute('data-scenario'), 'travel');
  });
  await check('first-time example produces a real comparison and an easy return to preserved choices', async () => {
    await waitText(page.locator('#decision-results'), 'Your comparison will appear here');
    await page.locator('#try-example').click();
    await page.locator('.decision-card').waitFor();
    assert.equal(await page.locator('#comparison-title').evaluate((element) => element === document.activeElement), true);
    await waitText(page.locator('.match-explanation'), 'Why this came first');
    assert.equal(await page.locator('.decision-card .decision-score').count(), 0);
    assert.equal(await page.locator('.decision-card').getByText('It fits the limits you set.', { exact: true }).isVisible(), true);
    await page.locator('#edit-choices').click();
    assert.equal(await page.locator('#scenario-title').evaluate((element) => element === document.activeElement), true);
    assert.equal(await page.locator('#limit-cost-pence').inputValue(), '25');
    await page.locator('#limit-cost-pence').fill('8');
    await page.locator('#priority-cost-pence').selectOption('100');
    assert.equal(await page.locator('.decision-card').count(), 0);
    assert.equal(await page.locator('#edit-choices').isVisible(), false);
    await page.locator('#decision-submit').click();
    await waitText(page.locator('.decision-card'), '£8.00');
    await page.locator('#edit-choices').click();
    assert.equal(await page.locator('#limit-cost-pence').inputValue(), '8');
    assert.equal(await page.locator('#priority-cost-pence').inputValue(), '100');
    await page.locator('#decision-reset').click();
  });
  await check('optional limits remain applied when closed and show how many are set', async () => {
    assert.equal(await page.locator('#extra-limits').evaluate((element) => element.open), false);
    await waitText(page.locator('#active-limit-preview'), 'Travel time: up to 3 hr');
    await moreLimits();
    await page.locator('#bound-duration-minutes').selectOption('lte');
    await page.locator('#limit-duration-minutes').fill('0');
    await waitText(page.locator('#extra-limits > summary'), '1 set');
    await waitText(page.locator('#active-limit-preview'), 'Travel time: up to 0 min');
    await page.locator('#extra-limits > summary').click();
    await page.locator('#decision-submit').click();
    await waitText(page.locator('#decision-status'), 'Nothing fits your limits');
    await page.locator('#edit-choices').click();
    await moreLimits();
    assert.equal(await page.locator('#limit-duration-minutes').inputValue(), '0');
    await page.locator('#limit-duration-minutes').fill('');
    await page.locator('#extra-limits > summary').click();
    await page.locator('#decision-submit').click();
    assert.equal(await page.locator('#extra-limits').evaluate((element) => element.open), true);
    assert.equal(await page.locator('#limit-duration-minutes').evaluate((element) => element === document.activeElement), true);
    await page.locator('#decision-reset').click();
  });
  await check('all five scenarios calculate comparison, exclusions and two-source provenance locally', async () => {
    for (const id of ['market', 'travel', 'student', 'sustainability', 'custom']) {
      await chooseTopic(id);
      await page.locator('#decision-submit').click();
      await page.locator('#decision-results .decision-card').waitFor();
      assert.ok(await page.locator('#decision-results .comparison-table tbody tr').count() > 0);
      assert.equal(await page.locator('.decision-provenance > p').count(), 2);
      await page.locator('.decision-about > summary').click();
      await waitText(page.locator('.decision-provenance'), 'not probabilities');
    }
    await chooseTopic('market');
    await waitText(page.locator('#scenario-notice'), 'No real prices');
    await chooseTopic('travel');
    await page.locator('#decision-submit').click();
    await page.screenshot({ path: 'tmp/web/workspace-light.png', fullPage: true });
    await appearance(page, 'dark');
    await page.screenshot({ path: 'tmp/web/workspace-dark.png', fullPage: true });
    await appearance(page, 'light');
  });
  await check('phone comparisons bring the result into focus and keep scenario controls within the screen', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await chooseTopic('travel');
    await page.locator('#decision-submit').click();
    assert.equal(await page.locator('#comparison-title').evaluate((element) => element === document.activeElement), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: 'tmp/web/workspace-phone.png', fullPage: true });
    await page.setViewportSize({ width: 1280, height: 950 });
  });
  await check('everyday importance choices preserve suggested settings and keep exact maths optional', async () => {
    await chooseTopic('travel');
    assert.equal(await page.locator('#priority-cost-pence').inputValue(), 'suggested');
    assert.equal(await page.locator('#weight-cost-pence').inputValue(), '45');
    assert.equal(await page.locator('#exact-cost-pence').isVisible(), false);
    assert.doesNotMatch(await page.locator('#decision-form').innerText(), /\bweights\b|hard constraints|\bpence\b|\bGBP\b/i);
    await page.locator('#priority-cost-pence').selectOption('100');
    assert.equal(await page.locator('#weight-cost-pence').inputValue(), '100');
    await page.locator('#decision-submit').click(); await page.locator('.decision-card').waitFor();
    await page.locator('#priority-cost-pence').selectOption('custom');
    await page.locator('#weight-cost-pence').fill('42.5');
    await page.locator('#decision-submit').click(); await page.locator('.decision-card').waitFor();
    await page.locator('#decision-reset').click();
    assert.equal(await page.locator('#weight-cost-pence').inputValue(), '45');
    assert.equal(await page.locator('#exact-cost-pence').isVisible(), false);
  });
  await check('importance slider and adjacent points field stay exact and keyboard accessible', async () => {
    await page.locator('#priority-cost-pence').selectOption('custom');
    const slider = page.locator('#importance-slider-cost-pence');
    const value = page.locator('#weight-cost-pence');
    await value.fill('42.5');
    assert.equal(await slider.inputValue(), '42.5');
    assert.equal(await slider.getAttribute('aria-valuetext'), '42.5 out of 100 importance points');
    await slider.focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await value.inputValue(), '43.5');
    await waitText(page.locator('#exact-cost-pence .number-unit'), '/ 100');
    await page.locator('#decision-submit').click(); await page.locator('.decision-card').waitFor();
    await slider.focus(); await page.keyboard.press('ArrowLeft');
    assert.equal(await value.inputValue(), '42.5');
    assert.equal(await page.locator('.decision-card').count(), 0);
    await page.locator('#decision-reset').click();
  });
  await check('amount sliders show money and time units and preserve typed values beyond their suggested range', async () => {
    const money = page.locator('#amount-slider-cost-pence');
    const budget = page.locator('#limit-cost-pence');
    assert.equal(await money.getAttribute('aria-valuetext'), '£25.00');
    await money.focus(); await page.keyboard.press('ArrowLeft');
    assert.equal(await budget.inputValue(), '24.99');
    await budget.fill('7.99');
    assert.equal(await money.inputValue(), '7.99');
    await page.locator('#decision-submit').click(); await waitText(page.locator('#decision-status'), 'Nothing fits');
    await money.focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await budget.inputValue(), '8.00');
    await page.locator('#decision-submit').click(); await waitText(page.locator('.decision-card'), '£8.00');
    await budget.fill('1234.56');
    assert.equal(await money.inputValue(), '1234.56');
    assert.ok(Number(await money.getAttribute('max')) >= 1234.56);
    await moreLimits();
    const time = page.locator('#amount-slider-duration-minutes');
    await page.locator('#limit-duration-minutes').fill('70');
    assert.equal(await time.inputValue(), '70');
    assert.equal(await time.getAttribute('aria-valuetext'), '1 hr 10 min');
    await waitText(page.locator('#limit-duration-minutes').locator('..'), 'minutes');
    await time.focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#limit-duration-minutes').inputValue(), '71');
    await page.locator('#priority-cost-pence').selectOption('custom');
    await page.locator('.decision-preferences').screenshot({ path: 'tmp/web/slider-units-light.png' });
    await appearance(page, 'dark');
    await page.locator('.decision-preferences').screenshot({ path: 'tmp/web/slider-units-dark.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.decision-preferences').screenshot({ path: 'tmp/web/slider-units-phone.png' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.setViewportSize({ width: 1280, height: 950 }); await appearance(page, 'light');
    await page.locator('#decision-reset').click();
  });
  await check('hours, days, carbon and custom rating limits keep their own units beside the number', async () => {
    for (const [topic, id, input, display, unit] of [
      ['student', 'commitment-hours', '4.5', '4.5 hours', 'hours'],
      ['sustainability', 'wait-days', '7', '7 days', 'days'],
      ['travel', 'emissions-grams', '2200', '2.2 kg CO₂e', 'g CO₂e'],
      ['custom', 'quality-score', '75.5', '75.5 points', 'points'],
    ]) {
      await chooseTopic(topic); await moreLimits();
      await page.locator(`#bound-${id}`).selectOption('lte');
      await page.locator(`#limit-${id}`).fill(input);
      assert.equal(await page.locator(`#amount-slider-${id}`).getAttribute('aria-valuetext'), display);
      assert.equal(await page.locator(`#limit-${id}`).locator('..').locator('.number-unit').innerText(), unit);
      await waitText(page.locator(`#amount-hint-${id}`), display);
    }
    await chooseTopic('travel');
  });
  await check('pound budgets round-trip exactly and prices remain £ in cards and comparisons', async () => {
    await chooseTopic('travel');
    assert.equal(await page.locator('#limit-cost-pence').inputValue(), '25');
    await page.getByLabel('Your budget (£)', { exact: true }).fill('7.99');
    await page.locator('#decision-submit').click(); await waitText(page.locator('#decision-status'), 'Nothing fits');
    await page.locator('#limit-cost-pence').fill('8.00');
    await page.locator('#decision-submit').click(); await waitText(page.locator('.decision-card'), '£8.00');
    await waitText(page.locator('.comparison-table').first(), '£8.00');
    assert.doesNotMatch(await page.locator('.decision-card').innerText(), /\bpence\b|\bGBP\b/);
    await page.locator('#limit-cost-pence').fill('8.001');
    await page.locator('#decision-submit').click(); await page.locator('#decision-status.error').waitFor();
    assert.equal(await page.locator('.decision-card').count(), 0);
    await page.locator('#decision-reset').click();
  });
  await check('ignoring every priority gives a plain correction rather than a fake match', async () => {
    for (const input of await page.locator('.priority-choice').all()) await input.selectOption('0');
    await page.locator('#decision-submit').click(); await waitText(page.locator('#decision-status.error'), 'Choose Important');
    assert.equal(await page.locator('.decision-card').count(), 0);
    await page.locator('#decision-reset').click();
  });
  await check('priority changes clear stale results and hard-limit no-match is distinct from failure', async () => {
    await page.locator('#priority-cost-pence').selectOption('0');
    assert.equal(await page.locator('.decision-card').count(), 0);
    await page.locator('#bound-cost-pence').selectOption('lte');
    await page.locator('#limit-cost-pence').fill('0');
    await moreLimits();
    await page.locator('#bound-duration-minutes').selectOption('lte');
    await page.locator('#limit-duration-minutes').fill('0');
    await page.locator('#decision-submit').click();
    await waitText(page.locator('#decision-status'), 'Nothing fits your limits');
    assert.equal(await page.locator('.decision-card').count(), 0);
    await page.locator('#decision-exclusions summary').click();
    assert.ok(await page.locator('.decision-excluded').count() > 0);
    await page.locator('#decision-reset').click();
    await page.locator('#decision-submit').click();
    await page.locator('.decision-card').waitFor();
  });
  await check('custom editor validates and calculates a new domain with safe text rendering', async () => {
    await chooseTopic('custom');
    await page.locator('#custom-editor summary').click();
    const custom = JSON.parse(await page.locator('#custom-json').inputValue());
    custom.title = 'Workshop selection';
    custom.dataset.options[0].name = '<img src=x onerror=alert(1)> Fictional workshop';
    const criterion = custom.criteria.at(-1);
    const oldId = criterion.id; criterion.id = 'constructor';
    for (const observation of custom.dataset.observations) {
      if (Object.hasOwn(observation.metrics, oldId)) observation.metrics.constructor = observation.metrics[oldId];
      delete observation.metrics[oldId];
    }
    await page.locator('#custom-json').fill(JSON.stringify(custom));
    await page.locator('#custom-apply').click();
    await waitText(page.locator('#custom-status'), 'ready to use');
    assert.equal(await page.locator('#weight-constructor').inputValue(), String(criterion.default_weight));
    await page.locator('#decision-submit').click();
    await page.locator('.decision-card').waitFor();
    assert.equal(await page.locator('#decision-results img').count(), 0);
    criterion.default_weight = 0;
    for (const observation of custom.dataset.observations) delete observation.metrics.constructor;
    await page.locator('#custom-json').fill(JSON.stringify(custom));
    await page.locator('#custom-apply').click();
    assert.equal(await page.locator('#weight-constructor').inputValue(), '0');
    await page.locator('#decision-submit').click();
    await page.locator('.decision-card').waitFor();
    await waitText(page.locator('#decision-results'), 'Unknown');
    assert.doesNotMatch(await page.locator('#decision-results').innerText(), /NaN|function Object/);
    await page.locator('#custom-json').fill('{broken');
    await page.locator('#custom-apply').click();
    await waitText(page.locator('#custom-status.error'), 'not applied');
    await chooseTopic('travel');
  });
  await check('library drawer opens on demand, Escape closes it, and reduced motion disables result entrance', async () => {
    await openTools(); await waitText(page.locator('#library-status'), 'Library ready.');
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#library-dialog').isVisible(), false);
    assert.equal(await page.locator('#library-open').evaluate((element) => element === document.activeElement), true);
    await page.locator('#decision-submit').click();
    assert.equal(await page.locator('.decision-card').evaluate((element) => getComputedStyle(element).animationName), 'none');
  });
  await check('sound starts off and only synthesises quiet feedback after explicit user opt-in', async () => {
    await page.evaluate(() => {
      window.audioTest = { contexts: 0, tones: 0, gains: [] };
      window.AudioContext = class {
        constructor() { window.audioTest.contexts++; this.currentTime = 0; this.destination = {}; }
        resume() { return Promise.resolve(); }
        createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() { window.audioTest.tones++; }, stop() {}, disconnect() {} }; }
        createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime(value) { window.audioTest.gains.push(value); }, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
      };
    });
    await page.locator('#decision-submit').click();
    assert.equal(await page.evaluate(() => window.audioTest.contexts), 0);
    await page.locator('#sound-toggle').click();
    await page.waitForFunction(() => window.audioTest.tones === 1);
    await page.locator('#decision-submit').click();
    await page.waitForFunction(() => window.audioTest.tones === 2);
    assert.ok(await page.evaluate(() => window.audioTest.gains.every((value) => value <= 0.025)));
    await page.locator('#sound-toggle').click();
    await page.locator('#decision-submit').click();
    assert.equal(await page.evaluate(() => window.audioTest.tones), 2);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('#decision-submit').click();
    assert.equal(await page.locator('.decision-card').evaluate((element) => getComputedStyle(element).animationName), 'decision-enter');
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });
  await check('subtle waves move, pause persistently, and stop automatically for reduced motion', async () => {
    const moving = await browser.newContext({ viewport: { width: 1280, height: 950 }, reducedMotion: 'no-preference', colorScheme: 'light' });
    const tab = await moving.newPage(); await tab.goto(base);
    await waitText(tab.locator('#decision-load-status'), 'Ready to explore');
    assert.equal((await tab.request.get(`${base}waves.svg`)).status(), 200);
    assert.equal(await tab.locator('html').getAttribute('data-waves'), 'on');
    assert.equal(await tab.locator('.wave-layer').first().evaluate((element) => getComputedStyle(element).animationPlayState), 'running');
    const start = await tab.locator('.wave-layer').first().evaluate((element) => getComputedStyle(element).transform);
    await tab.waitForFunction((before) => getComputedStyle(document.querySelector('.wave-layer')).transform !== before, start);
    await tab.locator('#theme-toggle').click(); await tab.locator('#waves-toggle').uncheck();
    assert.equal(await tab.locator('html').getAttribute('data-waves'), 'off');
    assert.equal(await tab.locator('.wave-layer').first().evaluate((element) => getComputedStyle(element).animationPlayState), 'paused');
    await tab.reload(); await waitText(tab.locator('#decision-load-status'), 'Ready to explore');
    assert.equal(await tab.locator('html').getAttribute('data-waves'), 'off');
    await tab.locator('#theme-toggle').click(); await tab.locator('#waves-toggle').check();
    await tab.locator('#appearance-done').click();
    await tab.screenshot({ path: 'tmp/web/waves-light.png' });
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await tab.locator('.wave-layer').first().evaluate((element) => getComputedStyle(element).animationName), 'none');
    await tab.locator('#theme-toggle').click();
    await tab.waitForFunction(() => document.getElementById('waves-toggle').disabled);
    assert.equal(await tab.locator('#waves-toggle').isDisabled(), true);
    await waitText(tab.locator('#waves-status'), 'reduced motion');
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    await tab.waitForFunction(() => document.documentElement.dataset.waves === 'on');
    assert.equal(await tab.locator('#waves-toggle').isChecked(), true);
    assert.equal(await tab.locator('html').getAttribute('data-waves'), 'on');
    await moving.close();
  });
  await check('failed decision data load has no fallback comparison and retry recovers', async () => {
    const broken = await context.newPage();
    await broken.route('**/decisions.json', (route) => route.abort()); await broken.goto(base);
    await waitText(broken.locator('#decision-load-status.error'), 'could not be loaded');
    assert.equal(await broken.locator('#decision-submit').isDisabled(), true);
    assert.equal(await broken.locator('.decision-card').count(), 0);
    await broken.unroute('**/decisions.json'); await broken.locator('#decision-retry').click();
    await waitText(broken.locator('#decision-load-status'), 'Ready to explore');
    await broken.locator('#decision-submit').click(); await broken.locator('.decision-card').waitFor();
    await broken.close();
  });
  await check('project-path deployment loads data, controls and independent local library', async () => {
    await page.evaluate(() => localStorage.removeItem('my-jinni-theme'));
    await page.goto(base);
    await openLegacy();
    await waitText(page.locator('#setup-status'), 'Ready.');
    await openTools();
    await waitText(page.locator('#library-status'), 'Library ready.');
    await page.locator('#library-close').click();
    assert.equal(await page.locator('#origin option').count(), 2);
    assert.match(await page.locator('.demo-banner').innerText(), /fictional|simulated/i);
    assert.equal(await page.locator('#depart').inputValue(), '16:00');
  });
  await check('theme follows device preference until the user chooses and persists across reload', async () => {
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await page.locator('html').getAttribute('data-appearance'), 'system');
    await appearance(page, 'light');
    assert.equal(await page.evaluate(() => localStorage.getItem('my-jinni-theme')), 'light');
    await page.reload(); await openLegacy(); await waitText(page.locator('#setup-status'), 'Ready.');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.locator('#theme-toggle').focus(); await page.keyboard.press('Enter');
    await page.locator('[name=appearance][value=dark]').check(); await page.locator('#appearance-done').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.reload(); await openLegacy(); await waitText(page.locator('#setup-status'), 'Ready.');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await appearance(page, 'light');
  });
  await check('theme changes sync to another tab without resetting its planner', async () => {
    const other = await context.newPage(); await other.goto(base); await openLegacy(other);
    await waitText(other.locator('#setup-status'), 'Ready.');
    await other.locator('#depart').fill('15:30');
    await appearance(page, 'dark');
    await other.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await other.locator('#depart').inputValue(), '15:30');
    await appearance(page, 'light'); await other.close();
  });
  await check('Match device can be restored after a manual theme and follows later device changes', async () => {
    await appearance(page, 'system');
    assert.equal(await page.evaluate(() => localStorage.getItem('my-jinni-theme')), 'system');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.reload(); await openLegacy(); await waitText(page.locator('#setup-status'), 'Ready.');
    assert.equal(await page.locator('html').getAttribute('data-appearance'), 'system');
    await appearance(page, 'light');
  });
  await check('appearance preview choices are keyboard accessible and Escape returns to the control', async () => {
    await page.locator('#theme-toggle').focus(); await page.keyboard.press('Enter');
    await page.locator('[name=appearance][value=light]').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#appearance-picker').evaluate((element) => element.open), false);
    assert.equal(await page.locator('#theme-toggle').evaluate((element) => element === document.activeElement), true);
    await appearance(page, 'light');
  });
  await check('planning shortcuts preserve time and location; Start fresh restores useful defaults', async () => {
    await appearance(page, 'dark');
    await openLegacy();
    await page.locator('#origin').selectOption('glasgow-city-centre'); await page.locator('#depart').fill('15:30');
    await page.locator('#starter').selectOption('budget');
    assert.equal(await page.locator('#budget-preset').inputValue(), '5');
    assert.equal(await page.locator('#interests input:checked').count(), 5);
    assert.equal(await page.locator('#origin').inputValue(), 'glasgow-city-centre');
    assert.equal(await page.locator('#depart').inputValue(), '15:30');
    await page.locator('#plan-submit').click(); await waitText(featured, '£4.00');
    await page.locator('#reset-planner').click();
    assert.equal(await page.locator('#origin').inputValue(), 'glasgow-main-campus');
    assert.equal(await page.locator('#depart').inputValue(), '16:00');
    assert.equal(await page.locator('#budget-preset').inputValue(), '10');
    assert.equal(await page.locator('#interests input:checked').count(), 1);
    assert.equal(await featured.count(), 0);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.locator('#budget-preset').selectOption('15');
    assert.equal(await page.locator('#starter').inputValue(), '');
    await page.locator('#reset-planner').click(); await appearance(page, 'light');
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
    assert.equal(await page.locator('#budget').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#budget').evaluate((element) => element === document.activeElement), true);
    await page.locator('#interest-picker summary').click();
    await page.locator('#interests input:checked').uncheck(); await plan('10');
    await waitText(page.locator('#plan-status.error'), 'interests');
    await page.locator('#interest-error').waitFor();
    await page.locator('#interest-picker summary').click();
    await page.locator('#interests input[value=games]').check(); await page.locator('#return').fill('15:00');
    await page.locator('#plan-submit').click(); await waitText(page.locator('#plan-status.error'), 'return time after');
    assert.equal(await page.locator('#return').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#return').evaluate((element) => element === document.activeElement), true);
    await page.locator('#return').fill('19:00'); await plan('10');
  });
  await check('fictional demo guide imports, searches selected text and opens exact original passage', async () => {
    await openTools();
    await addSourceAction(page, 'demo-source'); await row('Fictional venue guide').waitFor();
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
    await search('octopus'); await waitText(page.locator('#search-status'), 'No matching text');
    await row('Unselected secret').getByText('Read saved text').click();
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
    await row('notes.md').getByText('Read saved text').click();
    const downloadPromise = page.waitForEvent('download'); await page.locator('#download-source').click();
    const download = await downloadPromise; assert.equal(download.suggestedFilename(), 'jinni-source.txt');
    const file = await download.path(); assert.match(await readFile(file, 'utf8'), /acoustic music/);
    await page.locator('#viewer-close').click();
  });
  await check('source selection shortcuts and cancelled deletion preserve the library', async () => {
    await page.locator('#select-all').click();
    assert.equal(await page.locator('.source-item input:checked').count(), await page.locator('.source-item').count());
    await page.locator('#clear-selection').click();
    assert.equal(await page.locator('.source-item input:checked').count(), 0);
    await search('beginner'); await waitText(page.locator('#search-status.error'), 'Tick at least one');
    const count = await page.locator('.source-item').count();
    await row('notes.md').getByRole('button', { name: 'Delete notes.md', exact: true }).click();
    await page.locator('#delete-cancel').click();
    assert.equal(await page.locator('.source-item').count(), count);
    await row('notes.md').getByRole('button', { name: 'Delete notes.md', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#delete-dialog').isVisible(), false);
    assert.equal(await page.locator('.source-item').count(), count);
  });
  await check('IndexedDB survives reload; delete removes source and search results', async () => {
    await page.reload(); await openTools(); await waitText(page.locator('#library-status'), 'Library ready.');
    await row('guide.pdf').waitFor();
    await row('guide.pdf').locator('input').check(); await search('telescope'); await page.locator('.excerpt').waitFor();
    await row('guide.pdf').getByRole('button', { name: 'Delete guide.pdf', exact: true }).click();
    await page.locator('#delete-confirm').click();
    await waitText(page.locator('#library-status'), 'Item removed'); assert.equal(await page.locator('.excerpt').count(), 0);
    await page.reload(); await openTools(); await waitText(page.locator('#library-status'), 'Library ready.'); assert.equal(await row('guide.pdf').count(), 0);
  });
  await check('source sort dropdown orders saved documents without losing selection', async () => {
    await row('notes.md').locator('input').check();
    await page.locator('#source-sort').selectOption('title');
    const titles = await page.locator('.source-item .check').allTextContents();
    assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b)));
    assert.equal(await row('notes.md').locator('input').isChecked(), true);
  });
  await check('light and dark layouts fit at mobile, tablet and desktop widths', async () => {
    await page.locator('#library-close').click();
    for (const theme of ['light', 'dark']) {
      await appearance(page, theme);
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 }); await plan('10');
        if (width < 760) assert.equal(await page.locator('#results-title').evaluate((element) => element === document.activeElement), true);
        const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.width > 0 && (bounds.right > window.innerWidth + 1 || bounds.left < -1);
        }).map((element) => `${element.tagName}.${element.className}#${element.id}`));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${theme} ${width}px overflow: ${overflow.join(', ')}`);
        await page.screenshot({ path: `tmp/web/browser-${theme}-${width}.png`, fullPage: true });
      }
    }
  });
  await check('appearance and source dropdown panels fit on a narrow phone and close without losing work', async () => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.locator('#theme-toggle').click();
    await page.screenshot({ path: 'tmp/web/appearance-phone.png', fullPage: false });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.locator('#appearance-done').click();
    await openTools();
    await page.locator('#add-source-picker > summary').click();
    await page.locator('#import-button').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#add-source-picker').evaluate((element) => element.open), false);
    await page.locator('#library-close').click();
    await page.setViewportSize({ width: 1280, height: 950 });
  });
  await check('primary controls and common text meet WCAG AA contrast in both themes', async () => {
    for (const theme of ['light', 'dark']) {
      await appearance(page, theme);
      const failures = await page.evaluate(() => {
        const luminance = (rgb) => rgb.slice(0, 3).map((part) => {
          const channel = part / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        }).reduce((total, channel, i) => total + channel * [.2126, .7152, .0722][i], 0);
        const parse = (color) => color.match(/[\d.]+/g).map(Number);
        const failures = [];
        for (const selector of ['.lead', '.hero-badge', '.demo-banner', '.hint', '.eyebrow', '.primary', '.nav-link', '.local-badge', '.theme-toggle', 'label', 'select', '.activity .price', '.featured .muted', '.source-actions .text-button', '.scenario-tab', '.scenario-notice', '.decision-score', '.decision-limitations', '.comparison-table']) {
          for (const element of document.querySelectorAll(selector)) {
            if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
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
            if (contrast < 4.5) failures.push(`${selector} ${element.textContent.slice(0, 35)}: ${contrast.toFixed(2)}`);
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
    const tab = await restricted.newPage(); await tab.goto(base); await openLegacy(tab);
    await waitText(tab.locator('#setup-status'), 'Ready.');
    assert.equal(await tab.locator('html').getAttribute('data-theme'), 'dark');
    await appearance(tab, 'light');
    assert.equal(await tab.locator('html').getAttribute('data-theme'), 'light');
    await tab.locator('#plan-submit').click(); await waitText(tab.locator('.activity.featured'), 'Board Game Night');
    await restricted.close();
  });
  await check('failed scenario load cannot display a plan; retry recovers', async () => {
    const broken = await context.newPage();
    await broken.route('**/scenario.json', (route) => route.abort()); await broken.goto(base); await openLegacy(broken);
    await waitText(broken.locator('#setup-status.error'), 'could not be loaded');
    assert.equal(await broken.locator('#plan-submit').isDisabled(), true);
    await broken.unroute('**/scenario.json'); await broken.locator('#reload').click();
    await waitText(broken.locator('#setup-status'), 'Ready.'); await broken.close();
  });
  await check('blocked browser storage leaves planner fully usable and reports the library issue', async () => {
    const blocked = await context.newPage();
    await blocked.addInitScript(() => Object.defineProperty(window, 'indexedDB', { get() { throw new Error('Storage disabled'); } }));
    await blocked.goto(base); await openLegacy(blocked); await waitText(blocked.locator('#setup-status'), 'Ready.');
    await blocked.locator('#plan-submit').click(); await waitText(blocked.locator('.activity.featured'), 'Board Game Night');
    await openTools(blocked);
    await addSourceAction(blocked, 'demo-source'); await waitText(blocked.locator('#library-status.error'), 'Planning still works'); await blocked.close();
  });
  assert.deepEqual(errors, [], 'Uncaught browser errors'); assert.deepEqual(external, [], 'Documents/search must never leave this origin');
  console.log(`BROWSER E2E PASSED: ${checks} checks. No backend, API keys or cloud mocks used.`);
} catch (error) {
  await page.screenshot({ path: 'tmp/web/failure.png', fullPage: true }).catch(() => {});
  console.error(error); process.exitCode = 1;
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
