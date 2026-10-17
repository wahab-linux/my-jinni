'use strict';

class ValidationError extends Error {
  constructor(message = 'Please check the supplied values.') {
    super(message);
    this.name = 'ValidationError';
  }
}

function validateBackendUrl(value = 'http://127.0.0.1:8000') {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError('The backend URL must be a loopback HTTP origin.');
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '[::1]'
    || /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
  if (url.protocol !== 'http:' || !loopback || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) {
    throw new ValidationError('The backend URL must be a loopback HTTP origin without a path or credentials.');
  }
  return url.origin;
}

function object(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
      || Object.keys(value).some((key) => !allowed.includes(key))
      || required.some((key) => !Object.hasOwn(value, key))) {
    throw new ValidationError('The request contains missing or unsupported fields.');
  }
}

function text(value, min, max) {
  if (typeof value !== 'string' || value.length < min || value.length > max
      || (min > 0 && !value.trim()) || value.includes('\0') || !value.isWellFormed()) {
    throw new ValidationError('Text is missing, too long, or contains invalid characters.');
  }
  return value;
}

function validatePreferences(value) {
  object(value, ['origin_id', 'budget_pence', 'depart_at', 'return_by', 'interests']);
  if (typeof value.origin_id !== 'string' || value.origin_id.length > 100
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.origin_id)
      || !Number.isSafeInteger(value.budget_pence) || value.budget_pence < 0) {
    throw new ValidationError('Choose a valid origin and a nonnegative integer-pence budget.');
  }
  for (const field of ['depart_at', 'return_by']) {
    if (typeof value[field] !== 'string' || value[field].length > 60
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value[field])
        || !Number.isFinite(Date.parse(value[field]))) {
      throw new ValidationError('Departure and return times must include a timezone offset.');
    }
  }
  const categories = ['games', 'music', 'arts', 'sport', 'learning'];
  if (Date.parse(value.return_by) <= Date.parse(value.depart_at)
      || !Array.isArray(value.interests) || value.interests.length < 1 || value.interests.length > 5
      || new Set(value.interests).size !== value.interests.length
      || value.interests.some((interest) => !categories.includes(interest))) {
    throw new ValidationError('Choose distinct interests and a return time after departure.');
  }
  return { ...value, interests: [...value.interests] };
}

function validateSourceId(value) {
  text(value, 1, 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new ValidationError('Choose a valid source.');
  return value;
}

function validateTextSource(value) {
  object(value, ['title', 'text', 'is_simulated'], ['title', 'text']);
  text(value.title, 1, 200);
  text(value.text, 1, 150000);
  if (value.is_simulated !== undefined && typeof value.is_simulated !== 'boolean') {
    throw new ValidationError('The simulated-data label must be true or false.');
  }
  return { title: value.title, text: value.text, is_simulated: value.is_simulated ?? false };
}

function validateImportOptions(value) {
  object(value, ['is_simulated'], []);
  if (value.is_simulated !== undefined && typeof value.is_simulated !== 'boolean') {
    throw new ValidationError('The simulated-data label must be true or false.');
  }
  return { is_simulated: value.is_simulated ?? false };
}

function validateChatRequest(value) {
  object(value, ['question', 'source_ids', 'model', 'preferences'], ['question', 'source_ids', 'model']);
  text(value.question, 1, 2000);
  if (!Array.isArray(value.source_ids) || value.source_ids.length > 20
      || new Set(value.source_ids).size !== value.source_ids.length) {
    throw new ValidationError('Select up to twenty distinct sources.');
  }
  const ids = value.source_ids.map(validateSourceId);
  if (typeof value.model !== 'string' || !/^[a-zA-Z0-9._:-]{1,100}$/.test(value.model)) {
    throw new ValidationError('Enter a supported model name.');
  }
  if (ids.length === 0 && value.preferences === undefined) {
    throw new ValidationError('Select a source or include your current activity preferences.');
  }
  return {
    question: value.question,
    source_ids: ids,
    model: value.model,
    ...(value.preferences === undefined ? {} : { preferences: validatePreferences(value.preferences) }),
  };
}

function validateSessionKey(value) {
  if (typeof value !== 'string' || value.length > 1024 || /[^\x21-\x7e]/.test(value)) {
    throw new ValidationError('Enter a valid OpenAI API key without spaces.');
  }
  return value;
}

function validateIpcInput(method, value) {
  const validators = {
    recommend: validatePreferences,
    addTextSource: validateTextSource,
    importSource: validateImportOptions,
    getSource: validateSourceId,
    deleteSource: validateSourceId,
    askQuestion: validateChatRequest,
    setSessionApiKey: validateSessionKey,
  };
  if (Object.hasOwn(validators, method)) return validators[method](value);
  if (!['getOptions', 'listSources', 'clearSessionApiKey', 'getSessionSettings',
    'getBackendStatus', 'retryBackend'].includes(method) || value !== undefined) {
    throw new ValidationError('This desktop operation is not supported.');
  }
  return undefined;
}

module.exports = {
  ValidationError, validateBackendUrl, validatePreferences, validateSourceId, validateTextSource,
  validateImportOptions, validateChatRequest, validateSessionKey, validateIpcInput,
};
