const BASE_LIMITATIONS = [
  'Scores compare only the supplied options and chosen weights; they are not probabilities.',
  'Missing measurements and unknown availability cannot establish feasibility.',
  'Source names and simulation flags are supplied metadata, not independent verification.',
];
const roundSix = (value) => Math.floor(value * 1000000 + 0.5) / 1000000;
const fail = (message, field = 'body') => { throw Object.assign(new Error(message), { field }); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const object = (value, fields, required = fields) => {
  if (!isObject(value) || Object.keys(value).some((key) => !fields.includes(key))
      || required.some((key) => !Object.hasOwn(value, key))) fail('Missing or unsupported decision fields.');
};
const slug = (value) => {
  if (typeof value !== 'string' || value.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) fail('Use lowercase letters, digits and hyphens for IDs.');
};
const text = (value, maximum = 2000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || !value.isWellFormed()) fail('Provide valid text within the documented limits.');
};
const number = (value, weight = false) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12
      || (weight && (value < 0 || value > 100))) fail('Numbers must be finite and within the documented limits.');
};

function validateCriteria(criteria) {
  if (!Array.isArray(criteria) || !criteria.length || criteria.length > 10) fail('Choose between one and ten criteria.');
  const seen = new Set();
  for (const criterion of criteria) {
    object(criterion, ['id', 'label', 'unit', 'direction', 'default_weight']);
    slug(criterion.id); text(criterion.label, 100); text(criterion.unit, 40); number(criterion.default_weight, true);
    if (!['minimize', 'maximize'].includes(criterion.direction)) fail('Choose minimize or maximize for each criterion.');
    if (seen.has(criterion.id)) fail('Criterion IDs must be unique.');
    seen.add(criterion.id);
  }
}

function validateDataset(dataset, criteria) {
  object(dataset, ['option_source', 'metric_source', 'options', 'observations']);
  for (const source of [dataset.option_source, dataset.metric_source]) {
    object(source, ['id', 'label', 'is_simulated', 'updated_at']);
    slug(source.id); text(source.label, 200);
    if (typeof source.is_simulated !== 'boolean' || typeof source.updated_at !== 'string'
        || !/(?:Z|[+-]\d{2}:\d{2})$/.test(source.updated_at) || !Number.isFinite(Date.parse(source.updated_at))) fail('Source timestamps must be aware and simulation flags must be boolean.');
  }
  if (dataset.option_source.id === dataset.metric_source.id) fail('Option and measurement sources must have different IDs');
  if (!Array.isArray(dataset.options) || dataset.options.length > 50 || !Array.isArray(dataset.observations) || dataset.observations.length > 50) fail('Use up to fifty options and observations.');
  const optionIds = new Set(); const observedIds = new Set();
  const byId = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  for (const option of dataset.options) {
    object(option, ['id', 'name', 'description', 'category']);
    slug(option.id); text(option.name, 200); text(option.description, 1000); text(option.category, 100);
    if (optionIds.has(option.id)) fail('Option and observation IDs must be unique');
    optionIds.add(option.id);
  }
  for (const observation of dataset.observations) {
    object(observation, ['option_id', 'available', 'metrics'], ['option_id']);
    slug(observation.option_id);
    if (!optionIds.has(observation.option_id)) fail('Measurements reference an unknown option');
    if (observedIds.has(observation.option_id)) fail('Option and observation IDs must be unique');
    observedIds.add(observation.option_id);
    if (observation.available !== undefined && observation.available !== null && typeof observation.available !== 'boolean') fail('Availability must be true, false or unknown.');
    const metrics = observation.metrics === undefined ? {} : observation.metrics;
    if (!isObject(metrics)) fail('Measurements must be an object.');
    for (const [id, value] of Object.entries(metrics)) {
      slug(id);
      if (!byId.has(id)) fail('Measurements contain an unknown criterion');
      if (value === null) continue;
      number(value);
      if (byId.get(id).unit === 'pence' && (!Number.isInteger(value) || value < 0)) fail('Money measurements must use nonnegative integer pence');
    }
  }
}

