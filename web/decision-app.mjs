import { loadDecisions as loadDecisionCatalog, compareDecision } from './platform.mjs';
import { configureContext, notifyContextChange } from './ui-context.mjs';
import { parseBudget } from './planner.mjs';
import { criterionLabel, displayMeasure, topicCopy, unitLabel } from './presentation.mjs';
import { setupSound } from './effects.mjs';
import { bind, t, option, attribute, number } from './i18n.mjs';

const $ = (id) => document.getElementById(id);
const state = { entries: [], current: null, custom: null, result: null, controlRefresh: [], version: 0, busy: false, loadVersion: 0, customDirty: false };
const effects = setupSound($('sound-toggle'));
const node = (tag, content, className = '', raw = false) => {
  const element = document.createElement(tag);
  if (content !== undefined) bind(element, raw ? '{text}' : content, raw ? { text: content } : {});
  element.className = className;
  return element;
};
const status = (id, message, error = false, params = {}) => {
  bind($(id), message, params);
  $(id).className = `feedback${error ? ' error' : ''}`;
};
const isCustom = () => !!state.custom || state.current?.scenario.id === 'custom';
const measure = (value, unit) => displayMeasure(value, unit, !!state.custom);
const displayUnit = (unit) => unit === 'pence' ? '£' : state.custom ? unit : t(unitLabel(unit));
const labelFor = (criterion) => state.custom ? criterion.label : t(criterionLabel(criterion, isCustom()));
const optionName = (item) => isCustom() ? item.name : t(item.name);
const showSection = (id) => {
  $(id).focus({ preventScroll: true });
  $(id).scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
};

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

function clearComparison(message = '') {
  state.result = null; state.version++; notifyContextChange();
  const empty = node('div', undefined, 'decision-placeholder');
  empty.append(node('p', 'Set your priorities, then compare.'));
  $('decision-results').replaceChildren(empty);
  bind($('decision-count'), state.current ? '{count} example choices' : 'Getting ready', { count: state.current?.dataset.options.length });
  $('edit-choices').hidden = true;
  status('decision-status', message);
}

function updateLimitCount() {
  const selected = [...$('other-limit-controls').querySelectorAll('select')].filter((select) => select.value);
  bind($('extra-limit-count'), selected.length ? ' · {count} set' : '', { count: selected.length });
  const criteria = state.custom?.criteria ?? state.current?.scenario.criteria ?? [];
  $('active-limit-preview').textContent = selected.map((select) => {
    const criterion = criteria.find((item) => item.id === select.dataset.operator);
    const raw = $(`limit-${criterion.id}`).value.trim();
    const value = raw && Number.isFinite(Number(raw)) ? measure(Number(raw), criterion.unit) : t('enter an amount');
    return t(select.value === 'lte' ? '{label}: up to {value}' : '{label}: at least {value}', { label: labelFor(criterion), value });
  }).join(' · ');
}

function renderControls(criteria, defaults) {
  state.controlRefresh = [];
  $('spending-controls').replaceChildren();
  $('other-limit-controls').replaceChildren();
  $('criteria-controls').replaceChildren(...criteria.map((criterion) => control(criterion, defaults)));
  updateLimitCount();
  $('extra-limits').hidden = !$('other-limit-controls').children.length;
  $('extra-limits').open = false;
}

