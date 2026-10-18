// Shared UI readers expose current choices, never credentials or mutable application state.
const readers = {
  sourceIds: () => [],
  plannerPreferences: () => null,
  decisionRequest: () => null,
  sourceViewer: async () => false,
};
const listeners = new Set();
const snapshot = (value) => value == null ? value : structuredClone(value);

export function configureContext(next) {
  for (const name of Object.keys(readers)) if (typeof next[name] === 'function') readers[name] = next[name];
}
export const getSourceIds = () => [...readers.sourceIds()];
export const getPlannerPreferences = () => snapshot(readers.plannerPreferences());
export const getDecisionRequest = () => snapshot(readers.decisionRequest());
export const openSource = (id, options = {}) => readers.sourceViewer(id, options);
export function onContextChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
export function notifyContextChange() {
  for (const callback of listeners) {
    try { callback(); } catch { /* A tool must not interrupt the shared decision controls. */ }
  }
}
