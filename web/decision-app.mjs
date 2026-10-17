import { evaluateDecision } from './decisions.mjs';
import { money, parseBudget } from './planner.mjs';
import { setupSound } from './effects.mjs';

const $ = (id) => document.getElementById(id);
const state = { entries: [], current: null, custom: null };
const effects = setupSound($('sound-toggle'));
const node = (tag, content, className = '') => {
  const element = document.createElement(tag);
  if (content !== undefined) element.textContent = content;
  element.className = className;
  return element;
};
const status = (id, message, error = false) => {
  $(id).textContent = message;
  $(id).className = `feedback${error ? ' error' : ''}`;
};
const measure = (value, unit) => typeof value !== 'number' || !Number.isFinite(value) ? 'Unknown'
  : unit === 'pence' ? money(value) : `${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 }).format(value)} ${unit}`;

function scenarioIcon(id) {
  const paths = {
    market: 'M3 17l6-6 4 4 8-10M15 5h6v6',
    travel: 'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4',
    student: 'M3 8l9-5 9 5-9 5Zm3 2v6c3 3 9 3 12 0v-6m3-2v9',
    sustainability: 'M20 4C9 3 3 8 5 15c1 4 7 6 11 2 3-3 3-7 4-13ZM4 21l12-12',
    custom: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
  };
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '22'); icon.setAttribute('height', '22');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[id]); icon.append(path);
  return icon;
}

function clearComparison(message = 'Priorities changed. Compare again to update your result.') {
  $('decision-results').replaceChildren();
  status('decision-status', message);
}

function control(criterion, defaults) {
  const row = node('div', undefined, 'criterion-control');
  row.dataset.criterion = criterion.id;
  const heading = node('div', undefined, 'criterion-title');
  const label = node('label', criterion.label);
  label.htmlFor = `weight-${criterion.id}`;
  heading.append(label, node('span', `${criterion.direction === 'minimize' ? 'Lower' : 'Higher'} is preferred · ${criterion.unit === 'pence' ? 'GBP' : criterion.unit}`, 'hint'));
  const weights = node('div', undefined, 'weight-controls');
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1';
  slider.value = String(Object.hasOwn(defaults.weights ?? {}, criterion.id) ? defaults.weights[criterion.id] : criterion.default_weight);
  slider.setAttribute('aria-label', `Priority slider for ${criterion.label}`);
  const weight = document.createElement('input');
  weight.type = 'number'; weight.min = '0'; weight.max = '100'; weight.step = 'any';
  weight.id = `weight-${criterion.id}`; weight.value = slider.value;
  weight.dataset.weight = criterion.id;
  weight.setAttribute('aria-label', `Weight for ${criterion.label}`);
  slider.addEventListener('input', () => { weight.value = slider.value; clearComparison(); });
  weight.addEventListener('input', () => { slider.value = weight.value; });
  weights.append(slider, weight);
  const bounds = node('div', undefined, 'constraint-controls');
  const operatorLabel = node('label', undefined, 'sr-only');
  operatorLabel.textContent = `Hard limit for ${criterion.label}`;
  operatorLabel.htmlFor = `bound-${criterion.id}`;
  const operator = document.createElement('select');
  operator.id = `bound-${criterion.id}`; operator.dataset.operator = criterion.id;
  operator.append(new Option('No hard limit', ''), new Option('At most', 'lte'), new Option('At least', 'gte'));
  const limitLabel = node('label');
  const limitName = node('span', `Limit for ${criterion.label}${criterion.unit === 'pence' ? ' (£)' : ` (${criterion.unit})`}`, 'sr-only');
  limitName.id = `limit-label-${criterion.id}`;
  const limit = document.createElement('input');
  limit.id = `limit-${criterion.id}`; limit.type = 'text'; limit.inputMode = 'decimal';
  limit.dataset.limit = criterion.id; limit.setAttribute('aria-labelledby', limitName.id);
  limit.placeholder = criterion.unit === 'pence' ? 'Amount in £' : criterion.unit;
  const existing = defaults.constraints?.find((constraint) => constraint.criterion_id === criterion.id);
  operator.value = existing?.operator ?? '';
  limit.value = existing ? String(existing.value / (criterion.unit === 'pence' ? 100 : 1)) : '';
  limit.hidden = !operator.value; limit.required = !!operator.value;
  operator.addEventListener('change', () => {
    limit.hidden = !operator.value; limit.required = !!operator.value;
    clearComparison();
    if (operator.value) limit.focus();
  });
  limitLabel.append(limitName, limit);
  bounds.append(operatorLabel, operator, limitLabel);
  row.append(heading, weights, bounds);
  return row;
}

