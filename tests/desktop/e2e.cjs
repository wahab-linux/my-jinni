/* global window, document, getComputedStyle */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { _electron: electron } = require('playwright');
const { ROOT, SCREENSHOTS, TEST_KEY, tempDirectory, freePort, waitUntil, startMockBackend, launchDesktop } = require('./helpers.cjs');

let checks = 0;
async function check(name, action) {
  try { await action(); } catch (error) { error.message = `${name}: ${error.message}`; throw error; }
  checks++;
  console.log(`PASS ${name}`);
}
async function contains(locator, text) {
  await waitUntil(async () => (await locator.innerText()).toLowerCase().includes(text.toLowerCase()), { message: `Expected text: ${text}` });
}
async function screenshot(page, name) {
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOTS, name), scale: 'css' });
}
async function json(base, route) {
  const response = await fetch(`${base}${route}`);
  assert.equal(response.status, 200);
  return response.json();
}
const sources = async (base) => (await json(base, '/api/v1/sources')).data.sources;
const status = (base) => json(base, '/__test__/provider-status');
async function submit(page, base, kind, button) {
  const previous = (await json(base, '/__test__/captured'))[kind]?.sequence || 0;
  await page.locator(button).click();
  return waitUntil(async () => {
    const current = (await json(base, '/__test__/captured'))[kind];
    return current?.sequence > previous && current;
  }, { message: `No actual backend ${kind} request was observed.` });
}
async function post(base, route, value) {
  const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  return { status: response.status, body: await response.json() };
}
async function context(page) {
  return page.evaluate(async () => {
    const ui = await import('jinni://app/ui-context.mjs');
    return { sources: ui.getSourceIds(), planner: ui.getPlannerPreferences(), decision: ui.getDecisionRequest() };
  });
}
async function closeTools(page) {
  for (let index = 0; index < 5 && await page.locator('dialog[open]').count(); index++) await page.keyboard.press('Escape');
}
async function library(page) {
  if (await page.locator('#library-dialog').isVisible()) return;
  await closeTools(page); await page.locator('#library-open').click();
}
async function ai(page) {
  await closeTools(page); await page.locator('#desktop-ai-open').click();
}
async function settings(page, trigger = 'desktop-ai-settings-open') {
  if (await page.locator('#desktop-ai-settings').isVisible()) return;
  await closeTools(page); await page.locator(`#${trigger}`).click();
  await page.locator('#desktop-ai-settings').waitFor();
}
async function closeSettings(page) {
  if (await page.locator('#desktop-ai-settings').isVisible()) await page.locator('#desktop-ai-settings-close').click();
}
async function provider(page, id) {
  await settings(page); await page.locator('#desktop-ai-provider').selectOption(id); await closeSettings(page);
}
async function chooseModel(page, value) {
  await settings(page);
  const values = await page.locator('#desktop-ai-model-select option').evaluateAll((options) => options.map((option) => option.value));
  await page.locator('#desktop-ai-model-select').selectOption(values.includes(value) ? value : '__custom__');
  if (!values.includes(value)) await page.locator('#desktop-ai-model').fill(value);
  assert.equal(await page.locator('#desktop-ai-model').inputValue(), value);
  await closeSettings(page);
}
async function legacy(page) {
  await closeTools(page);
  if (!await page.locator('#legacy-planner').evaluate((node) => node.open)) await page.locator('#legacy-planner > summary').click();
}
async function scenario(page, id) {
  await closeTools(page); await page.locator(`#scenario-tabs button[data-id="${id}"]`).click();
  await waitUntil(() => page.locator('#decision-submit').isEnabled());
}
async function compare(page, base) {
  const response = await submit(page, base, 'decision', '#decision-submit');
  if (response.status === 200) {
    if (response.body.data.recommended) await page.locator('.decision-card').waitFor();
    else await contains(page.locator('#decision-status'), 'Nothing fits');
  }
  return response;
}
async function definition(page, value) {
  if (!await page.locator('#custom-editor').evaluate((node) => node.open)) await page.locator('#custom-editor > summary').click();
  await page.locator('#custom-json').fill(JSON.stringify(value, null, 2)); await page.locator('#custom-apply').click();
  await contains(page.locator('#custom-status'), 'applied');
}
async function plan(page, base, budget) {
  await legacy(page); await page.locator('#budget-preset').selectOption('custom'); await page.locator('#budget').fill(budget);
  const response = await submit(page, base, 'planner', '#plan-submit');
  if (response.body.data?.recommended) await page.locator('.activity.featured').waitFor();
  return response;
}
async function menu(page, id) {
  await library(page);
  if (!await page.locator('#add-source-picker').evaluate((node) => node.open)) await page.locator('#add-source-picker > summary').click();
  await page.locator(`#${id}`).click();
}
async function paste(page, base, title, text) {
  await library(page);
  if (!await page.locator('#paste-form').isVisible()) await menu(page, 'paste-toggle');
  await page.locator('#source-title').fill(title); await page.locator('#source-text').fill(text);
  await page.locator('#source-simulated').check(); await page.locator('#paste-form button[type=submit]').click();
  const result = await waitUntil(async () => (await sources(base)).find((item) => item.title === title));
  await page.locator(`.source-item[data-source-id="${result.id}"]`).waitFor(); return result;
}
async function select(page, ids) {
  await library(page);
  for (const row of await page.locator('.source-item').all()) await row.locator('input[type=checkbox]').setChecked(ids.includes(await row.getAttribute('data-source-id')));
  assert.deepEqual((await context(page)).sources.sort(), [...ids].sort());
}
async function importFile(page, app, base, directory, filename, bytes) {
  const file = path.join(directory, filename); fs.writeFileSync(file, bytes);
  await app.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }); }, file);
  await library(page); await page.locator('#import-simulated').check(); await menu(page, 'import-button');
  const result = await waitUntil(async () => (await sources(base)).find((item) => item.filename === filename));
  await page.locator(`.source-item[data-source-id="${result.id}"]`).waitFor();
  await waitUntil(() => page.locator('#import-button').isEnabled());
  return result;
}
async function key(page, value, provider = 'openai') {
  await settings(page); await page.locator('#desktop-ai-provider').selectOption(provider);
  await page.locator('#desktop-ai-key').fill(value);
  await page.locator('#desktop-ai-key-save').click();
  await waitUntil(async () => (await page.evaluate((id) => window.myJinni.getSessionSettings(id), provider)).configured);
  assert.equal(await page.locator('#desktop-ai-key').inputValue(), '');
  assert.equal((await page.evaluate(() => JSON.stringify(window.localStorage))).includes(value), false);
  await closeSettings(page);
}
async function ask(page, base, question, model = 'gpt-4.1-mini') {
  await ai(page); await page.locator('#desktop-ai-include-plan').uncheck(); await page.locator('#desktop-ai-include-decision').uncheck();
  await chooseModel(page, model); await page.locator('#desktop-ai-question').fill(question);
  return submit(page, base, 'chat', '#desktop-ai-ask');
}
async function appearance(page, mode) {
  await closeTools(page);
  if (!await page.locator('#appearance-picker').evaluate((node) => node.open)) await page.locator('#theme-toggle').click();
  await page.locator(`[name=appearance][value="${mode}"]`).check(); await page.locator('#appearance-done').click();
}
function equipment() {
  const source = (id) => ({ id, label: `Fictional ${id}`, is_simulated: true, updated_at: '2026-10-17T10:00:00+01:00' });
  return { title: 'Fictional equipment choice', criteria: [
    { id: 'cost-pence', label: 'Price', unit: 'pence', direction: 'minimize', default_weight: 100 },
    { id: 'quality-score', label: 'Your choices', unit: 'hours', direction: 'maximize', default_weight: 0 },
  ], dataset: { option_source: source('catalog'), metric_source: source('measurements'), options: [
    { id: 'budget', name: 'Budget equipment', category: 'equipment', description: 'Fictional lower-cost option.' },
    { id: 'premium', name: 'Premium equipment', category: 'equipment', description: 'Fictional higher-quality option.' },
  ], observations: [
    { option_id: 'budget', available: true, metrics: { 'cost-pence': 100, 'quality-score': 20 } },
    { option_id: 'premium', available: true, metrics: { 'cost-pence': 900, 'quality-score': 100 } },
  ] } };
}
function pdf(text) {
  const stream = `BT /F1 12 Tf 10 100 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let result = '%PDF-1.4\n'; const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(result)); result += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const start = Buffer.byteLength(result);
  result += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(result);
}

async function decisions(page, base) {
  for (const id of ['market', 'travel', 'student', 'sustainability', 'custom']) await check(`shared ${id} controls call the actual two-source Python comparison`, async () => {
    await scenario(page, id); const result = await compare(page, base); assert.equal(result.status, 200);
    assert.equal(result.request.scenario_id, id); assert.deepEqual(result.body, (await post(base, '/api/v1/decisions/evaluate', result.request)).body);
    assert.equal(result.body.data.sources.length, 2); assert.notEqual(result.body.data.sources[0].id, result.body.data.sources[1].id);
    assert.equal(await page.locator('.decision-card').getAttribute('data-option-id'), result.body.data.recommended.id);
    assert.equal(await page.locator('#decision-results .comparison-table').first().locator('tbody tr').count(), result.body.data.ranked.length);
    await page.locator('.decision-about > summary').click();
    for (const source of result.body.data.sources) await contains(page.locator('.decision-provenance'), source.label);
    if (id === 'market') assert.match(await page.locator('#scenario-notice').innerText(), /No.*(?:investment|suitability)/i);
  });
  await check('custom domains support weight flips, hard exclusions, missing data and constructor IDs', async () => {
    const custom = equipment(); await definition(page, custom);
    assert.equal((await compare(page, base)).body.data.recommended.id, 'budget');
    await page.locator('#priority-cost-pence').selectOption('custom'); await page.locator('#weight-cost-pence').fill('0');
    await page.locator('#priority-quality-score').selectOption('custom'); await page.locator('#weight-quality-score').fill('100');
    assert.equal(await page.locator('.decision-card').count(), 0);
    assert.equal((await compare(page, base)).body.data.recommended.id, 'premium');
    await page.locator('#bound-cost-pence').selectOption('lte'); await page.locator('#limit-cost-pence').fill('0.00');
    assert.equal((await compare(page, base)).body.data.recommended, null); assert.equal(await page.locator('.decision-card').count(), 0);
    custom.dataset.observations = []; await definition(page, custom);
    const missing = (await compare(page, base)).body.data; assert.equal(missing.recommended, null); assert.match(missing.excluded[0].reasons.join(), /measurements/);
    custom.criteria = [{ id: 'constructor', label: 'Price', unit: 'hours', direction: 'maximize', default_weight: 100 }];
    custom.dataset.observations = [{ option_id: 'budget', available: true, metrics: { constructor: 1 } }, { option_id: 'premium', available: true, metrics: { constructor: 100 } }];
    await definition(page, custom); assert.equal(await page.locator('#weight-constructor').inputValue(), '100');
    assert.equal((await compare(page, base)).body.data.recommended.id, 'premium');
    assert.equal((await page.locator('#decision-results').innerText()).includes('NaN'), false);
  });
  await check('failed real feeds clear prior success and an explicit retry recovers without fallback', async () => {
    await scenario(page, 'travel'); await compare(page, base); await fetch(`${base}/__test__/source-mode?failed=true`, { method: 'POST' });
    try { assert.equal((await compare(page, base)).status, 503); await contains(page.locator('#decision-status'), 'source'); assert.equal(await page.locator('.decision-card').count(), 0); }
    finally { await fetch(`${base}/__test__/source-mode?failed=false`, { method: 'POST' }); }
    assert.equal((await compare(page, base)).status, 200);
  });
}

async function planner(page, base) {
  await check('shared planner preserves GBP 10 / 4 / 0 and distinct city-origin journeys', async () => {
    await legacy(page); await page.locator('#origin').selectOption('glasgow-main-campus');
    let result = (await plan(page, base, '10.00')).body.data; assert.equal(result.recommended.title, 'Board Game Night'); assert.equal(result.recommended.total_cost_pence, 500);
    await contains(page.locator('.activity.featured'), '£5.00');
    assert.equal((await plan(page, base, '4.00')).body.data.recommended.title, 'Acoustic Hour');
    assert.equal((await plan(page, base, '0.00')).body.data.recommended, null); assert.equal(await page.locator('.activity.featured').count(), 0);
    await page.locator('#origin').selectOption('glasgow-city-centre'); result = (await plan(page, base, '10.00')).body.data;
    assert.equal(result.recommended.title, 'Short Film Club'); assert.equal(result.recommended.total_cost_pence, 600); assert.equal(JSON.stringify(result).includes('Board Game Night'), false);
  });
  await check('budget, outbound and return equality pass; each just-over boundary excludes the activity', async () => {
    await page.locator('#origin').selectOption('glasgow-main-campus'); await page.locator('#depart').fill('16:15'); await page.locator('#return').fill('18:15');
    assert.equal((await plan(page, base, '5.00')).body.data.recommended.title, 'Board Game Night');
    for (const [budget, depart, back] of [['4.99', '16:15', '18:15'], ['5.00', '16:16', '18:15'], ['5.00', '16:15', '18:14']]) {
      await page.locator('#depart').fill(depart); await page.locator('#return').fill(back); const result = (await plan(page, base, budget)).body.data;
      assert.equal([result.recommended, ...result.alternatives].filter(Boolean).some((item) => item.title === 'Board Game Night'), false);
    }
    await page.locator('#origin').selectOption('glasgow-city-centre'); await page.locator('#depart').fill('16:00'); await page.locator('#return').fill('19:00'); await plan(page, base, '10.00');
  });
}

async function sourceLibrary(page, app, base, directory) {
  const text = 'The fictional museum opens at 11:00. The entrance has a ramp.';
  let guide; let excluded; let imported;
  await check('shared library saves literal notes and native TXT, Markdown and page-aware PDF to SQLite', async () => {
    guide = await paste(page, base, 'Price <img src=x>', 'Board Game Night starts at 16:30. Exact evidence <script>not executable</script>.');
    excluded = await paste(page, base, 'Excluded Observatory Guide', 'The observatory code is OMITTED-8672 and closing time is 22:00.');
    await importFile(page, app, base, directory, 'fictional-note.txt', 'A fictional text note about museum access.');
    await importFile(page, app, base, directory, 'fictional-note.md', '# Fictional guide\nMuseum access is fictional.');
    imported = await importFile(page, app, base, directory, 'fictional-museum.pdf', pdf(text));
    assert.equal(imported.kind, 'pdf'); assert.equal(imported.is_simulated, true);
    const detail = (await json(base, `/api/v1/sources/${imported.id}`)).data; assert.equal(detail.chunks[0].page, 1); assert.equal(detail.chunks[0].text, text);
    assert.equal(await page.locator('.source-item img, .source-item script').count(), 0); await select(page, [imported.id]);
  });
  await check('cancelled native picker and unsupported files leave the library unchanged', async () => {
    const before = await sources(base); await app.evaluate(({ dialog }) => { globalThis.testPickerFinished = false; dialog.showOpenDialog = async () => { globalThis.testPickerFinished = true; return { canceled: true, filePaths: [] }; }; });
    await menu(page, 'import-button'); await waitUntil(() => app.evaluate(() => globalThis.testPickerFinished));
    await waitUntil(() => page.locator('#import-button').isEnabled()); assert.deepEqual(await sources(base), before);
    const fixture = path.join(directory, 'unsupported.exe'); fs.writeFileSync(fixture, 'Harmless plain-text fixture.');
    await app.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }); }, fixture);
    await menu(page, 'import-button'); await contains(page.locator('#library-status'), 'UTF-8 text'); assert.deepEqual(await sources(base), before);
  });
  await check('selected-source search opens original literal evidence without an AI request', async () => {
    const before = (await status(base)).calls; await page.locator('#question').fill('museum opens'); await page.locator('#search-form button').click();
    await contains(page.locator('#search-results blockquote').first(), '11:00'); assert.equal((await page.locator('#search-results').innerText()).includes('OMITTED-8672'), false);
    await page.locator('#search-results button').first().click(); await contains(page.locator('#viewer-content'), text);
    assert.equal(await page.locator('#viewer-title').innerText(), imported.title); assert.deepEqual((await status(base)).calls, before); await closeTools(page);
  });
  return { guide, excluded, imported, text };
}

async function providers(page, base, saved) {
  const question = 'When does the fictional museum open?';
  await check('Ask is inline by default, while independent settings support keyboard, Escape and restored focus', async () => {
    await closeTools(page);
    assert.equal(await page.locator('#desktop-ai-dialog').evaluate((node) => node.tagName), 'SECTION');
    assert.equal(await page.locator('#desktop-ai-question').isVisible(), true);
    assert.equal(await page.locator('#desktop-ai-settings').evaluate((node) => node.tagName), 'DIALOG');
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await page.locator('#desktop-ai-open').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'desktop-ai-question');
    await page.locator('#decision-submit').click(); await page.locator('.decision-card').waitFor();
    assert.equal(await page.locator('dialog[open]').count(), 0);
    for (const trigger of ['desktop-ai-settings-open', 'desktop-ai-settings-nav']) {
      await page.locator(`#${trigger}`).focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator('#desktop-ai-settings').isVisible(), true);
      assert.equal(await page.locator('#desktop-ai-provider').isVisible(), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.getElementById('desktop-ai-settings').contains(document.activeElement)), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#desktop-ai-settings').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), trigger);
    }
    await screenshot(page, 'inline-ai-default.png');
  });
  await check('provider-specific suggested models and custom model selections retain independent session memory', async () => {
    const catalog = (await json(base, '/api/v1/sources')).data.providers;
    const optionLists = new Map();
    await settings(page);
    for (const item of catalog) {
      await page.locator('#desktop-ai-provider').selectOption(item.id);
      const values = await page.locator('#desktop-ai-model-select option').evaluateAll((options) => options.map((option) => option.value));
      assert.equal(new Set(values).size, values.length); assert.ok(values.includes('__custom__'));
      if (item.default_model) assert.ok(values.includes(item.default_model));
      optionLists.set(item.id, values.filter((value) => value !== '__custom__'));
      const suggested = values.find((value) => value !== '__custom__' && value !== item.default_model) || item.default_model;
      if (suggested) {
        await page.locator('#desktop-ai-model-select').selectOption(suggested);
        assert.equal(await page.locator('#desktop-ai-model').inputValue(), suggested);
        assert.equal(await page.locator('#desktop-ai-model').isVisible(), false);
      }
      await page.locator('#desktop-ai-model-select').selectOption('__custom__');
      await page.locator('#desktop-ai-model').fill(`custom-${item.id}-model`);
      assert.equal(await page.locator('#desktop-ai-model').isVisible(), true);
    }
    assert.notDeepEqual(optionLists.get('openai'), optionLists.get('deepseek'));
    for (const item of catalog) {
      await page.locator('#desktop-ai-provider').selectOption(item.id);
      assert.equal(await page.locator('#desktop-ai-model-select').inputValue(), '__custom__');
      assert.equal(await page.locator('#desktop-ai-model').inputValue(), `custom-${item.id}-model`);
      await contains(page.locator('#desktop-ai-cloud-notice'), item.label);
      if (item.default_model) await page.locator('#desktop-ai-model-select').selectOption(item.default_model);
      else await page.locator('#desktop-ai-model').fill('');
    }
    await page.locator('#desktop-ai-provider').selectOption('openai');
    await closeSettings(page); await contains(page.locator('#desktop-ai-cloud-notice'), 'OpenAI');
    await settings(page); await screenshot(page, 'independent-ai-settings.png'); await closeSettings(page);
  });
  await check('missing-key feedback stays explicit while deterministic planning remains enabled', async () => {
    assert.equal((await ask(page, base, question)).status, 401); await contains(page.locator('#desktop-ai-feedback'), 'key');
    await page.locator('#decision-goal').fill('Suggest a visit using the fictional museum guide.');
    const proposal = await submit(page, base, 'chat', '#ai-options-generate');
    assert.equal(proposal.request.intent, 'options'); assert.equal(proposal.status, 401);
    await contains(page.locator('#ai-options-status'), 'key');
    assert.deepEqual(await page.evaluate(() => window.myJinni.getSessionSettings()), { configured: false }); assert.equal(await page.locator('#plan-submit').isEnabled(), true);
  });
  await check('session settings return only configured state and saving clears the key input', async () => {
    await key(page, TEST_KEY); assert.deepEqual(await page.evaluate(() => window.myJinni.getSessionSettings()), { configured: true });
    assert.equal((await page.evaluate(() => JSON.stringify(window.localStorage))).includes(TEST_KEY), false);
  });
  await check('MOCKED OpenAI uses only selected evidence and its citation opens exact original PDF text/page', async () => {
    const result = await ask(page, base, question); assert.equal(result.status, 200); assert.equal(result.body.data.status, 'answered');
    await contains(page.locator('#desktop-ai-answer'), '11:00'); const telemetry = await status(base);
    assert.deepEqual(telemetry.last_source_ids, [saved.imported.id]); assert.equal(telemetry.header_used, true); assert.equal(telemetry.body_key_free, true); assert.equal(telemetry.store_disabled, true);
    assert.equal(JSON.stringify(result.body).includes('OMITTED-8672'), false); await screenshot(page, 'shared-desktop-ai-mocked.png');
    await page.locator('#desktop-ai-citations button').first().click(); await contains(page.locator('#viewer-content'), saved.text);
    assert.equal(await page.locator('#viewer-content mark').innerText(), result.body.data.citations[0].quote); await contains(page.locator('#viewer-content'), 'Page 1');
    await screenshot(page, 'shared-desktop-citation-mocked.png'); await closeTools(page);
  });
  await check('changing selected sources clears the previous answer and changes the evidence used', async () => {
    const calls = (await status(base)).calls; await select(page, [saved.guide.id]);
    assert.equal(await page.locator('#desktop-ai-result').isVisible(), false);
    const reply = await ask(page, base, question); assert.equal(reply.body.data.status, 'insufficient_evidence');
    assert.deepEqual((await status(base)).calls, calls); await select(page, [saved.imported.id]);
  });
  await check('AI context returns exactly the real city-origin planner and comparison JSON', async () => {
    await scenario(page, 'travel'); await compare(page, base); const current = await context(page);
    const expectedPlan = (await post(base, '/api/v1/recommendations', current.planner)).body.data;
    const expectedDecision = (await post(base, '/api/v1/decisions/evaluate', current.decision)).body.data;
    await ai(page); await page.locator('#desktop-ai-include-plan').check(); await page.locator('#desktop-ai-include-decision').check();
    await page.locator('#desktop-ai-question').fill('Explain my comparison and activity plan with the museum guide.');
    const result = await submit(page, base, 'chat', '#desktop-ai-ask'); assert.equal(result.status, 200);
    assert.deepEqual(result.request.preferences, current.planner); assert.deepEqual(result.request.decision_request, current.decision);
    assert.deepEqual(result.body.data.planner, expectedPlan); assert.deepEqual(result.body.data.decision, expectedDecision); assert.equal(result.body.data.planner.recommended.title, 'Short Film Club');
    const telemetry = await status(base); assert.ok(telemetry.last_source_ids.includes('planner-context')); assert.ok(telemetry.last_source_ids.includes('decision-context')); assert.equal(telemetry.last_source_ids.includes(saved.excluded.id), false);
    await select(page, []); await ai(page); await page.locator('#desktop-ai-include-plan').uncheck(); await page.locator('#desktop-ai-include-decision').check();
    await page.locator('#desktop-ai-question').fill('Explain the calculated comparison.'); const only = await submit(page, base, 'chat', '#desktop-ai-ask');
    assert.equal(only.body.data.citations[0].source_id, 'decision-context'); await page.locator('#desktop-ai-citations button').first().click();
    await contains(page.locator('#desktop-ai-context-json'), expectedDecision.recommended.name); await closeTools(page); await select(page, [saved.imported.id]);
  });
  await check('insufficient evidence avoids provider calls and clears the previous answer', async () => {
    const before = (await status(base)).calls; const result = await ask(page, base, 'Axolotl hyperdrive spectroscopy');
    assert.equal(result.body.data.status, 'insufficient_evidence'); assert.deepEqual((await status(base)).calls, before); assert.equal((await page.locator('#desktop-ai-answer').innerText()).includes('11:00'), false);
  });
  await check('MOCKED auth, timeout, rate-limit, invalid quotation and retry retain honest error states', async () => {
    for (const [model, text] of [['test-auth-error', 'key'], ['test-provider-timeout', 'timed out'], ['test-rate-limit', 'limit'], ['test-invalid-quote', 'valid']]) {
      assert.ok((await ask(page, base, question, model)).status >= 400); await contains(page.locator('#desktop-ai-feedback'), text);
      assert.equal((await page.locator('#desktop-ai-answer').innerText()).includes('11:00'), false);
    }
    assert.equal((await ask(page, base, question, 'test-provider-error')).status, 503); await contains(page.locator('#desktop-ai-feedback'), 'unavailable');
    assert.equal((await submit(page, base, 'chat', '#desktop-ai-ask')).status, 200); await contains(page.locator('#desktop-ai-answer'), '11:00');
  });
  await check('editing a slow MOCKED question prevents stale success', async () => {
    await chooseModel(page, 'test-slow'); await page.locator('#desktop-ai-question').fill(question); await page.locator('#desktop-ai-ask').click();
    await page.locator('#desktop-ai-question').fill('A different question now'); await page.waitForTimeout(650);
    assert.equal((await page.locator('#desktop-ai-answer').innerText()).includes('11:00'), false);
  });
  await check('DeepSeek, Gemini and Claude never borrow keys and return checked MOCKED citations', async () => {
    for (const [provider, model, label] of [['deepseek', 'deepseek-flash', 'DeepSeek'], ['gemini', 'gemini-3.8-flash', 'Gemini'], ['anthropic', 'claude-sonnet-4-6', 'Claude']]) {
      await settings(page); await page.locator('#desktop-ai-provider').selectOption(provider); assert.equal(await page.locator('#desktop-ai-model').inputValue(), model); await closeSettings(page);
      assert.deepEqual(await page.evaluate((id) => window.myJinni.getSessionSettings(id), provider), { configured: false }); assert.equal((await ask(page, base, question, model)).status, 401);
      await key(page, `sk-${provider}-test-placeholder`, provider); const result = await ask(page, base, question, model); assert.equal(result.status, 200); assert.equal(result.body.data.provider, provider);
      assert.equal(result.body.data.citations[0].quote, saved.text); await contains(page.locator('#desktop-ai-dialog'), label);
      const telemetry = await status(base); assert.equal(telemetry.last_provider, provider); assert.equal(telemetry.header_used, true); assert.equal(telemetry.body_key_free, true);
      assert.deepEqual(await page.evaluate(() => window.myJinni.getSessionSettings('openai')), { configured: true });
    }
  });
  await check('clearing one provider preserves other keys; provider switching clears unsaved keys and stale answers', async () => {
    await provider(page, 'deepseek');
    assert.equal((await ask(page, base, question, 'test-provider-error')).status, 503);
    assert.equal((await submit(page, base, 'chat', '#desktop-ai-ask')).status, 200);
    await settings(page); await page.locator('#desktop-ai-key-clear').click();
    await waitUntil(async () => !(await page.evaluate(() => window.myJinni.getSessionSettings('deepseek'))).configured);
    await closeSettings(page);
    for (const id of ['openai', 'gemini', 'anthropic']) assert.deepEqual(await page.evaluate((provider) => window.myJinni.getSessionSettings(provider), id), { configured: true });
    assert.equal((await ask(page, base, question, 'deepseek-flash')).status, 401); await key(page, 'sk-deepseek-test-placeholder', 'deepseek');
    await chooseModel(page, 'test-slow'); await page.locator('#desktop-ai-question').fill(question); await page.locator('#desktop-ai-ask').click();
    await settings(page); await page.locator('#desktop-ai-key').fill('unsaved-placeholder'); await page.locator('#desktop-ai-provider').selectOption('openai'); assert.equal(await page.locator('#desktop-ai-key').inputValue(), ''); await closeSettings(page);
    await page.waitForTimeout(650); assert.equal((await page.locator('#desktop-ai-answer').innerText()).includes('11:00'), false);
    await settings(page); await page.locator('#desktop-ai-provider').selectOption('deepseek'); await screenshot(page, 'shared-desktop-deepseek-settings.png');
    await page.locator('#desktop-ai-provider').selectOption('openai'); await closeSettings(page); await ask(page, base, question);
  });
}

