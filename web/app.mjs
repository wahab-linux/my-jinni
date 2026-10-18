import { fromLocal, parseBudget, time } from './planner.mjs';
import { createSource, LIMITS, searchSources } from './library.mjs';
import { bind, t, option, attribute, currency as money, locale, number } from './i18n.mjs';
import { isDesktop, loadPlanner, recommendPlan, openSources, importDesktopSource, initDesktopTools } from './platform.mjs';
import { configureContext, notifyContextChange } from './ui-context.mjs';

const $ = (id) => document.getElementById(id);
const state = { scenario: null, library: null, sources: [], selected: new Set(), busy: false, viewer: null, pendingDelete: null, starters: new Map(), planBusy: false, planVersion: 0, loadVersion: 0 };
const node = (tag, text, className = '', raw = false) => {
  const item = document.createElement(tag);
  if (text !== undefined) bind(item, raw ? '{text}' : text, raw ? { text } : {});
  item.className = className;
  return item;
};
function feedback(id, message = '', error = false, params = {}) {
  bind($(id), message, params);
  $(id).className = `feedback${error ? ' error' : ''}`;
}

function setBudget(pence) {
  $('budget').value = (pence / 100).toFixed(2);
  const value = String(pence / 100);
  $('budget-preset').value = [...$('budget-preset').options].some((option) => option.value === value) ? value : 'custom';
  $('custom-budget').hidden = $('budget-preset').value !== 'custom';
  $('budget').required = !$('custom-budget').hidden;
}

