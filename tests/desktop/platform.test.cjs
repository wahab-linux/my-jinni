const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const filename = pathToFileURL(path.resolve(__dirname, '../../web/platform.mjs')).href;
const ok = (data, warnings = []) => ({ status: 200, body: { data, error: null, warnings } });
let index = 0;
async function platform(bridge) {
  globalThis.myJinni = bridge;
  return import(`${filename}?native-test=${index++}`);
}

test('native planner and comparison preserve authoritative backend envelopes and never fetch browser fixtures', async () => {
  const calls = [];
  const preferences = { origin_id: 'test-origin', budget_pence: 405 };
  const decision = { scenario_id: 'travel', weights: {}, constraints: [] };
  const warning = { code: 'SIMULATED_DATA', message: 'Actual backend warning.' };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Desktop must not fetch static rankings.'); };
  try {
    const ui = await platform({
      getOptions: async () => ok({ supported_dates: ['2026-10-20'], origins: [] }),
      recommend: async (request) => { calls.push(['plan', request]); return ok({ recommended: { event_id: 'calculated' } }, [warning]); },
      evaluateDecision: async (request) => { calls.push(['decision', request]); return ok({ recommended: { id: 'computed' } }, [warning]); },
    });
    assert.equal(ui.isDesktop, true);
    assert.equal((await ui.loadPlanner()).options.demo_date, '2026-10-20');
    const plan = await ui.recommendPlan(preferences, {});
    assert.equal(plan.data.recommended.event_id, 'calculated'); assert.deepEqual(plan.warnings, [warning]);
    assert.equal((await ui.compareDecision(decision, {})).data.recommended.id, 'computed');
    assert.deepEqual(calls, [['plan', preferences], ['decision', decision]]);
  } finally { globalThis.fetch = originalFetch; delete globalThis.myJinni; }
});

test('native catalog loads each configured detail using named IPC operations', async () => {
  const ids = ['market', 'travel', 'student', 'sustainability', 'custom']; const requested = [];
  const ui = await platform({ getOptions() {}, getDecisionScenarios: async () => ok({ scenarios: ids.map((id) => ({ id })) }), getDecisionScenario: async (id) => { requested.push(id); return ok({ scenario: { id }, dataset: { source: id } }); } });
  assert.deepEqual((await ui.loadDecisions()).scenarios.map(({ scenario }) => scenario.id), ids);
  assert.deepEqual(requested, ids); delete globalThis.myJinni;
});

test('native library returns backend IDs and exact extracted chunks; cancellation remains a cancellation', async () => {
  const calls = [];
  const meta = { id: 'server-assigned', title: 'Original source title', is_simulated: true };
  const chunks = [{ chunk_id: 'saved-1', text: 'Original evidence.', page: 1 }];
  const ui = await platform({
    getOptions() {}, listSources: async () => ok({ sources: [meta] }),
    getSource: async (id) => { assert.equal(id, meta.id); return ok({ source: meta, chunks }); },
    addTextSource: async (value) => { calls.push(value); return ok(meta); },
    deleteSource: async (id) => ok({ source_id: id }), importSource: async () => ({ status: 0, body: null, cancelled: true }),
  });
  const library = await ui.openSources();
  assert.deepEqual(await library.all(), [{ ...meta, chunks }]);
  const saved = await library.add({ id: 'discard-generated-id', title: 'Original source title', is_simulated: true, chunks: [{ text: 'First', page: 1 }, { text: ' second', page: 1 }, { text: 'Third', page: 2 }] });
  assert.equal(saved.id, 'server-assigned');
  assert.deepEqual(calls, [{ title: meta.title, text: 'First second\n\nThird', is_simulated: true }]);
  assert.equal((await library.remove(meta.id)).source_id, meta.id);
  assert.equal((await ui.importDesktopSource({ is_simulated: true })).cancelled, true); delete globalThis.myJinni;
});

test('native HTTP error envelopes retain their meaning and source/key failures never become success', async () => {
  const failed = { status: 401, body: { data: null, error: { code: 'AI_AUTH_ERROR', message: 'A session key is needed.' }, warnings: [] } };
  const ui = await platform({ getOptions: async () => failed, recommend: async () => failed });
  assert.deepEqual(await ui.recommendPlan({}, {}), failed.body);
  await assert.rejects(() => ui.loadPlanner(), { message: 'A session key is needed.', code: 'AI_AUTH_ERROR', status: 401 });
  delete globalThis.myJinni;
});