export function evaluateDecision(request, entry) {
  try {
    object(request, ['scenario_id', 'weights', 'constraints', 'custom'], ['scenario_id']);
    slug(request.scenario_id);
    if (!entry || entry.scenario?.id !== request.scenario_id) fail('The request must identify the selected scenario.', 'body.scenario_id');
    const scenario = entry.scenario;
    let { criteria, title } = scenario;
    let dataset = entry.dataset;
    const custom = request.custom;
    if (custom !== null && custom !== undefined) {
      if (request.scenario_id !== 'custom') fail('Custom data is supported only for the custom scenario');
      object(custom, ['title', 'criteria', 'dataset']);
      text(custom.title, 200);
      ({ criteria, title, dataset } = custom);
    }
    validateCriteria(criteria);
    validateDataset(dataset, criteria);
    const selectedWeights = request.weights === undefined ? {} : request.weights;
    if (!isObject(selectedWeights) || Object.keys(selectedWeights).length > 10) fail('Use up to ten criterion weights.', 'body.weights');
    const byId = new Map(criteria.map((criterion) => [criterion.id, criterion]));
    for (const [id, value] of Object.entries(selectedWeights)) {
      slug(id); number(value, true);
      if (!byId.has(id)) fail('Weights contain an unknown criterion.', 'body.weights');
    }
    const weights = Object.fromEntries(criteria.map((criterion) => [criterion.id, Object.hasOwn(selectedWeights, criterion.id) ? selectedWeights[criterion.id] : criterion.default_weight]));
    const active = criteria.filter((criterion) => weights[criterion.id] > 0);
    if (!active.length) fail('Choose at least one positive criterion weight.', 'body.weights');
    const constraints = request.constraints === undefined ? [] : request.constraints;
    if (!Array.isArray(constraints) || constraints.length > 20) fail('Use up to twenty constraints.', 'body.constraints');
    for (const constraint of constraints) {
      object(constraint, ['criterion_id', 'operator', 'value']);
      slug(constraint.criterion_id); number(constraint.value);
      if (!['lte', 'gte'].includes(constraint.operator)) fail('Choose a minimum or maximum constraint.');
      if (!byId.has(constraint.criterion_id)) fail('A constraint references an unknown criterion.', 'body.constraints');
      if (byId.get(constraint.criterion_id).unit === 'pence' && (!Number.isInteger(constraint.value) || constraint.value < 0)) fail('Money constraints must use nonnegative integer pence.', 'body.constraints');
    }
    const needed = new Set([...active.map((criterion) => criterion.id), ...constraints.map((constraint) => constraint.criterion_id)]);
    const observed = new Map(dataset.observations.map((observation) => [observation.option_id,
      { ...observation, metrics: Object.assign(Object.create(null), observation.metrics) }]));
    const feasible = []; const excluded = [];
    for (const option of dataset.options) {
      const observation = observed.get(option.id);
      const reasons = [];
      if (!observation) reasons.push('No measurements were provided for this option.');
      else if (observation.available === null || observation.available === undefined) reasons.push('Availability is unknown.');
      else if (!observation.available) reasons.push('Option is unavailable.');
      if (observation) {
        const metrics = observation.metrics ?? {};
        for (const criterion of criteria) if (needed.has(criterion.id) && metrics[criterion.id] == null) reasons.push(`Missing value for ${criterion.label}.`);
        for (const constraint of constraints) {
          const value = metrics[constraint.criterion_id];
          if (value == null) continue;
          const label = byId.get(constraint.criterion_id).label;
          if (constraint.operator === 'lte' && value > constraint.value) reasons.push(`${label} exceeds its selected maximum.`);
          else if (constraint.operator === 'gte' && value < constraint.value) reasons.push(`${label} is below its selected minimum.`);
        }
      }
      if (reasons.length) excluded.push({ id: option.id, name: option.name, reasons });
      else feasible.push({ option, observation });
    }
    const ranges = new Map(active.map((criterion) => [criterion.id, feasible.length
      ? [Math.min(...feasible.map(({ observation }) => observation.metrics[criterion.id])), Math.max(...feasible.map(({ observation }) => observation.metrics[criterion.id]))] : [0, 0]]));
    const totalWeight = active.reduce((total, criterion) => total + weights[criterion.id], 0);
    const sourceIds = [dataset.option_source.id, dataset.metric_source.id];
    const ranked = feasible.map(({ option, observation }) => {
      let score = 0;
      const contributions = active.map((criterion) => {
        const value = observation.metrics[criterion.id];
        const [lower, upper] = ranges.get(criterion.id);
        const normalised = lower === upper ? 1 : criterion.direction === 'maximize'
          ? (value - lower) / (upper - lower) : (upper - value) / (upper - lower);
        const points = normalised * weights[criterion.id] / totalWeight * 100;
        score += points;
        return { criterion_id: criterion.id, label: criterion.label, unit: criterion.unit, value,
          weight: weights[criterion.id], normalised, points: roundSix(points) };
      });
      return { ...option, score: roundSix(score), metrics: { ...observation.metrics }, contributions,
        reasons: ['Meets all hard constraints with known availability.', ...active.map((criterion) => `For ${criterion.label}, ${criterion.direction === 'minimize' ? 'lower' : 'higher'} values are preferred.`)], source_ids: [...sourceIds] };
    });
    ranked.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    excluded.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const data = { scenario_id: request.scenario_id, title, method: 'weighted_min_max',
      summary: ranked.length ? 'Compared options using the selected hard constraints and weighted criteria.' : 'No options meet all known data and hard constraints.',
      recommended: ranked[0] ?? null, ranked, excluded, criteria: criteria.map((criterion) => ({ ...criterion })),
      sources: [{ ...dataset.option_source }, { ...dataset.metric_source }], evaluated_count: dataset.options.length,
      is_simulated: dataset.option_source.is_simulated || dataset.metric_source.is_simulated,
      limitations: [scenario.notice, ...BASE_LIMITATIONS] };
    return { data, error: null, warnings: data.is_simulated ? [{ code: 'SIMULATED_DATA', message: 'Options and measurements include fictional simulated data.' }] : [] };
  } catch (error) {
    return { data: null, error: { code: 'VALIDATION_ERROR', message: error.message, details: [{ field: error.field ?? 'body', message: error.message }] }, warnings: [] };
  }
}
