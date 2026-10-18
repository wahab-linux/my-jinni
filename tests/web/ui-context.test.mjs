import test from 'node:test';
import assert from 'node:assert/strict';
import { configureContext, getSourceIds, getSources, setSourceIds, getDecisionGoal, getPlannerPreferences, getDecisionRequest, openSource, onContextChange, notifyContextChange } from '../../web/ui-context.mjs';

test('independently registered shared readers retain one another and return isolated snapshots', () => {
  const selection = ['source-1'];
  const planner = { budget_pence: 2500, interests: ['games'] };
  const decision = { scenario_id: 'travel', weights: { cost: 35 }, constraints: [] };
  configureContext({ sourceIds: () => selection, plannerPreferences: () => planner });
  configureContext({ decisionRequest: () => decision });
  getSourceIds().push('unexpected');
  getPlannerPreferences().interests.push('music');
  getDecisionRequest().weights.cost = 99;
  assert.deepEqual(getSourceIds(), ['source-1']);
  assert.deepEqual(getPlannerPreferences(), planner);
  assert.deepEqual(getDecisionRequest(), decision);
  assert.equal(decision.weights.cost, 35);
});

test('current readers validate on demand and original-source viewing preserves exact quote and page', async () => {
  const calls = [];
  configureContext({
    plannerPreferences() { throw new Error('Invalid current budget'); },
    sourceViewer: async (id, options) => { calls.push({ id, options }); return true; },
  });
  assert.throws(getPlannerPreferences, /Invalid current budget/);
  const options = { quote: 'Price <script> exact 日本語', page: 3 };
  assert.equal(await openSource('source-1', options), true);
  assert.deepEqual(calls, [{ id: 'source-1', options }]);
});

test('context invalidation notifies active tools, supports unsubscribe and isolates a failed tool', () => {
  let notifications = 0;
  const stopFailed = onContextChange(() => { throw new Error('Tool failed'); });
  const stop = onContextChange(() => { notifications++; });
  notifyContextChange();
  assert.equal(notifications, 1);
  stop(); stopFailed(); notifyContextChange();
  assert.equal(notifications, 1);
});

test('compact source selection and goal readers preserve literal metadata and isolate caller arrays', () => {
  const sources = [{ id: 'source-1', title: 'Price <script> literal', is_simulated: true }];
  let selected = [];
  configureContext({ sources: () => sources, setSourceIds: (ids) => { selected = ids; }, sourceIds: () => selected, decisionGoal: () => 'Exact goal <img src=x>' });
  getSources()[0].title = 'Changed copy';
  assert.equal(getSources()[0].title, 'Price <script> literal');
  const input = ['source-1']; setSourceIds(input); input.push('unselected-source');
  assert.deepEqual(getSourceIds(), ['source-1']); assert.equal(getDecisionGoal(), 'Exact goal <img src=x>');
});
