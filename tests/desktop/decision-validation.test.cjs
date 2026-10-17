const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDecisionRequest, validateIpcInput, validateChatRequest } = require('../../desktop/validation.cjs');
const { ApiClient } = require('../../desktop/api-client.cjs');

function customRequest() {
  return {
    scenario_id: 'custom',
    custom: {
      title: 'Choose a workshop',
      criteria: [{ id: 'cost', label: 'Cost', unit: 'pence', direction: 'minimize', default_weight: 100 }],
      dataset: {
        option_source: { id: 'workshops', label: 'Workshop catalog', is_simulated: true, updated_at: '2026-10-17T12:00:00+01:00' },
        metric_source: { id: 'fees', label: 'Workshop fees', is_simulated: true, updated_at: '2026-10-17T12:00:00+01:00' },
        options: [{ id: 'workshop-a', name: 'Workshop A', description: 'Fictional workshop.', category: 'learning' }],
        observations: [{ option_id: 'workshop-a', available: true, metrics: { cost: 500 } }],
      },
    },
  };
}

test('decision bridge supports generic scenario IDs and passes a detached custom dataset', () => {
  assert.equal(validateIpcInput('getDecisionScenarios'), undefined);
  assert.equal(validateIpcInput('getDecisionScenario', 'career-options'), 'career-options');
  assert.deepEqual(validateDecisionRequest({ scenario_id: 'travel', custom: null }), { scenario_id: 'travel', custom: null });
  const request = customRequest();
  const copy = validateIpcInput('evaluateDecision', request);
  assert.deepEqual(copy, request);
  copy.custom.dataset.observations[0].metrics.cost = 200;
  assert.equal(request.custom.dataset.observations[0].metrics.cost, 500);
  assert.deepEqual(validateChatRequest({ question: 'Why this option?', source_ids: [], decision_request: request }).decision_request, request);
});

test('decision IPC rejects credential/URL injection, ambiguous records and invalid money', () => {
  for (const mutate of [
    (r) => { r.api_key = 'private-placeholder'; },
    (r) => { r.custom.dataset.url = 'https://example.com'; },
    (r) => { r.custom.dataset.options.push({ ...r.custom.dataset.options[0] }); },
    (r) => { r.custom.dataset.observations[0].option_id = 'missing'; },
    (r) => { r.custom.dataset.observations[0].metrics.cost = 0.5; },
    (r) => { r.custom.dataset.observations[0].metrics.cost = -1; },
    (r) => { r.custom.dataset.observations[0].metrics.cost = true; },
    (r) => { r.custom.dataset.metric_source.id = 'workshops'; },
    (r) => { r.weights = { cost: Infinity }; },
    (r) => { r.custom.dataset.observations[0].metrics.extra = 1; },
  ]) {
    const request = customRequest(); mutate(request);
    assert.throws(() => validateDecisionRequest(request));
  }
  for (const id of ['../travel', 'travel?api_key=x', 'http://example.com', 'a'.repeat(101)]) {
    assert.throws(() => validateIpcInput('getDecisionScenario', id));
  }
});

test('unknown availability stays unknown and decision arrays remain bounded', () => {
  const request = customRequest();
  request.custom.dataset.observations = [{ option_id: 'workshop-a' }];
  assert.deepEqual(validateDecisionRequest(request), request);
  request.constraints = Array.from({ length: 21 }, () => ({ criterion_id: 'cost', operator: 'lte', value: 500 }));
  assert.throws(() => validateDecisionRequest(request));
  assert.throws(() => validateIpcInput('getDecisionScenarios', { url: 'https://example.com' }));
});

test('decision HTTP operations keep provider keys isolated from every source/calculation request', async () => {
  const requests = [];
  const client = new ApiClient({ fetchImpl: async (url, options) => {
    requests.push({ url, ...options });
    return Response.json({ data: {}, error: null, warnings: [] });
  } });
  client.setSessionApiKey({ provider: 'deepseek', key: 'private-deepseek-placeholder' });
  for (const [path, method] of [
    ['/api/v1/decision-scenarios', 'GET'],
    ['/api/v1/decision-scenarios/travel', 'GET'],
    ['/api/v1/decisions/evaluate', 'POST'],
  ]) {
    await client.request(path, { method, json: method === 'POST' ? { scenario_id: 'travel' } : undefined,
      headers: { 'X-AI-API-Key': 'manual-placeholder' } });
    assert.equal(Object.keys(requests.at(-1).headers).some((header) => header.toLowerCase().includes('api-key')), false);
    assert.equal(requests.at(-1).redirect, 'error');
  }
  assert.equal(requests.length, 3);
  for (const path of ['/api/v1/decision-scenarios/travel/extra', '/api/v1/decisions/evaluate?url=https://example.com']) {
    await assert.rejects(client.request(path));
  }
  assert.equal(requests.length, 3);
});