async function options(page, app, base, saved) {
  const goal = 'Use the museum guide to suggest a small accessible visit.';
  const cards = page.locator('#ai-options-results > .ai-option-card');
  async function generate() {
    const result = await submit(page, base, 'chat', '#ai-options-generate');
    if (result.status === 200 && result.body.data.status === 'answered') await cards.first().waitFor();
    return result;
  }
  await check('AI proposals use current goal, settings, sources and conditions without changing numeric comparisons', async () => {
    await scenario(page, 'travel'); const compared = (await compare(page, base)).body.data;
    await select(page, [saved.imported.id]); await closeTools(page); await chooseModel(page, 'gpt-4.1-mini');
    await page.locator('#decision-goal').fill(goal);
    const current = await context(page); const result = await generate();
    assert.equal(result.status, 200); assert.equal(result.request.intent, 'options'); assert.equal(result.request.question, goal);
    assert.equal(result.request.provider, 'openai'); assert.equal(result.request.model, 'gpt-4.1-mini');
    assert.deepEqual(result.request.source_ids, [saved.imported.id]); assert.deepEqual(result.request.decision_request, current.decision);
    assert.equal(Object.hasOwn(result.request, 'preferences'), false);
    assert.deepEqual(result.body.data.decision, compared); assert.equal(result.body.data.options.length, 2);
    assert.equal(await cards.count(), 2);
    assert.equal(await page.evaluate(() => Boolean(document.getElementById('ai-options-panel').compareDocumentPosition(document.getElementById('decision-results')) & window.Node.DOCUMENT_POSITION_FOLLOWING)), true);
    await waitUntil(() => page.evaluate(() => document.getElementById('ai-options-panel').contains(document.activeElement)));
    for (const option of result.body.data.options) {
      const card = page.locator(`#ai-options-results [data-option-id="${option.id}"]`);
      assert.equal(await card.locator('h4').textContent(), option.title);
      for (const phrase of [option.summary, ...option.trade_offs, ...option.missing_information]) await contains(card, phrase);
      assert.equal(option.citations[0].source_id, saved.imported.id); assert.equal(option.citations[0].quote, saved.text);
    }
    assert.equal(await page.locator('#ai-options-results img, #ai-options-results script').count(), 0);
    assert.deepEqual((await context(page)).decision, current.decision);
    assert.equal(await page.locator('.decision-card').getAttribute('data-option-id'), compared.recommended.id);
    const telemetry = await status(base); assert.equal(telemetry.last_intent, 'options');
    assert.ok(telemetry.last_source_ids.includes(saved.imported.id)); assert.equal(telemetry.last_source_ids.includes(saved.excluded.id), false);
    await page.locator('#ai-options-results .ai-option-citation').first().click();
    assert.equal(await page.locator('#viewer-content mark').innerText(), saved.text); await page.locator('#viewer-close').click();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1680, 1000));
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await screenshot(page, 'jinni-parallel-options-wide.png');
  });
  await check('questions and locale changes keep current proposals, original citations and source selections without automatic calls', async () => {
    await page.locator('#desktop-ai-question').fill('When does the fictional museum open?');
    assert.equal((await submit(page, base, 'chat', '#desktop-ai-ask')).status, 200);
    assert.equal(await cards.count(), 2);
    const original = await cards.allTextContents(); const current = await context(page); const calls = (await status(base)).calls;
    for (const locale of ['zh-CN', 'fr', 'ja', 'ru', 'en']) {
      await page.locator('#language-select').selectOption(locale);
      assert.equal(await page.locator('#decision-goal').inputValue(), goal); assert.deepEqual(await context(page), current);
      assert.equal(await cards.first().locator('h4').textContent(), 'Fictional museum visit');
      await contains(cards.nth(1), 'Literal <img src=x> text.');
      await page.locator('#ai-options-results .ai-option-citation').first().click();
      assert.equal(await page.locator('#viewer-content mark').innerText(), saved.text); await page.locator('#viewer-close').click();
    }
    assert.deepEqual(await cards.allTextContents(), original); assert.deepEqual((await status(base)).calls, calls);
  });
  await check('goal, source, conditions and provider/model changes invalidate proposals and stale responses', async () => {
    await page.locator('#decision-goal').fill(`${goal} Revised.`); assert.equal(await cards.count(), 0);
    await page.locator('#decision-goal').fill(goal); await generate();
    await page.locator(`#decision-sources input[value="${saved.imported.id}"]`).uncheck();
    assert.equal(await cards.count(), 0); await select(page, [saved.imported.id]); await closeTools(page); await generate();
    await page.locator('#limit-cost-pence').fill('24.75'); assert.equal(await cards.count(), 0); await compare(page, base); await generate();
    await chooseModel(page, 'test-options-slow'); assert.equal(await cards.count(), 0);
    await page.locator('#ai-options-generate').click(); await page.locator('#desktop-ai-question').focus();
    await waitUntil(async () => await cards.count() === 2); assert.equal(await page.evaluate(() => document.activeElement.id), 'desktop-ai-question');
    await page.locator('#ai-options-generate').click(); await page.locator('#decision-goal').fill('A changed goal during the slow request.');
    await page.waitForTimeout(650); assert.equal(await cards.count(), 0); assert.equal(await page.evaluate(() => document.activeElement.id), 'decision-goal');
    await page.locator('#decision-goal').fill(goal); await provider(page, 'deepseek'); await chooseModel(page, 'deepseek-flash');
    const deepseek = await generate(); assert.equal(deepseek.body.data.provider, 'deepseek'); assert.equal((await status(base)).header_used, true);
    await provider(page, 'openai'); assert.equal(await cards.count(), 0); await chooseModel(page, 'gpt-4.1-mini');
  });
  await check('proposal provider errors, invalid quotations and unsupported evidence never show fallback choices; retry remains explicit', async () => {
    await chooseModel(page, 'test-options-provider-error'); assert.equal((await generate()).status, 503);
    await contains(page.locator('#ai-options-status'), 'unavailable'); assert.equal(await cards.count(), 0);
    assert.equal((await generate()).status, 200); assert.equal(await cards.count(), 2);
    await chooseModel(page, 'test-options-invalid-quote'); assert.equal((await generate()).status, 502);
    await contains(page.locator('#ai-options-status'), 'valid'); assert.equal(await cards.count(), 0);
    await chooseModel(page, 'test-insufficient'); const insufficient = await generate();
    assert.equal(insufficient.body.data.status, 'insufficient_evidence'); assert.deepEqual(insufficient.body.data.options, []); assert.equal(await cards.count(), 0);
    assert.equal(await page.locator('#decision-submit').isEnabled(), true);
    await chooseModel(page, 'gpt-4.1-mini'); await generate();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 850));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true);
    await screenshot(page, 'jinni-parallel-options-narrow.png');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
  });
}

