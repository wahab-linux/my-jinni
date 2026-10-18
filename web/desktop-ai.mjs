// Native-only tools extend the shared page without owning a second source library.
import { attribute, bind, option } from './i18n.mjs';
import { callDesktop, desktopData } from './platform.mjs';
import { getSourceIds, getPlannerPreferences, getDecisionRequest, openSource, onContextChange } from './ui-context.mjs';

export function mountDesktopTools() {
  if (document.getElementById('desktop-ai-dialog')) return;
  const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = new URL('./desktop-tools.css', import.meta.url).href; document.head.append(stylesheet);
  const state = { providers: [], provider: 'openai', models: new Map(), token: 0, keyToken: 0, busy: false, data: null };
  const nodes = {};
  const make = (tag, id, text, className) => {
    const node = document.createElement(tag);
    if (id) { node.id = id; node.dataset.testid = id; nodes[id] = node; }
    if (text) bind(node, text);
    if (className) node.className = className;
    return node;
  };
  const button = (id, text, action, className = 'button secondary') => {
    const node = make('button', id, text, className); node.type = 'button'; node.addEventListener('click', action); return node;
  };
  const label = (id, text, input) => { const node = make('label', null, text); node.htmlFor = id; return [node, input]; };
  const feedback = (message = '', error = false, params = {}) => { bind(nodes['desktop-ai-feedback'], message, params); nodes['desktop-ai-feedback'].classList.toggle('error', error); };
  const providerLabel = () => state.providers.find(({ id }) => id === state.provider)?.label || 'OpenAI';
  const result = make('section', 'desktop-ai-result', null, 'desktop-ai-result'); result.hidden = true;
  const answer = make('div', 'desktop-ai-answer', null, 'desktop-ai-answer');
  const citations = make('div', 'desktop-ai-citations', null, 'desktop-ai-citations');
  const calculated = make('details', 'desktop-ai-calculated', null, 'desktop-ai-calculated');
  calculated.append(make('summary', null, 'Calculated result'));
  const calculatedJson = make('pre', 'desktop-ai-calculated-json'); calculated.append(calculatedJson);
  result.append(make('h3', 'desktop-ai-answer-label', 'Answer'), answer, citations, calculated);

  const dialog = make('dialog', 'desktop-ai-dialog', null, 'desktop-ai-dialog');
  const heading = make('div', null, null, 'dialog-top');
  const title = make('h2', 'desktop-ai-title', 'Ask your sources');
  dialog.setAttribute('aria-labelledby', title.id);
  heading.append(title, button('desktop-ai-close', 'Close', () => dialog.close(), 'text-button'));
  dialog.append(heading);
  const notice = make('p', 'desktop-ai-cloud-notice', null, 'desktop-ai-notice');
  const selection = make('p', 'desktop-ai-selection', null, 'muted');
  dialog.append(notice, selection);
  const form = make('form', 'desktop-ai-form'); form.noValidate = true;
  const provider = make('select', 'desktop-ai-provider'); provider.disabled = true;
  const question = make('textarea', 'desktop-ai-question'); question.rows = 3; question.maxLength = 2000;
  form.append(...label(provider.id, 'AI provider', provider), ...label(question.id, 'Your question', question));
  for (const [suffix, text] of [['include-decision', 'Include my current comparison'], ['include-plan', 'Include my current activity preferences']]) {
    const row = make('label', null, null, 'desktop-ai-check'); const check = make('input', `desktop-ai-${suffix}`); check.type = 'checkbox'; row.append(check, make('span', null, text)); form.append(row);
  }
  const vertexPanel = make('fieldset', 'desktop-vertex-settings', null, 'desktop-vertex-settings'); vertexPanel.hidden = true;
  vertexPanel.append(make('legend', null, 'Google Cloud project'), make('p', null, 'ADC is your Google sign-in on this computer. No API key or credential upload is needed.', 'muted'));
  const project = make('input', 'desktop-vertex-project'); project.maxLength = 30; project.placeholder = 'my-cloud-project'; project.autocomplete = 'off';
  const location = make('input', 'desktop-vertex-location'); location.maxLength = 40; location.value = 'global'; location.autocomplete = 'off';
  try { const saved = JSON.parse(localStorage.getItem('jinni-vertex-settings') || 'null'); if (saved && typeof saved.project_id === 'string' && typeof saved.location === 'string') { project.value = saved.project_id; location.value = saved.location; } } catch { /* Nonsecret preferences are optional. */ }
  const adcStatus = make('p', 'desktop-vertex-status', 'Run Google sign-in, then check it here.', 'feedback'); adcStatus.setAttribute('role', 'status');
  const checkAdc = button('desktop-vertex-check', 'Check Google sign-in', async () => {
    let value; try { value = vertexSettings(); } catch (error) { adcStatus.classList.add('error'); bind(adcStatus, error.message); return; }
    const current = () => state.provider === 'vertex' && project.value.trim() === value.project_id && location.value.trim() === value.location;
    checkAdc.disabled = true; adcStatus.classList.remove('error'); bind(adcStatus, 'Checking Google sign-in…');
    try { const data = desktopData(await callDesktop('checkVertexAdc', value)); if (current()) bind(adcStatus, data.message); }
    catch (error) { if (current()) { adcStatus.classList.add('error'); bind(adcStatus, error.message); } }
    finally { checkAdc.disabled = false; }
  });
  vertexPanel.append(...label(project.id, 'Project ID', project), ...label(location.id, 'Location', location), checkAdc, adcStatus);
  const setup = make('details', null, null, 'desktop-ai-settings'); setup.append(make('summary', null, 'How to sign in with Google'));
  setup.append(make('p', null, 'Install Google Cloud CLI. In a terminal, run these commands, replacing YOUR_PROJECT_ID:', 'muted'));
  const commands = make('pre', 'desktop-vertex-commands'); commands.textContent = 'gcloud init\ngcloud config set project YOUR_PROJECT_ID\ngcloud services enable aiplatform.googleapis.com\ngcloud auth application-default login\ngcloud auth application-default set-quota-project YOUR_PROJECT_ID';
  setup.append(commands, make('p', null, 'Link the project to your trial billing account. Choose a Gemini model available in Vertex AI Studio. Credits, quota and model access depend on Google; usage can cost money after credits run out.', 'muted'));
  vertexPanel.append(setup); form.insertBefore(vertexPanel, question.previousElementSibling);
  const models = make('details', null, null, 'desktop-ai-settings'); models.append(make('summary', null, 'Model settings'));
  const model = make('input', 'desktop-ai-model'); model.maxLength = 100; model.autocomplete = 'off'; models.append(...label(model.id, 'Provider model', model));
  form.append(models);
  const submit = make('button', 'desktop-ai-ask', 'Ask', 'button primary'); submit.type = 'submit';
  form.append(submit); dialog.append(form);
  const status = make('div', 'desktop-ai-feedback', null, 'feedback'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); dialog.append(status, result);
  const settings = make('details', 'desktop-ai-settings', null, 'desktop-ai-settings'); settings.append(make('summary', null, 'AI session settings'));
  const keyStatus = make('p', 'desktop-ai-key-status', null, 'muted'); keyStatus.setAttribute('role', 'status');
  const keyForm = make('form', 'desktop-ai-key-form'); keyForm.noValidate = true;
  const key = make('input', 'desktop-ai-key'); key.type = 'password'; key.autocomplete = 'off'; key.maxLength = 1024; key.spellcheck = false;
  const keyLabel = make('label', 'desktop-ai-key-label'); keyLabel.htmlFor = key.id;
  const save = make('button', 'desktop-ai-key-save', 'Use for this session', 'button secondary'); save.type = 'submit';
  const clear = button('desktop-ai-key-clear', "Clear this provider's key", clearKey, 'text-button');
  keyForm.append(keyLabel, key, make('p', null, 'Kept in session memory only. Never saved or shared between providers.', 'muted'));
  const actions = make('div', null, null, 'desktop-ai-key-actions'); actions.append(save, clear); keyForm.append(actions);
  settings.append(keyStatus, keyForm);
  const limitations = make('details', null, null, 'desktop-ai-settings');
  limitations.append(make('summary', null, 'AI limitations'), make('p', null, 'Each question starts fresh. Quote checks help you verify evidence; they do not prove every claim is true. Local search may miss paraphrases.', 'muted'));
  dialog.append(settings, limitations);
  document.body.append(dialog);
  const open = button('desktop-ai-open', 'Ask AI ↗', () => { dialog.showModal(); selectionLabel(); void refreshKey(); }, 'nav-link'); open.setAttribute('aria-haspopup', 'dialog');
  (document.querySelector('.header nav') || document.querySelector('.header')).append(open);
  const context = make('dialog', 'desktop-ai-context-dialog');
  const contextTop = make('div', null, null, 'dialog-top'); contextTop.append(make('h3', null, 'Original context'), button('desktop-ai-context-close', 'Close', () => context.close(), 'text-button'));
  const quote = make('blockquote', 'desktop-ai-context-quote'); const contextJson = make('pre', 'desktop-ai-context-json'); context.append(contextTop, quote, contextJson); document.body.append(context);

  function selectionLabel() { bind(selection, '{count} sources selected', { count: getSourceIds().length }); }
  function invalidate(message = '') {
    const had = state.busy || state.data;
    state.token++; state.busy = false; state.data = null; result.hidden = true; answer.textContent = ''; citations.replaceChildren(); submit.disabled = false;
    bind(submit, 'Ask'); if (had) feedback(message); selectionLabel();
  }
  function renderProvider() {
    provider.value = state.provider; model.value = state.models.get(state.provider) || '';
    bind(notice, 'Questions and selected evidence snippets are sent to {provider}. API processing is subject to that provider\'s data policies.', { provider: providerLabel() });
    bind(keyLabel, '{provider} API key', { provider: providerLabel() });
    vertexPanel.hidden = state.provider !== 'vertex'; settings.hidden = state.provider === 'vertex';
    form.insertBefore(models, state.provider === 'vertex' ? question.previousElementSibling : submit);
    if (state.provider === 'vertex') models.open = true;
    attribute(model, 'placeholder', state.provider === 'vertex' ? 'Copy a model ID from Vertex AI Studio' : '');
  }
  async function loadProviders() {
    feedback('Loading providers…');
    try {
      const data = desktopData(await callDesktop('listSources'));
      const allowed = ['openai', 'deepseek', 'gemini', 'anthropic', 'vertex'];
      if (!Array.isArray(data.providers) || !data.providers.length || data.providers.some((item) => !allowed.includes(item.id))) throw new Error('The local service returned an unsupported provider catalog. Refresh the library to retry.');
      state.providers = data.providers;
      provider.replaceChildren(...data.providers.map((item) => { state.models.set(item.id, item.default_model); return option(item.label, item.id, true); }));
      provider.disabled = false; renderProvider(); await refreshKey(); feedback();
    } catch (error) { feedback(error.message, true); status.append(button('desktop-ai-provider-retry', 'Try again', loadProviders, 'text-button')); }
  }
  function sessionValue(response) {
    if (typeof response?.configured === 'boolean') return response;
    desktopData(response); throw new Error('The desktop service returned an unexpected session-setting response.');
  }
  async function refreshKey() {
    const token = ++state.keyToken; const selected = state.provider;
    if (selected === 'vertex') return;
    keyStatus.dataset.configured = 'false';
    bind(keyStatus, 'Checking the {provider} session key…', { provider: providerLabel() });
    try {
      const value = sessionValue(await callDesktop('getSessionSettings', selected));
      if (token !== state.keyToken || selected !== state.provider) return;
      keyStatus.dataset.configured = String(value.configured);
      bind(keyStatus, value.configured ? '{provider} key saved for this session. Account access has not been checked.' : 'No {provider} key is saved. Planning and your library are still available.', { provider: providerLabel() });
    } catch (error) { if (token === state.keyToken) bind(keyStatus, error.message); }
  }
  async function saveKey(event) {
    event.preventDefault(); const value = key.value.trim(); key.value = '';
    if (!value) { bind(keyStatus, 'Enter an API key, or use Clear session key.'); return; }
    const selected = state.provider; const token = ++state.keyToken; save.disabled = true;
    try {
      const response = sessionValue(await callDesktop('setSessionApiKey', { provider: selected, key: value }));
      if (token !== state.keyToken || selected !== state.provider) return;
      keyStatus.dataset.configured = String(response.configured);
      bind(keyStatus, '{provider} key saved for this session. Access is checked when you ask an AI question.', { provider: providerLabel() });
    } catch (error) { if (token === state.keyToken) bind(keyStatus, error.message); }
    finally { if (token === state.keyToken) save.disabled = false; }
  }
  async function clearKey() {
    key.value = ''; const selected = state.provider; const token = ++state.keyToken; clear.disabled = true;
    try {
      sessionValue(await callDesktop('clearSessionApiKey', selected));
      if (token !== state.keyToken || selected !== state.provider) return;
      keyStatus.dataset.configured = 'false'; bind(keyStatus, '{provider} session key cleared. Other providers, the planner and library are unchanged.', { provider: providerLabel() });
    } catch (error) { if (token === state.keyToken) bind(keyStatus, error.message); }
    finally { if (token === state.keyToken) clear.disabled = false; }
  }
  async function ask(event) {
    event?.preventDefault(); if (state.busy) return;
    let request;
    try {
      const text = question.value.trim();
      if (!text || text.length > 2000) throw new Error('Enter a question of up to 2,000 characters.');
      if (state.provider === 'vertex' && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(model.value.trim())) throw new Error('Enter a model ID available in Vertex AI Studio.');
      if (!state.providers.some(({ id }) => id === state.provider) || !/^[a-zA-Z0-9._:-]{1,100}$/.test(model.value.trim())) throw new Error('Choose a valid provider model in Model settings. Refresh the library to load its default.');
      request = { question: text, source_ids: getSourceIds(), provider: state.provider, model: model.value.trim() };
      if (state.provider === 'vertex') request.vertex = vertexSettings();
      if (nodes['desktop-ai-include-plan'].checked) { request.preferences = getPlannerPreferences(); if (!request.preferences) throw new Error('Load the activity options before including a plan.'); }
      if (nodes['desktop-ai-include-decision'].checked) { request.decision_request = getDecisionRequest(); if (!request.decision_request) throw new Error('Choose a scenario and wait for its sources to load.'); }
      if (!request.source_ids.length && !request.preferences && !request.decision_request) throw new Error('Select a source or include comparison/activity preferences first.');
    } catch (error) { feedback(error.message, true); return; }
    invalidate(); const token = ++state.token; state.busy = true; submit.disabled = true; bind(submit, 'Reading selected evidence…'); feedback('Retrieving selected evidence and preparing an answer…');
    try {
      const envelope = await callDesktop('askQuestion', request); const data = desktopData(envelope);
      if (token !== state.token) return;
      if (data.provider !== request.provider) throw new Error('The answer did not match the selected provider. Please try again.');
      state.data = data; answer.textContent = data.answer; result.hidden = false;
      bind(nodes['desktop-ai-answer-label'], data.status === 'answered' ? 'Answer' : 'INSUFFICIENT EVIDENCE');
      for (const citation of data.citations || []) {
        const link = button(null, null, () => {
          if (['planner-context', 'decision-context'].includes(citation.source_id)) {
            quote.textContent = citation.quote; contextJson.textContent = JSON.stringify(citation.source_id === 'planner-context' ? data.planner : data.decision, null, 2); context.showModal();
          } else void openSource(citation.source_id, { quote: citation.quote, page: citation.page }).catch((error) => feedback(error.message, true));
        }, 'desktop-ai-citation');
        link.dataset.testid = 'desktop-ai-citation'; link.dataset.sourceId = citation.source_id;
        const title = make('strong'); title.textContent = citation.source_title;
        link.append(title, make('span', null, 'Open exact quote ↗'));
        if (citation.is_simulated) link.append(make('span', null, 'Simulated source'));
        citations.append(link);
      }
      calculated.hidden = !data.planner && !data.decision; calculatedJson.textContent = JSON.stringify({ planner: data.planner, decision: data.decision }, null, 2);
      feedback(data.status === 'answered' ? 'Answer ready. Open a citation to check its context.' : 'No supported answer was found in the selected evidence.');
    } catch (error) { if (token === state.token) { feedback(error.message, true); status.append(button('desktop-ai-retry', 'Try again', ask, 'text-button')); } }
    finally { if (token === state.token) { state.busy = false; submit.disabled = false; bind(submit, 'Ask'); } }
  }
  provider.addEventListener('change', () => {
    state.models.set(state.provider, model.value); state.provider = provider.value; key.value = ''; save.disabled = false; clear.disabled = false;
    renderProvider(); invalidate('AI provider changed. Ask again to use the selected provider.'); void refreshKey();
  });
  function vertexSettings() {
    const value = { project_id: project.value.trim(), location: location.value.trim() };
    if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value.project_id) || !/^(global|[a-z]+-[a-z]+[0-9])$/.test(value.location)) throw new Error('Use your Google Cloud project ID and a location such as global or europe-west2.');
    return value;
  }
  for (const input of [project, location]) input.addEventListener('input', () => {
    invalidate('Question context changed. Ask again for an updated answer.'); bind(adcStatus, 'Run Google sign-in, then check it here.');
    try { localStorage.setItem('jinni-vertex-settings', JSON.stringify(vertexSettings())); } catch { /* Invalid/incomplete values or restricted storage are not persisted. */ }
  });
  model.addEventListener('input', () => { state.models.set(state.provider, model.value); invalidate('Model changed. Ask again for an updated answer.'); });
  for (const input of [question, nodes['desktop-ai-include-plan'], nodes['desktop-ai-include-decision']]) input.addEventListener('input', () => invalidate('Question context changed. Ask again for an updated answer.'));
  form.addEventListener('submit', ask); keyForm.addEventListener('submit', saveKey); dialog.addEventListener('close', () => { key.value = ''; });
  onContextChange(() => invalidate('Question context changed. Ask again for an updated answer.'));
  selectionLabel(); void loadProviders();

  const native = make('aside', 'desktop-backend-panel', null, 'desktop-backend-panel');
  const backendLabel = make('span', 'desktop-backend-status', 'Starting local service…'); backendLabel.setAttribute('role', 'status');
  const retry = button('desktop-backend-retry', 'Retry connection', async () => {
    retry.disabled = true;
    try { const value = await callDesktop('retryBackend'); if (value.state === 'ready') window.location.reload(); else await pollBackend(); }
    catch (error) { bind(backendLabel, error.message); } finally { retry.disabled = false; }
  }, 'text-button'); retry.hidden = true; native.append(backendLabel, retry); document.body.append(native);
  async function pollBackend() {
    try {
      const value = await callDesktop('getBackendStatus'); backendLabel.dataset.state = value.state;
      bind(backendLabel, value.state === 'ready' ? 'Local service ready' : value.message || 'Starting local service…');
      retry.hidden = value.state !== 'error'; native.hidden = value.state === 'ready';
      if (value.state === 'starting') setTimeout(pollBackend, 1000);
    } catch (error) { bind(backendLabel, error.message); retry.hidden = false; }
  }
  void pollBackend();
}