function clearFieldErrors() {
  for (const id of ['budget-error', 'time-error', 'interest-error']) { $(id).hidden = true; $(id).textContent = ''; }
  for (const field of $('planner-form').querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
}

function fieldError(kind, message) {
  const field = kind === 'interest' ? $('interest-picker').querySelector('summary')
    : kind === 'time' ? $('return') : $('custom-budget').hidden ? $('budget-preset') : $('budget');
  bind($(`${kind}-error`), message);
  $(`${kind}-error`).hidden = false;
  field.setAttribute('aria-invalid', 'true');
  field.focus();
}

function preferencesChanged() {
  state.planVersion++;
  notifyContextChange();
  clearFieldErrors();
  $('plan-results').replaceChildren();
  $('plan-empty').hidden = false;
  bind($('plan-empty').querySelector('h3'), 'A little adventure starts here.');
  bind($('plan-empty').querySelector('p'), 'Tell us where, when and what you enjoy. We’ll match you with something that fits.');
  updateInterestSummary();
  feedback('plan-status', '');
}

function resetPreferences() {
  if (!state.scenario) return;
  const { options } = state.scenario;
  const defaults = options.default_request;
  $('origin').value = defaults.origin_id;
  $('date').value = options.demo_date;
  $('depart').value = time(defaults.depart_at, options.timezone);
  $('return').value = time(defaults.return_by, options.timezone);
  setBudget(defaults.budget_pence);
  for (const input of document.querySelectorAll('#interests input')) input.checked = defaults.interests.includes(input.value);
  $('starter').value = '';
  $('interest-picker').open = false;
  preferencesChanged();
  feedback('plan-status', '');
}

async function loadScenario() {
  state.planVersion++; notifyContextChange();
  $('reload').hidden = true;
  $('preferences').disabled = true;
  state.scenario = null;
  $('plan-results').replaceChildren();
  feedback('setup-status', 'Loading planner…');
  const loadVersion = ++state.loadVersion;
  try {
    const scenario = await loadPlanner();
    if (loadVersion !== state.loadVersion) return;
    state.scenario = scenario;
    const { options } = scenario;
    const defaults = options.default_request;
    $('origin').replaceChildren(...options.origins.map((item) => option(item.label, item.id, true)));
    $('date').replaceChildren(...options.supported_dates.map((date) => {
      const item = option('', date, true);
      bind(item, '{date}', () => ({ date: new Intl.DateTimeFormat(locale() === 'en' ? 'en-GB' : locale(), { dateStyle: 'long', timeZone: options.timezone }).format(new Date(`${date}T12:00:00Z`)) }));
      return item;
    }));
    $('origin').value = defaults.origin_id;
    $('date').value = options.demo_date;
    $('depart').value = time(defaults.depart_at, options.timezone);
    $('return').value = time(defaults.return_by, options.timezone);
    setBudget(defaults.budget_pence);
    state.starters.clear();
    for (const [id, label, interests, budget] of [
      ['games', 'Games & good company', ['games'], 1000],
      ['music', 'A little music', ['music'], 1000],
      ['budget', 'A day out for £5 or less', options.interests.map((interest) => interest.id), 500],
    ]) {
      if (budget <= options.max_budget_pence && interests.every((interest) => options.interests.some((item) => item.id === interest))) state.starters.set(id, { label, interests, budget });
    }
    $('starter').replaceChildren(option('Build my own plan', ''), ...[...state.starters].map(([id, starter]) => option(starter.label, id)));
    $('interests').replaceChildren(...options.interests.map((interest) => {
      const label = node('label');
      const input = document.createElement('input');
      input.type = 'checkbox'; input.name = 'interest'; input.value = interest.id;
      input.checked = defaults.interests.includes(interest.id);
      label.append(input, node('span', interest.label));
      return label;
    }));
    updateInterestSummary();
    bind($('coverage'), 'Fictional demo · {zone} · Budget up to {amount}', () => ({ zone: options.timezone, amount: money(options.max_budget_pence) }));
    $('preferences').disabled = false;
    feedback('setup-status', '');
    notifyContextChange();
  } catch {
    if (loadVersion !== state.loadVersion) return;
    feedback('setup-status', 'The demo data could not be loaded. Check your connection and retry.', true);
    $('reload').hidden = false;
  }
}

function activityCard(activity, featured, zone) {
  const card = node('article', undefined, `activity${featured ? ' featured' : ''}`);
  const top = node('div', undefined, 'activity-top');
  const heading = node('div');
  heading.append(node('p', featured ? 'YOUR BEST FIT' : 'ANOTHER POSSIBILITY', 'eyebrow'), node('h3', activity.title, '', true));
  top.append(heading, bind(node('div', undefined, 'price'), '{value}', () => ({ value: money(activity.total_cost_pence) })));
  card.append(top, bind(node('p', undefined, 'muted'), '{venue} · {category} · Fictional activity', () => ({ venue: activity.venue_name, category: t(activity.category) })));
  const timing = node('dl');
  for (const [label, value] of [['Arrive', time(activity.arrive_at, zone)], ['Activity', `${time(activity.starts_at, zone)}–${time(activity.ends_at, zone)}`], ['Back at origin', time(activity.return_at, zone)]]) {
    const group = node('div'); group.append(node('dt', label), node('dd', value)); timing.append(group);
  }
  card.append(timing, bind(node('p', undefined, 'muted'), '{ticket} ticket + {travel} return travel = {total}', () => ({ ticket: money(activity.ticket_cost_pence), travel: money(activity.travel_cost_pence), total: money(activity.total_cost_pence) })));
  const notes = node('details', undefined, 'activity-notes');
  notes.append(node('summary', 'Why this plan fits'));
  const reasons = node('ul');
  reasons.append(...activity.reasons.map((reason) => bind(node('li'), '{text}', () => ({ text: plannerReason(reason) }))));
  notes.append(reasons);
  card.append(notes);
  return card;
}

function readPlannerPreferences(showErrors = false) {
  if (!state.scenario) return null;
  const { options } = state.scenario;
  let budget;
  try { budget = parseBudget($('budget').value.trim()); }
  catch (error) { if (showErrors) fieldError('budget', error.message); throw error; }
  if (budget > options.max_budget_pence) {
    const message = t('This demo supports budgets up to {amount}.', { amount: money(options.max_budget_pence) });
    if (showErrors) fieldError('budget', message); throw new Error(message);
  }
  const interests = [...document.querySelectorAll('[name=interest]:checked')].map((input) => input.value);
  if (!interests.length) {
    const message = 'Choose at least one of your interests.';
    if (showErrors) fieldError('interest', message); throw new Error(message);
  }
  if ($('return').value <= $('depart').value) {
    const message = 'Choose a return time after you leave.';
    if (showErrors) fieldError('time', message); throw new Error(message);
  }
  return { origin_id: $('origin').value, budget_pence: budget,
    depart_at: fromLocal($('date').value, $('depart').value, options.timezone),
    return_by: fromLocal($('date').value, $('return').value, options.timezone),
    interests };

}

async function submitPlan(event) {
  event.preventDefault();
  if (state.planBusy) return;
  const version = ++state.planVersion;
  state.planBusy = true; $('plan-submit').disabled = true;
  $('plan-results').replaceChildren();
  if (!state.scenario) { state.planBusy = false; $('plan-submit').disabled = false; return; }
  $('interest-picker').open = false;
  $('plan-empty').hidden = true;
  clearFieldErrors();
  try {
    const { options } = state.scenario;
    const request = readPlannerPreferences(true);
    feedback('plan-status', 'Calculating…');
    const result = await recommendPlan(request, state.scenario);
    if (version !== state.planVersion) return;
    if (result.error) throw new Error(result.error.message);
    feedback('plan-status', result.data.message);
    if (!result.data.recommended) {
      $('plan-empty').hidden = false;
      bind($('plan-empty').querySelector('h3'), 'Let’s give your plan a little more room.');
      bind($('plan-empty').querySelector('p'), 'Try a bigger budget, an earlier departure, or a later return. We’ll look for another fit.');
    }
    if (result.data.recommended) $('plan-results').append(activityCard(result.data.recommended, true, options.timezone));
    for (const activity of result.data.alternatives) $('plan-results').append(activityCard(activity, false, options.timezone));
    const provenance = node('details', undefined, 'provenance');
    provenance.append(node('summary', 'Sources and limitations'));
    const origin = options.origins.find((item) => item.id === request.origin_id);
    provenance.append(bind(node('strong'), 'Start and return: {origin}', { origin: origin.label }), bind(node('p'), 'All times: {zone}. Calculated locally from the following fictional datasets:', { zone: options.timezone }));
    for (const source of result.data.sources) provenance.append(bind(node('p'), '{source} · Simulated snapshot {updated}{origin}', { source: source.label, updated: source.updated_at, origin: source.origin_id ? ` · ${origin.label}` : '' }));
    for (const warning of result.warnings) {
      const missing = /^Excluded (\d+) activities with missing or unavailable return travel\.$/.exec(warning.message);
      provenance.append(missing ? bind(node('p'), 'Excluded {count} activities with missing or unavailable return travel.', { count: missing[1] }) : node('p', warning.message));
    }
    $('plan-results').append(provenance);
    if (window.matchMedia('(max-width: 760px)').matches) {
      $('results-title').focus({ preventScroll: true });
      $('results-title').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }
  } catch (error) {
    if (version === state.planVersion) feedback('plan-status', error.message, true);
  } finally { state.planBusy = false; $('plan-submit').disabled = false; }
}

function clearSearch() {
  $('search-results').replaceChildren();
  feedback('search-status', '');
}

function updateInterestSummary() {
  const checked = [...document.querySelectorAll('#interests input:checked')];
  bind($('interest-summary'), checked.length ? '{text}' : 'Choose your interests', () => ({ text: checked.map((input) => t(state.scenario.options.interests.find((item) => item.id === input.value).label)).join(', ') }));
}

function renderSources() {
  $('sources').replaceChildren();
  renderCompactSources();
  bind($('source-count'), '{count} / {limit} saved items · {selected} selected', { count: state.sources.length, limit: LIMITS.sources, selected: state.selected.size });
  $('select-all').disabled = !state.sources.length || state.selected.size === state.sources.length;
  $('clear-selection').disabled = !state.selected.size;
  if (!state.sources.length) {
    const empty = node('div', undefined, 'library-empty');
    empty.append(node('p', 'No sources saved.', 'muted'));
    $('sources').append(empty);
  }
  const sources = [...state.sources].sort($('source-sort').value === 'title'
    ? (a, b) => a.title.localeCompare(b.title)
    : (a, b) => b.created_at.localeCompare(a.created_at));
  for (const source of sources) {
    const row = node('article', undefined, 'source-item');
    row.dataset.sourceId = source.id;
    const label = node('label', undefined, 'check');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = state.selected.has(source.id);
    input.addEventListener('change', () => {
      if (input.checked) state.selected.add(source.id); else state.selected.delete(source.id);
      clearSearch(); notifyContextChange();
      renderCompactSources();
      bind($('source-count'), '{count} / {limit} saved items · {selected} selected', { count: state.sources.length, limit: LIMITS.sources, selected: state.selected.size });
      $('select-all').disabled = state.selected.size === state.sources.length;
      $('clear-selection').disabled = !state.selected.size;
    });
    label.append(input, document.createTextNode(source.title));
    row.append(label, bind(node('p', undefined, 'hint'), '{kind} · {count} characters · {label}', () => ({ kind: source.kind.toUpperCase(), count: number(source.character_count), label: t(source.is_simulated ? 'Fictional / AI-generated' : 'Source accuracy not independently verified') })));
    const actions = node('div', undefined, 'source-actions');
    const view = node('button', 'Read saved text', 'text-button'); view.type = 'button';
    view.addEventListener('click', () => openSource(source));
    const remove = node('button', 'Delete', 'text-button'); remove.type = 'button';
    attribute(remove, 'aria-label', 'Delete {title}', { title: source.title });
    remove.addEventListener('click', () => {
      state.pendingDelete = source;
      bind($('delete-description'), '“{title}” will be removed from your notes and files.', { title: source.title });
      $('delete-dialog').showModal();
    });
    actions.append(view, remove); row.append(actions); $('sources').append(row);
  }
}

function renderCompactSources() {
  bind($('decision-sources-status'), state.sources.length ? '{selected} / {count} selected' : 'No sources saved.', { selected: state.selected.size, count: state.sources.length });
  $('decision-sources').replaceChildren(...state.sources.map((source) => {
    const label = node('label', undefined, 'compact-source check'); label.dataset.sourceId = source.id;
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = source.id; input.checked = state.selected.has(source.id);
    input.addEventListener('change', () => {
      if (input.checked) state.selected.add(source.id); else state.selected.delete(source.id);
      clearSearch(); renderSources(); notifyContextChange();
      [...$('decision-sources').querySelectorAll('input')].find((item) => item.value === source.id)?.focus({ preventScroll: true });
    });
    const title = node('span', source.title, '', true);
    const copy = node('span', undefined, 'compact-source-copy'); copy.append(title);
    if (source.is_simulated) copy.append(node('span', 'Simulated source', 'compact-source-badge'));
    label.append(input, copy);
    return label;
  }));
}

async function withLibrary(action) {
  if (state.busy) return;
  if (!state.library) { feedback('library-status', isDesktop ? 'Local library is unavailable. Retry loading it.' : 'Browser storage is unavailable. Allow site storage and reload. Planning still works.', true); return; }
  state.busy = true;
  for (const id of ['import-button', 'demo-source', 'paste-toggle']) $(id).disabled = true;
  try { await action(); } catch (error) { feedback('library-status', error.message, true); }
  finally { state.busy = false; for (const id of ['import-button', 'demo-source', 'paste-toggle']) $(id).disabled = false; }
}

async function saveSource(source) {
  if (state.sources.length >= LIMITS.sources) throw new Error('Your library is full. Remove an item before adding another (limit: 20).');
  const saved = await state.library.add(source);
  const savedId = saved?.id ?? source.id;
  state.sources = await state.library.all(); state.selected.add(savedId);
  notifyContextChange();
  clearSearch(); renderSources();
  [...$('sources').children].find((row) => row.dataset.sourceId === savedId)?.querySelector('input')?.focus();
  feedback('library-status', 'Saved.');
}

async function extractFile(file) {
  if (file.size > LIMITS.bytes) throw new Error('Files must be 5 MiB or smaller.');
  const extension = file.name.split('.').pop().toLowerCase();
  if (!['txt', 'md', 'markdown', 'pdf'].includes(extension)) throw new Error('Choose a UTF-8 TXT, Markdown or text PDF file.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (extension !== 'pdf') {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new Error('This file is not valid UTF-8 text. Save it as UTF-8 and retry.'); }
    if (text.includes('\0')) throw new Error('This file contains binary data. Choose a plain-text document.');
    return { kind: extension === 'txt' ? 'text' : 'markdown', pages: [{ text, page: null }] };
  }
  feedback('library-status', 'Extracting PDF text on this device…');
  const pdfjs = await import('./vendor/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs', import.meta.url).href;
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false,
    cMapUrl: new URL('./vendor/cmaps/', import.meta.url).href,
    standardFontDataUrl: new URL('./vendor/standard_fonts/', import.meta.url).href,
    wasmUrl: new URL('./vendor/wasm/', import.meta.url).href,
    useSystemFonts: true, stopAtErrors: true });
  let timer;
  try {
    return await Promise.race([(async () => {
      const pdf = await task.promise;
      if (pdf.numPages > LIMITS.pages) throw new Error('PDFs must have 40 pages or fewer.');
      const pages = []; let count = 0;
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        const text = content.items.map((item) => item.str + (item.hasEOL ? '\n' : ' ')).join('').trim();
        count += text.length;
        if (count > LIMITS.characters) throw new Error('The extracted document exceeds 150,000 characters.');
        pages.push({ text, page: number });
        page.cleanup();
      }
      return { kind: 'pdf', pages };
    })(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('PDF extraction timed out. Try a smaller document.')), 20000); })]);
  } catch (error) {
    if (error.name === 'PasswordException') throw new Error('Password-protected PDFs are not supported. Import an unencrypted copy.', { cause: error });
    if (error.name === 'InvalidPDFException') throw new Error('This PDF is invalid or corrupted. Choose another document.', { cause: error });
    throw error;
  } finally { clearTimeout(timer); await task.destroy(); }
}