async function languages(page, app, base, saved) {
  await check('five locales retain raw content, custom labels/units, input state, keys and calculations without cloud calls', async () => {
    await scenario(page, 'custom'); await definition(page, equipment()); await compare(page, base);
    const current = await context(page); const raw = await page.locator('#custom-json').inputValue(); const calls = (await status(base)).calls;
    await ask(page, base, 'When does the fictional museum open?');
    await ai(page); const answer = await page.locator('#desktop-ai-answer').innerText(); assert.ok(answer.includes('11:00'));
    await settings(page); await page.locator('#desktop-ai-key').fill('unsaved-locale-placeholder');
    for (const id of ['zh-CN', 'fr', 'ja', 'ru', 'en']) {
      await page.evaluate((value) => window.jinniI18n.setLocale(value), id); assert.equal(await page.locator('html').getAttribute('lang'), id);
      assert.equal(await page.locator('#custom-json').inputValue(), raw); assert.deepEqual(await context(page), current);
      assert.deepEqual(await page.locator('#decision-results .comparison-table').first().locator('thead th').allTextContents(), [await page.evaluate(() => window.jinniI18n.t('Your choices')), 'Price', 'Your choices']);
      assert.ok((await page.locator('#decision-results .comparison-table').first().innerText()).includes('hours'));
      assert.equal(await page.locator('#desktop-ai-answer').innerText(), answer); assert.equal(await page.locator('#desktop-ai-key').inputValue(), 'unsaved-locale-placeholder');
      assert.deepEqual(await page.evaluate(() => window.myJinni.getSessionSettings('openai')), { configured: true }); assert.equal((await page.evaluate(() => JSON.stringify(window.localStorage))).includes(TEST_KEY), false);
    }
    const afterCalls = (await status(base)).calls;
    assert.equal(Object.values(afterCalls).reduce((sum, count) => sum + count, 0), Object.values(calls).reduce((sum, count) => sum + count, 0) + 1);
    await page.locator('#desktop-ai-key').fill(''); await closeSettings(page);
    for (const id of ['zh-CN', 'fr', 'ja', 'ru', 'en']) {
      await page.locator('#language-select').selectOption(id);
      await page.locator('#desktop-ai-citations button').first().click();
      assert.equal(await page.locator('#viewer-content mark').innerText(), saved.text); await page.locator('#viewer-close').click();
    }
    await library(page);
    for (const id of ['zh-CN', 'fr', 'ja', 'ru', 'en']) {
      await page.evaluate((value) => window.jinniI18n.setLocale(value), id);
      assert.equal(await page.locator(`.source-item[data-source-id="${saved.imported.id}"] input[type=checkbox]`).isChecked(), true);
      await page.locator(`.source-item[data-source-id="${saved.guide.id}"] button`).first().click(); assert.equal(await page.locator('#viewer-title').innerText(), saved.guide.title);
      await contains(page.locator('#viewer-content'), 'Exact evidence <script>not executable</script>.'); assert.equal(await page.locator('#viewer-content script, #viewer-content img').count(), 0);
      await page.locator('#viewer-close').click();
    }
    await closeTools(page);
  });
  await check('shared light/dark themes, waves, reduced motion and opt-in sound preserve decisions', async () => {
    await scenario(page, 'travel'); await compare(page, base); const current = await context(page);
    await appearance(page, 'light'); await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await screenshot(page, 'shared-desktop-light.png');
    await appearance(page, 'dark'); assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark'); await screenshot(page, 'shared-desktop-dark.png');
    await page.emulateMedia({ reducedMotion: 'reduce' }); await waitUntil(async () => await page.locator('html').getAttribute('data-waves') === 'off');
    assert.equal(await page.locator('.wave-layer').first().evaluate((node) => getComputedStyle(node).animationName), 'none');
    await page.locator('#theme-toggle').click(); assert.equal(await page.locator('#waves-toggle').isDisabled(), true); await page.locator('#appearance-done').click();
    await page.evaluate(() => {
      window.testOscillators = 0;
      const original = window.AudioContext.prototype.createOscillator;
      window.AudioContext.prototype.createOscillator = function (...args) { window.testOscillators++; return original.apply(this, args); };
    });
    assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => window.testOscillators), 0);
    await page.locator('#sound-toggle').click(); assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
    await compare(page, base); await waitUntil(() => page.evaluate(() => window.testOscillators >= 2));
    await page.locator('#sound-toggle').click(); assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
    const requests = await page.evaluate(() => window.testOscillators); await compare(page, base);
    assert.equal(await page.evaluate(() => window.testOscillators), requests); assert.deepEqual(await context(page), current);
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await appearance(page, 'light');
  });
  await check('keyboard dialogs, resized translated layout and blocked locale storage remain usable', async () => {
    await page.locator('#library-open').focus(); await page.keyboard.press('Enter'); assert.equal(await page.locator('#library-dialog').isVisible(), true);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#library-dialog').isVisible(), false); assert.equal(await page.evaluate(() => document.activeElement.id), 'library-open');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 850));
    for (const id of ['fr', 'ru']) { await page.locator('#language-select').selectOption(id); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true); }
    const fallback = await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      try { Storage.prototype.setItem = () => { throw new Error('Isolated blocked-storage test.'); }; window.jinniI18n.setLocale('ja'); return { locale: window.jinniI18n.getLocale(), missing: window.jinniI18n.t('An intentionally missing interface key') }; }
      finally { Storage.prototype.setItem = original; }
    });
    assert.deepEqual(fallback, { locale: 'ja', missing: 'An intentionally missing interface key' }); await page.locator('#language-select').selectOption('fr'); await screenshot(page, 'shared-desktop-french-resized.png');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000)); await page.locator('#language-select').selectOption('en');
  });
}

