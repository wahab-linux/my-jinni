// Suggestions, not an account-access check. Sources and review date: docs/AI_PROVIDERS.md.
const suggestions = Object.freeze({
  openai: ['gpt-4.1-mini', 'gpt-4.1'],
  deepseek: ['deepseek-flash', 'deepseek-v4-pro'],
  gemini: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'],
  anthropic: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'],
  vertex: ['gemini-3.8-flash', 'gemini-3.5-flash-lite'],
});

export function modelChoices(provider, defaultModel = '') {
  if (!Object.hasOwn(suggestions, provider)) return [];
  const pattern = provider === 'vertex' ? /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/ : /^[a-zA-Z0-9._:-]{1,100}$/;
  const preferred = typeof defaultModel === 'string' && pattern.test(defaultModel) ? [defaultModel] : [];
  return [...new Set([...preferred, ...suggestions[provider]])].map(id => ({ id, label: id }));
}