function control(criterion, defaults) {
  const title = labelFor(criterion);
  const defaultWeight = Object.hasOwn(defaults.weights ?? {}, criterion.id) ? defaults.weights[criterion.id] : criterion.default_weight;
  const row = node('div', undefined, 'criterion-control');
  row.dataset.criterion = criterion.id;
  const heading = node('div', undefined, 'criterion-title');
  const label = node('label', title, '', true);
  label.htmlFor = `priority-${criterion.id}`;
  const preference = criterion.unit === 'pence' ? 'Lower cost is better · £'
    : `${criterion.direction === 'minimize' ? 'Less' : 'More'} is better · ${unitLabel(criterion.unit)}`;
  const preferenceNode = node('span', preference, 'hint');
  heading.append(label, preferenceNode);
  const priorityLabel = node('label', 'How much does this matter?', 'sr-only');
  priorityLabel.htmlFor = `priority-${criterion.id}`;
  const priority = document.createElement('select');
  priority.id = `priority-${criterion.id}`; priority.className = 'priority-choice';
  priority.setAttribute('aria-label', `How much ${title} matters`);
  priority.append(option('Suggested', 'suggested'), option('Not important', '0'), option('A little important', '25'),
    option('Important', '50'), option('Very important', '100'), option('Fine-tune…', 'custom'));
  priority.value = 'suggested';
  const advanced = node('details', undefined, 'exact-priority');
  advanced.hidden = true;
  advanced.id = `exact-${criterion.id}`;
  advanced.append(node('summary', 'Fine-tune importance'));
  const weights = node('div', undefined, 'weight-controls');
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = 'any';
  slider.id = `importance-slider-${criterion.id}`;
  slider.value = String(defaultWeight);
  slider.setAttribute('aria-label', `Importance slider for ${title}`);
  const weight = document.createElement('input');
  weight.type = 'number'; weight.min = '0'; weight.max = '100'; weight.step = 'any';
  weight.id = `weight-${criterion.id}`; weight.value = String(defaultWeight);
  weight.dataset.weight = criterion.id;
  weight.setAttribute('aria-label', `Exact importance for ${title}`);
  const weightBox = node('div', undefined, 'number-with-unit');
  const weightUnit = node('span', '/ 100', 'number-unit'); weightUnit.setAttribute('aria-hidden', 'true');
  weightBox.append(weight, weightUnit);
  const weightHint = node('p', 'Importance points, not an amount. 0 = ignore; 100 = matters most.', 'hint');
  weightHint.id = `importance-hint-${criterion.id}`;
  slider.setAttribute('aria-describedby', weightHint.id); weight.setAttribute('aria-describedby', weightHint.id);
  const updateWeight = () => {
    const value = Number(weight.value);
    if (weight.value.trim() && Number.isFinite(value) && value >= 0 && value <= 100) {
      slider.value = weight.value;
      attribute(slider, 'aria-valuetext', '{value} out of 100 importance points', () => ({ value: number(Number(weight.value)) }));
      slider.style.setProperty('--range-fill', `${value}%`);
    }
  };
  const sync = () => {
    priority.value = Number(weight.value) === defaultWeight ? 'suggested'
      : ['0', '25', '50', '100'].includes(weight.value) ? weight.value : 'custom';
  };
  slider.addEventListener('keydown', (event) => {
    const changes = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 };
    if (!Object.hasOwn(changes, event.key)) return;
    event.preventDefault(); slider.value = String(Math.min(100, Math.max(0, Number(slider.value) + changes[event.key])));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  slider.addEventListener('input', () => { weight.value = String(Number(Number(slider.value).toFixed(3))); updateWeight(); sync(); clearComparison(); });
  weight.addEventListener('input', () => { updateWeight(); sync(); });
  priority.addEventListener('change', () => {
    if (priority.value === 'custom') { advanced.hidden = false; advanced.open = true; weight.focus(); }
    else { weight.value = priority.value === 'suggested' ? String(defaultWeight) : priority.value; updateWeight(); advanced.open = false; advanced.hidden = true; }
    clearComparison();
  });
  updateWeight();
  const ends = node('div', undefined, 'range-endpoints'); ends.append(node('span', 'Ignore'), node('span', 'Matters most'));
  const sliderGroup = node('div', undefined, 'slider-group'); sliderGroup.append(slider, ends);
  weights.append(sliderGroup, weightBox); advanced.append(weights, weightHint);
  const bounds = node('div', undefined, 'constraint-controls');
  const operatorLabel = node('label', 'Any limits?', 'limit-heading');
  bind(operatorLabel, criterion.unit === 'pence' ? '{title}: spending limit' : '{title}: limit', () => ({ title: labelFor(criterion) }));
  operatorLabel.htmlFor = `bound-${criterion.id}`;
  const operator = document.createElement('select');
  operator.id = `bound-${criterion.id}`; operator.dataset.operator = criterion.id;
  operator.setAttribute('aria-label', `Limit for ${title}`);
  operator.append(option(criterion.unit === 'pence' ? 'No spending limit' : 'No limit', ''),
    option(criterion.unit === 'pence' ? 'Spend up to…' : 'No more than…', 'lte'),
    option(criterion.unit === 'pence' ? 'Spend at least…' : 'At least…', 'gte'));
  const limitLabel = node('div', undefined, 'limit-field');
  const limitName = node('label', '', 'limit-caption'); limitName.id = `limit-label-${criterion.id}`;
  limitName.htmlFor = `limit-${criterion.id}`;
  const inputWrap = node('div', undefined, 'number-with-unit amount-input');
  const limit = document.createElement('input');
  limit.id = `limit-${criterion.id}`; limit.type = 'text'; limit.inputMode = 'decimal';
  limit.dataset.limit = criterion.id; limit.setAttribute('aria-labelledby', limitName.id);
  attribute(limit, 'placeholder', criterion.unit === 'pence' ? 'e.g. 25.00' : 'Enter an amount');
  const unit = node('span', unitLabel(criterion.unit), 'number-unit'); unit.setAttribute('aria-hidden', 'true');
  if (criterion.unit === 'pence') inputWrap.append(unit);
  inputWrap.append(limit);
  if (criterion.unit !== 'pence') inputWrap.append(unit);
  const existing = defaults.constraints?.find((constraint) => constraint.criterion_id === criterion.id);
  operator.value = existing?.operator ?? '';
  limit.value = existing ? String(existing.value / (criterion.unit === 'pence' ? 100 : 1)) : '';
  const amountSlider = document.createElement('input');
  amountSlider.type = 'range'; amountSlider.id = `amount-slider-${criterion.id}`;
  amountSlider.setAttribute('aria-label', `${title} limit in ${criterion.unit === 'pence' ? 'pounds' : unitLabel(criterion.unit)}`);
  amountSlider.step = criterion.unit === 'pence' ? '0.01' : 'any';
  const divisor = criterion.unit === 'pence' ? 100 : 1;
  const values = (state.custom?.dataset ?? state.current.dataset).observations.map((item) => item.metrics?.[criterion.id])
    .filter((value) => typeof value === 'number' && Number.isFinite(value)).map((value) => value / divisor);
  const baseMin = Math.min(0, ...values);
  const baseMax = Math.max(100, ...values, existing ? existing.value / divisor : 0);
  const amountHint = node('p', '', 'amount-hint hint'); amountHint.id = `amount-hint-${criterion.id}`;
  limit.setAttribute('aria-describedby', amountHint.id); amountSlider.setAttribute('aria-describedby', amountHint.id);
  const syncAmount = () => {
    const raw = limit.value.trim(); const value = Number(raw);
    const valid = raw !== '' && Number.isFinite(value) && (criterion.unit !== 'pence' || value >= 0);
    amountSlider.min = String(valid ? Math.min(baseMin, value) : baseMin);
    amountSlider.max = String(valid ? Math.max(baseMax, value) : baseMax);
    amountSlider.value = String(valid ? value : baseMin);
    const display = valid ? measure(value * divisor, criterion.unit) : 'Enter an amount';
    amountSlider.setAttribute('aria-valuetext', display);
    amountSlider.style.setProperty('--range-fill', `${(Number(amountSlider.value) - Number(amountSlider.min)) / (Number(amountSlider.max) - Number(amountSlider.min)) * 100}%`);
    bind(amountHint, valid ? '{value}' : '', { value: display });
  };
  amountSlider.addEventListener('input', () => {
    limit.value = criterion.unit === 'pence' ? Number(amountSlider.value).toFixed(2) : String(Number(Number(amountSlider.value).toFixed(3)));
    syncAmount(); updateLimitCount();
  });
  amountSlider.addEventListener('keydown', (event) => {
    const changes = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 };
    if (!Object.hasOwn(changes, event.key)) return;
    event.preventDefault();
    const step = criterion.unit === 'pence' ? 0.01 : 1;
    amountSlider.value = String(Math.min(Number(amountSlider.max), Math.max(Number(amountSlider.min), Number(amountSlider.value) + changes[event.key] * step)));
    amountSlider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  syncAmount();
  const showLimit = () => {
    const visible = !!operator.value;
    limitLabel.hidden = !visible; limit.required = visible;
    bind(limitName, criterion.unit === 'pence'
      ? (operator.value === 'gte' ? 'Minimum spend (£)' : 'Your budget (£)')
      : (operator.value === 'gte' ? 'Minimum ({unit})' : 'Maximum ({unit})'), { unit: displayUnit(criterion.unit) });
  };
  showLimit();
  operator.addEventListener('change', () => { showLimit(); updateLimitCount(); clearComparison(); if (operator.value) limit.focus(); });
  limit.addEventListener('invalid', () => { if (bounds.closest('#extra-limits')) $('extra-limits').open = true; });
  limit.addEventListener('input', () => { syncAmount(); updateLimitCount(); });
  const amountPair = node('div', undefined, 'measure-controls'); amountPair.append(amountSlider, inputWrap);
  limitLabel.append(limitName, amountPair, amountHint);
  const operatorGroup = node('div'); operatorGroup.append(operatorLabel, operator);
  bounds.append(operatorGroup, limitLabel);
  $(criterion.unit === 'pence' ? 'spending-controls' : 'other-limit-controls').append(bounds);
  row.append(heading, priorityLabel, priority, advanced);
  const refresh = () => {
    bind(label, '{text}', { text: labelFor(criterion) });
    bind(preferenceNode, criterion.unit === 'pence' ? 'Lower cost is better · £' : criterion.direction === 'minimize' ? 'Less is better · {unit}' : 'More is better · {unit}', { unit: displayUnit(criterion.unit) });
    attribute(priority, 'aria-label', 'How much {title} matters', { title: labelFor(criterion) });
    attribute(slider, 'aria-label', 'Importance slider for {title}', { title: labelFor(criterion) });
    attribute(weight, 'aria-label', 'Exact importance for {title}', { title: labelFor(criterion) });
    attribute(operator, 'aria-label', 'Limit for {title}', { title: labelFor(criterion) });
    attribute(amountSlider, 'aria-label', '{title} limit in {unit}', { title: labelFor(criterion), unit: criterion.unit === 'pence' ? t('pounds') : displayUnit(criterion.unit) });
    bind(unit, '{text}', { text: displayUnit(criterion.unit) });
    showLimit(); syncAmount(); updateWeight();
  };
  state.controlRefresh.push(refresh); refresh();
  return row;
}


function updateScenarioNotice() {
  const message = state.current?.scenario.id === 'market' ? 'No investment recommendation or suitability assessment.'
    : state.custom ? 'User-supplied data is not independently verified.' : '';
  bind($('scenario-notice'), message);
  $('scenario-notice').hidden = !message;
}

function selectScenario(id) {
  const entry = state.entries.find((candidate) => candidate.scenario.id === id);
  if (!entry) return;
  state.current = entry; state.custom = null; state.customDirty = false;
  const { scenario } = entry;
  bind($('scenario-title'), topicCopy[id].name);
  $('decision-workspace').dataset.scenario = id;

  updateScenarioNotice();
  renderControls(scenario.criteria, scenario.default_request);
  $('custom-editor').hidden = id !== 'custom';
  $('custom-editor').open = false;
  status('custom-status', '');
  if (id === 'custom') $('custom-json').value = JSON.stringify({ title: scenario.title, criteria: scenario.criteria, dataset: entry.dataset }, null, 2);
  for (const tab of $('scenario-tabs').children) tab.setAttribute('aria-pressed', String(tab.dataset.id === id));
  bind($('decision-count'), '{count} choices to explore', { count: entry.dataset.options.length });
  clearComparison();
}

async function loadDecisions() {
  $('decision-inputs').disabled = true;
  $('try-example').disabled = true;
  $('decision-retry').hidden = true;
  clearComparison();
  status('decision-load-status', 'Getting your choices ready…');
  const loadVersion = ++state.loadVersion;
  try {
    const catalog = await loadDecisionCatalog();
    if (loadVersion !== state.loadVersion) return;
    if (!Array.isArray(catalog.scenarios) || catalog.scenarios.length !== 5) throw new Error();
    const ids = new Set(catalog.scenarios.map((entry) => entry.scenario.id));
    if (!['market', 'travel', 'student', 'sustainability', 'custom'].every((id) => ids.has(id))) throw new Error();
    state.entries = catalog.scenarios;
    $('scenario-tabs').replaceChildren(...state.entries.map(({ scenario }) => {
      const tab = node('button', undefined, 'scenario-tab');
      tab.type = 'button'; tab.dataset.id = scenario.id; tab.setAttribute('aria-pressed', 'false');
      const symbol = node('span', undefined, 'scenario-symbol'); symbol.setAttribute('aria-hidden', 'true');
      symbol.append(scenarioIcon(scenario.id));
      const copy = topicCopy[scenario.id];
      const text = node('span', undefined, 'topic-text'); text.append(node('strong', copy.name), node('small', copy.example));
      tab.append(symbol, text);
      tab.addEventListener('click', () => selectScenario(scenario.id));
      return tab;
    }));
    selectScenario('travel');
    $('decision-inputs').disabled = false;
    $('try-example').disabled = false;
    status('decision-load-status', '');
  } catch {
    if (loadVersion !== state.loadVersion) return;
    state.entries = []; state.current = null;
    status('decision-load-status', 'Your choices could not be loaded. Check your connection and try again.', true);
    $('decision-retry').hidden = false;
    clearComparison();
  }
}

function table(headers, rows, caption) {
  const container = node('div', undefined, 'comparison-scroll');
  container.tabIndex = 0; container.setAttribute('role', 'region'); container.setAttribute('aria-label', caption);
  const grid = node('table', undefined, 'comparison-table');
  grid.append(node('caption', caption));
  const head = node('thead'); const heading = node('tr');
  for (const label of headers) { const cell = typeof label === 'object' ? node('th', label.text, '', true) : node('th', label); cell.scope = 'col'; heading.append(cell); }
  head.append(heading); grid.append(head);
  const body = node('tbody');
  for (const values of rows) { const row = node('tr'); for (const value of values) row.append(node('td', value, '', true)); body.append(row); }
  grid.append(body); container.append(grid); return container;
}

function renderResult(result) {
  state.result = result;
  const target = $('decision-results'); target.replaceChildren();
  status('decision-status', result.recommended ? '' : 'Nothing fits your limits yet. Try changing a limit.');
  bind($('decision-count'), '{fit} fit · {excluded} don’t fit', { fit: result.ranked.length, excluded: result.excluded.length });
  $('edit-choices').hidden = false;
  if (result.recommended) {
    const choice = result.recommended;
    const card = node('article', undefined, 'decision-card'); card.dataset.optionId = choice.id;
    const header = node('header'); const heading = node('div');
    heading.append(node('p', 'Best match', 'eyebrow'), node('h3', optionName(choice), '', true));
    header.append(heading); card.append(header);
    if (choice.description !== 'A fictional example for transparent preference comparison.') card.append(node('p', choice.description, 'muted', true));
    const measures = node('dl', undefined, 'decision-metrics');
    for (const criterion of result.criteria) {
      const group = node('div'); group.append(node('dt', labelFor(criterion), '', true), node('dd', measure(choice.metrics[criterion.id], criterion.unit))); measures.append(group);
    }
    card.append(measures);
    const priorities = [...choice.contributions].filter((part) => part.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, 2)
      .map((part) => labelFor(result.criteria.find((criterion) => criterion.id === part.criterion_id)));
    card.append(bind(node('p', undefined, 'match-explanation'), 'Top priorities: {labels}', { labels: priorities.join(', ') }));
    target.append(card);
    target.append(table(['Your choices', ...result.criteria.map((criterion) => ({ text: labelFor(criterion) }))], result.ranked.map((option) => [optionName(option), ...result.criteria.map((criterion) => measure(option.metrics[criterion.id], criterion.unit))]), 'Compare the choices that fit'));
    const breakdown = node('details', undefined, 'decision-disclosure'); breakdown.append(node('summary', 'Why this match?'));
    breakdown.append(node('p', 'Scores compare these options using your settings. They are not a chance of success, a guarantee or a prediction.', 'hint'));
    for (const option of result.ranked) {
      breakdown.append(node('h4', optionName(option), '', true), node('p', t('{score} / 100 relative match score', { score: number(option.score, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }), 'decision-score'), table(['What matters', 'Value', 'Importance', 'Preference match', 'Score points'], option.contributions.map((part) => [labelFor(result.criteria.find((criterion) => criterion.id === part.criterion_id)), measure(part.value, part.unit), String(part.weight), `${(part.normalised * 100).toFixed(2)}%`, part.points.toFixed(6)]), t('Score breakdown for {name}', { name: optionName(option) })));
    }
    target.append(breakdown);
  } else {
    const empty = node('div', undefined, 'decision-placeholder');
    empty.append(node('h3', 'No matching choices'), node('p', 'Change a limit. Choices with missing required data are excluded.'));
    target.append(empty);
  }
  if (result.excluded.length) {
    const excluded = node('details', undefined, 'decision-disclosure'); excluded.id = 'decision-exclusions';
    excluded.append(node('summary', t('Why {count} choices don’t fit', { count: result.excluded.length })));
    for (const option of result.excluded) {
      const item = node('article', undefined, 'decision-excluded');
      const reasons = node('ul');
      for (const reason of option.reasons) reasons.append(node('li', exclusionReason(reason, result.criteria), '', true));
      item.append(node('h4', optionName(option), '', true), reasons); excluded.append(item);
    }
    target.append(excluded);
  }
  const provenance = node('div', undefined, 'decision-provenance provenance');
  provenance.append(node('strong', 'Where the example information comes from'));
  for (const source of result.sources) provenance.append(node('p', `${source.label} · ${t(source.is_simulated ? 'Simulated' : 'Provided metadata; accuracy unverified')} · ${source.updated_at}`));
  const limits = node('ul', undefined, 'decision-limitations'); limits.append(...result.limitations.map((limit) => node('li', state.custom && limit === result.limitations[0] ? limit : t(limit), '', true)));
  provenance.append(limits);
  const about = node('details', undefined, 'decision-about decision-disclosure');
  about.append(node('summary', 'Sources and limitations'), provenance); target.append(about);
}

$('decision-form').addEventListener('input', () => clearComparison());
$('decision-form').addEventListener('change', () => clearComparison());
$('decision-reset').addEventListener('click', () => selectScenario(state.current.scenario.id));
$('decision-retry').addEventListener('click', loadDecisions);
$('try-example').addEventListener('click', () => {
  selectScenario('travel');
  $('decision-form').requestSubmit();
  showSection('comparison-title');
});
$('edit-choices').addEventListener('click', () => showSection('scenario-title'));
function readDecisionRequest() {
  if (!state.current) return null;
  if (state.customDirty) throw new Error('Apply your custom data first.');
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
      if (!Number.isFinite(value)) {
        const error = new Error('Enter a number for {label}.');
        error.params = () => ({ label: labelFor(criterion) });
        throw error;
      }
      constraints.push({ criterion_id: criterion.id, operator, value });
    }
  }
  if (!Object.values(weights).some((weight) => weight > 0)) throw new Error('Choose Important or Very important for at least one thing.');
  return { scenario_id: state.current.scenario.id, weights, constraints, ...(state.custom ? { custom: state.custom } : {}) };

}

$('decision-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.current || state.busy) return;
  clearComparison();
  const version = state.version;
  state.busy = true; $('decision-submit').disabled = true; $('custom-apply').disabled = true;
  try {
    const request = readDecisionRequest();
    status('decision-status', 'Calculating…');
    const response = await compareDecision(request, state.current);
    if (version !== state.version) return;
    if (response.error) throw new Error(response.error.details[0]?.message ?? response.error.message);
    renderResult(response.data); effects.play(response.data.recommended ? 'success' : 'empty');
    if (window.matchMedia('(max-width: 760px)').matches) {
      showSection('comparison-title');
    }
  } catch (error) { if (version === state.version) { status('decision-status', error.message, true, error.params ?? {}); effects.play('empty'); } }
  finally { state.busy = false; $('decision-submit').disabled = !state.current; $('custom-apply').disabled = false; }
});
$('custom-json').addEventListener('input', () => {
  state.customDirty = true;
  status('custom-status', 'Apply your custom data first.');
});
$('custom-apply').addEventListener('click', async () => {
  if (!state.current || state.busy) return;
  const version = state.version;
  state.busy = true; $('custom-apply').disabled = true; $('decision-submit').disabled = true;
  try {
    const custom = JSON.parse($('custom-json').value);
    const response = await compareDecision({ scenario_id: 'custom', weights: {}, constraints: [], custom }, state.current);
    if (version !== state.version) return;
    if (response.error) throw new Error(t('Please check the structure, values and limits in your custom JSON.'));
    state.custom = custom; state.customDirty = false; updateScenarioNotice();
    renderControls(custom.criteria, {});
    bind($('scenario-title'), '{text}', { text: custom.title });
    clearComparison();
    status('custom-status', 'Custom data applied.');
  } catch (error) { if (version === state.version) status('custom-status', 'Custom data was not applied: {message}', true, () => ({ message: error instanceof SyntaxError ? t('Please check the JSON format.') : t(error.message) })); }
  finally { state.busy = false; $('custom-apply').disabled = false; $('decision-submit').disabled = !state.current; }
});

