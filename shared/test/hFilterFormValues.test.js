import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from './helpers/fakeDom.js';

const document = installFakeDom();
const { HFilterForm } = await import('../src/widgets/filter/HFilterForm.js');
const { resolveQueryParameters, describeQueryParameters, exactParameterNames } = await import('../src/data/queryParameters.js');

// field 26 = enum (vocabulary 100), field 1 = text
const TREE = { id: 100, children: [{ id: 11, label: 'France' }, { id: 12, label: 'Italy' }, { id: 13, label: 'Spain' }] };
const dbdefs = {
  fieldGlobal: (id) => ({ 26: { type: 'enum', name: 'Country' }, 1: { type: 'freetext', name: 'Name' } })[id] || null,
  rectypeName: () => '',
  vocabRoot: (id) => (Number(id) === 26 ? 100 : 0),
  termTree: () => TREE,
  termLabel: (id) => ({ 11: 'France', 12: 'Italy', 13: 'Spain' })[id] || '',
  hasUserGroups: () => true,
  groups: () => [{ id: 6, name: 'Test group', role: 'member' }],
  users: () => [{ id: 5, name: 'timma' }]
};

/** Records API stub: answers detail=values from a table and records the requests. */
function valuesApi(table) {
  const requests = [];
  return {
    requests,
    async get(path, { query }) {
      requests.push(structuredClone(query));
      const rows = table[query.field] || [];
      return { total: rows.length, values: rows };
    }
  };
}

function mountForm(query, filterForm, apiClient = null) {
  const host = document.createElement('div');
  document.body.append(host);
  const submits = [];
  const form = new HFilterForm().attach(host, {
    definition: { query, filterForm },
    dbdefs,
    apiClient,
    onSubmit: (event) => submits.push(event.query.q)
  }).render();
  return { form, submits };
}

const layoutOf = (children, settings) => ({ version: 1, ...(settings ? { settings } : {}), groups: [{ id: 'main', children }] });

test('exact text parameters become exact matches, several values an OR group', () => {
  const layout = layoutOf([{ input: 'X1', exact: true }]);
  assert.deepEqual([...exactParameterNames(layout)], ['X1']);
  const query = [{ t: '10' }, { 'f:1': '$X1$' }];
  assert.deepEqual(resolveQueryParameters(query, { X1: 'France' }, layout).q, [{ t: '10' }, { 'f:1': '=France' }]);
  assert.deepEqual(resolveQueryParameters(query, { X1: ['France', 'Italy'] }, layout).q,
    [{ t: '10' }, { any: [{ 'f:1': '=France' }, { 'f:1': '=Italy' }] }]);
  assert.deepEqual(resolveQueryParameters([{ 'f:1': '-$X1$' }], { X1: ['a', 'b'] }, layout).q,
    [{ all: [{ 'f:1': '!=a' }, { 'f:1': '!=b' }] }]);
  assert.deepEqual(resolveQueryParameters(query, { X1: [] }, layout).q, [{ t: '10' }]);
  // without the layout the template value is substituted as before
  assert.deepEqual(resolveQueryParameters(query, { X1: 'France' }).q, [{ t: '10' }, { 'f:1': 'France' }]);
});

test('parameters record their predicate, record type and nesting', () => {
  const described = describeQueryParameters(
    [{ t: '10' }, { owner: '$X1$' }, { 'lt:240': [{ t: '48' }, { 'f:1': '$X2$' }] }], dbdefs);
  assert.deepEqual([described.X1.predicate, described.X1.nested], ['owner', false]);
  assert.deepEqual([described.X2.predicate, described.X2.recordTypeId, described.X2.nested], ['f', '48', true]);
});

test('enum with facets lists only occurring terms and counts over the other values', async () => {
  const api = valuesApi({ 26: [{ value: 12, count: 4 }] });
  const query = [{ t: '10' }, { 'f:26': '$X1$' }, { 'f:1': '$X2$' }];
  const { form } = mountForm(query, layoutOf([
    { input: 'X1', facets: true, mode: 'checkbox' }, { input: 'X2', mode: 'select', exact: true }
  ]), api);
  await flush();
  const country = form.inputs.get('X1');
  assert.deepEqual(country.listHost.querySelectorAll('label').map((label) => label.querySelector('span').textContent), ['Italy']);
  // facet request leaves X1 itself out
  const facetRequest = api.requests.find((request) => request.field === '26');
  assert.deepEqual(facetRequest.q, [{ t: '10' }]);
  assert.equal(facetRequest.detail, 'values');

  // choosing a name recounts the country facet over it (exact match)
  form.inputs.get('X2').setValue('Rossi');
  form.inputs.get('X2').notifyChange();
  await flush(350);
  const recount = api.requests.filter((request) => request.field === '26').at(-1);
  assert.deepEqual(recount.q, [{ t: '10' }, { 'f:1': '=Rossi' }]);
});

test('text in a list mode lists server values as strings; without the API it stays direct input', async () => {
  const api = valuesApi({ 1: [{ value: 'Rossi', count: 3 }, { value: '12', count: 1 }] });
  const query = [{ t: '10' }, { 'f:1': '$X1$' }];
  const { form, submits } = mountForm(query, layoutOf([{ input: 'X1', mode: 'radio', exact: true }]), api);
  await flush();
  const input = form.inputs.get('X1');
  assert.equal(input.constructor.name, 'HInputEnum');
  input.choices[1].checked = true;
  input.choices[1].fire('change');
  assert.equal(input.getValue(), '12');
  assert.deepEqual(submits.at(-1), [{ t: '10' }, { 'f:1': '=12' }]);

  const { form: offline } = mountForm(query, layoutOf([{ input: 'X1', mode: 'radio', exact: true }]));
  assert.equal(offline.inputs.get('X1').constructor.name, 'HInputText');
});