function selectScenario(id) {
  const entry = state.entries.find((candidate) => candidate.scenario.id === id);
  if (!entry) return;
  state.current = entry; state.custom = null;
  const { scenario } = entry;
  $('decision-scenario').value = id;
  $('scenario-title').textContent = scenario.title;
  $('scenario-description').textContent = scenario.description;
  $('scenario-notice').textContent = scenario.notice;
  $('criteria-controls').replaceChildren(...scenario.criteria.map((criterion) => control(criterion, scenario.default_request)));
  $('custom-editor').hidden = id !== 'custom';
  $('custom-editor').open = false;
  status('custom-status', '');
  if (id === 'custom') $('custom-json').value = JSON.stringify({ title: scenario.title, criteria: scenario.criteria, dataset: entry.dataset }, null, 2);
  for (const tab of $('scenario-tabs').children) tab.setAttribute('aria-pressed', String(tab.dataset.id === id));
  $('decision-count').textContent = `${entry.dataset.options.length} options · Two sources`;
  clearComparison('Adjust your priorities and limits, then compare the options.');
}

async function loadDecisions() {
  $('decision-inputs').disabled = true;
  $('decision-retry').hidden = true;
  clearComparison('Loading the decision datasets…');
  try {
    const response = await fetch('./decisions.json', { signal: AbortSignal.timeout(10000), cache: 'no-cache' });
    if (!response.ok) throw new Error();
    const catalog = await response.json();
    if (!Array.isArray(catalog.scenarios) || catalog.scenarios.length !== 5) throw new Error();
    const ids = new Set();
    for (const entry of catalog.scenarios) {
      if (ids.has(entry.scenario.id) || evaluateDecision(entry.scenario.default_request, entry).error) throw new Error();
      ids.add(entry.scenario.id);
    }
    if (!['market', 'travel', 'student', 'sustainability', 'custom'].every((id) => ids.has(id))) throw new Error();
    state.entries = catalog.scenarios;
    $('decision-scenario').replaceChildren(...state.entries.map(({ scenario }) => new Option(scenario.title, scenario.id)));
    const names = { market: 'Market context', travel: 'Travel', student: 'Student hub', sustainability: 'Sustainability', custom: 'Your own idea' };
    $('scenario-tabs').replaceChildren(...state.entries.map(({ scenario }) => {
      const tab = node('button', undefined, 'scenario-tab');
      tab.type = 'button'; tab.dataset.id = scenario.id; tab.setAttribute('aria-pressed', 'false');
      const symbol = node('span', undefined, 'scenario-symbol'); symbol.setAttribute('aria-hidden', 'true');
      symbol.append(scenarioIcon(scenario.id));
      tab.append(symbol, node('strong', names[scenario.id]));
      tab.addEventListener('click', () => selectScenario(scenario.id));
      return tab;
    }));
    selectScenario('travel');
    $('decision-inputs').disabled = false;
    status('decision-load-status', 'Five scenarios ready. All preset options and measurements are fictional.');
  } catch {
    state.entries = []; state.current = null;
    status('decision-load-status', 'Decision data could not be loaded or validated. Check your connection and retry.', true);
    $('decision-retry').hidden = false;
    clearComparison('No comparison is available until the source data load successfully.');
  }
}

function table(headers, rows, caption) {
  const container = node('div', undefined, 'comparison-scroll');
  container.tabIndex = 0; container.setAttribute('role', 'region'); container.setAttribute('aria-label', caption);
  const grid = node('table', undefined, 'comparison-table');
  grid.append(node('caption', caption));
  const head = node('thead'); const heading = node('tr');
  for (const label of headers) { const cell = node('th', label); cell.scope = 'col'; heading.append(cell); }
  head.append(heading); grid.append(head);
  const body = node('tbody');
  for (const values of rows) { const row = node('tr'); for (const value of values) row.append(node('td', value)); body.append(row); }
  grid.append(body); container.append(grid); return container;
}