function openTools() { if (!$('library-dialog').open) $('library-dialog').showModal(); }
$('library-open').addEventListener('click', openTools);
$('library-close').addEventListener('click', () => $('library-dialog').close());
for (const link of document.querySelectorAll('a[href="#library"]')) link.addEventListener('click', (event) => { event.preventDefault(); openTools(); });
for (const link of document.querySelectorAll('a[href="#planner"]')) link.addEventListener('click', () => { $('legacy-planner').open = true; });

function exclusionReason(reason, criteria) {
  const fixed = { 'Availability is unknown.': 'We don’t know if this is available.', 'Option is unavailable.': 'This is not available.', 'No measurements were provided for this option.': 'There is not enough information about this choice.' };
  if (Object.hasOwn(fixed, reason)) return t(fixed[reason]);
  for (const criterion of criteria) {
    const label = labelFor(criterion);
    if (reason === `${criterion.label} exceeds its selected maximum.`) return t('{label} is over your limit.', { label });
    if (reason === `${criterion.label} is below its selected minimum.`) return t('{label} is below your minimum.', { label });
    if (reason === `Missing value for ${criterion.label}.`) return t('We don’t have a value for {label}.', { label });
  }
  return reason;
}

globalThis.jinniI18n?.onChange(() => {
  for (const refresh of state.controlRefresh) refresh();
  updateLimitCount();
  if (state.result) {
    const open = [...$('decision-results').querySelectorAll('details')].map((item) => item.open);
    renderResult(state.result);
    [...$('decision-results').querySelectorAll('details')].forEach((item, index) => { item.open = !!open[index]; });
  }
});

configureContext({ decisionRequest: readDecisionRequest });

void loadDecisions();
