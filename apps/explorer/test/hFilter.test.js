import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDirectQuery, parseSavedFilterDefinition, executableRequest } from '../src/widgets/filter/HFilter.js';

test('HFilter normalizes direct Heurist queries', () => {
  assert.deepEqual(normalizeDirectQuery('t:12'), { q: 't:12' });
  assert.deepEqual(normalizeDirectQuery('{"t":12}'), { q: { t: 12 } });
  assert.deepEqual(normalizeDirectQuery('{"q":"t:12","rulesonly":1}'), { q: 't:12', rulesonly: 1 });
  assert.equal(normalizeDirectQuery('  '), null);
});

test('HFilter parses saved filter definitions without inventing fields', () => {
  assert.deepEqual(parseSavedFilterDefinition('{"q":"t:12","w":"all","rules":null}'), { q: 't:12', w: 'all', rules: null });
  assert.deepEqual(parseSavedFilterDefinition('t:12'), { q: 't:12' });
  assert.deepEqual(executableRequest({ q: 't:12', w: 'all', ui_name: 'Places', rules: null }), { q: 't:12', w: 'all' });
});
