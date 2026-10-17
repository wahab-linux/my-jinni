import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDecision } from '../../web/decisions.mjs';
import { playFeedback, setupSound } from '../../web/effects.mjs';

function fixture(id = 'custom') {
  return {
    scenario: { id, title: 'Compare a workshop', description: 'Fictional workshop comparison.', notice: 'Fictional inputs; no verified outcomes.',
      criteria: [
        { id: 'cost', label: 'Cost', unit: 'pence', direction: 'minimize', default_weight: 50 },
        { id: 'quality', label: 'Quality', unit: 'score', direction: 'maximize', default_weight: 50 },
      ], default_request: { scenario_id: id, weights: {}, constraints: [] } },
    dataset: {
      option_source: { id: 'catalog', label: 'Fictional catalog', is_simulated: true, updated_at: '2026-10-17T10:00:00+01:00' },
      metric_source: { id: 'measurements', label: 'Fictional measurements', is_simulated: true, updated_at: '2026-10-17T10:00:00+01:00' },
      options: [
        { id: 'budget', name: 'Budget workshop', description: 'Fictional affordable workshop.', category: 'workshop' },
        { id: 'premium', name: 'Premium workshop', description: 'Fictional premium workshop.', category: 'workshop' },
      ], observations: [
        { option_id: 'budget', available: true, metrics: { cost: 100, quality: 2 } },
        { option_id: 'premium', available: true, metrics: { cost: 200, quality: 10 } },
      ],
    },
  };
}
const evaluate = (entry, changes = {}) => evaluateDecision({ ...entry.scenario.default_request, ...changes }, entry);

test('opposing min/max criteria use defaults, exact tie-breaks and both source IDs', () => {
  const entry = fixture();
  const response = evaluate(entry);
  assert.equal(response.error, null);
  assert.deepEqual(response.data.ranked.map((option) => [option.id, option.score]), [['budget', 50], ['premium', 50]]);
  assert.deepEqual(response.data.recommended.source_ids, ['catalog', 'measurements']);
  assert.deepEqual(response.data.recommended.contributions.map((part) => [part.criterion_id, part.normalised, part.points]), [['cost', 1, 50], ['quality', 0, 0]]);
  assert.deepEqual(response.warnings, [{ code: 'SIMULATED_DATA', message: 'Options and measurements include fictional simulated data.' }]);
  entry.dataset.options.reverse(); entry.dataset.observations.reverse();
  assert.deepEqual(evaluate(entry).data.ranked, response.data.ranked);
});

test('changed priorities and changed measurements materially change the recommendation', () => {
  const entry = fixture();
  assert.equal(evaluate(entry, { weights: { cost: 0, quality: 100 } }).data.recommended.id, 'premium');
  entry.dataset.observations[0].metrics.quality = 11;
  assert.equal(evaluate(entry).data.recommended.id, 'budget');
  entry.dataset.observations[0].metrics.cost = 300;
  assert.equal(evaluate(entry, { weights: { cost: 100, quality: 0 } }).data.recommended.id, 'premium');
});

test('hard-bound equality passes and normalisation uses feasible options only', () => {
  const entry = fixture();
  const result = evaluate(entry, { constraints: [{ criterion_id: 'cost', operator: 'lte', value: 100 }] }).data;
  assert.equal(result.recommended.id, 'budget');
  assert.equal(result.recommended.score, 100);
  assert.deepEqual(result.recommended.contributions.map((part) => part.normalised), [1, 1]);
  assert.deepEqual(result.excluded[0].reasons, ['Cost exceeds its selected maximum.']);
  const empty = evaluate(entry, { constraints: [{ criterion_id: 'cost', operator: 'lte', value: 99 }] });
  assert.equal(empty.error, null); assert.equal(empty.data.recommended, null); assert.deepEqual(empty.data.ranked, []);
  assert.equal(evaluate(entry, { constraints: [{ criterion_id: 'quality', operator: 'gte', value: 10 }] }).data.recommended.id, 'premium');
});

test('unknown availability, absent observations and missing active metrics are exclusions', () => {
  const entry = fixture();
  delete entry.dataset.observations[0].available;
  entry.dataset.observations[1].metrics.quality = null;
  const result = evaluate(entry).data;
  assert.equal(result.recommended, null);
  assert.deepEqual(result.excluded.map((option) => option.reasons), [['Availability is unknown.'], ['Missing value for Quality.']]);
  entry.dataset.observations = [];
  assert.ok(evaluate(entry).data.excluded.every((option) => option.reasons[0] === 'No measurements were provided for this option.'));
});

test('disabled metrics may be unknown unless a hard bound needs them', () => {
  const entry = fixture(); entry.dataset.observations[0].metrics.quality = null;
  assert.equal(evaluate(entry, { weights: { quality: 0 } }).data.recommended.id, 'budget');
  const result = evaluate(entry, { weights: { quality: 0 }, constraints: [{ criterion_id: 'quality', operator: 'gte', value: 1 }] }).data;
  assert.equal(result.recommended.id, 'premium');
  assert.ok(result.excluded[0].reasons.includes('Missing value for Quality.'));
});

