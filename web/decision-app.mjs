import { evaluateDecision } from './decisions.mjs';
import { parseBudget } from './planner.mjs';
import { criterionLabel, displayMeasure as measure, topicCopy, unitLabel } from './presentation.mjs';
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
const labelFor = (criterion) => criterionLabel(criterion, !!state.custom || state.current?.scenario.id === 'custom');

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

function clearComparison(message = 'Your choices changed. Tap Find my best match to update the result.') {
  $('decision-results').replaceChildren();
  status('decision-status', message);
}

function control(criterion, defaults) {
  const title = labelFor(criterion);
  const defaultWeight = Object.hasOwn(defaults.weights ?? {}, criterion.id) ? defaults.weights[criterion.id] : criterion.default_weight;
  const row = node('div', undefined, 'criterion-control');
  row.dataset.criterion = criterion.id;
  const heading = node('div', undefined, 'criterion-title');
  const label = node('label', title);
  label.htmlFor = `priority-${criterion.id}`;
  const preference = criterion.unit === 'pence' ? 'Lower cost is better · £'
    : `${criterion.direction === 'minimize' ? 'Less' : 'More'} is better · ${unitLabel(criterion.unit)}`;
  heading.append(label, node('span', preference, 'hint'));
  const priorityLabel = node('label', 'How much does this matter?', 'sr-only');
  priorityLabel.htmlFor = `priority-${criterion.id}`;
  const priority = document.createElement('select');
  priority.id = `priority-${criterion.id}`; priority.className = 'priority-choice';
  priority.setAttribute('aria-label', `How much ${title} matters`);
  priority.append(new Option('Suggested', 'suggested'), new Option('Not important', '0'), new Option('A little important', '25'),
    new Option('Important', '50'), new Option('Very important', '100'), new Option('Fine-tune…', 'custom'));
  priority.value = 'suggested';
  const advanced = node('details', undefined, 'exact-priority');
  advanced.hidden = true;
  advanced.id = `exact-${criterion.id}`;
  advanced.append(node('summary', 'Fine-tune importance'));
  const weights = node('div', undefined, 'weight-controls');
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1';
  slider.value = String(defaultWeight);
  slider.setAttribute('aria-label', `Importance slider for ${title}`);
  const weight = document.createElement('input');
  weight.type = 'number'; weight.min = '0'; weight.max = '100'; weight.step = 'any';
  weight.id = `weight-${criterion.id}`; weight.value = String(defaultWeight);
  weight.dataset.weight = criterion.id;
  weight.setAttribute('aria-label', `Exact importance for ${title}`);
  const sync = () => {
    priority.value = Number(weight.value) === defaultWeight ? 'suggested'
      : ['0', '25', '50', '100'].includes(weight.value) ? weight.value : 'custom';
  };
  slider.addEventListener('input', () => { weight.value = slider.value; sync(); clearComparison(); });
  weight.addEventListener('input', () => { slider.value = weight.value; sync(); });
  priority.addEventListener('change', () => {
    if (priority.value === 'custom') { advanced.hidden = false; advanced.open = true; weight.focus(); }
    else { weight.value = priority.value === 'suggested' ? String(defaultWeight) : priority.value; slider.value = weight.value; advanced.open = false; advanced.hidden = true; }
    clearComparison();
  });
  weights.append(slider, weight); advanced.append(weights, node('p', '0 means ignore this; 100 means it matters most. Limits still apply.', 'hint'));
  const bounds = node('div', undefined, 'constraint-controls');
  const operatorLabel = node('label', 'Any limits?', 'limit-heading');
  operatorLabel.htmlFor = `bound-${criterion.id}`;
  const operator = document.createElement('select');
  operator.id = `bound-${criterion.id}`; operator.dataset.operator = criterion.id;
  operator.setAttribute('aria-label', `Limit for ${title}`);
  operator.append(new Option(criterion.unit === 'pence' ? 'No spending limit' : 'No limit', ''),
    new Option(criterion.unit === 'pence' ? 'Spend up to…' : 'No more than…', 'lte'),
    new Option(criterion.unit === 'pence' ? 'Spend at least…' : 'At least…', 'gte'));
  const limitLabel = node('label', undefined, 'limit-field');
  const limitName = node('span', '', 'limit-caption'); limitName.id = `limit-label-${criterion.id}`;
  const inputWrap = node('span', undefined, criterion.unit === 'pence' ? 'currency-input' : 'limit-input');
  const limit = document.createElement('input');
  limit.id = `limit-${criterion.id}`; limit.type = 'text'; limit.inputMode = 'decimal';
  limit.dataset.limit = criterion.id; limit.setAttribute('aria-labelledby', limitName.id);
  limit.placeholder = criterion.unit === 'pence' ? 'e.g. 25.00' : 'Enter an amount';
  if (criterion.unit === 'pence') { const symbol = node('span', '£', 'currency-prefix'); symbol.setAttribute('aria-hidden', 'true'); inputWrap.append(symbol); }
  inputWrap.append(limit);
  const existing = defaults.constraints?.find((constraint) => constraint.criterion_id === criterion.id);
  operator.value = existing?.operator ?? '';
  limit.value = existing ? String(existing.value / (criterion.unit === 'pence' ? 100 : 1)) : '';
  const showLimit = () => {
    const visible = !!operator.value;
    limitLabel.hidden = !visible; limit.required = visible;
    limitName.textContent = criterion.unit === 'pence'
      ? `${operator.value === 'gte' ? 'Minimum spend' : 'Your budget'} (£)`
      : `${operator.value === 'gte' ? 'Minimum' : 'Maximum'} (${unitLabel(criterion.unit)})`;
  };
  showLimit();
  operator.addEventListener('change', () => { showLimit(); clearComparison(); if (operator.value) limit.focus(); });
  limitLabel.append(limitName, inputWrap);
  const operatorGroup = node('div'); operatorGroup.append(operatorLabel, operator);
  bounds.append(operatorGroup, limitLabel);
  row.append(heading, priorityLabel, priority, bounds, advanced);
  return row;
}

