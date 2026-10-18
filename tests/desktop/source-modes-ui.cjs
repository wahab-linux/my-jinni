/* global window, document */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _electron: electron } = require('playwright');
const { SCREENSHOTS, tempDirectory, waitUntil, startMockBackend, launchDesktop } = require('./helpers.cjs');

async function menu(page, id) {
  if (!await page.locator('#add-source-picker').evaluate((node) => node.open)) await page.locator('#add-source-picker > summary').click();
  await page.locator(`#${id}`).click();
}
async function sources(base) { return (await (await fetch(`${base}/api/v1/sources`)).json()).data.sources; }
async function oneFlag(page, expected) {
  assert.equal(await page.locator('#source-simulated:visible, #import-simulated:visible').count(), 1);
  assert.equal(await page.locator(`#${expected}`).isVisible(), true);
}

(async () => {
  const directory = tempDirectory(); const backend = await startMockBackend({ directory }); let app;
  try {
    const launched = await launchDesktop(electron, backend.baseUrl, directory); app = launched.application; const page = launched.page;
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await waitUntil(() => page.locator('#decision-submit').isEnabled());
    assert.equal(await page.locator('.conditions-title').evaluate((node) => node.nextElementSibling.classList.contains('decision-source-picker')), true);
    await page.locator('#decision-sources-manage').click(); await oneFlag(page, 'import-simulated');
    await page.locator('#import-simulated').check(); await menu(page, 'paste-toggle'); await oneFlag(page, 'source-simulated');
    assert.equal(await page.locator('#source-simulated').isChecked(), false);
    const filename = path.join(directory, 'Fictional museum guide.txt');
    fs.writeFileSync(filename, 'Fictional demo guide: the museum opens at 11:00 and has step-free access.');
    await app.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }); }, filename);
    await menu(page, 'import-button'); await oneFlag(page, 'import-simulated');
    await waitUntil(async () => (await sources(backend.baseUrl)).some((source) => source.filename === path.basename(filename)));
    assert.equal((await sources(backend.baseUrl)).find((source) => source.filename === path.basename(filename)).is_simulated, true);
    await waitUntil(() => page.locator('#paste-toggle').isEnabled());
    await page.locator('#import-simulated').uncheck(); await menu(page, 'paste-toggle'); await oneFlag(page, 'source-simulated');
    await page.locator('#source-title').fill('Fictional access note');
    await page.locator('#source-text').fill('Fictional demo note: a quiet room is available during the visit.');
    await page.locator('#source-simulated').check();
    fs.mkdirSync(SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SCREENSHOTS, 'jinni-source-paste-single-label.png') });
    await page.locator('#paste-form button[type=submit]').click();
    await waitUntil(async () => (await sources(backend.baseUrl)).some((source) => source.title === 'Fictional access note'));
    await waitUntil(async () => !await page.locator('#paste-form').isVisible());
    await oneFlag(page, 'import-simulated');
    assert.equal(await page.locator('#import-simulated').isChecked(), false);
    assert.equal((await sources(backend.baseUrl)).find((source) => source.title === 'Fictional access note').is_simulated, true);
    await page.locator('#library-close').click(); await page.locator('#decision-submit').click(); await page.locator('.decision-card').waitFor();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: path.join(SCREENSHOTS, 'jinni-sources-first-light.png') });
    await page.locator('#theme-toggle').click(); await page.locator('[name=appearance][value=dark]').check(); await page.locator('#appearance-done').click();
    await page.screenshot({ path: path.join(SCREENSHOTS, 'jinni-sources-first-dark.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(460, 900));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.join(SCREENSHOTS, 'jinni-sources-first-narrow.png') });
    console.log('SOURCE MODE UI PASSED: source-first order, one visible flag per mode, independent real SQLite metadata and clean screenshots. No provider call made.');
  } finally { if (app) await app.close(); await backend.stop(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
