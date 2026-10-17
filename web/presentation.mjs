// Friendly display text and units. Stored values and decision calculations stay unchanged.
import { money } from './planner.mjs';

const number = (value) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 }).format(value);

export function displayMeasure(value, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unknown';
  if (unit === 'pence') return money(value);
  if (unit === 'minutes') {
    if (Number.isInteger(value) && value >= 60) return `${Math.floor(value / 60)} hr${value % 60 ? ` ${value % 60} min` : ''}`;
    return `${number(value)} min`;
  }
  if (unit === 'g CO2e') return value >= 1000 ? `${number(value / 1000)} kg CO₂e` : `${number(value)} g CO₂e`;
  if (unit === 'score' || unit === 'index') return `${number(value)} points`;
  if (unit === '%') return `${number(value)}%`;
  return `${number(value)} ${unit}`;
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
  market: { name: 'Money choices', description: 'Explore made-up financial examples and compare their fees and ratings.', notice: 'Demo figures only. No real prices, predictions or investment advice.' },
  travel: { name: 'Getting around', description: 'Compare ways to get there. Choose what matters and set your budget.', notice: 'Example journeys only. Prices, travel times and carbon figures are not live.' },
  student: { name: 'Student life', description: 'Find an activity or opportunity that fits your time, interests and budget.', notice: 'Made-up opportunities. Places and availability have not been checked.' },
  sustainability: { name: 'Greener choices', description: 'Compare the cost, waiting time and possible benefit of small changes.', notice: 'Example costs and environmental estimates. Savings and benefits are not verified.' },
  custom: { name: 'My own idea', description: 'Try the example, or add your own options using the advanced editor below.', notice: 'The example is made up. Check any information you add before relying on it.' },
};
