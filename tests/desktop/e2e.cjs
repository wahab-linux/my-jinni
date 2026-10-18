/* global window, document, getComputedStyle */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { _electron: electron } = require('playwright');
const {
  SCREENSHOTS, TEST_KEY, tempDirectory, freePort, waitUntil, startMockBackend, launchDesktop, screenshot,
} = require('./helpers.cjs');

let checks = 0;
async function check(name, action) {
  await action();
  checks++;
  console.log(`PASS ${name}`);
}

async function contains(locator, text) {
  await waitUntil(async () => (await locator.innerText()).toLowerCase().includes(text.toLowerCase()),
    { message: `Expected visible text: ${text}` });
}

async function viewportScreenshot(page, name) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
    .map((animation) => animation.finished.catch(() => {}))));
  await page.screenshot({ path: path.join(SCREENSHOTS, name), scale: 'css' });
}

async function sources(baseUrl) {
  const response = await fetch(`${baseUrl}/api/v1/sources`);
  assert.equal(response.status, 200);
  return (await response.json()).data.sources;
}

function pdfFixture(text) {
  const stream = `BT /F1 12 Tf 10 100 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let content = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(content));
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(content);
  content += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  content += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(content);
}

async function closeTools(page) {
  for (const id of ['source-dialog', 'settings-dialog', 'chat-drawer', 'library-drawer']) {
    if (await page.getByTestId(id).isVisible()) await page.keyboard.press('Escape');
  }
}

async function openTool(page, name) {
  if (await page.getByTestId(`${name}-drawer`).isVisible()) return;
  await closeTools(page);
  await page.getByTestId(`${name}-open`).click();
}

async function openLegacy(page) {
  await closeTools(page);
  if (!await page.getByTestId('legacy-planner').evaluate((node) => node.open)) await page.getByTestId('legacy-toggle').click();
}

async function openSettings(page) {
  const button = await page.getByTestId('chat-drawer').isVisible() ? 'chat-settings-button' : 'settings-button';
  await page.getByTestId(button).click();
}

async function addText(page, baseUrl, title, text) {
  await openTool(page, 'library');
  if (!await page.getByTestId('source-title').isVisible()) await page.getByTestId('add-text-toggle').click();
  await page.getByTestId('source-title').fill(title);
  await page.getByTestId('source-text').fill(text);
  await page.getByTestId('text-source-simulated').check();
  await page.getByTestId('add-source-submit').click();
  return waitUntil(async () => (await sources(baseUrl)).find((source) => source.title === title));
}

async function selectOnly(page, selectedIds) {
  await openTool(page, 'library');
  for (const checkbox of await page.getByTestId('source-checkbox').all()) {
    await checkbox.setChecked(selectedIds.includes(await checkbox.inputValue()));
  }
}

async function saveKey(page, key, provider = 'openai') {
  await openSettings(page);
  await page.getByTestId('settings-provider').selectOption(provider);
  await page.getByTestId('api-key').fill(key);
  await page.getByTestId('save-key').click();
  await waitUntil(async () => await page.getByTestId('api-key').inputValue() === '');
  if (await page.getByTestId('settings-dialog').isVisible()) {
    await page.getByTestId('settings-dialog').getByRole('button', { name: 'Close', exact: true }).click();
  }
}

async function ask(page, question, model = 'gpt-4.1-mini') {
  await openTool(page, 'chat');
  await page.getByTestId('include-decision').uncheck();
  await page.getByTestId('include-plan').uncheck();
  if (!await page.getByTestId('model').isVisible()) await page.getByText('Model settings', { exact: true }).click();
  await page.getByTestId('model').fill(model);
  await page.getByTestId('question').fill(question);
  await page.getByTestId('ask-submit').click();
}

function customComparison() {
  const source = (id, label) => ({ id, label, is_simulated: true, updated_at: '2026-10-17T10:00:00+01:00' });
  return {
    title: 'Fictional workspace equipment choice',
    criteria: [
      { id: 'cost-pence', label: 'Total cost', unit: 'pence', direction: 'minimize', default_weight: 100 },
      { id: 'quality-score', label: 'Quality estimate', unit: 'score', direction: 'maximize', default_weight: 0 },
    ],
    dataset: {
      option_source: source('equipment-catalog', 'Fictional equipment catalog'),
      metric_source: source('equipment-measures', 'Fictional equipment measurements'),
      options: [
        { id: 'budget', name: 'Budget equipment', category: 'equipment', description: 'Fictional lower-cost option.' },
        { id: 'premium', name: 'Premium equipment', category: 'equipment', description: 'Fictional higher-quality option.' },
      ],
      observations: [
        { option_id: 'budget', available: true, metrics: { 'cost-pence': 100, 'quality-score': 20 } },
        { option_id: 'premium', available: true, metrics: { 'cost-pence': 900, 'quality-score': 100 } },
      ],
    },
  };
}

async function chooseScenario(page, id) {
  await closeTools(page);
  await page.getByTestId('decision-scenario').selectOption(id);
  await waitUntil(() => page.getByTestId('decision-submit').isEnabled());
}

async function compare(page) {
  await page.getByTestId('decision-submit').click();
  await contains(page.getByTestId('decision-feedback'), 'Comparison complete');
}

async function applyDefinition(page, definition) {
  const editor = page.getByTestId('custom-editor');
  if (!await editor.evaluate((node) => node.open)) await editor.locator('summary').click();
  await page.getByTestId('custom-json').fill(JSON.stringify(definition, null, 2));
  await page.getByTestId('custom-apply').click();
  await contains(page.getByTestId('decision-feedback'), 'definition applied');
}

async function exerciseGeneralDecisions(page, baseUrl) {
  await waitUntil(() => page.getByTestId('decision-submit').isEnabled());
  await check('decision workspace is primary and optional tools start collapsed', async () => {
    assert.equal(await page.title(), 'jinni');
    assert.equal(await page.locator('.brand').innerText(), 'jinni');
    assert.equal(await page.getByTestId('jinni-lamp').getAttribute('viewBox'), '0 0 64 64');
    assert.equal(await page.getByTestId('jinni-lamp').locator('path').count(), 3);
    assert.equal(await page.getByTestId('library-drawer').isVisible(), false);
    assert.equal(await page.getByTestId('chat-drawer').isVisible(), false);
    assert.equal(await page.getByTestId('legacy-planner').evaluate((node) => node.open), false);
    assert.equal(await page.getByTestId('sound-toggle').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.getByTestId('sound-toggle').innerText(), 'Sound off');
    await contains(page.getByTestId('decision-empty'), 'comparison will appear');
    await screenshot(page, '08-decision-workspace.png');
  });
  for (const id of ['market', 'travel', 'student', 'sustainability', 'custom']) {
    await check(`actual two-source ${id} comparison matches the API's calculated result`, async () => {
      await chooseScenario(page, id);
      const request = await page.evaluate(() => window.currentDecisionRequest());
      const response = await fetch(`${baseUrl}/api/v1/decisions/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
      assert.equal(response.status, 200);
      const expected = (await response.json()).data;
      assert.equal(expected.sources.length, 2);
      assert.notEqual(expected.sources[0].id, expected.sources[1].id);
      await compare(page);
      await contains(page.getByTestId('decision-results'), expected.recommended.name);
      await contains(page.getByTestId('decision-results'), 'not a probability');
      await page.getByTestId('decision-results').locator('.decision-provenance summary').click();
      await contains(page.getByTestId('decision-results'), expected.sources[0].label);
      assert.equal(await page.getByTestId('decision-table').locator('tbody tr').count(), expected.ranked.length);
      if (id === 'market') await contains(page.locator('#scenario-notice'), 'no live prices');
      if (id === 'travel') {
        await screenshot(page, '09-travel-comparison.png');
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await viewportScreenshot(page, 'jinni-desktop-light.png');
      }
    });
  }
  await check('custom criteria change domains and a weight flip changes the actual winner', async () => {
    await applyDefinition(page, customComparison());
    await compare(page);
    await contains(page.getByTestId('decision-results').locator('.decision-recommendation h3'), 'Budget equipment');
    await page.getByTestId('weight-cost-pence').fill('0');
    await page.getByTestId('weight-quality-score').fill('100');
    await contains(page.getByTestId('decision-empty'), 'comparison will appear');
    await compare(page);
    await contains(page.getByTestId('decision-results').locator('.decision-recommendation h3'), 'Premium equipment');
    await screenshot(page, '10-custom-weighted-comparison.png');
  });
  await check('hard limits and missing observations give honest exclusions and no fallback', async () => {
    await page.getByTestId('limit-enabled-cost-pence').check();
    await page.getByTestId('limit-cost-pence').fill('0.00');
    await compare(page);
    await contains(page.getByTestId('decision-results'), 'No option meets');
    assert.equal(await page.getByTestId('decision-results').locator('table').count(), 0);
    await contains(page.getByTestId('decision-exclusions'), 'Budget equipment');
    const definition = customComparison();
    definition.dataset.observations = [];
    await applyDefinition(page, definition);
    await compare(page);
    await contains(page.getByTestId('decision-results'), 'No option meets');
    await contains(page.getByTestId('decision-exclusions'), 'measurement');
  });
  await check('drawers open with keyboard, close with Escape and return focus', async () => {
    await page.getByTestId('library-open').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.getByTestId('library-drawer').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByTestId('library-drawer').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'library-open');
    await page.getByTestId('chat-open').click();
    assert.equal(await page.getByTestId('chat-drawer').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByTestId('chat-drawer').isVisible(), false);
  });
  await check('valid constructor criterion IDs use configured numeric defaults', async () => {
    const definition = customComparison();
    definition.criteria = [{ id: 'constructor', label: 'Constructor measure', unit: 'score', direction: 'maximize', default_weight: 100 }];
    definition.dataset.observations = [
      { option_id: 'budget', available: true, metrics: { constructor: 1 } },
      { option_id: 'premium', available: true, metrics: { constructor: 100 } },
    ];
    await applyDefinition(page, definition);
    assert.equal(await page.getByTestId('weight-constructor').inputValue(), '100');
    await compare(page);
    await contains(page.getByTestId('decision-results').locator('.decision-recommendation h3'), 'Premium equipment');
    definition.criteria[0].default_weight = 0;
    definition.criteria.push({ id: 'quality-score', label: 'Quality estimate', unit: 'score', direction: 'maximize', default_weight: 100 });
    definition.dataset.observations[0].metrics = { 'quality-score': 20 };
    definition.dataset.observations[1].metrics = { 'quality-score': 100 };
    await applyDefinition(page, definition);
    await compare(page);
    await contains(page.getByTestId('decision-table'), 'Unknown');
    assert.equal((await page.getByTestId('decision-results').innerText()).includes('NaN'), false);
  });
  await check('reduced motion, theme and opt-in Web Audio requests preserve the decision flow', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await chooseScenario(page, 'travel');
    await compare(page);
    assert.equal(await page.getByTestId('decision-results').evaluate((node) => getComputedStyle(node).animationName), 'none');
    await page.evaluate(() => { window.testSoundRequests = 0; window.addEventListener('my-jinni:sound', () => { window.testSoundRequests++; }); });
    assert.equal(await page.evaluate(() => window.testSoundRequests), 0);
    await page.getByTestId('sound-toggle').click();
    assert.equal(await page.getByTestId('sound-toggle').getAttribute('aria-pressed'), 'true');
    await compare(page);
    await waitUntil(() => page.evaluate(() => window.testSoundRequests >= 2));
    await page.getByTestId('sound-toggle').click();
    assert.equal(await page.getByTestId('sound-toggle').getAttribute('aria-pressed'), 'false');
    await page.getByTestId('theme-toggle').click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await screenshot(page, '11-decision-dark-reduced-motion.png');
    await viewportScreenshot(page, 'jinni-desktop-dark.png');
    await page.getByTestId('theme-toggle').click();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });
}

async function exerciseLanguages(page, desktop, baseUrl) {
  await chooseScenario(page, 'travel');
  await page.getByTestId('limit-cost-pence').fill('24.75');
  await compare(page);
  await check('five UI languages retain edited inputs, calculated comparison and provider-call count', async () => {
    const request = await page.evaluate(() => window.currentDecisionRequest());
    const calls = (await (await fetch(`${baseUrl}/__test__/provider-status`)).json()).calls;
    const winner = await page.locator('.decision-recommendation h3').innerText();
    const scores = await page.locator('.table-score').allTextContents();
    for (const locale of ['zh-CN', 'fr', 'ja', 'ru', 'en']) {
      await page.getByTestId('language-select').selectOption(locale);
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
      assert.equal(await page.getByTestId('limit-cost-pence').inputValue(), '24.75');
      assert.deepEqual(await page.evaluate(() => window.currentDecisionRequest()), request);
      assert.equal(await page.locator('.decision-recommendation h3').innerText(), winner);
      assert.deepEqual(await page.locator('.table-score').allTextContents(), scores);
      assert.equal((await page.locator('#workspace-title').innerText()) === 'A clearer way to choose.', locale === 'en');
      if (['zh-CN', 'fr', 'ru'].includes(locale)) {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await viewportScreenshot(page, `jinni-desktop-${locale}.png`);
      }
    }
    assert.deepEqual((await (await fetch(`${baseUrl}/__test__/provider-status`)).json()).calls, calls);
  });
  await check('custom labels and units that equal interface phrases remain literal', async () => {
    await chooseScenario(page, 'custom');
    const definition = customComparison();
    definition.criteria[1].label = 'Source library';
    definition.criteria[1].unit = 'hours';
    await applyDefinition(page, definition);
    await compare(page);
    await page.getByTestId('language-select').selectOption('zh-CN');
    await contains(page.locator('label[for="weight-quality-score"]'), 'Source library');
    await contains(page.getByTestId('decision-table'), 'Source library');
    await contains(page.getByTestId('decision-table'), 'hours');
    await page.getByTestId('language-select').selectOption('en');
    await chooseScenario(page, 'travel');
    await compare(page);
  });
  await check('long translated labels fit a narrow desktop and blocked locale storage remains usable', async () => {
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 850));
    for (const locale of ['fr', 'ru']) {
      await page.getByTestId('language-select').selectOption(locale);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true);
    }
    const fallback = await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      try {
        Storage.prototype.setItem = () => { throw new Error('Storage disabled for this isolated test.'); };
        window.jinniI18n.setLocale('ja');
        return { locale: window.jinniI18n.getLocale(), missing: window.jinniI18n.t('An intentionally missing interface key') };
      } finally { Storage.prototype.setItem = original; }
    });
    assert.deepEqual(fallback, { locale: 'ja', missing: 'An intentionally missing interface key' });
    await page.getByTestId('language-select').selectOption('en');
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
  });
}

async function exerciseMockedProviderDesktop() {
  const directory = tempDirectory();
  let backend = await startMockBackend({ directory });
  let desktop;
  let page;
  try {
    ({ application: desktop, page } = await launchDesktop(electron, backend.baseUrl, directory));
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
    await contains(page.getByTestId('backend-status'), 'ready');
    await waitUntil(() => page.getByTestId('plan-submit').isEnabled());

    await exerciseGeneralDecisions(page, backend.baseUrl);
    await exerciseLanguages(page, desktop, backend.baseUrl);

    await check('actual Electron isolation and planner GBP 10 / 4 / 0', async () => {
      await openLegacy(page);
      const applicationInfo = await desktop.evaluate(({ app }) => ({ name: app.getName(), userData: app.getPath('userData') }));
      assert.equal(applicationInfo.name, 'jinni');
      assert.equal(applicationInfo.userData, path.join(directory, 'desktop'));
      const isolation = await desktop.evaluate(({ BrowserWindow }) => {
        const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
        return { contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration, sandbox: preferences.sandbox };
      });
      assert.deepEqual(isolation, { contextIsolation: true, nodeIntegration: false, sandbox: true });
      assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
      await page.getByTestId('budget').fill('10.00');
      await page.getByTestId('plan-submit').click();
      await contains(page.getByTestId('planner-result'), 'Board Game Night');
      assert.match(await page.getByTestId('planner-result').innerText(), /(?:GBP\s*|£)5\.00/);
      await screenshot(page, '01-planner.png');
      await page.getByTestId('budget').fill('4.00');
      await page.getByTestId('plan-submit').click();
      await contains(page.getByTestId('planner-result'), 'Acoustic Hour');
      await page.getByTestId('budget').fill('0.00');
      await page.getByTestId('plan-submit').click();
      await contains(page.getByTestId('planner-result'), 'no activity');
      assert.equal((await page.getByTestId('planner-result').innerText()).includes('Acoustic Hour'), false);
    });

    await check('city-centre travel changes the real calculated recommendation', async () => {
      await openLegacy(page);
      await page.getByTestId('origin').selectOption('glasgow-city-centre');
      await page.getByTestId('budget').fill('10.00');
      await page.getByTestId('plan-submit').click();
      await contains(page.getByTestId('planner-result'), 'Short Film Club');
      assert.equal((await page.getByTestId('planner-result').innerText()).includes('Board Game Night'), false);
    });

    let guide;
    let excluded;
    let imported;
    await check('real pasted-source create/list and native-picker PDF upload', async () => {
      guide = await addText(page, backend.baseUrl, 'Fictional Venue Guide', 'Board Game Night starts at 16:30. The fictional venue has a ramp entrance.');
      excluded = await addText(page, backend.baseUrl, 'Excluded Observatory Guide', 'The observatory code is OMITTED-8672 and closing time is 22:00.');
      const fixture = path.join(directory, 'fictional-museum.pdf');
      fs.writeFileSync(fixture, pdfFixture('The fictional museum opens at 11:00. The entrance has a ramp.'));
      await desktop.evaluate(({ dialog }, filename) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
      }, fixture);
      await page.getByTestId('source-simulated').check();
      await page.getByTestId('import-source').click();
      imported = await waitUntil(async () => (await sources(backend.baseUrl)).find((source) => source.filename === 'fictional-museum.pdf'));
      assert.equal(imported.kind, 'pdf');
      assert.equal(imported.is_simulated, true);
      await contains(page.getByTestId('source-list'), imported.title);
      await selectOnly(page, [imported.id]);
    });

    await check('cancelled native file picker changes no sources', async () => {
      const before = await sources(backend.baseUrl);
      await desktop.evaluate(({ dialog }) => {
        dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
      });
      await page.getByTestId('import-source').click();
      await contains(page.getByTestId('library-status'), 'cancel');
      assert.deepEqual(await sources(backend.baseUrl), before);
    });

    await check('missing key stays an error while deterministic planning remains usable', async () => {
      await ask(page, 'When does the fictional museum open?');
      await contains(page.getByTestId('chat-feedback'), 'key');
      const settings = await page.evaluate(() => window.myJinni.getSessionSettings());
      assert.deepEqual(settings, { configured: false });
      assert.equal(await page.getByTestId('plan-submit').isEnabled(), true);
    });

    await check('missing-key feedback translates without a request and keyless planning stays enabled', async () => {
      await closeTools(page);
      await page.getByTestId('language-select').selectOption('zh-CN');
      await openTool(page, 'chat');
      await contains(page.getByTestId('chat-feedback'), '密钥');
      assert.equal(await page.getByTestId('plan-submit').isEnabled(), true);
      assert.deepEqual(await page.evaluate(() => window.myJinni.getSessionSettings()), { configured: false });
      await closeTools(page);
      await page.getByTestId('language-select').selectOption('en');
      await openTool(page, 'chat');
    });

    await check('session key is memory-only and the input clears after saving', async () => {
      await saveKey(page, TEST_KEY);
      assert.deepEqual(await page.evaluate(() => window.myJinni.getSessionSettings()), { configured: true });
      assert.equal((await page.evaluate(() => JSON.stringify(window.localStorage))).includes(TEST_KEY), false);
    });

    await check('MOCKED provider citation opens the real original PDF text and page', async () => {
      await ask(page, 'When does the fictional museum open?');
      await contains(page.getByTestId('chat-answer'), '11:00');
      const status = await (await fetch(`${backend.baseUrl}/__test__/provider-status`)).json();
      assert.deepEqual(status.last_source_ids, [imported.id]);
      assert.equal(status.header_used, true);
      assert.equal(status.body_key_free, true);
      assert.equal(status.store_disabled, true);
      assert.equal((await page.getByTestId('chat-result').innerText()).includes('OMITTED-8672'), false);
      await screenshot(page, '02-chat-mocked-provider.png');
      await page.getByTestId('chat-result').scrollIntoViewIfNeeded();
      await viewportScreenshot(page, 'jinni-desktop-ai-mocked.png');
      await page.getByTestId('citation-reference').first().click();
      await contains(page.getByTestId('source-dialog-content'), '11:00');
      await contains(page.getByTestId('citation-quote'), '11:00');
      assert.match(await page.getByTestId('source-dialog-content').innerText(), /page\s*1/i);
      assert.match(await page.getByTestId('source-dialog-content').locator('mark').first().innerText(), /11:00/);
      await screenshot(page, '03-original-citation.png');
      await viewportScreenshot(page, 'jinni-desktop-citation-mocked.png');
      await page.getByTestId('source-dialog').getByRole('button', { name: 'Close', exact: true }).click();
    });

    await check('five languages preserve original citations, source selection, answer and session key', async () => {
      const answer = await page.getByTestId('chat-answer').innerText();
      const calls = (await (await fetch(`${backend.baseUrl}/__test__/provider-status`)).json()).calls;
      for (const locale of ['zh-CN', 'fr', 'ja', 'ru', 'en']) {
        await closeTools(page);
        await page.getByTestId('language-select').selectOption(locale);
        await openTool(page, 'chat');
        assert.equal(await page.getByTestId('chat-answer').innerText(), answer);
        assert.equal(await page.getByTestId('cloud-recipient').innerText(), 'OpenAI');
        await page.getByTestId('citation-reference').first().click();
        await contains(page.getByTestId('source-dialog-content'), '11:00');
        assert.equal(await page.locator('.original-quote').innerText(), '“The fictional museum opens at 11:00. The entrance has a ramp.”');
        assert.equal(await page.getByTestId('source-dialog-content').locator('mark').innerText(), 'The fictional museum opens at 11:00. The entrance has a ramp.');
        await page.getByTestId('source-close').click();
        assert.deepEqual(await page.evaluate(() => window.myJinni.getSessionSettings()), { configured: true });
        assert.equal((await page.evaluate(() => JSON.stringify(window.localStorage))).includes(TEST_KEY), false);
      }
      assert.deepEqual((await (await fetch(`${backend.baseUrl}/__test__/provider-status`)).json()).calls, calls);
      await openTool(page, 'library');
      assert.equal(await page.locator(`[data-testid="source-checkbox"][value="${imported.id}"]`).isChecked(), true);
      await openTool(page, 'chat');
    });

    await check('MOCKED AI explanation includes the authoritative real city-origin plan', async () => {
      await page.getByTestId('include-plan').check();
      await page.getByTestId('question').fill('Which activity fits my plan and what does the museum guide say?');
      await page.getByTestId('ask-submit').click();
      await contains(page.getByTestId('chat-planner'), 'Short Film Club');
      assert.match(await page.getByTestId('chat-planner').innerText(), /(?:GBP\s*|£)6\.00/);
      const status = await (await fetch(`${backend.baseUrl}/__test__/provider-status`)).json();
      assert.ok(status.last_source_ids.includes('planner-context'));
      assert.ok(status.last_source_ids.includes(imported.id));
      assert.equal(status.last_source_ids.includes(excluded.id), false);
    });

    await check('MOCKED AI cites an authoritative server-calculated general comparison', async () => {
      await chooseScenario(page, 'travel');
      await compare(page);
      const winner = await page.getByTestId('decision-results').locator('.decision-recommendation h3').innerText();
      await openTool(page, 'chat');
      await page.getByTestId('include-plan').uncheck();
      await page.getByTestId('include-decision').check();
      await page.getByTestId('question').fill('Explain my current comparison using these sources.');
      await page.getByTestId('ask-submit').click();
      await contains(page.getByTestId('chat-decision'), winner);
      const status = await (await fetch(`${backend.baseUrl}/__test__/provider-status`)).json();
      assert.ok(status.last_source_ids.includes('decision-context'));
      await page.locator('[data-testid="citation-reference"][data-source-id="decision-context"]').click();
      await contains(page.getByTestId('source-dialog-content'), winner);
      await page.getByTestId('source-close').click();
      await page.getByTestId('include-decision').uncheck();
    });

    await check('no lexical match gives insufficient evidence without a provider call', async () => {
      const before = await (await fetch(`${backend.baseUrl}/__test__/provider-status`)).json();
      await ask(page, 'Axolotl hyperdrive spectroscopy');
      await contains(page.getByTestId('chat-result'), 'evidence');
      const after = await (await fetch(`${backend.baseUrl}/__test__/provider-status`)).json();
      assert.deepEqual(after.calls, before.calls);
      assert.equal((await page.getByTestId('chat-result').innerText()).includes('11:00'), false);
    });

    await check('MOCKED invalid key, provider failure and retry preserve honest states', async () => {
      await ask(page, 'When does the fictional museum open?', 'test-auth-error');
      await contains(page.getByTestId('chat-feedback'), 'key');
      await ask(page, 'When does the fictional museum open?', 'test-provider-error');
      await contains(page.getByTestId('chat-feedback'), 'unavailable');
      assert.equal((await page.getByTestId('chat-result').innerText()).includes('11:00'), false);
      await page.getByTestId('ask-submit').click();
      await contains(page.getByTestId('chat-answer'), '11:00');
      await ask(page, 'When does the fictional museum open?', 'test-provider-timeout');
      await contains(page.getByTestId('chat-feedback'), 'timed out');
    });

    await check('editing during a slow MOCKED answer prevents stale success', async () => {
      await ask(page, 'When does the fictional museum open?', 'test-slow');
      assert.equal(await page.getByTestId('ask-submit').isEnabled(), false);
      await page.getByTestId('question').fill('A different question now');
      await page.waitForTimeout(650);
      assert.equal((await page.getByTestId('chat-result').innerText()).includes('11:00'), false);
    });

    await check('DeepSeek selection uses its model and never borrows the OpenAI key', async () => {
      await page.getByTestId('provider').selectOption('deepseek');
      assert.equal(await page.getByTestId('model').inputValue(), 'deepseek-flash');
      await contains(page.getByTestId('cloud-recipient'), 'DeepSeek');
      assert.deepEqual(await page.evaluate(() => window.myJinni.getSessionSettings('deepseek')), { configured: false });
      assert.deepEqual(await page.evaluate(() => window.myJinni.getSessionSettings('openai')), { configured: true });
      await ask(page, 'When does the fictional museum open?', 'deepseek-flash');
      await contains(page.getByTestId('chat-feedback'), 'key');
      await saveKey(page, 'sk-deepseek-test-placeholder', 'deepseek');
      await ask(page, 'When does the fictional museum open?', 'deepseek-flash');
      await contains(page.getByTestId('chat-answer'), '11:00');
      const status = await (await fetch(`${backend.baseUrl}/__test__/provider-status`)).json();
      assert.equal(status.last_provider, 'deepseek');
      assert.equal(status.header_used, true);
      assert.equal(status.body_key_free, true);
      await screenshot(page, '06-deepseek-mocked-provider.png');
    });

    await check('Gemini and Anthropic also use isolated keys and checked original citations', async () => {
      for (const [provider, model] of [['gemini', 'gemini-3.8-flash'], ['anthropic', 'claude-sonnet-4-6']]) {
        await page.getByTestId('provider').selectOption(provider);
        assert.equal(await page.getByTestId('model').inputValue(), model);
        await saveKey(page, `sk-${provider}-test-placeholder`, provider);
        await ask(page, 'When does the fictional museum open?', model);
        await contains(page.getByTestId('chat-answer'), '11:00');
        const status = await (await fetch(`${backend.baseUrl}/__test__/provider-status`)).json();
        assert.equal(status.last_provider, provider);
        assert.equal(status.header_used, true);
        assert.equal(status.body_key_free, true);
      }
    });

    await check('DeepSeek failure/retry is explicit and clearing its key leaves OpenAI configured', async () => {
      await page.getByTestId('provider').selectOption('deepseek');
      await ask(page, 'When does the fictional museum open?', 'test-provider-error');
      await contains(page.getByTestId('chat-feedback'), 'unavailable');
      await page.getByTestId('ask-submit').click();
      await contains(page.getByTestId('chat-answer'), '11:00');
      await openSettings(page);
      await page.getByTestId('settings-provider').selectOption('deepseek');
      await page.getByTestId('clear-key').click();
      await waitUntil(async () => !(await page.evaluate(() => window.myJinni.getSessionSettings('deepseek'))).configured);
      assert.deepEqual(await page.evaluate(() => window.myJinni.getSessionSettings('openai')), { configured: true });
      await page.getByTestId('settings-dialog').getByRole('button', { name: 'Close', exact: true }).click();
      await ask(page, 'When does the fictional museum open?', 'deepseek-flash');
      await contains(page.getByTestId('chat-feedback'), 'key');
      await openLegacy(page);
      await page.getByTestId('plan-submit').click();
      await contains(page.getByTestId('planner-result'), 'Short Film Club');
      await openTool(page, 'chat');
    });

    await check('switching provider invalidates a slow MOCKED answer and clears unsaved key entry', async () => {
      await saveKey(page, 'sk-deepseek-test-placeholder', 'deepseek');
      await ask(page, 'When does the fictional museum open?', 'test-slow');
      await page.getByTestId('provider').selectOption('openai');
      await page.waitForTimeout(650);
      assert.equal((await page.getByTestId('chat-result').innerText()).includes('11:00'), false);
      await openSettings(page);
      await page.getByTestId('api-key').fill('unsaved-placeholder');
      await page.getByTestId('settings-provider').selectOption('deepseek');
      assert.equal(await page.getByTestId('api-key').inputValue(), '');
      assert.equal(await page.getByTestId('provider').inputValue(), 'deepseek');
      await screenshot(page, '07-deepseek-session-settings.png');
      await page.getByTestId('settings-dialog').getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByTestId('provider').selectOption('openai');
    });

    await check('keyboard navigation and resized window remain usable', async () => {
      await openLegacy(page);
      await page.getByTestId('origin').focus();
      await page.keyboard.press('Tab');
      assert.notEqual(await page.evaluate(() => document.activeElement.id), 'origin');
      await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1050, 760));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true);
      await screenshot(page, '04-resized-window.png');
    });

    await check('source deletion updates real storage and an external backend survives app close', async () => {
      await openTool(page, 'library');
      await page.locator(`[data-testid="source-delete"][data-source-id="${excluded.id}"]`).click();
      await waitUntil(async () => !(await sources(backend.baseUrl)).some((source) => source.id === excluded.id));
      await closeTools(page);
      await page.getByTestId('language-select').selectOption('fr');
      await desktop.close();
      desktop = null;
      assert.equal((await fetch(`${backend.baseUrl}/health`)).status, 200);
    });

    await check('library survives backend restart while session key does not', async () => {
      const port = Number(new URL(backend.baseUrl).port);
      await backend.stop();
      backend = await startMockBackend({ directory, port });
      ({ application: desktop, page } = await launchDesktop(electron, backend.baseUrl, directory));
      await waitUntil(async () => await page.getByTestId('language-select').locator('option').count() === 5);
      assert.equal(await page.getByTestId('language-select').inputValue(), 'fr');
      assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
      await page.getByTestId('language-select').selectOption('en');
      await openTool(page, 'library');
      await contains(page.getByTestId('source-list'), imported.title);
      const saved = await sources(backend.baseUrl);
      assert.ok(saved.some((source) => source.id === guide.id));
      assert.ok(saved.some((source) => source.id === imported.id));
      for (const provider of ['openai', 'deepseek', 'gemini', 'anthropic']) {
        assert.deepEqual(await page.evaluate((id) => window.myJinni.getSessionSettings(id), provider), { configured: false });
      }
    });
  } catch (error) {
    if (page && !page.isClosed()) await screenshot(page, 'failure.png').catch(() => {});
    throw error;
  } finally {
    if (desktop) await desktop.close().catch(() => {});
    await backend.stop();
  }
}

async function exerciseOwnedBackendRecovery() {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const directory = tempDirectory();
  const occupied = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data: { status: 'ok', recommendations_ready: true }, info: { title: 'Unrelated test server' } }));
  });
  await new Promise((resolve) => occupied.listen(port, '127.0.0.1', resolve));
  let desktop;
  let page;
  try {
    ({ application: desktop, page } = await launchDesktop(electron, baseUrl, directory));
    await check('occupied-port startup failure is visible and leaves the other service running', async () => {
      await contains(page.getByTestId('backend-status'), 'port');
      assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
      await screenshot(page, '05-startup-failure.png');
    });
    await new Promise((resolve) => occupied.close(resolve));
    await check('retry starts an owned real backend and normal close stops it', async () => {
      await page.getByTestId('backend-retry').click();
      await contains(page.getByTestId('backend-status'), 'ready');
      const status = await page.evaluate(() => window.myJinni.getBackendStatus());
      assert.equal(status.owned, true);
      await openLegacy(page);
      await page.getByTestId('plan-submit').click();
      await contains(page.getByTestId('planner-result'), 'Board Game Night');
      await desktop.close();
      desktop = null;
      await waitUntil(async () => {
        try { await fetch(`${baseUrl}/health`); return false; } catch { return true; }
      }, { message: 'Owned backend remained running after desktop close.' });
    });
  } finally {
    if (desktop) await desktop.close().catch(() => {});
    if (occupied.listening) await new Promise((resolve) => occupied.close(resolve));
  }
}

async function main() {
  console.log('Actual Electron + IPC + HTTP + SQLite + planner verification; all AI providers are MOCKED.');
  await exerciseMockedProviderDesktop();
  await exerciseOwnedBackendRecovery();
  console.log(`DESKTOP E2E PASSED: ${checks} checks. Live provider account access was not tested.`);
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
