// Pure browser decision layer. Verified against the Python application by parity tests.
export function money(pence) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

export function localParts(value, timezone = 'Europe/London') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
}

export function timestamp(value, timezone = 'Europe/London') {
  const date = new Date(value);
  const p = localParts(date, timezone);
  const offset = Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime()) / 60000);
  const sign = offset >= 0 ? '+' : '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

export function time(value, timezone = 'Europe/London') {
  const p = localParts(value, timezone);
  return `${p.hour}:${p.minute}`;
}

export function fromLocal(date, clock, timezone) {
  // Resolve the selected day's offset, independently of the user's own timezone.
  const naive = Date.parse(`${date}T${clock}:00Z`);
  const local = timestamp(naive, timezone);
  const offset = local.slice(-6);
  const result = `${date}T${clock}:00${offset}`;
  if (timestamp(Date.parse(result), timezone).slice(0, 16) !== `${date}T${clock}`) {
    throw new Error('This local time is not supported. Choose another departure or return time.');
  }
  return result;
}

export function parseBudget(value) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter a budget in pounds with at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) throw new Error('The budget is too large.');
  return result;
}

export function recommend(request, scenario) {
  const { options, bundles } = scenario;
  const zone = options.timezone;
  const dateOf = (value) => timestamp(Date.parse(value), zone).slice(0, 10);
  const aware = (value) => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  if (!options.origins.some((item) => item.id === request.origin_id)
      || !Number.isSafeInteger(request.budget_pence) || request.budget_pence < 0 || request.budget_pence > options.max_budget_pence
      || !aware(request.depart_at) || !aware(request.return_by)
      || Date.parse(request.return_by) <= Date.parse(request.depart_at)
      || !options.supported_dates.includes(dateOf(request.depart_at)) || !options.supported_dates.includes(dateOf(request.return_by))
      || !Array.isArray(request.interests) || !request.interests.length
      || new Set(request.interests).size !== request.interests.length
      || request.interests.some((interest) => !options.interests.some((item) => item.id === interest))) {
    throw new Error('Choose a supported origin, demo date, budget, interests and an ordered time window.');
  }
  const bundle = bundles[request.origin_id];
  if (!bundle || !Array.isArray(bundle.activities) || !bundle.journeys
      || !bundle.sources.some((source) => source.id === 'travel' && source.origin_id === request.origin_id)) {
    throw new Error('The selected travel data is missing or invalid. Reload to retry.');
  }
  const candidates = [];
  let missing = 0;
  for (const activity of bundle.activities) {
    const journey = bundle.journeys[activity.venue_id];
    if (!journey || !journey.available) { missing++; continue; }
    const total = activity.ticket_cost_pence + journey.return_fare_pence;
    const arrival = Date.parse(request.depart_at) + journey.outbound_minutes * 60000;
    const returned = Date.parse(activity.ends_at) + journey.return_minutes * 60000;
    if (total > request.budget_pence || arrival > Date.parse(activity.starts_at) || returned > Date.parse(request.return_by)) continue;
    candidates.push({ activity, journey, total, arrival, returned, match: request.interests.includes(activity.category) });
  }
  candidates.sort((a, b) => Number(b.match) - Number(a.match) || a.total - b.total
    || a.journey.outbound_minutes + a.journey.return_minutes - b.journey.outbound_minutes - b.journey.return_minutes
    || (a.activity.id < b.activity.id ? -1 : a.activity.id > b.activity.id ? 1 : 0));
  const results = candidates.slice(0, 3).map(({ activity: a, journey: j, total, arrival, returned, match }) => ({
    event_id: a.id, title: a.title, venue_name: a.venue_name, category: a.category,
    starts_at: a.starts_at, ends_at: a.ends_at, ticket_cost_pence: a.ticket_cost_pence,
    travel_cost_pence: j.return_fare_pence, total_cost_pence: total, outbound_minutes: j.outbound_minutes,
    return_minutes: j.return_minutes, arrive_at: timestamp(arrival, zone), return_at: timestamp(returned, zone),
    reasons: [match ? `Matches your interest in ${a.category}.` : `A different interest category (${a.category}) that fits your constraints.`,
      `Costs GBP ${(total / 100).toFixed(2)} including return travel, within your GBP ${(request.budget_pence / 100).toFixed(2)} budget.`,
      `Arrive at ${time(arrival, zone)}, at or before the activity starts; return to your selected origin at ${time(returned, zone)}, by your ${time(request.return_by, zone)} deadline (${zone}).`],
  }));
  const message = !results.length ? 'No activity fits this budget and time window. Try adjusting your preferences.'
    : candidates[0].match ? 'Found an activity that fits your interests, budget, and return deadline.'
      : 'Found an activity within your budget and time window, in a different interest category.';
  return { data: { recommended: results[0] || null, alternatives: results.slice(1), message, sources: bundle.sources }, error: null,
    warnings: [...bundle.warnings, ...(missing ? [{ code: 'MISSING_JOURNEY', message: `Excluded ${missing} activities with missing or unavailable return travel.` }] : [])] };
}
