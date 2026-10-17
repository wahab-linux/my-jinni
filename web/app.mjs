import { fromLocal, money, parseBudget, recommend, time } from './planner.mjs';
import { createSource, LIMITS, openLibrary, searchSources } from './library.mjs';

const $ = (id) => document.getElementById(id);
const state = { scenario: null, library: null, sources: [], selected: new Set(), busy: false, viewer: null };
const node = (tag, text, className = '') => {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  item.className = className;
  return item;
};
function feedback(id, message = '', error = false) {
  $(id).textContent = message;
  $(id).className = `feedback${error ? ' error' : ''}`;
}

async function loadScenario() {
  $('reload').hidden = true;
  $('preferences').disabled = true;
  state.scenario = null;
  $('plan-results').replaceChildren();
  feedback('setup-status', 'Loading planner…');
  try {
    const response = await fetch('./scenario.json', { signal: AbortSignal.timeout(10000), cache: 'no-cache' });
    if (!response.ok) throw new Error();
    const scenario = await response.json();
    // Exercise all configured bundles before enabling controls. A broken deployment must fail visibly.
    for (const origin of scenario.options.origins) recommend({ ...scenario.options.default_request, origin_id: origin.id }, scenario);
    state.scenario = scenario;
    const { options } = scenario;
    const defaults = options.default_request;
    $('origin').replaceChildren(...options.origins.map((item) => new Option(item.label, item.id)));
    $('date').replaceChildren(...options.supported_dates.map((date) => new Option(new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: options.timezone }).format(new Date(`${date}T12:00:00Z`)), date)));
    $('origin').value = defaults.origin_id;
    $('date').value = options.demo_date;
    $('depart').value = time(defaults.depart_at, options.timezone);
    $('return').value = time(defaults.return_by, options.timezone);
    $('budget').value = (defaults.budget_pence / 100).toFixed(2);
    $('budget-preset').value = [...$('budget-preset').options].some((option) => option.value === String(defaults.budget_pence / 100)) ? String(defaults.budget_pence / 100) : 'custom';
    $('custom-budget').hidden = $('budget-preset').value !== 'custom';
    $('budget').required = !$('custom-budget').hidden;
    $('interests').replaceChildren(...options.interests.map((interest) => {
      const label = node('label');
      const input = document.createElement('input');
      input.type = 'checkbox'; input.name = 'interest'; input.value = interest.id;
      input.checked = defaults.interests.includes(interest.id);
      label.append(input, node('span', interest.label));
      return label;
    }));
    updateInterestSummary();
    $('coverage').textContent = `Fictional demo · ${options.timezone} · Budget up to ${money(options.max_budget_pence)}`;
    $('preferences').disabled = false;
    feedback('setup-status', 'Ready. No account or API key needed.');
  } catch {
    feedback('setup-status', 'The demo data could not be loaded. Check your connection and retry.', true);
    $('reload').hidden = false;
  }
}

function activityCard(activity, featured, zone) {
  const card = node('article', undefined, `activity${featured ? ' featured' : ''}`);
  const top = node('div', undefined, 'activity-top');
  const heading = node('div');
  heading.append(node('p', featured ? 'YOUR BEST FIT' : 'ANOTHER POSSIBILITY', 'eyebrow'), node('h3', activity.title));
  top.append(heading, node('div', money(activity.total_cost_pence), 'price'));
  card.append(top, node('p', `${activity.venue_name} · ${activity.category} · Fictional activity`, 'muted'));
  const timing = node('dl');
  for (const [label, value] of [['Arrive', time(activity.arrive_at, zone)], ['Activity', `${time(activity.starts_at, zone)}–${time(activity.ends_at, zone)}`], ['Back at origin', time(activity.return_at, zone)]]) {
    const group = node('div'); group.append(node('dt', label), node('dd', value)); timing.append(group);
  }
  card.append(timing, node('p', `${money(activity.ticket_cost_pence)} ticket + ${money(activity.travel_cost_pence)} return travel = ${money(activity.total_cost_pence)}`, 'muted'));
  const notes = node('details', undefined, 'activity-notes');
  notes.append(node('summary', 'Why this plan fits'));
  const reasons = node('ul');
  reasons.append(...activity.reasons.map((reason) => node('li', reason)));
  notes.append(reasons);
  card.append(notes);
  return card;
}

