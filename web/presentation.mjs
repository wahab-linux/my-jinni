// Friendly display text and units. Stored values and decision calculations stay unchanged.
import { currency, number as formatNumber, t } from './i18n.mjs';

const number = (value) => formatNumber(value, { maximumFractionDigits: 3 });

export function displayMeasure(value, unit, custom = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return t('Unknown');
  if (unit === 'pence') return currency(value);
  if (custom) return `${number(value)} ${unit}`;
  if (unit === 'minutes') {
    if (Number.isInteger(value) && value >= 60) return t(value % 60 ? '{hours} hr {minutes} min' : '{hours} hr', { hours: number(Math.floor(value / 60)), minutes: number(value % 60) });
    return t('{value} min', { value: number(value) });
  }
  if (unit === 'g CO2e') return value >= 1000 ? `${number(value / 1000)} kg CO₂e` : `${number(value)} g CO₂e`;
  if (unit === 'score' || unit === 'index') return t('{value} points', { value: number(value) });
  if (unit === '%') return `${number(value)}%`;
  return `${number(value)} ${t(unitLabel(unit))}`;
}

export function unitLabel(unit) {
  const labels = { pence: '£', minutes: 'minutes', hours: 'hours', days: 'days', 'g CO2e': 'g CO₂e', score: 'points', index: 'points' };
  return Object.hasOwn(labels, unit) ? labels[unit] : unit;
}

export function criterionLabel(criterion, custom = false) {
  if (custom) return criterion.label;
  const labels = {
    'cost-pence': 'Price', 'fee-pence': 'Fees', 'duration-minutes': 'Travel time',
    'emissions-grams': 'Carbon emissions', 'volatility-index': 'Price ups and downs',
    'liquidity-score': 'Ease of selling', 'macro-context-score': 'Wider market conditions',
    'commitment-hours': 'Time each week', 'fit-score': 'Interest match',
    'impact-reduction-score': 'Environmental benefit', 'wait-days': 'Waiting time',
  };
  return Object.hasOwn(labels, criterion.id) ? labels[criterion.id] : criterion.label;
}

export const topicCopy = {
  market: { name: 'Money choices', example: 'Fees & financial examples', description: 'Explore made-up financial examples and compare their fees and ratings.', notice: 'Demo figures only. No real prices, predictions or investment advice.' },
  travel: { name: 'Getting around', example: 'Train, bus & more', description: 'Compare ways to make an example journey. Start with a £25 budget, or change it below.', notice: 'Example journeys only. Prices, travel times and carbon figures are not live.' },
  student: { name: 'Student life', example: 'Activities & opportunities', description: 'Find an activity or opportunity that fits your time, interests and budget.', notice: 'Made-up opportunities. Places and availability have not been checked.' },
  sustainability: { name: 'Greener choices', example: 'Small everyday changes', description: 'Compare the cost, waiting time and possible benefit of small changes.', notice: 'Example costs and environmental estimates. Savings and benefits are not verified.' },
  custom: { name: 'My own idea', example: 'Try a ready-made example', description: 'Compare the ready-made example choices. Adding your own information needs the advanced editor below.', notice: 'The example is made up. Check any information you add before relying on it.' },
};
