import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criterionLabel, displayMeasure, unitLabel } from '../../web/presentation.mjs';

test('all money displays pounds with exact penny boundaries, including custom fees and zero', () => {
  for (const [pence, pounds] of [[0, '£0.00'], [1, '£0.01'], [99, '£0.99'], [800, '£8.00'], [2500, '£25.00'], [15000, '£150.00']]) {
    assert.equal(displayMeasure(pence, 'pence'), pounds);
  }
  assert.equal(unitLabel('pence'), '£');
  assert.equal(displayMeasure(null, 'pence'), 'Unknown');
  assert.equal(displayMeasure(NaN, 'pence'), 'Unknown');
});

test('time and carbon stay real measurements rather than becoming money', () => {
  assert.equal(displayMeasure(70, 'minutes'), '1 hr 10 min');
  assert.equal(displayMeasure(120, 'minutes'), '2 hr');
  assert.equal(displayMeasure(45, 'minutes'), '45 min');
  assert.equal(displayMeasure(2200, 'g CO2e'), '2.2 kg CO₂e');
  assert.equal(displayMeasure(300, 'g CO2e'), '300 g CO₂e');
  assert.equal(displayMeasure(8, 'hours'), '8 hours');
  assert.equal(displayMeasure(31, 'score'), '31 points');
});

test('friendly preset labels do not overwrite custom meanings or object-property units', () => {
  const criterion = { id: 'cost-pence', label: 'My deposit' };
  assert.equal(criterionLabel(criterion), 'Price');
  assert.equal(criterionLabel(criterion, true), 'My deposit');
  assert.equal(unitLabel('constructor'), 'constructor');
  assert.equal(criterionLabel({ id: 'constructor', label: 'My rating' }), 'My rating');
});