function openSource(source, selectedIndex = -1, quote = '') {
  state.viewer = source;
  bind($('viewer-title'), '{text}', { text: source.title });
  bind($('viewer-meta'), '{kind} · Extracted text · {label}', () => ({ kind: source.kind.toUpperCase(), label: t(source.is_simulated ? 'Fictional / AI-generated source' : 'Accuracy not independently verified') }));
  $('viewer-content').replaceChildren(...source.chunks.map((chunk, index) => {
    const passage = node('section', undefined, `passage${index === selectedIndex ? ' selected' : ''}`);
    const paragraph = node('p', chunk.text, '', true);
    if (quote && index === selectedIndex) {
      const start = chunk.text.indexOf(quote);
      if (start >= 0) {
        const mark = node('mark', quote, '', true);
        paragraph.replaceChildren(document.createTextNode(chunk.text.slice(0, start)), mark, document.createTextNode(chunk.text.slice(start + quote.length)));
      }
    }
    passage.append(bind(node('strong'), chunk.page ? 'Page {page} · Passage {index}' : 'Passage {index}', { page: chunk.page, index: index + 1 }), paragraph);
    return passage;
  }));
  if (!$('viewer').open) $('viewer').showModal();
  $('viewer-content').querySelector('.selected')?.scrollIntoView({ block: 'center' });
}