function submitPlan(event) {
  event.preventDefault();
  $('plan-results').replaceChildren();
  if (!state.scenario) return;
  $('interest-picker').open = false;
  $('plan-empty').hidden = true;
  try {
    const { options } = state.scenario;
    const request = { origin_id: $('origin').value, budget_pence: parseBudget($('budget').value.trim()),
      depart_at: fromLocal($('date').value, $('depart').value, options.timezone),
      return_by: fromLocal($('date').value, $('return').value, options.timezone),
      interests: [...document.querySelectorAll('[name=interest]:checked')].map((input) => input.value) };
    const result = recommend(request, state.scenario);
    feedback('plan-status', result.data.message);
    if (!result.data.recommended) {
      $('plan-empty').hidden = false;
      $('plan-empty').querySelector('h3').textContent = 'Let’s give your plan a little more room.';
      $('plan-empty').querySelector('p').textContent = 'Try a bigger budget, an earlier departure, or a later return. We’ll look for another fit.';
    }
    if (result.data.recommended) $('plan-results').append(activityCard(result.data.recommended, true, options.timezone));
    for (const activity of result.data.alternatives) $('plan-results').append(activityCard(activity, false, options.timezone));
    const provenance = node('div', undefined, 'provenance');
    const origin = options.origins.find((item) => item.id === request.origin_id);
    provenance.append(node('strong', `Start and return: ${origin.label}`), node('p', `All times: ${options.timezone}. Calculated locally from the following fictional datasets:`));
    for (const source of result.data.sources) provenance.append(node('p', `${source.label} · Simulated snapshot ${source.updated_at}${source.origin_id ? ` · ${origin.label}` : ''}`));
    for (const warning of result.warnings) provenance.append(node('p', warning.message));
    $('plan-results').append(provenance);
  } catch (error) {
    feedback('plan-status', error.message, true);
  }
}

function clearSearch() {
  $('search-results').replaceChildren();
  feedback('search-status', '');
}

function updateInterestSummary() {
  const checked = [...document.querySelectorAll('#interests input:checked')];
  $('interest-summary').textContent = checked.length ? checked.map((input) => input.nextElementSibling.textContent).join(', ') : 'Choose your interests';
}

function renderSources() {
  $('sources').replaceChildren();
  $('source-count').textContent = `${state.sources.length} / ${LIMITS.sources} sources · ${state.selected.size} selected`;
  if (!state.sources.length) $('sources').append(node('p', 'Your library is empty. Paste a note, import a file, or try the fictional guide.', 'muted'));
  const sources = [...state.sources].sort($('source-sort').value === 'title'
    ? (a, b) => a.title.localeCompare(b.title)
    : (a, b) => b.created_at.localeCompare(a.created_at));
  for (const source of sources) {
    const row = node('article', undefined, 'source-item');
    const label = node('label', undefined, 'check');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = state.selected.has(source.id);
    input.addEventListener('change', () => {
      if (input.checked) state.selected.add(source.id); else state.selected.delete(source.id);
      clearSearch();
      $('source-count').textContent = `${state.sources.length} / ${LIMITS.sources} sources · ${state.selected.size} selected`;
    });
    label.append(input, document.createTextNode(source.title));
    row.append(label, node('p', `${source.kind.toUpperCase()} · ${source.character_count.toLocaleString()} characters · ${source.is_simulated ? 'Fictional / AI-generated' : 'Source accuracy not independently verified'}`, 'hint'));
    const actions = node('div', undefined, 'source-actions');
    const view = node('button', 'View original text', 'text-button'); view.type = 'button';
    view.addEventListener('click', () => openSource(source));
    const remove = node('button', 'Delete', 'text-button'); remove.type = 'button';
    remove.setAttribute('aria-label', `Delete ${source.title}`);
    remove.addEventListener('click', () => withLibrary(async () => {
      await state.library.remove(source.id);
      state.selected.delete(source.id);
      state.sources = await state.library.all();
      if (state.viewer?.id === source.id) $('viewer').close();
      clearSearch(); renderSources(); feedback('library-status', 'Source deleted from this browser.');
    }));
    actions.append(view, remove); row.append(actions); $('sources').append(row);
  }
}

async function withLibrary(action) {
  if (state.busy) return;
  if (!state.library) { feedback('library-status', 'Browser storage is unavailable. Allow site storage and reload. Planning still works.', true); return; }
  state.busy = true;
  for (const id of ['import-button', 'demo-source', 'paste-toggle']) $(id).disabled = true;
  try { await action(); } catch (error) { feedback('library-status', error.message, true); }
  finally { state.busy = false; for (const id of ['import-button', 'demo-source', 'paste-toggle']) $(id).disabled = false; }
}