function renderResult(result) {
  const target = $('decision-results'); target.replaceChildren();
  status('decision-status', result.summary);
  $('decision-count').textContent = `${result.ranked.length} feasible · ${result.excluded.length} excluded`;
  if (result.recommended) {
    const choice = result.recommended;
    const card = node('article', undefined, 'decision-card'); card.dataset.optionId = choice.id;
    const header = node('header'); const heading = node('div');
    heading.append(node('p', 'HIGHEST PREFERENCE FIT', 'eyebrow'), node('h3', choice.name));
    const score = node('div', choice.score.toFixed(2), 'decision-score'); score.append(node('small', 'Relative score / 100'));
    header.append(heading, score); card.append(header, node('p', choice.description, 'muted'));
    const measures = node('dl', undefined, 'decision-metrics');
    for (const criterion of result.criteria) {
      const group = node('div'); group.append(node('dt', criterion.label), node('dd', measure(choice.metrics[criterion.id], criterion.unit))); measures.append(group);
    }
    card.append(measures);
    const explanation = node('details', undefined, 'decision-disclosure');
    explanation.append(node('summary', 'Why this option ranks first'));
    const reasons = node('ul'); reasons.append(...choice.reasons.map((reason) => node('li', reason))); explanation.append(reasons);
    card.append(explanation); target.append(card);
    target.append(table(['Option', 'Relative score', ...result.criteria.map((criterion) => criterion.label)], result.ranked.map((option) => [option.name, `${option.score.toFixed(2)} / 100`, ...result.criteria.map((criterion) => measure(option.metrics[criterion.id], criterion.unit))]), 'Feasible options and actual measures'));
    const breakdown = node('details', undefined, 'decision-disclosure'); breakdown.append(node('summary', 'Inspect score contributions'));
    for (const option of result.ranked) {
      breakdown.append(node('h4', option.name), table(['Measure', 'Value', 'Weight', 'Normalised', 'Points'], option.contributions.map((part) => [part.label, measure(part.value, part.unit), String(part.weight), `${(part.normalised * 100).toFixed(2)}%`, part.points.toFixed(6)]), `Score breakdown for ${option.name}`));
    }
    target.append(breakdown);
  } else {
    const empty = node('div', undefined, 'decision-placeholder');
    empty.append(node('h3', 'No option meets these limits.'), node('p', 'Try adjusting a hard limit or inspect the missing measurements below. Unknown values are never treated as zero.'));
    target.append(empty);
  }
  if (result.excluded.length) {
    const excluded = node('details', undefined, 'decision-disclosure'); excluded.id = 'decision-exclusions';
    excluded.append(node('summary', `Why ${result.excluded.length} options were excluded`));
    for (const option of result.excluded) {
      const item = node('article', undefined, 'decision-excluded');
      const reasons = node('ul'); reasons.append(...option.reasons.map((reason) => node('li', reason)));
      item.append(node('h4', option.name), reasons); excluded.append(item);
    }
    target.append(excluded);
  }
  const provenance = node('div', undefined, 'decision-provenance provenance');
  provenance.append(node('strong', 'Source provenance · joined by option ID'));
  for (const source of result.sources) provenance.append(node('p', `${source.label} · ${source.is_simulated ? 'Simulated' : 'Provided metadata; accuracy unverified'} · ${source.updated_at}`));
  const limits = node('ul', undefined, 'decision-limitations'); limits.append(...result.limitations.map((limit) => node('li', limit)));
  provenance.append(limits); target.append(provenance);
}

$('decision-form').addEventListener('input', () => clearComparison());
$('decision-form').addEventListener('change', () => clearComparison());
$('decision-scenario').addEventListener('change', () => selectScenario($('decision-scenario').value));
$('decision-reset').addEventListener('click', () => selectScenario($('decision-scenario').value));
$('decision-retry').addEventListener('click', loadDecisions);
$('decision-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!state.current) return;
  clearComparison();
  try {
    const criteria = state.custom?.criteria ?? state.current.scenario.criteria;
    const weights = {}; const constraints = [];
    for (const criterion of criteria) {
      const rawWeight = $(`weight-${criterion.id}`).value.trim();
      if (!rawWeight) throw new Error('Enter a weight for each criterion; use zero to disable it.');
      weights[criterion.id] = Number(rawWeight);
      const operator = $(`bound-${criterion.id}`).value;
      if (operator) {
        const raw = $(`limit-${criterion.id}`).value.trim();
        if (!raw) throw new Error('Enter a value for each selected hard limit.');
        const value = criterion.unit === 'pence'
          ? parseBudget(raw.replace(/^-/, '')) * (raw.startsWith('-') ? -1 : 1) : Number(raw);
        constraints.push({ criterion_id: criterion.id, operator, value });
      }
    }
    const request = { scenario_id: state.current.scenario.id, weights, constraints, ...(state.custom ? { custom: state.custom } : {}) };
    const response = evaluateDecision(request, state.current);
    if (response.error) throw new Error(response.error.details[0]?.message ?? response.error.message);
    renderResult(response.data); effects.play(response.data.recommended ? 'success' : 'empty');
    if (window.matchMedia('(max-width: 760px)').matches) {
      $('comparison-title').focus({ preventScroll: true });
      $('comparison-title').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }
  } catch (error) { status('decision-status', error.message, true); effects.play('empty'); }
});
$('custom-apply').addEventListener('click', () => {
  try {
    const custom = JSON.parse($('custom-json').value);
    const response = evaluateDecision({ scenario_id: 'custom', weights: {}, constraints: [], custom }, state.current);
    if (response.error) throw new Error(response.error.details[0]?.message ?? response.error.message);
    state.custom = custom;
    $('criteria-controls').replaceChildren(...custom.criteria.map((criterion) => control(criterion, {})));
    $('scenario-title').textContent = custom.title;
    clearComparison('Custom data applied. Set priorities and compare your options.');
    status('custom-status', 'Custom criteria and both source datasets validated locally.');
  } catch (error) { status('custom-status', `Custom data was not applied: ${error.message}`, true); }
});

function openTools() { if (!$('library-dialog').open) $('library-dialog').showModal(); }
$('library-open').addEventListener('click', openTools);
$('library-open-secondary').addEventListener('click', openTools);
$('library-close').addEventListener('click', () => $('library-dialog').close());
for (const link of document.querySelectorAll('a[href="#library"]')) link.addEventListener('click', (event) => { event.preventDefault(); openTools(); });
for (const link of document.querySelectorAll('a[href="#planner"]')) link.addEventListener('click', () => { $('legacy-planner').open = true; });
void loadDecisions();