$('reload').addEventListener('click', loadScenario);
$('planner-form').addEventListener('submit', submitPlan);
$('planner-form').addEventListener('input', (event) => {
  if (event.target.id !== 'starter') $('starter').value = '';
  preferencesChanged();
});
$('starter').addEventListener('change', () => {
  const starter = state.starters.get($('starter').value);
  if (!starter) return;
  setBudget(starter.budget);
  for (const input of document.querySelectorAll('#interests input')) input.checked = starter.interests.includes(input.value);
  preferencesChanged();
  feedback('plan-status', '');
});
$('reset-planner').addEventListener('click', resetPreferences);
$('budget-preset').addEventListener('change', () => {
  const custom = $('budget-preset').value === 'custom';
  $('custom-budget').hidden = !custom;
  $('budget').required = custom;
  if (!custom) $('budget').value = Number($('budget-preset').value).toFixed(2);
  $('budget').dispatchEvent(new Event('input', { bubbles: true }));
  if (custom) $('budget').focus();
});
$('source-sort').addEventListener('change', renderSources);
document.addEventListener('click', (event) => {
  for (const dropdown of document.querySelectorAll('.dropdown[open]')) {
    if (!dropdown.contains(event.target)) dropdown.open = false;
    else if (event.target.closest('a')) dropdown.open = false;
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || $('viewer').open || $('delete-dialog').open) return;
  const open = [...document.querySelectorAll('.dropdown[open]')];
  if (!open.length) return;
  const focused = open.find((dropdown) => dropdown.contains(document.activeElement)) || open[0];
  for (const dropdown of open) dropdown.open = false;
  focused.querySelector('summary').focus();
  event.preventDefault();
});
$('paste-toggle').addEventListener('click', () => {
  $('add-source-picker').open = false;
  $('paste-form').hidden = !$('paste-form').hidden;
  $('paste-toggle').setAttribute('aria-expanded', String(!$('paste-form').hidden));
  if (!$('paste-form').hidden) $('source-title').focus();
});
$('paste-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void withLibrary(async () => {
    await saveSource(createSource({ title: $('source-title').value, pages: [{ text: $('source-text').value, page: null }], is_simulated: $('source-simulated').checked }));
    $('paste-form').reset(); $('paste-form').hidden = true; $('paste-toggle').setAttribute('aria-expanded', 'false');
  });
});
$('import-button').addEventListener('click', () => {
  $('add-source-picker').open = false;
  if (!isDesktop) { $('file').click(); return; }
  void withLibrary(async () => {
    const result = await importDesktopSource({ is_simulated: $('import-simulated').checked });
    if (result?.cancelled) { feedback('library-status', 'Import cancelled.'); return; }
    if (result?.body?.error) throw new Error(result.body.error.message);
    const imported = result?.body?.data?.source ?? result?.body?.data;
    state.sources = await state.library.all();
    if (imported?.id) state.selected.add(imported.id);
    clearSearch(); renderSources(); notifyContextChange();
    feedback('library-status', 'Saved.');
  });
});
$('file').addEventListener('change', () => {
  if (isDesktop) return;
  const file = $('file').files[0]; $('file').value = '';
  if (!file) return;
  void withLibrary(async () => {
    const extracted = await extractFile(file);
    await saveSource(createSource({ title: file.name, filename: file.name, ...extracted, is_simulated: $('import-simulated').checked }));
  });
});
$('demo-source').addEventListener('click', () => withLibrary(async () => {
  $('add-source-picker').open = false;
  const response = await fetch('./venue-guide.md', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Could not load the fictional guide. Check your connection and retry.');
  await saveSource(createSource({ title: 'Fictional venue guide', kind: 'markdown', pages: [{ text: await response.text(), page: null }], is_simulated: true }));
}));
$('select-all').addEventListener('click', () => { state.selected = new Set(state.sources.map((source) => source.id)); clearSearch(); renderSources(); notifyContextChange(); $('select-all').disabled = true; $('clear-selection').focus(); });
$('clear-selection').addEventListener('click', () => { state.selected.clear(); clearSearch(); renderSources(); notifyContextChange(); $('select-all').focus(); });
$('delete-cancel').addEventListener('click', () => $('delete-dialog').close());
$('delete-dialog').addEventListener('close', () => { state.pendingDelete = null; });
$('delete-confirm').addEventListener('click', () => withLibrary(async () => {
  const source = state.pendingDelete;
  if (!source) return;
  $('delete-confirm').disabled = true;
  try {
    await state.library.remove(source.id);
    state.selected.delete(source.id);
    state.sources = await state.library.all();
    if (state.viewer?.id === source.id) $('viewer').close();
    $('delete-dialog').close();
    clearSearch(); renderSources(); notifyContextChange(); feedback('library-status', 'Source removed.');
    $('add-source-picker').querySelector('summary').focus();
  } catch (error) { $('delete-dialog').close(); throw error; }
  finally { $('delete-confirm').disabled = false; }
}));
$('search-form').addEventListener('submit', (event) => {
  event.preventDefault(); clearSearch();
  const question = $('question').value.trim();
  if (!question || question.length > 2000) { feedback('search-status', 'Enter up to 2,000 characters to search.', true); return; }
  if (!state.selected.size) {
    feedback('search-status', 'Tick at least one note or file to search, or use Select all.', true);
    $('sources').querySelector('input')?.focus();
    return;
  }
  const matches = searchSources(question, state.sources, state.selected);
  feedback('search-status', matches.length ? '{count} matching passages. Open the original to check the surrounding context.' : 'No matching text in the selected notes or files. Try different words.', false, { count: matches.length });
  for (const { source, chunk, index } of matches) {
    const item = node('article', undefined, 'excerpt');
    item.append(node('h4', source.title, '', true), bind(node('p', undefined, 'hint'), chunk.page ? 'Page {page} · {label}' : '{label}', () => ({ page: chunk.page, label: t(source.is_simulated ? 'Fictional / AI-generated source' : 'Source accuracy not independently verified') })), node('blockquote', chunk.text, '', true));
    const view = node('button', 'Read full text', 'text-button'); view.type = 'button';
    view.addEventListener('click', () => openSource(source, index)); item.append(view); $('search-results').append(item);
  }
});
$('question').addEventListener('input', clearSearch);
$('viewer-close').addEventListener('click', () => $('viewer').close());
$('viewer').addEventListener('close', () => { state.viewer = null; });
$('download-source').addEventListener('click', () => {
  if (!state.viewer) return;
  const source = state.viewer;
  const text = [source.title, source.is_simulated ? 'Fictional / AI-generated source' : 'Source accuracy not independently verified',
    ...source.chunks.map((chunk) => `${chunk.page ? `Page ${chunk.page}\n` : ''}${chunk.text}`)].join('\n\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'jinni-source.txt'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function plannerReason(reason) {
  let match = /^Matches your interest in (.+)\.$/.exec(reason);
  if (match) return t('Matches your interest in {category}.', { category: t(match[1]) });
  match = /^A different interest category \((.+)\) that fits your constraints\.$/.exec(reason);
  if (match) return t('A different interest category ({category}) that fits your constraints.', { category: t(match[1]) });
  match = /^Costs GBP ([\d.]+) including return travel, within your GBP ([\d.]+) budget\.$/.exec(reason);
  if (match) return t('Costs {total} including return travel, within your {budget} budget.', { total: money(Number(match[1]) * 100), budget: money(Number(match[2]) * 100) });
  match = /^Arrive at (.+), at or before the activity starts; return to your selected origin at (.+), by your (.+) deadline \((.+)\)\.$/.exec(reason);
  if (match) return t('Arrive at {arrival}, at or before the activity starts; return at {returned}, by your {deadline} deadline ({zone}).', { arrival: match[1], returned: match[2], deadline: match[3], zone: match[4] });
  return t(reason);
}

globalThis.jinniI18n?.onChange(updateInterestSummary);


configureContext({
  sourceIds: () => [...state.selected],
  sources: () => state.sources.map(({ id, title, kind, is_simulated }) => ({ id, title, kind, is_simulated })),
  setSourceIds: (ids) => {
    const available = new Set(state.sources.map((source) => source.id));
    state.selected = new Set(ids.filter((id) => available.has(id)));
    clearSearch(); renderSources(); notifyContextChange();
  },
  plannerPreferences: () => readPlannerPreferences(),
  sourceViewer: async (id, { quote, page } = {}) => {
    if (isDesktop && state.library) state.sources = await state.library.all();
    let source = state.sources.find((item) => item.id === id);
    if (!source && state.library) source = (await state.library.all()).find((item) => item.id === id);
    if (!source) throw new Error(t('The source is no longer available.'));
    const index = source.chunks.findIndex((chunk) => (!quote || chunk.text.includes(quote)) && (page == null || chunk.page === page));
    if (quote && index < 0) throw new Error(t('The quoted passage is no longer available.'));
    openSource(source, index, quote);
    return true;
  },
});
document.documentElement.dataset.platform = isDesktop ? 'desktop' : 'browser';
bind($('storage-notice'), isDesktop ? 'Sources are saved locally on this computer.' : 'Sources are saved in this browser. Clearing site data removes them.');
bind($('library-limits'), isDesktop ? '20 sources · TXT, Markdown or text PDF · 5 MiB · 150,000 characters · 40 pages. Only extracted text is saved. AI questions send selected snippets to the chosen provider.' : '20 sources · TXT, Markdown or text PDF · 5 MiB · 150,000 characters · 40 pages. Nothing is sent to an AI provider. Download important sources before clearing site data.');
bind($('delete-scope'), isDesktop ? 'Removes this source from the local library. Your original file is unchanged.' : 'Removes this source from this browser. Your original file is unchanged.');
void initDesktopTools().catch((error) => feedback('library-status', error.message, true));

void loadScenario();
async function loadLibrary() {
  $('library-retry').hidden = true;
  feedback('library-status', 'Loading sources…');
  try {
    state.library = await openSources(); state.sources = await state.library.all(); renderSources();
    feedback('library-status', '');
    notifyContextChange();
  } catch (error) {
    feedback('library-status', isDesktop ? error.message : 'Browser storage is unavailable. Allow site storage to save a library. Planning still works.', true);
    $('library-retry').hidden = false;
    bind($('decision-sources-status'), isDesktop ? 'Local library is unavailable. Retry loading it.' : 'Browser storage is unavailable. Allow site storage to save a library. Planning still works.');
  }
}
$('library-retry').addEventListener('click', loadLibrary);
$('decision-sources-manage').addEventListener('click', () => $('library-open').click());
void loadLibrary();