async function sharedDesktop() {
  const directory = tempDirectory(); let backend = await startMockBackend({ directory }); let app; let page; const errors = [];
  try {
    ({ application: app, page } = await launchDesktop(electron, backend.baseUrl, directory)); page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
    await waitUntil(async () => page.url() === 'jinni://app/index.html' && await page.locator('#decision-submit').isEnabled() && await page.locator('#desktop-backend-status').count() && await page.locator('#scenario-tabs button').count() === 5);
    await waitUntil(async () => await page.locator('#origin option').count() === 2);
    await check('Electron securely serves the exact shared page/core assets and preserves the existing data location', async () => {
      const resources = await page.evaluate(async () => Object.fromEntries(await Promise.all(['index.html', 'styles.css', 'app.mjs', 'decision-app.mjs', 'platform.mjs', 'shared/i18n.js'].map(async (name) => { const response = await fetch(name); return [name, { status: response.status, text: await response.text() }]; }))));
      for (const [name, resource] of Object.entries(resources)) { assert.equal(resource.status, 200); assert.equal(resource.text, fs.readFileSync(name.startsWith('shared/') ? path.join(ROOT, name) : path.join(ROOT, 'web', name), 'utf8')); }
      const denied = await page.evaluate(async () => Promise.all(['.env', 'app/main.py', 'pyproject.toml', 'desktop/main.cjs', '%2e%2e/.env'].map(async (name) => (await fetch(name)).status)));
      assert.ok(denied.every((code) => code === 403 || code === 404));
      const info = await app.evaluate(({ app, BrowserWindow }) => { const settings = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { name: app.getName(), userData: app.getPath('userData'), contextIsolation: settings.contextIsolation, nodeIntegration: settings.nodeIntegration, sandbox: settings.sandbox }; });
      assert.deepEqual(info, { name: 'Jinni', userData: path.join(directory, 'desktop'), contextIsolation: true, nodeIntegration: false, sandbox: true }); assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
      assert.equal(await page.locator('.brand').innerText(), 'Jinni'); assert.equal(await page.locator('.brand .lamp-mark path').count(), 3);
      assert.equal(await page.locator('#library-dialog').isVisible(), false); assert.equal(await page.locator('#desktop-ai-settings').isVisible(), false);
      assert.equal(await page.locator('#desktop-ai-dialog').evaluate((node) => node.tagName), 'SECTION'); assert.equal(await page.locator('#desktop-ai-question').isVisible(), true);
      assert.equal(await page.locator('#legacy-planner').evaluate((node) => node.open), false);
    });
    await decisions(page, backend.baseUrl); await planner(page, backend.baseUrl);
    const saved = await sourceLibrary(page, app, backend.baseUrl, directory); await providers(page, backend.baseUrl, saved);
    await options(page, app, backend.baseUrl, saved); await languages(page, app, backend.baseUrl, saved);
    await check('deletion updates SQLite and the external backend survives close without page errors', async () => {
      await library(page); await page.locator(`.source-item[data-source-id="${saved.excluded.id}"] button`).last().click(); await page.locator('#delete-confirm').click();
      await waitUntil(async () => !(await sources(backend.baseUrl)).some((source) => source.id === saved.excluded.id)); await closeTools(page); await page.locator('#language-select').selectOption('fr');
      assert.deepEqual(errors, []); await app.close(); app = null; assert.equal((await fetch(`${backend.baseUrl}/health`)).status, 200);
    });
    await check('SQLite sources and selected locale survive restart while all provider session keys disappear', async () => {
      const port = Number(new URL(backend.baseUrl).port); await backend.stop(); backend = await startMockBackend({ directory, port });
      ({ application: app, page } = await launchDesktop(electron, backend.baseUrl, directory)); await waitUntil(async () => await page.locator('#language-select').inputValue() === 'fr');
      assert.equal(await page.locator('html').getAttribute('lang'), 'fr'); await page.locator('#language-select').selectOption('en'); await library(page); await contains(page.locator('#sources'), saved.imported.title);
      const persisted = await sources(backend.baseUrl); assert.ok(persisted.some((source) => source.id === saved.guide.id)); assert.ok(persisted.some((source) => source.id === saved.imported.id));
      for (const id of ['openai', 'deepseek', 'gemini', 'anthropic']) assert.deepEqual(await page.evaluate((provider) => window.myJinni.getSessionSettings(provider), id), { configured: false });
    });
  } catch (error) { if (page && !page.isClosed()) await screenshot(page, 'shared-desktop-failure.png').catch(() => {}); throw error; }
  finally { if (app) await app.close().catch(() => {}); await backend.stop(); }
}

