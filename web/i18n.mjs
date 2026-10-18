// Bind only application-owned interface copy; callers keep evidence and custom text raw.
const runtime = () => globalThis.jinniI18n;
const tracked = new Set();
const current = new WeakMap();
const currentAttributes = new WeakMap();
export const locale = () => runtime()?.getLocale() ?? 'en';
export const t = (key, params = {}) => runtime()?.t(key, params) ?? key.replace(/\{(\w+)\}/g, (token, name) => Object.hasOwn(params, name) ? String(params[name]) : token);
export const number = (value, options = {}) => new Intl.NumberFormat(locale() === 'en' ? 'en-GB' : locale(), options).format(value);
export const currency = (pence) => number(pence / 100, { style: 'currency', currency: 'GBP' });
export function bind(element, key, params = {}) {
  // Programmatic text owners replace their initial, explicitly marked placeholder span.
  if (element.childElementCount) element.replaceChildren();
  const binding = { element: new WeakRef(element), key, params };
  current.set(element, binding); tracked.add(binding);
  const resolved = typeof params === 'function' ? params() : params;
  if (runtime()) runtime().bindText(element, key, resolved);
  else element.textContent = t(key, resolved);
  return element;
}
export function attribute(element, name, key, params = {}) {
  const binding = { element: new WeakRef(element), name, key, params };
  if (!currentAttributes.has(element)) currentAttributes.set(element, new Map());
  currentAttributes.get(element).set(name, binding);
  tracked.add(binding);
  element.setAttribute(name, t(key, typeof params === 'function' ? params() : params));
}
export function option(key, value, raw = false) {
  const element = new Option(key, value);
  if (!raw) bind(element, key);
  return element;
}
runtime()?.onChange(() => {
  for (const binding of tracked) {
    const element = binding.element.deref();
    if (!element || !element.isConnected || (binding.name ? currentAttributes.get(element)?.get(binding.name) !== binding : current.get(element) !== binding)) { tracked.delete(binding); continue; }
    const params = typeof binding.params === 'function' ? binding.params() : binding.params;
    if (binding.name) element.setAttribute(binding.name, t(binding.key, params));
    else runtime().bindText(element, binding.key, params);
  }
});
