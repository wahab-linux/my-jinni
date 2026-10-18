// The shared experience chooses storage and calculation boundaries at runtime.
export const isDesktop = Boolean(globalThis.myJinni?.getOptions);

export async function callDesktop(method, ...values) {
  if (!isDesktop || typeof globalThis.myJinni[method] !== 'function') throw new Error('The desktop connection is unavailable. Restart Jinni and try again.');
  let response;
  try { response = await globalThis.myJinni[method](...values); }
  catch { throw new Error('The desktop service could not complete this request. Please try again.'); }
  if (response?.cancelled) return response;
  if (response?.status === 0) throw new Error(response.connectionError || 'Cannot reach the local service. Check the connection above, then retry.');
  return response;
}

export function desktopEnvelope(response) {
  if (!response?.body || typeof response.body !== 'object') throw new Error('The local service returned an unexpected response.');
  return response.body;
}

export function desktopData(response) {
  const envelope = desktopEnvelope(response);
  if (envelope.error || envelope.data == null) {
    const error = new Error(envelope.error?.message || 'The local service returned an unexpected response.');
    error.code = envelope.error?.code;
    error.status = response.status;
    throw error;
  }
  return envelope.data;
}

async function staticJson(name) {
  const response = await fetch(new URL(name, import.meta.url), { signal: AbortSignal.timeout(10000), cache: 'no-cache' });
  if (!response.ok) throw new Error('The demo data could not be loaded. Check your connection and retry.');
  return response.json();
}

export async function loadPlanner() {
  if (!isDesktop) {
    const scenario = await staticJson('./scenario.json');
    const { recommend } = await import('./planner.mjs');
    if (!scenario.options?.origins?.length) throw new Error('The demo data could not be loaded. Check your connection and retry.');
    for (const origin of scenario.options.origins) recommend({ ...scenario.options.default_request, origin_id: origin.id }, scenario);
    return scenario;
  }
  const options = desktopData(await callDesktop('getOptions'));
  return { options: { ...options, demo_date: options.demo_date || options.supported_dates?.[0] } };
}

export async function recommendPlan(preferences, scenario) {
  if (isDesktop) return desktopEnvelope(await callDesktop('recommend', preferences));
  const { recommend } = await import('./planner.mjs');
  return recommend(preferences, scenario);
}

export async function loadDecisions() {
  if (!isDesktop) {
    const catalog = await staticJson('./decisions.json');
    const { evaluateDecision } = await import('./decisions.mjs');
    if (!Array.isArray(catalog.scenarios) || catalog.scenarios.length !== 5 || catalog.scenarios.some((entry) => evaluateDecision(entry.scenario.default_request, entry).error)) throw new Error('Your choices could not be loaded. Check your connection and try again.');
    return catalog;
  }
  const catalog = desktopData(await callDesktop('getDecisionScenarios'));
  const scenarios = await Promise.all(catalog.scenarios.map(({ id }) => callDesktop('getDecisionScenario', id).then(desktopData)));
  return { scenarios };
}

export async function compareDecision(request, entry) {
  if (isDesktop) return desktopEnvelope(await callDesktop('evaluateDecision', request));
  const { evaluateDecision } = await import('./decisions.mjs');
  return evaluateDecision(request, entry);
}

export async function openSources() {
  if (!isDesktop) {
    const { openLibrary } = await import('./library.mjs');
    const library = await openLibrary();
    return { ...library, add: async (source) => { await library.add(source); return source; } };
  }
  const detail = async (id) => {
    const data = desktopData(await callDesktop('getSource', id));
    return { ...data.source, chunks: data.chunks };
  };
  return {
    all: async () => {
      const data = desktopData(await callDesktop('listSources'));
      return Promise.all(data.sources.map((source) => detail(source.id)));
    },
    add: async (source) => {
      let previousPage;
      const text = (source.chunks || []).map((chunk, index) => {
        const prefix = index && chunk.page !== previousPage ? '\n\n' : '';
        previousPage = chunk.page;
        return prefix + chunk.text;
      }).join('');
      const data = desktopData(await callDesktop('addTextSource', { title: source.title, text, is_simulated: source.is_simulated === true }));
      return detail((data.source || data).id);
    },
    remove: async (id) => desktopData(await callDesktop('deleteSource', id)),
  };
}

export async function importDesktopSource(options) {
  const response = await callDesktop('importSource', options);
  if (!response?.cancelled) desktopData(response);
  return response;
}

export async function initDesktopTools() {
  if (!isDesktop) return;
  await import('./desktop-locales.js');
  const { mountDesktopTools } = await import('./desktop-ai.mjs');
  mountDesktopTools();
}
