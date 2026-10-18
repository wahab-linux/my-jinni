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

function validateDecisionId(value) {
  text(value, 1, 100);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new ValidationError('Choose a valid decision or criterion ID.');
  }
  return value;
}

function decisionNumber(value, maximum = 1e12, minimum = -1e12) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ValidationError('Decision values must be finite numbers within the supported range.');
  }
}

function decisionRecord(value, allowNull = false) {
  object(value, Object.keys(value || {}), []);
  if (Object.keys(value).length > 10) throw new ValidationError('Use at most ten decision criteria.');
  for (const [id, number] of Object.entries(value)) {
    validateDecisionId(id);
    if (!allowNull || number !== null) decisionNumber(number);
  }
}

function decisionSource(value) {
  object(value, ['id', 'label', 'is_simulated', 'updated_at']);
  validateDecisionId(value.id);
  text(value.label, 1, 200);
  if (typeof value.is_simulated !== 'boolean' || typeof value.updated_at !== 'string'
      || value.updated_at.length > 60 || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value.updated_at)
      || !Number.isFinite(Date.parse(value.updated_at))) {
    throw new ValidationError('Provide a source label, simulation flag and aware update time.');
  }
}

function decisionArray(value, minimum, maximum) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new ValidationError('The decision has too few or too many entries.');
  }
}

function decisionCustom(value) {
  object(value, ['title', 'criteria', 'dataset']);
  text(value.title, 1, 200);
  decisionArray(value.criteria, 1, 10);
  const criteria = new Map();
  for (const criterion of value.criteria) {
    object(criterion, ['id', 'label', 'unit', 'direction', 'default_weight']);
    validateDecisionId(criterion.id);
    text(criterion.label, 1, 100);
    text(criterion.unit, 1, 40);
    if (!['minimize', 'maximize'].includes(criterion.direction) || criteria.has(criterion.id)) {
      throw new ValidationError('Criteria need unique IDs and a supported direction.');
    }
    decisionNumber(criterion.default_weight, 100, 0);
    criteria.set(criterion.id, criterion);
  }
  const dataset = value.dataset;
  object(dataset, ['option_source', 'metric_source', 'options', 'observations']);
  decisionSource(dataset.option_source);
  decisionSource(dataset.metric_source);
  if (dataset.option_source.id === dataset.metric_source.id) {
    throw new ValidationError('The option and metric source IDs must differ.');
  }
  decisionArray(dataset.options, 0, 50);
  decisionArray(dataset.observations, 0, 50);
  const optionIds = new Set();
  for (const option of dataset.options) {
    object(option, ['id', 'name', 'description', 'category']);
    validateDecisionId(option.id);
    text(option.name, 1, 200);
    text(option.description, 1, 1000);
    text(option.category, 1, 100);
    if (optionIds.has(option.id)) throw new ValidationError('Option IDs must be unique.');
    optionIds.add(option.id);
  }
  const observed = new Set();
  for (const row of dataset.observations) {
    object(row, ['option_id', 'available', 'metrics'], ['option_id']);
    validateDecisionId(row.option_id);
    if (!optionIds.has(row.option_id) || observed.has(row.option_id)
        || (row.available !== undefined && row.available !== null && typeof row.available !== 'boolean')) {
      throw new ValidationError('Observation IDs must be unique and belong to an option.');
    }
    observed.add(row.option_id);
    if (row.metrics !== undefined) decisionRecord(row.metrics, true);
    for (const [id, number] of Object.entries(row.metrics || {})) {
      if (!criteria.has(id)) throw new ValidationError('Measurements must use a declared criterion.');
      if (criteria.get(id).unit === 'pence' && number !== null
          && (!Number.isSafeInteger(number) || number < 0)) {
        throw new ValidationError('Money must use nonnegative integer pence.');
      }
    }
  }
}

function validateDecisionRequest(value) {
  object(value, ['scenario_id', 'weights', 'constraints', 'custom'], ['scenario_id']);
  validateDecisionId(value.scenario_id);
  if (value.weights !== undefined) {
    decisionRecord(value.weights);
    for (const weight of Object.values(value.weights)) decisionNumber(weight, 100, 0);
  }
  if (value.constraints !== undefined) {
    decisionArray(value.constraints, 0, 20);
    for (const constraint of value.constraints) {
      object(constraint, ['criterion_id', 'operator', 'value']);
      validateDecisionId(constraint.criterion_id);
      if (!['lte', 'gte'].includes(constraint.operator)) {
        throw new ValidationError('Choose a minimum or maximum constraint.');
      }
      decisionNumber(constraint.value);
    }
  }
  if (value.custom !== undefined && value.custom !== null) {
    if (value.scenario_id !== 'custom') throw new ValidationError('Custom data needs the custom scenario.');
    decisionCustom(value.custom);
  }
  if (JSON.stringify(value).length > 150000) throw new ValidationError('The custom decision is too large.');
  return structuredClone(value);
}

