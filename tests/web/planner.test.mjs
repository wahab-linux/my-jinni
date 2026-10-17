import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromLocal, parseBudget, recommend } from '../../web/planner.mjs';
import { createSource, searchSources } from '../../web/library.mjs';

const request = { origin_id: 'test', budget_pence: 500, depart_at: '2026-10-20T16:15:00+01:00', return_by: '2026-10-20T18:15:00+01:00', interests: ['games'] };
const activity = { id: 'a', title: 'Activity', venue_id: 'venue', venue_name: 'Venue', category: 'games', starts_at: '2026-10-20T16:30:00+01:00', ends_at: '2026-10-20T18:00:00+01:00', ticket_cost_pence: 300 };
const journey = { available: true, outbound_minutes: 15, return_minutes: 15, return_fare_pence: 200 };
function scenario(activities = [activity]) {
  return { options: { timezone: 'Europe/London', origins: [{ id: 'test' }], interests: [{ id: 'games' }, { id: 'music' }], supported_dates: ['2026-10-20'], max_budget_pence: 20000 },
    bundles: { test: { activities, journeys: { venue: { ...journey } }, sources: [{ id: 'travel', origin_id: 'test' }], warnings: [] } } };
}

test('budget and both journey boundaries accept equality and reject one unit beyond', () => {
  assert.equal(recommend(request, scenario()).data.recommended.event_id, 'a');
  for (const change of [{ budget_pence: 499 }, { depart_at: '2026-10-20T16:16:00+01:00' }, { return_by: '2026-10-20T18:14:00+01:00' }]) {
    assert.equal(recommend({ ...request, ...change }, scenario()).data.recommended, null);
  }
});

test('interest, cost, duration and stable ID determine rank independently of feed order', () => {
  const activities = [{ ...activity, id: 'z' }, { ...activity, id: 'b' }, { ...activity, id: 'a' }, { ...activity, id: 'cheap', category: 'music', ticket_cost_pence: 0 }];
  for (const values of [activities, [...activities].reverse()]) {
    const result = recommend(request, scenario(values)).data;
    assert.deepEqual([result.recommended, ...result.alternatives].map((item) => item.event_id), ['a', 'b', 'z']);
  }
  const data = scenario([{ ...activity, venue_id: 'long', id: 'a' }, { ...activity, id: 'z' }]);
  data.bundles.test.journeys.long = { ...journey, return_minutes: 16 };
  assert.equal(recommend({ ...request, return_by: '2026-10-20T19:00:00+01:00' }, data).data.recommended.event_id, 'z');
  assert.equal(recommend(request, scenario([{ ...activity, id: 'a' }, { ...activity, id: 'z', ticket_cost_pence: 299 }])).data.recommended.event_id, 'z');
});

test('missing/unavailable travel is excluded; missing bundle and wrong origin fail', () => {
  const data = scenario(); delete data.bundles.test.journeys.venue;
  assert.equal(recommend(request, data).data.recommended, null);
  assert.equal(recommend(request, data).warnings[0].code, 'MISSING_JOURNEY');
  data.bundles.test.journeys.venue = { ...journey, available: false };
  assert.equal(recommend(request, data).data.recommended, null);
  data.bundles.test.sources[0].origin_id = 'other';
  assert.throws(() => recommend(request, data), /travel data/);
  delete data.bundles.test;
  assert.throws(() => recommend(request, data), /travel data/);
});

test('input validation rejects unsupported, fractional, naive and reversed requests', () => {
  for (const change of [{ budget_pence: 1.5 }, { budget_pence: true }, { budget_pence: 20001 }, { interests: [] }, { interests: ['games', 'games'] }, { origin_id: 'other' }, { depart_at: '2026-10-20T16:00:00' }, { return_by: request.depart_at }, { depart_at: '2026-10-19T16:00:00Z' }]) {
    assert.throws(() => recommend({ ...request, ...change }, scenario()));
  }
});

test('pence parsing is exact and London offsets follow the selected date', () => {
  assert.equal(parseBudget('10.01'), 1001); assert.equal(parseBudget('0.1'), 10);
  for (const value of ['1.001', '-1', 'NaN', '1e2', '']) assert.throws(() => parseBudget(value));
  assert.equal(fromLocal('2026-10-20', '16:00', 'Europe/London'), '2026-10-20T16:00:00+01:00');
  assert.equal(fromLocal('2026-12-20', '16:00', 'Europe/London'), '2026-12-20T16:00:00+00:00');
  assert.throws(() => fromLocal('2026-03-29', '01:30', 'Europe/London'));
});

test('source limits and exact selected-source retrieval retain text and page provenance', () => {
  const a = createSource({ title: 'Guide', pages: [{ page: 2, text: 'Board games welcome beginner players.' }], is_simulated: true });
  const b = createSource({ title: 'Secret', pages: [{ page: null, text: 'A beginner can find the hidden code.' }] });
  const results = searchSources('beginner games', [a, b], new Set([a.id]));
  assert.equal(results.length, 1); assert.equal(results[0].chunk.page, 2); assert.equal(results[0].source.is_simulated, true);
  assert.equal(results[0].chunk.text, a.chunks[0].text);
  assert.equal(searchSources('submarines', [a], new Set([a.id])).length, 0);
  assert.throws(() => createSource({ title: 'Empty', pages: [{ page: 1, text: ' ' }] }), /No readable/);
  assert.throws(() => createSource({ title: 'Huge', pages: [{ page: null, text: 'a'.repeat(150001) }] }), /150,000/);
  assert.throws(() => createSource({ title: 'Long', pages: Array.from({ length: 41 }, (_, i) => ({ page: i + 1, text: 'a' })) }), /40 PDF/);
});
