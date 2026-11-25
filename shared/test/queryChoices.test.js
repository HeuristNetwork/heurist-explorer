/**
 * @file queryChoices.test.js
 * @brief The one list of query sources and saved filters (review 7 of plan 27q2, query-choice-picker.md): names, both
 *        kinds mixed, the scopes, the marks; disabled items of HValuePicker are not picked.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

installFakeDom();

const { listQueryChoices, queryChoiceTerms, findQueryChoice } = await import('../src/data/queryChoices.js');
const { HValuePicker } = await import('../src/widgets/picker/HValuePicker.js');
const { StaticSource } = await import('../src/data/valueSources/localSources.js');

/** An API client: the record type of query sources, their records and the saved filters of `/sys`. */
function client(calls) {
  return {
    get: async (path, options = {}) => {
      calls.push({ path, query: options.query });
      if (path.startsWith('/def') || path.includes('rectypes')) return { records: [{ rty_ID: 29, rty_OriginatingDBID: 3, rty_IDInOriginatingDB: 1021 }] };
      if (path === '/records/') {
        return { records: [
          { rec_ID: 5, rec_Title: 'Title of Zeta', details: { 1: [{ value: 'Zeta' }], 12: ['[{"t":"10"},{"title":"$A$"}]'] } },
          { rec_ID: 6, rec_Title: 'Title of Alpha', details: { 1: [{ value: 'Alpha' }], 12: ['[{"t":"12"}]'] } }
        ] };
      }
      if (path === '/sys') return [{ rec_ID: 7, rec_Title: 'Middle filter', details: { query: '[{"t":"10"}]' } }];
      return null;
    }
  };
}

const dbdefs = { localId: () => 12, dbconst: (name) => ({ DT_NAME: 1, DT_FILTER_FORM: 0 }[name] || 0) };

test('one list: query sources by their names and saved filters, mixed and sorted; the website scope', async (t) => {
  const { RecordTypeProvider } = await import('../src/data/RecordTypeProvider.js');
  t.mock.method(RecordTypeProvider.prototype, 'getIdByConceptCode', async () => 29);
  const calls = [];
  const choices = await listQueryChoices({ apiClient: client(calls), dbdefs, scope: 'user', ownerIds: () => [0, 4, 2] });
  assert.deepEqual(choices.map((choice) => [choice.value, choice.label, choice.parameterized]),
    [['source:6', 'Alpha', false], ['filter:7', 'Middle filter', false], ['source:5', 'Zeta', true]]);
  assert.equal(calls.find((call) => call.path === '/sys').query.q.owner, '0,4,2');
  assert.equal(findQueryChoice(choices, 'filter:7').kind, 'filter');
  assert.deepEqual(queryChoiceTerms(choices).map((term) => term.marks), [[], ['filter'], ['parametrized']]);
  // website: public query sources, the saved filters of "Website filters"
  const website = [];
  await listQueryChoices({ apiClient: client(website), dbdefs, scope: 'website' });
  assert.equal(website.find((call) => call.path === '/sys').query.q.owner, '4');
  assert.deepEqual(website.find((call) => call.path === '/records/').query.q.at(-1), { access: 'public' });
});

test('the list is kept for a while: a picker opened again does not read it again (27q3 review 4)', async (t) => {
  const { RecordTypeProvider } = await import('../src/data/RecordTypeProvider.js');
  t.mock.method(RecordTypeProvider.prototype, 'getIdByConceptCode', async () => 29);
  const calls = [];
  const apiClient = client(calls);
  await listQueryChoices({ apiClient, dbdefs, scope: 'user' });
  const read = calls.length;
  await listQueryChoices({ apiClient, dbdefs, scope: 'user' });
  assert.equal(calls.length, read, 'kept');
  await listQueryChoices({ apiClient, dbdefs, scope: 'user', fresh: true });
  assert.ok(calls.length > read, 'read again');
});

test('HValuePicker: a disabled item is shown with its marks and tooltip, not picked', () => {
  const host = document.createElement('div');
  const picked = [];
  const picker = new HValuePicker().attach(host, {
    source: new StaticSource([{ value: 'a', label: 'A', marks: ['filter'] }, { value: 'b', label: 'B', disabled: true, title: 'Why' }]),
    onPick: (item) => picked.push(item.value)
  }).render();
  picker.pick({ value: 'b', disabled: true });
  picker.pick({ value: 'a' });
  assert.deepEqual(picked, ['a']);
});