function validateChatRequest(value) {
  object(value, ['question', 'source_ids', 'provider', 'model', 'preferences', 'decision_request', 'vertex', 'intent'], ['question', 'source_ids']);
  text(value.question, 1, 2000);
  if (Object.hasOwn(value, 'intent') && !['answer', 'options'].includes(value.intent)) {
    throw new ValidationError('Choose an answer or option suggestions.');
  }
  if (!Array.isArray(value.source_ids) || value.source_ids.length > 20
      || new Set(value.source_ids).size !== value.source_ids.length) {
    throw new ValidationError('Select up to twenty distinct sources.');
  }
  const ids = value.source_ids.map(validateSourceId);
  if (Object.hasOwn(value, 'provider')) validateProvider(value.provider);
  if (Object.hasOwn(value, 'model')
      && (typeof value.model !== 'string' || !/^[a-zA-Z0-9._:-]{1,100}$/.test(value.model))) {
    throw new ValidationError('Enter a supported model name.');
  }
  if (ids.length === 0 && value.preferences === undefined && value.decision_request === undefined) {
    throw new ValidationError('Select a source or include your current decision or activity preferences.');
  }
  if (value.provider === 'vertex' && !value.vertex) throw new ValidationError('Enter your Google Cloud project ID and location.');
  if (value.provider !== 'vertex' && value.vertex !== undefined) throw new ValidationError('Google Cloud settings apply only to Vertex AI.');
  return {
    question: value.question,
    source_ids: ids,
    ...(Object.hasOwn(value, 'intent') ? { intent: value.intent } : {}),
    ...(Object.hasOwn(value, 'provider') ? { provider: value.provider } : {}),
    ...(Object.hasOwn(value, 'model') ? { model: value.model } : {}),
    ...(value.preferences === undefined ? {} : { preferences: validatePreferences(value.preferences) }),
    ...(value.decision_request === undefined ? {} : { decision_request: validateDecisionRequest(value.decision_request) }),
    ...(value.vertex === undefined ? {} : { vertex: validateVertexSettings(value.vertex) }),
  };
}

function validateSessionKey(value) {
  if (typeof value !== 'string' || value.length > 1024 || /[^\x21-\x7e]/.test(value)) {
    throw new ValidationError('Enter a valid provider API key without spaces.');
  }
  return value;
}

function validateProvider(value) {
  if (typeof value !== 'string' || !['openai', 'deepseek', 'gemini', 'anthropic', 'vertex'].includes(value)) {
    throw new ValidationError('Choose one of the supported AI providers.');
  }
  return value;
}

function validateSessionKeySetting(value) {
  if (typeof value === 'string') return validateSessionKey(value);
  object(value, ['provider', 'key']);
  if (value.provider === 'vertex') throw new ValidationError('Vertex AI uses Google sign-in (ADC), not an API key.');
  return { provider: validateProvider(value.provider), key: validateSessionKey(value.key) };
}

function validateVertexSettings(value) {
  object(value, ['project_id', 'location'], ['project_id']);
  if (typeof value.project_id !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value.project_id)
      || (value.location !== undefined && (typeof value.location !== 'string' || !/^(global|[a-z]+-[a-z]+[0-9])$/.test(value.location)))) {
    throw new ValidationError('Use your Google Cloud project ID and a location such as global or europe-west2.');
  }
  return { project_id: value.project_id, location: value.location ?? 'global' };
}

function validateIpcInput(method, value) {
  const validators = {
    recommend: validatePreferences,
    getDecisionScenario: validateDecisionId,
    evaluateDecision: validateDecisionRequest,
    addTextSource: validateTextSource,
    importSource: validateImportOptions,
    getSource: validateSourceId,
    deleteSource: validateSourceId,
    askQuestion: validateChatRequest,
    checkVertexAdc: validateVertexSettings,
    setSessionApiKey: validateSessionKeySetting,
    getSessionSettings: (input) => input === undefined ? undefined : validateProvider(input),
    clearSessionApiKey: (input) => input === undefined ? undefined : validateProvider(input),
  };
  if (Object.hasOwn(validators, method)) return validators[method](value);
  if (!['getOptions', 'getDecisionScenarios', 'listSources', 'getBackendStatus', 'retryBackend'].includes(method) || value !== undefined) {
    throw new ValidationError('This desktop operation is not supported.');
  }
  return undefined;
}

module.exports = {
  ValidationError, validateBackendUrl, validatePreferences, validateSourceId, validateTextSource,
  validateImportOptions, validateChatRequest, validateSessionKey, validateProvider,
  validateSessionKeySetting, validateIpcInput,
  validateDecisionId, validateDecisionRequest,
};