function selectScenario(id) {
  const entry = state.entries.find((candidate) => candidate.scenario.id === id);
  if (!entry) return;
  state.current = entry; state.custom = null;
  const { scenario } = entry;
  $('decision-scenario').value = id;
  $('scenario-title').textContent = topicCopy[id].name;
  $('decision-workspace').dataset.scenario = id;
  $('scenario-description').textContent = topicCopy[id].description;
  $('scenario-notice').textContent = topicCopy[id].notice;
  $('criteria-controls').replaceChildren(...scenario.criteria.map((criterion) => control(criterion, scenario.default_request)));
  $('custom-editor').hidden = id !== 'custom';
  $('custom-editor').open = false;
  status('custom-status', '');
  if (id === 'custom') $('custom-json').value = JSON.stringify({ title: scenario.title, criteria: scenario.criteria, dataset: entry.dataset }, null, 2);
  for (const tab of $('scenario-tabs').children) tab.setAttribute('aria-pressed', String(tab.dataset.id === id));
  $('decision-count').textContent = `${entry.dataset.options.length} choices to explore`;
  clearComparison('Tell us what matters, then find your best match.');
}

async function loadDecisions() {
  $('decision-inputs').disabled = true;
  $('decision-retry').hidden = true;
  clearComparison('Getting your choices ready…');
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
    $('decision-scenario').replaceChildren(...state.entries.map(({ scenario }) => new Option(topicCopy[scenario.id].name, scenario.id)));
    const names = Object.fromEntries(Object.entries(topicCopy).map(([id, copy]) => [id, copy.name]));
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
    status('decision-load-status', 'Ready to explore. All examples use made-up information.');
  } catch {
    state.entries = []; state.current = null;
    status('decision-load-status', 'Your choices could not be loaded. Check your connection and try again.', true);
    $('decision-retry').hidden = false;
    clearComparison('We need the example information before we can find a match.');
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
  status('decision-status', result.recommended ? `We found ${result.ranked.length} ${result.ranked.length === 1 ? 'choice' : 'choices'} that fit what you asked for.` : 'Nothing fits your limits yet. Try changing a limit.');
  $('decision-count').textContent = `${result.ranked.length} fit · ${result.excluded.length} don’t fit`;
  if (result.recommended) {
    const choice = result.recommended;
    const card = node('article', undefined, 'decision-card'); card.dataset.optionId = choice.id;
    const header = node('header'); const heading = node('div');
    heading.append(node('p', 'CLOSEST MATCH TO YOUR CHOICES', 'eyebrow'), node('h3', choice.name));
    const score = node('div', choice.score.toFixed(2), 'decision-score'); score.append(node('small', 'Match score · out of 100'));
    header.append(heading, score); card.append(header);
    if (choice.description !== 'A fictional example for transparent preference comparison.') card.append(node('p', choice.description, 'muted'));
    const measures = node('dl', undefined, 'decision-metrics');
    for (const criterion of result.criteria) {
      const group = node('div'); group.append(node('dt', labelFor(criterion)), node('dd', measure(choice.metrics[criterion.id], criterion.unit))); measures.append(group);
    }
    card.append(measures);
    const explanation = node('details', undefined, 'decision-disclosure');
    explanation.append(node('summary', 'Why this is a good match'));
    const reasons = node('ul');
    reasons.append(node('li', 'It fits the limits you set.'));
    for (const part of choice.contributions) {
      const criterion = result.criteria.find((item) => item.id === part.criterion_id);
      reasons.append(node('li', `${labelFor(criterion)}: ${measure(part.value, part.unit)}. You asked us to favour ${criterion.direction === 'minimize' ? 'less' : 'more'}.`));
    }
    explanation.append(reasons);
    card.append(explanation); target.append(card);
    target.append(table(['Your choices', 'Match score', ...result.criteria.map(labelFor)], result.ranked.map((option) => [option.name, `${option.score.toFixed(2)} / 100`, ...result.criteria.map((criterion) => measure(option.metrics[criterion.id], criterion.unit))]), 'Compare the choices that fit'));
    const breakdown = node('details', undefined, 'decision-disclosure'); breakdown.append(node('summary', 'More details: how we worked it out'));
    for (const option of result.ranked) {
      breakdown.append(node('h4', option.name), table(['What matters', 'Value', 'Importance', 'Preference match', 'Score points'], option.contributions.map((part) => [labelFor(result.criteria.find((criterion) => criterion.id === part.criterion_id)), measure(part.value, part.unit), String(part.weight), `${(part.normalised * 100).toFixed(2)}%`, part.points.toFixed(6)]), `Score breakdown for ${option.name}`));
    }
    target.append(breakdown);
  } else {
    const empty = node('div', undefined, 'decision-placeholder');
    empty.append(node('h3', 'Nothing quite fits. Let’s try again.'), node('p', 'Try raising your budget or changing a limit. We leave out choices when important information is missing.'));
    target.append(empty);
  }
  if (result.excluded.length) {
    const excluded = node('details', undefined, 'decision-disclosure'); excluded.id = 'decision-exclusions';
    excluded.append(node('summary', `Why ${result.excluded.length} choices don’t fit`));
    for (const option of result.excluded) {
      const item = node('article', undefined, 'decision-excluded');
      const reasons = node('ul');
      for (let reason of option.reasons) {
        for (const criterion of result.criteria) reason = reason.replaceAll(criterion.label, () => labelFor(criterion));
        reason = reason.replace('exceeds its selected maximum', 'is over your limit').replace('is below its selected minimum', 'is below your minimum')
          .replace('Availability is unknown.', 'We don’t know if this is available.').replace('Option is unavailable.', 'This is not available.')
          .replace('No measurements were provided for this option.', 'There is not enough information about this choice.').replace('Missing value for', 'We don’t have a value for');
        reasons.append(node('li', reason));
      }
      item.append(node('h4', option.name), reasons); excluded.append(item);
    }
    target.append(excluded);
  }
  const provenance = node('div', undefined, 'decision-provenance provenance');
  provenance.append(node('strong', 'Where the example information comes from'));
  for (const source of result.sources) provenance.append(node('p', `${source.label} · ${source.is_simulated ? 'Simulated' : 'Provided metadata; accuracy unverified'} · ${source.updated_at}`));
  const limits = node('ul', undefined, 'decision-limitations'); limits.append(...result.limitations.map((limit) => node('li', limit)));
  provenance.append(limits);
  const about = node('details', undefined, 'decision-about decision-disclosure');
  about.append(node('summary', 'About these examples'), provenance); target.append(about);
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
      if (!rawWeight) throw new Error('Choose how much each thing matters. Use Not important to leave it out.');
      weights[criterion.id] = Number(rawWeight);
      const operator = $(`bound-${criterion.id}`).value;
      if (operator) {
        const raw = $(`limit-${criterion.id}`).value.trim();
        if (!raw) throw new Error('Enter an amount for each limit you have chosen.');
        const value = criterion.unit === 'pence'
          ? parseBudget(raw.replace(/^-/, '')) * (raw.startsWith('-') ? -1 : 1) : Number(raw);
        if (!Number.isFinite(value)) throw new Error(`Enter a number for ${labelFor(criterion)}.`);
        constraints.push({ criterion_id: criterion.id, operator, value });
      }
    }
    if (!Object.values(weights).some((weight) => weight > 0)) throw new Error('Choose Important or Very important for at least one thing.');
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
    clearComparison('Your information is ready. Choose what matters and find your match.');
    status('custom-status', 'Your information has been checked and is ready to use.');
  } catch (error) { status('custom-status', `Custom data was not applied: ${error.message}`, true); }
});

function openTools() { if (!$('library-dialog').open) $('library-dialog').showModal(); }
$('library-open').addEventListener('click', openTools);
$('library-open-secondary').addEventListener('click', openTools);
$('library-close').addEventListener('click', () => $('library-dialog').close());
for (const link of document.querySelectorAll('a[href="#library"]')) link.addEventListener('click', (event) => { event.preventDefault(); openTools(); });
for (const link of document.querySelectorAll('a[href="#planner"]')) link.addEventListener('click', () => { $('legacy-planner').open = true; });
void loadDecisions();