test('generic scenario IDs and custom domain overrides reuse the same deterministic core', () => {
  const configured = fixture('workshop-selection');
  assert.equal(evaluate(configured).data.scenario_id, 'workshop-selection');
  const entry = fixture(); const original = structuredClone(entry);
  const custom = { title: 'A different workshop', criteria: entry.scenario.criteria, dataset: structuredClone(entry.dataset) };
  custom.dataset.option_source.is_simulated = false; custom.dataset.metric_source.is_simulated = false;
  const result = evaluate(entry, { custom });
  assert.equal(result.data.title, custom.title); assert.equal(result.data.is_simulated, false); assert.deepEqual(result.warnings, []);
  assert.deepEqual(entry, original);
  assert.equal(evaluate(fixture('travel'), { custom }).error.code, 'VALIDATION_ERROR');
});

test('score rounds after summing unrounded points rather than rounding each component first', () => {
  const entry = fixture();
  entry.scenario.criteria.push({ id: 'third', label: 'Third', unit: 'score', direction: 'maximize', default_weight: 50 });
  entry.dataset.options.pop(); entry.dataset.observations.pop(); entry.dataset.observations[0].metrics.third = 7;
  const result = evaluate(entry).data.recommended;
  assert.equal(result.score, 100);
  assert.deepEqual(result.contributions.map((part) => part.points), [33.333333, 33.333333, 33.333333]);
});

test('valid criterion IDs that match JavaScript object properties never invent weights or measurements', () => {
  const entry = fixture(); entry.scenario.criteria[1].id = 'constructor';
  for (const observation of entry.dataset.observations) {
    observation.metrics.constructor = observation.metrics.quality; delete observation.metrics.quality;
  }
  assert.equal(evaluate(entry).data.recommended.id, 'budget');
  delete entry.dataset.observations[0].metrics.constructor;
  const result = evaluate(entry).data;
  assert.equal(result.recommended.id, 'premium');
  assert.deepEqual(result.excluded[0].reasons, ['Missing value for Quality.']);
});

for (const [name, change] of [
  ['all zero weights', (request) => { request.weights = { cost: 0, quality: 0 }; }],
  ['boolean weight', (request) => { request.weights = { cost: true }; }],
  ['unknown criterion', (request) => { request.weights = { unknown: 4 }; }],
  ['excessive weight', (request) => { request.weights = { cost: 101 }; }],
  ['unknown constraint', (request) => { request.constraints = [{ criterion_id: 'unknown', operator: 'lte', value: 1 }]; }],
  ['fractional pence', (request) => { request.constraints = [{ criterion_id: 'cost', operator: 'lte', value: 1.5 }]; }],
  ['negative pence', (request) => { request.constraints = [{ criterion_id: 'cost', operator: 'lte', value: -1 }]; }],
  ['nonfinite bound', (request) => { request.constraints = [{ criterion_id: 'quality', operator: 'lte', value: Infinity }]; }],
  ['null weights', (request) => { request.weights = null; }],
  ['unexpected request field', (request) => { request.api_key = 'not-accepted'; }],
]) test(`rejects ${name} rather than inventing a result`, () => {
  const entry = fixture(); const request = structuredClone(entry.scenario.default_request); change(request);
  const result = evaluateDecision(request, entry); assert.equal(result.data, null); assert.equal(result.error.code, 'VALIDATION_ERROR');
});

for (const [name, change] of [
  ['ambiguous IDs', (entry) => entry.dataset.options.push(entry.dataset.options[0])],
  ['unknown observed option', (entry) => { entry.dataset.observations[0].option_id = 'unknown'; }],
  ['one source posing as two', (entry) => { entry.dataset.metric_source.id = 'catalog'; }],
  ['boolean measurement', (entry) => { entry.dataset.observations[0].metrics.cost = true; }],
  ['unknown metric', (entry) => { entry.dataset.observations[0].metrics.unknown = 7; }],
  ['fractional money measurement', (entry) => { entry.dataset.observations[0].metrics.cost = 1.5; }],
]) test(`rejects malformed dataset: ${name}`, () => {
  const entry = fixture(); change(entry); assert.equal(evaluate(entry).data, null);
});

test('sound is initially off, needs a user gesture, and synthesis failures remain harmless', async () => {
  let created = 0; let click;
  const span = {}; const attributes = {};
  const button = { setAttribute: (name, value) => { attributes[name] = value; }, querySelector: () => span,
    addEventListener: (name, action) => { assert.equal(name, 'click'); click = action; } };
  class Audio {
    constructor() { created++; this.currentTime = 0; this.destination = {}; }
    resume() { return Promise.resolve(); }
    createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {}, disconnect() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime(value) { assert.ok(value <= 0.025); }, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  }
  const sound = setupSound(button, { AudioContext: Audio, localStorage: { getItem: () => null, setItem() {} } });
  sound.play(); assert.equal(created, 0); assert.equal(attributes['aria-pressed'], 'false');
  click(); await Promise.resolve(); assert.equal(created, 1); assert.equal(attributes['aria-pressed'], 'true');
  click(); sound.play(); assert.equal(created, 1); assert.equal(attributes['aria-pressed'], 'false');
  assert.equal(playFeedback({ createOscillator() { throw new Error('Unavailable audio'); } }), false);
});