async function saveSource(source) {
  if (state.sources.length >= LIMITS.sources) throw new Error('Your library is full. Delete a source before adding another (limit: 20).');
  await state.library.add(source);
  state.sources = await state.library.all(); state.selected.add(source.id);
  clearSearch(); renderSources();
  feedback('library-status', 'Source saved and selected. It stays in this browser until deleted or site data is cleared.');
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

function openSource(source, selectedIndex = -1) {
  state.viewer = source;
  $('viewer-title').textContent = source.title;
  $('viewer-meta').textContent = `${source.kind.toUpperCase()} · Extracted text${source.is_simulated ? ' · Fictional / AI-generated source' : ' · Accuracy not independently verified'}`;
  $('viewer-content').replaceChildren(...source.chunks.map((chunk, index) => {
    const passage = node('section', undefined, `passage${index === selectedIndex ? ' selected' : ''}`);
    passage.append(node('strong', `${chunk.page ? `Page ${chunk.page} · ` : ''}Passage ${index + 1}`), node('p', chunk.text));
    return passage;
  }));
  if (!$('viewer').open) $('viewer').showModal();
  $('viewer-content').querySelector('.selected')?.scrollIntoView({ block: 'center' });
}

$('reload').addEventListener('click', loadScenario);
$('planner-form').addEventListener('submit', submitPlan);
$('planner-form').addEventListener('input', () => {
  $('plan-results').replaceChildren();
  $('plan-empty').hidden = false;
  $('plan-empty').querySelector('h3').textContent = 'A little adventure starts here.';
  $('plan-empty').querySelector('p').textContent = 'Tell us where, when and what you enjoy. We’ll match you with something that fits.';
  updateInterestSummary();
  feedback('plan-status', 'Preferences changed. Find a plan to update your result.');
});
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
  if (event.key !== 'Escape' || $('viewer').open) return;
  const open = [...document.querySelectorAll('.dropdown[open]')];
  if (!open.length) return;
  const focused = open.find((dropdown) => dropdown.contains(document.activeElement)) || open[0];
  for (const dropdown of open) dropdown.open = false;
  focused.querySelector('summary').focus();
  event.preventDefault();
});
$('paste-toggle').addEventListener('click', () => {
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
$('import-button').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', () => {
  const file = $('file').files[0]; $('file').value = '';
  if (!file) return;
  void withLibrary(async () => {
    const extracted = await extractFile(file);
    await saveSource(createSource({ title: file.name, filename: file.name, ...extracted, is_simulated: $('import-simulated').checked }));
  });
});
$('demo-source').addEventListener('click', () => withLibrary(async () => {
  const response = await fetch('./venue-guide.md', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Could not load the fictional guide. Check your connection and retry.');
  await saveSource(createSource({ title: 'Fictional venue guide', kind: 'markdown', pages: [{ text: await response.text(), page: null }], is_simulated: true }));
}));
$('search-form').addEventListener('submit', (event) => {
  event.preventDefault(); clearSearch();
  const question = $('question').value.trim();
  if (!question || question.length > 2000) { feedback('search-status', 'Enter up to 2,000 characters to search.', true); return; }
  if (!state.selected.size) { feedback('search-status', 'Select at least one source to search.', true); return; }
  const matches = searchSources(question, state.sources, state.selected);
  feedback('search-status', matches.length ? `${matches.length} matching passages. Open the original to check the surrounding context.` : 'No matching evidence in the selected sources. Try different keywords.');
  for (const { source, chunk, index } of matches) {
    const item = node('article', undefined, 'excerpt');
    item.append(node('h4', source.title), node('p', `${chunk.page ? `Page ${chunk.page} · ` : ''}${source.is_simulated ? 'Fictional / AI-generated source' : 'Source accuracy not independently verified'}`, 'hint'), node('blockquote', chunk.text));
    const view = node('button', 'Open original passage ↗', 'text-button'); view.type = 'button';
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
  const link = document.createElement('a'); link.href = url; link.download = 'my-jinni-source.txt'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
void loadScenario();
void (async () => {
  try {
    state.library = await openLibrary(); state.sources = await state.library.all(); renderSources();
    feedback('library-status', 'Library ready. Sources are saved only in this browser on this device.');
  } catch (error) { feedback('library-status', error.message, true); }
})();
