import assert from 'node:assert/strict';
import test from 'node:test';
import { modelChoices } from '../../web/provider-models.mjs';

test('suggestions are provider-specific and do not require keys or model discovery', () => {
  for (const provider of ['openai', 'deepseek', 'gemini', 'anthropic', 'vertex']) {
    const choices = modelChoices(provider);
    assert.ok(choices.length >= 2);
    assert.equal(new Set(choices.map(item => item.id)).size, choices.length);
    assert.ok(choices.every(item => item.label === item.id));
  }
  assert.ok(modelChoices('deepseek').every(item => item.id.startsWith('deepseek-')));
  assert.ok(modelChoices('vertex').every(item => item.id.startsWith('gemini-')));
  assert.deepEqual(modelChoices('__proto__', 'gpt-4.1'), []);
  assert.deepEqual(modelChoices('unknown', 'gpt-4.1'), []);
});

test('the existing server default is retained without duplicates or alias replacement', () => {
  assert.equal(modelChoices('anthropic', 'claude-sonnet-4-6')[0].id, 'claude-sonnet-4-6');
  assert.equal(modelChoices('deepseek', 'deepseek-flash').filter(item => item.id === 'deepseek-flash').length, 1);
  assert.equal(modelChoices('openai', 'account-custom:v1')[0].id, 'account-custom:v1');
  for (const invalid of [null, {}, 'bad model', '../model', 'x'.repeat(101)]) {
    assert.deepEqual(modelChoices('openai', invalid), modelChoices('openai'));
  }
  assert.deepEqual(modelChoices('vertex', 'invalid:vertex'), modelChoices('vertex'));
});

test('callers receive independent choices and cannot mutate later suggestions', () => {
  const choices = modelChoices('gemini');
  const first = choices[0].id;
  choices[0].id = 'changed'; choices.pop();
  assert.equal(modelChoices('gemini')[0].id, first);
  assert.equal(modelChoices('gemini').length, 3);
});
