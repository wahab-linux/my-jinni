/* global window, document */
// Actual Electron, IPC, FastAPI and SQLite; provider responses are explicitly mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _electron: electron } = require('playwright');
const { SCREENSHOTS, TEST_KEY, tempDirectory, waitUntil, startMockBackend, launchDesktop } = require('./helpers.cjs');

async function run() {
  const backend = await startMockBackend({ directory: tempDirectory() });
  let application; let page; let checks = 0;
  const check = async (name, action) => { await action(); checks++; console.log(`PASS ${name}`); };
  const captured = async () => (await (await fetch(`${backend.baseUrl}/__test__/captured`)).json()).chat;
  const settings = async (model) => {
    await page.locator('#desktop-ai-settings-open').click();
    const values = await page.locator('#desktop-ai-model-select option').evaluateAll((nodes) => nodes.map((node) => node.value));
    await page.locator('#desktop-ai-model-select').selectOption(values.includes(model) ? model : '__custom__');
    if (!values.includes(model)) await page.locator('#desktop-ai-model').fill(model);
    await page.locator('#desktop-ai-settings-close').click();
  };
  const generate = async () => {
    const previous = (await captured())?.sequence || 0;
    await page.locator('#ai-options-generate').click();
    const response = await waitUntil(async () => { const current = await captured(); return current?.sequence > previous && current; });
    if (response.status === 200 && response.body.data.status === 'answered') await waitUntil(async () => await page.locator('.ai-option-card').count() === 2);
    return response;
  };
  const shot = async (name, fullPage = true) => {
    fs.mkdirSync(SCREENSHOTS, { recursive: true });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: path.join(SCREENSHOTS, name), fullPage, scale: 'css' });
  };
  try {
    ({ application, page } = await launchDesktop(electron, backend.baseUrl, backend.directory));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await waitUntil(() => page.locator('#decision-submit').isEnabled());
    await page.locator('#desktop-ai-open').waitFor();
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1680, 1000));
    await check('the shared native workspace starts with a hidden proposal panel and visible Ask', async () => {
      assert.equal(new URL(page.url()).origin, 'null');
      assert.ok(page.url().startsWith('jinni://app/index.html'));
      assert.equal(await page.locator('#ai-options-panel').isVisible(), false);
      assert.equal(await page.locator('#desktop-ai-dialog').evaluate((node) => node.tagName), 'SECTION');
      assert.equal(await page.locator('#desktop-ai-question').isVisible(), true);
    });
    await page.locator('#scenario-tabs button[data-id=travel]').click();
    await page.locator('#library-open').click();
    await page.locator('#add-source-picker > summary').click();
    await page.locator('#paste-toggle').click();
    const title = 'Museum access guide';
    const text = 'The fictional museum opens at 11:00. The entrance has a ramp.';
    await page.locator('#source-title').fill(title);
    await page.locator('#source-text').fill(text);
    await page.locator('#source-simulated').check();
    await page.locator('#paste-form button[type=submit]').click();
    await page.locator('.source-item').filter({ hasText: title }).waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#desktop-ai-settings-open').click();
    await page.locator('#desktop-ai-key').fill(TEST_KEY);
    await page.locator('#desktop-ai-key-save').click();
    await waitUntil(async () => (await page.evaluate(() => window.myJinni.getSessionSettings('openai'))).configured);
    assert.equal(await page.locator('#desktop-ai-key').inputValue(), '');
    await page.locator('#desktop-ai-settings-close').click();
    const goal = 'Suggest a small accessible museum visit, using the selected guide and travel comparison.';
    await page.locator('#decision-goal').fill(goal);
    await check('invalid conditions show a visible error with an interpolated criterion label', async () => {
      await page.locator('#extra-limits > summary').click();
      await page.locator('#limit-duration-minutes').fill('not-a-number');
      await page.locator('#ai-options-generate').click();
      await waitUntil(async () => (await page.locator('#ai-options-status').innerText()).includes('Travel time'));
      assert.equal(await page.locator('#ai-options-panel').isVisible(), true);
      assert.equal((await page.locator('#ai-options-status').innerText()).includes('{label}'), false);
      assert.equal(await page.locator('.ai-option-card').count(), 0);
      await page.locator('#decision-reset').click();
    });
    await page.locator('#decision-goal').fill(goal);
    await page.locator('#decision-submit').click();
    await page.locator('.decision-card').waitFor();
    const ranking = await page.locator('.decision-card').getAttribute('data-option-id');
    await check('pending and successful proposals appear above the unchanged calculated result', async () => {
      await settings('test-options-slow');
      const pending = generate();
      await waitUntil(() => page.locator('#ai-options-generate').isDisabled());
      assert.equal(await page.locator('#ai-options-panel').isVisible(), true);
      assert.match(await page.locator('#ai-options-status').innerText(), /Generating/);
      const response = await pending;
      assert.equal(response.status, 200);
      assert.equal(response.request.intent, 'options');
      assert.equal(response.request.question, goal);
      assert.equal(response.request.source_ids.length, 1);
      assert.equal(await page.evaluate(() => Boolean(document.getElementById('ai-options-panel').compareDocumentPosition(document.getElementById('decision-results')) & window.Node.DOCUMENT_POSITION_FOLLOWING)), true);
      await waitUntil(async () => await page.evaluate(() => document.activeElement.id === 'ai-options-title'));
      assert.equal(await page.locator('.decision-card').getAttribute('data-option-id'), ranking);
      await page.locator('.ai-option-citation').first().click();
      assert.equal(await page.locator('#viewer-content mark').innerText(), text);
      await page.locator('#viewer-close').click();
    });
    await check('a pending response never steals focus while the user types a separate question', async () => {
      const pending = generate();
      await waitUntil(() => page.locator('#ai-options-generate').isDisabled());
      await page.locator('#desktop-ai-question').fill('When does the museum open?');
      await pending;
      assert.equal(await page.evaluate(() => document.activeElement.id), 'desktop-ai-question');
      assert.equal(await page.locator('#desktop-ai-question').inputValue(), 'When does the museum open?');
    });
    await check('provider errors remain visible without stale choices, then an explicit retry succeeds', async () => {
      await settings('test-options-provider-error');
      assert.equal((await generate()).status, 503);
      assert.equal(await page.locator('#ai-options-panel').isVisible(), true);
      assert.match(await page.locator('#ai-options-status').innerText(), /unavailable/i);
      assert.equal(await page.locator('.ai-option-card').count(), 0);
      assert.equal((await generate()).status, 200);
    });
    await settings('gpt-4.1-mini');
    await generate();
    await shot('jinni-parallel-desktop-wide.png');
    await shot('jinni-parallel-desktop-wide-top.png', false);
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 850));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true);
    await shot('jinni-parallel-desktop-narrow.png');
    console.log(`OPTIONS UI PASSED: ${checks} targeted actual Electron checks. Provider responses are MOCKED.`);
  } catch (error) {
    if (page && !page.isClosed()) await shot('jinni-parallel-targeted-failure.png').catch(() => {});
    throw error;
  } finally {
    if (application) await application.close().catch(() => {});
    await backend.stop();
  }
}
run().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