test('owner parameters pick from visible groups and users', () => {
  const { form } = mountForm([{ owner: '$X1$' }], layoutOf([{ input: 'X1' }]));
  const input = form.inputs.get('X1');
  assert.equal(input.constructor.name, 'HInputEnum');
  assert.ok(input.combo, 'owner uses the picker');
});

test('enum without facets still lists the whole vocabulary', async () => {
  const { form } = mountForm([{ 'f:26': '$X1$' }], layoutOf([{ input: 'X1', mode: 'radio' }], { listThreshold: 2 }));
  await flush();
  const input = form.inputs.get('X1');
  // form-wide list size 2: two explicit terms and a picker for the rest
  assert.equal(input.choices.length, 2);
  assert.equal(input.moreHost.hidden, false);
});

test('accordion view collapses list presentations only', () => {
  const query = [{ t: '10' }, { 'f:26': '$X1$' }, { 'f:26': '$X2$' }, { 'f:1': '$X3$' }];
  const { form } = mountForm(query, layoutOf(
    [{ input: 'X1', mode: 'radio' }, { input: 'X2' }, { input: 'X3' }], { accordion: true }));
  const collapsible = ['X1', 'X2', 'X3'].map((id) => form.inputs.get(id).container.classList.contains('is-collapsible'));
  assert.deepEqual(collapsible, [true, false, false]);
  return form.destroy();
});

test('a slider without bounds requests detail=minmax and shows the sliders', async () => {
  const requests = [];
  const api = { async get(path, { query }) { requests.push(query); return { min: 3, max: 40, count: 12 }; } };
  const query = [{ t: '10' }, { 'f:1160': '$X1$<>$X1_to$' }];
  const numberDefs = { ...dbdefs, fieldGlobal: () => ({ type: 'integer', name: 'Size' }) };
  const host = document.createElement('div');
  document.body.append(host);
  const form = new HFilterForm().attach(host, {
    definition: { query, filterForm: layoutOf([{ input: 'X1', widget: { type: 'range', control: 'slider' } }]) },
    dbdefs: numberDefs,
    apiClient: api
  }).render();
  const input = form.inputs.get('X1');
  assert.equal(input.sliders, undefined, 'no sliders before the bounds arrive');
  await flush();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].detail, 'minmax');
  assert.equal(requests[0].field, '1160');
  assert.deepEqual(requests[0].q, [{ t: '10' }]);
  assert.deepEqual(input.sliders.map((slider) => [slider.min, slider.max]), [['3', '40'], ['3', '40']]);
  await form.destroy();

  // configured bounds: no request
  requests.length = 0;
  const fixed = new HFilterForm().attach(document.createElement('div'), {
    definition: { query, filterForm: layoutOf([{ input: 'X1', widget: { type: 'range', control: 'slider', min: 1, max: 5 } }]) },
    dbdefs: numberDefs,
    apiClient: api
  }).render();
  await flush();
  assert.equal(requests.length, 0);
  return fixed.destroy();
});

test('a date list of ranges requests detail=ranges and submits the picked range', async () => {
  const requests = [];
  const api = { async get(path, { query }) {
    requests.push(query);
    return { buckets: [{ from: '1990', to: '1999', label: '1990–1999', count: 4 }, { from: '2000', to: '2009', label: '2000–2009', count: 2 }] };
  } };
  const dateDefs = { ...dbdefs, fieldGlobal: () => ({ type: 'date', name: 'Start' }) };
  const host = document.createElement('div');
  document.body.append(host);
  const submits = [];
  const form = new HFilterForm().attach(host, {
    definition: { query: [{ t: '10' }, { 'f:10': '><$X1$/$X1_to$' }],
      filterForm: layoutOf([{ input: 'X1', mode: 'radio', groupBy: 'decade' }]) },
    dbdefs: dateDefs,
    apiClient: api,
    onSubmit: (event) => submits.push(event.query.q)
  }).render();
  await flush();
  assert.equal(requests[0].detail, 'ranges');
  assert.equal(requests[0].groupby, 'decade');
  assert.equal(requests[0].match, 'within', '"><" counts spans within a range');
  const input = form.inputs.get('X1');
  assert.deepEqual(input.choices.map((choice) => choice.value), ['1990/1999', '2000/2009']);
  input.choices[1].checked = true;
  input.choices[1].fire('change');
  await flush();
  assert.deepEqual(submits.at(-1), [{ t: '10' }, { 'f:10': '><2000/2009' }]);
  return form.destroy();
});

test('auto slider without values shows a note instead of the slider', async () => {
  const api = { async get() { return { min: null, max: null, count: 0 }; } };
  const numberDefs = { ...dbdefs, fieldGlobal: () => ({ type: 'integer', name: 'Size' }) };
  const form = new HFilterForm().attach(document.createElement('div'), {
    definition: { query: [{ 'f:3': '$X1$<>$X1_to$' }],
      filterForm: layoutOf([{ input: 'X1', widget: { type: 'range', control: 'slider' } }]) },
    dbdefs: numberDefs,
    apiClient: api
  }).render();
  await flush();
  const input = form.inputs.get('X1');
  assert.equal(input.sliders, undefined);
  assert.equal(input.noteElement.textContent, 'No values');
  return form.destroy();
});