async function ownedBackend() {
  const port = await freePort(); const base = `http://127.0.0.1:${port}`; const directory = tempDirectory(); let app; let page;
  const occupied = http.createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ data: { status: 'ok', recommendations_ready: true }, info: { title: 'Unrelated isolated test server' } })); });
  await new Promise((resolve) => occupied.listen(port, '127.0.0.1', resolve));
  try {
    ({ application: app, page } = await launchDesktop(electron, base, directory));
    await check('native startup failure is visible and the unrelated occupied service remains running', async () => { await contains(page.locator('#desktop-backend-status'), 'port'); assert.equal((await fetch(`${base}/health`)).status, 200); await screenshot(page, 'shared-desktop-startup-failure.png'); });
    await new Promise((resolve) => occupied.close(resolve));
    await check('native retry starts an owned real backend and app close stops only its own process', async () => {
      await page.locator('#desktop-backend-retry').click(); await waitUntil(async () => (await page.evaluate(() => window.myJinni.getBackendStatus())).state === 'ready');
      assert.equal((await page.evaluate(() => window.myJinni.getBackendStatus())).owned, true); await waitUntil(() => page.locator('#decision-submit').isEnabled());
      assert.equal((await page.evaluate(() => window.myJinni.getDecisionScenarios())).status, 200); await app.close(); app = null;
      await waitUntil(async () => { try { await fetch(`${base}/health`); return false; } catch { return true; } }, { message: 'The isolated owned backend remained running.' });
    });
  } catch (error) {
    if (page && !page.isClosed()) {
      await screenshot(page, 'shared-desktop-lifecycle-failure.png').catch(() => {});
      console.error(JSON.stringify(await page.evaluate(() => ({ url: window.location.href, decision: document.getElementById('decision-load-status')?.textContent, planner: document.getElementById('setup-status')?.textContent, native: document.getElementById('desktop-backend-status')?.textContent }))));
    }
    throw error;
  } finally { if (app) await app.close().catch(() => {}); if (occupied.listening) await new Promise((resolve) => occupied.close(resolve)); }
}

(async () => {
  console.log('Actual shared-front-end Electron + IPC + FastAPI + SQLite checks; provider transports are MOCKED.');
  if (!process.argv.includes('--lifecycle-only')) await sharedDesktop();
  await ownedBackend(); console.log(`DESKTOP E2E PASSED: ${checks} checks. Live provider account access was not tested.`);
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
