import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
const { HRecordManager, userDataRecordTypeIds } = await import('../src/widgets/record-manager/HRecordManager.js');

/** HDbDefs stand-in: types 10 Person, 11 Place, 60 file (RT_REGISTERED_FILE), 70 query source (system). */
const dbdefs = {
  dbconst: (code) => ({ RT_REGISTERED_FILE: 60, RT_QUERY_SOURCE: 70 })[code] || 0,
  rectypes: () => [{ id: 10, name: 'Person' }, { id: 11, name: 'Place' }, { id: 60, name: 'File' }, { id: 70, name: 'Query source' }],
  rectypeName: (id) => ({ 10: 'Person', 11: 'Place', 60: 'File', 70: 'Query source' })[id] || ''
};

/** A manager with a stand-in list (the fake DOM can not render the HRecordList template). */
function manager(options = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const events = [];
  for (const type of ['h-record-manager-finish', 'h-record-manager-selection']) {
    host.addEventListener(type, (event) => events.push({ type, ids: event.detail.ids }));
  }
  const widget = new HRecordManager().attach(host, { apiClient: {}, dbdefs, ...options });
  const calls = [];
  widget.list = {
    reload: async () => calls.push('reload'),
    setSelection: async (ids) => calls.push(['setSelection', ids]),
    destroy: async () => {}
  };
  widget.loader = { query: [], setQuery: () => calls.push('setQuery'), abort: () => {} };
  return { widget, events, calls };
}

test('unconstrained lists only user-data types on /records', () => {
  assert.deepEqual(userDataRecordTypeIds(dbdefs), [10, 11]);
});

test('query of the record types plus the browse filter conditions', () => {
  const { widget } = manager({ recordTypes: [10, 11], query: [{ f: 'x' }] });
  assert.deepEqual(widget._query([10, 11]), [{ t: '10,11' }, { f: 'x' }]);
});

test('list options: top bar, single selection in select mode, no engine switch or source actions', () => {
  const single = manager({ recordTypes: [10], selectMode: 'select' }).widget._listOptions();
  assert.equal(single.topBar, true);
  assert.equal(single.selectionMode, 'single');
  assert.equal(single.engineSwitch, false);
  assert.equal(single.sourceActionsEnabled, false);
  assert.equal(single.interaction.editEnabled, false);
  const multi = manager({ recordTypes: [10], selectMode: 'select_multi', editRecord: () => {} }).widget._listOptions();
  assert.equal(multi.selectionMode, 'multi');
  assert.equal(multi.interaction.editEnabled, true);
});

test('Add buttons: one per type the user can add; one Add record unconstrained; none without addRecord or allowAddition false', () => {
  const { widget } = manager({ recordTypes: [10, 11], addRecord: async () => ({}), canAddRecordType: (id) => id === 10 });
  const bar = widget._renderAddBar();
  const buttons = bar.querySelectorAll('button');
  assert.ok(buttons[0].classList.contains('h-btn-primary'));
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].dataset.rectypeId, '10');
  assert.equal(buttons[0].querySelector('span').textContent, 'Add new Person');
  // unconstrained: one "Add record" button, the host asks for the type (addRecord(null), Phase 4)
  const asked = [];
  const any = manager({ recordTypes: [], addRecord: async (id) => { asked.push(id); return {}; } }).widget._renderAddBar();
  const anyButton = any.querySelectorAll('button');
  assert.equal(anyButton.length, 1);
  assert.equal(anyButton[0].querySelector('span').textContent, 'Add record');
  anyButton[0].click();
  assert.deepEqual(asked, [null]);
  assert.equal(manager({ recordTypes: [], addRecord: async () => ({}), canAddRecordType: (id) => id !== null }).widget._renderAddBar(), null);
  assert.equal(manager({ recordTypes: [10] }).widget._renderAddBar(), null);
  assert.equal(manager({ recordTypes: [10], addRecord: async () => ({}), allowAddition: false }).widget._renderAddBar(), null);
});

test('select mode: a saved new record is the selection and the manager finishes', async () => {
  const { widget, events } = manager({ recordTypes: [10], addRecord: async () => ({ saved: true, recordId: 55 }) });
  await widget._add(10);
  assert.deepEqual(events.at(-1), { type: 'h-record-manager-finish', ids: [55] });
});

test('an add that was not saved changes nothing', async () => {
  const { widget, events } = manager({ recordTypes: [10], addRecord: async () => ({ saved: false }) });
  await widget._add(10);
  assert.equal(events.length, 0);
});

test('manager mode: after an add the list reloads and selects the new record; no finish', async () => {
  const { widget, events, calls } = manager({ recordTypes: [10], selectMode: 'manager', addRecord: async () => ({ saved: true, recordId: 56 }) });
  await widget._add(10);
  assert.ok(calls.includes('reload'));
  assert.deepEqual(calls.at(-1), ['setSelection', [56]]);
  assert.equal(events.some((event) => event.type === 'h-record-manager-finish'), false);
  assert.deepEqual(widget.getSelection(), [56]);
});

test('Select: last selected in select mode, all in select_multi; nothing without a selection', () => {
  const one = manager({ recordTypes: [10], selectMode: 'select' });
  assert.deepEqual(one.widget.select(), []);
  assert.equal(one.events.length, 0);
  one.widget._selectionChanged([3, 4]);
  assert.deepEqual(one.widget.select(), [4]);
  assert.deepEqual(one.events.at(-1), { type: 'h-record-manager-finish', ids: [4] });
  const many = manager({ recordTypes: [10], selectMode: 'select_multi' });
  many.widget._selectionChanged([3, 4]);
  assert.deepEqual(many.events.at(-1), { type: 'h-record-manager-selection', ids: [3, 4] });
  assert.deepEqual(many.widget.select(), [3, 4]);
  assert.deepEqual(many.events.at(-1), { type: 'h-record-manager-finish', ids: [3, 4] });
});

test('manager mode needs record types', () => {
  assert.throws(() => new HRecordManager().attach(document.createElement('div'), { dbdefs, selectMode: 'manager' }), /needs record types/);
});

/** A RecordTitleSource stand-in. */
function titleSource() {
  return {
    labels: new Map(),
    types: new Map(),
    labelFor(id) { return this.labels.get(Number(id)); },
    rectypeFor(id) { return this.types.get(Number(id)) || null; },
    async fetchLabels(ids) { for (const id of ids) this.labels.set(Number(id), `Record ${id}`); },
    rememberLabel(id, title, rectype) {
      this.labels.set(Number(id), title);
      if (rectype) this.types.set(Number(id), Number(rectype));
    },
    async load() { return { items: [], total: 0, complete: true }; }
  };
}

/** An HInputResource rendered in the fake DOM. */
async function resourceInput(options) {
  const { HInputResource } = await import('../src/widgets/form/inputs/HInputResource.js');
  const host = document.createElement('div');
  document.body.append(host);
  const input = new HInputResource().attach(host, { source: titleSource(), dbdefs, ...options });
  input.render();
  return input;
}

/** Let pending promise callbacks run. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('pointer mode: stored values kept; addorbrowse (the column default) on system targets = dropdown_add', async () => {
  const { resolvePointerMode } = await import('../src/data/recordEditStructure.js');
  assert.equal(resolvePointerMode('addorbrowse', [10], dbdefs), 'addorbrowse');
  assert.equal(resolvePointerMode('', [10], dbdefs), 'addorbrowse');
  assert.equal(resolvePointerMode('browseonly', [70], dbdefs), 'browseonly');
  assert.equal(resolvePointerMode('addorbrowse', [70], dbdefs), 'dropdown_add');
  assert.equal(resolvePointerMode(null, [70], dbdefs), 'dropdown_add');
  // files are user data here; mixed or unconstrained targets keep addorbrowse
  assert.equal(resolvePointerMode('addorbrowse', [60], dbdefs), 'addorbrowse');
  assert.equal(resolvePointerMode('addorbrowse', [70, 10], dbdefs), 'addorbrowse');
  assert.equal(resolvePointerMode('addorbrowse', [], dbdefs), 'addorbrowse');
  assert.equal(resolvePointerMode('nonsense', [10], dbdefs), 'addorbrowse');
});

test('edit structure: pointer types from the base field only; pointerMode and browseFilter', async () => {
  const { buildEditStructure, EDIT_STRUCTURE_DETAILS } = await import('../src/data/recordEditStructure.js');
  assert.match(EDIT_STRUCTURE_DETAILS, /rst_PointerMode/);
  assert.doesNotMatch(EDIT_STRUCTURE_DETAILS, /rst_PtrFilteredIDs|rst_FilteredJsonTermIDTree/);
  const structure = buildEditStructure([
    { rst_DetailTypeID: 5, dty_Type: 'resource', rst_DisplayName: 'Layer', rst_PtrFilteredIDs: '10', dty_PtrTargetRectypeIDs: '70',
      rst_PointerMode: 'addorbrowse', rst_PointerBrowseFilter: ' f:1:x ' },
    { rst_DetailTypeID: 6, dty_Type: 'enum', rst_DisplayName: 'Kind', rst_FilteredJsonTermIDTree: '99', dty_JsonTermIDTree: '42' }
  ], { rty: 24, dbdefs });
  const [layer, kind] = structure.groups[0].children;
  assert.deepEqual(layer.targetTypes, [70]);
  assert.equal(layer.pointerMode, 'dropdown_add');
  assert.equal(layer.browseFilter, 'f:1:x');
  assert.equal(kind.vocabulary, 42);
  assert.equal(kind.pointerMode, undefined);
});

test('browse filter: JSON conditions, a saved filter object, keyword text', async () => {
  const { browseFilterQuery } = await import('../src/widgets/record-manager/HRecordManager.js');
  assert.equal(browseFilterQuery(''), null);
  assert.equal(browseFilterQuery(null), null);
  assert.deepEqual(browseFilterQuery('[{"f:1":"x"}]'), [{ 'f:1': 'x' }]);
  assert.deepEqual(browseFilterQuery('{"q":[{"t":"5"}],"rules":[]}'), [{ t: '5' }]);
  assert.equal(browseFilterQuery('f:1:x sortby:t'), 'f:1:x sortby:t');
  const { widget } = manager({ recordTypes: [10, 11], query: 'f:1:x' });
  assert.equal(widget._query([10, 11]), 't:10,11 f:1:x');
});

test('HInputResource dropdown_add: value picker with Browse and Add after its filter input', async () => {
  const asked = [];
  const input = await resourceInput({
    pointerMode: 'dropdown_add', targetTypes: [10], showBrowse: true,
    browseRecords: async (options) => { asked.push(options); return [42]; },
    addRecord: async () => ({ saved: true, recordId: 43, record: { rec_Title: '<b>New</b> one' } })
  });
  assert.ok(input.combo, 'value picker');
  assert.deepEqual(input.combo.picker.actions.map((action) => action.id), ['browse', 'add']);
  await input.combo.picker.actions[0].run();
  assert.equal(input.getValue(), 42);
  assert.equal(asked[0].allowAddition, true);
  await input.combo.picker.actions[1].run();
  assert.equal(input.getValue(), 43);
  assert.equal(input.source.labelFor(43), 'New one');
});

test('HInputResource dropdown: Browse only; no Browse without showBrowse (filter forms) or browseRecords', async () => {
  const browse = async () => [1];
  const dropdown = await resourceInput({ pointerMode: 'dropdown', targetTypes: [10], showBrowse: true, browseRecords: browse, addRecord: async () => ({}) });
  assert.deepEqual(dropdown.combo.picker.actions.map((action) => action.id), ['browse']);
  const filterForm = await resourceInput({ pointerMode: 'dropdown_add', targetTypes: [10], browseRecords: browse });
  assert.deepEqual(filterForm.combo.picker.actions, []);
});

test('HInputResource addorbrowse / browseonly: no dropdown; a click on the input opens the manager', async () => {
  const asked = [];
  const browseRecords = async (options) => { asked.push(options); return [7]; };
  const input = await resourceInput({ pointerMode: 'addorbrowse', targetTypes: [10, 11], showBrowse: true, browseRecords,
    addRecord: async () => ({}), browseFilter: 'f:1:x' });
  assert.equal(input.combo, undefined);
  assert.ok(input.modeButton);
  assert.equal(input.modeButtonText.textContent, 'Select record…');
  input.modeButton.click();
  await tick();
  assert.deepEqual(asked[0], { recordTypes: [10, 11], selectMode: 'select', allowAddition: true, query: 'f:1:x' });
  assert.equal(input.getValue(), 7);
  assert.equal(input.modeButtonText.textContent, 'Record 7');
  const only = await resourceInput({ pointerMode: 'browseonly', targetTypes: [10], showBrowse: true, browseRecords, addRecord: async () => ({}) });
  await only._browse();
  assert.equal(asked[1].allowAddition, false);
  // without the record manager: the value picker
  const plain = await resourceInput({ pointerMode: 'addorbrowse', targetTypes: [10] });
  assert.ok(plain.combo);
});

test('HInputResource addonly: "Add <type>" button; a click on the empty input adds a record', async () => {
  let added = 0;
  const input = await resourceInput({ pointerMode: 'addonly', targetTypes: [10], addRecord: async (id) => { added = id; return { saved: true, recordId: 9 }; } });
  assert.equal(input.modeButtonText.textContent, 'Add Person');
  input.modeButton.click();
  await tick();
  await tick();
  assert.equal(added, 10);
  assert.equal(input.getValue(), 9);
  assert.equal(input.modeButtonText.textContent, 'Record 9');
  // several types: "Add record"; without addRecord: the value picker
  const several = await resourceInput({ pointerMode: 'addonly', targetTypes: [10, 11], addRecord: async () => ({}) });
  assert.equal(several.modeButtonText.textContent, 'Add record');
  const plain = await resourceInput({ pointerMode: 'addonly', targetTypes: [10] });
  assert.ok(plain.combo);
});

test('HValuePicker actions: the filter row is shown; a click tells the combo and runs the action', async () => {
  const { HValuePicker } = await import('../src/widgets/picker/HValuePicker.js');
  const host = document.createElement('div');
  document.body.append(host);
  let ran = 0;
  const events = [];
  host.addEventListener('h-value-picker-action', (event) => events.push(event.detail.id));
  const picker = new HValuePicker().attach(host, {
    source: titleSource(),
    actions: [{ id: 'browse', icon: 'fa-table', title: 'Browse', run: () => { ran++; } }]
  }).render();
  await picker.load();
  assert.equal(picker.filterRow.hidden, false);
  picker.filterRow.querySelector('.h-value-picker-action').click();
  assert.equal(ran, 1);
  assert.deepEqual(events, ['browse']);
});

test('HEditField: a repeatable pointer selects several records; new ones become values, known ones are skipped', async () => {
  const { HEditField } = await import('../src/widgets/edit-form/HEditField.js');
  const apiClient = { get: async () => ({ records: [] }), post: async () => ({ records: [] }) };
  const asked = [];
  const field = new HEditField().attach(document.createElement('div'), {
    field: { dty: 5, name: '5', type: 'resource', label: 'Persons', max: 0, targetTypes: [10], pointerMode: 'addorbrowse' },
    state: { values: [{ value: 3, hidden: false }, { value: 4, hidden: false }], translations: [] },
    dbdefs,
    apiClient,
    browseRecords: async (options) => { asked.push(options); return [4, 5, 6, 5]; }
  }).render();
  const ids = await field._browsePointer(field._rows[0].entry, { recordTypes: [10], selectMode: 'select' });
  assert.equal(asked[0].selectMode, 'select_multi');
  // 4 is the other value: skipped; 5 for this value, 6 a new value
  assert.deepEqual(ids, [5]);
  assert.equal(field._rows.length, 3);
  assert.equal(field._rows[2].input.getValue(), 6);
  // a field with one value at most selects one record
  const single = new HEditField().attach(document.createElement('div'), {
    field: { dty: 6, name: '6', type: 'resource', label: 'Layer', max: 1, targetTypes: [10], pointerMode: 'addorbrowse' },
    state: { values: [], translations: [] },
    dbdefs,
    apiClient,
    browseRecords: async (options) => { asked.push(options); return [8, 9]; }
  }).render();
  assert.deepEqual(await single._browsePointer(single._rows[0].entry, {}), [8]);
  assert.equal(asked[1].selectMode, 'select');
  assert.equal(single._rows.length, 1);
});

test('built-in filters: files for RT_REGISTERED_FILE (fields by concept code), generic for other types', async () => {
  const { builtinRecordFilter, fileFilter } = await import('../src/data/recordManagerFilters.js');
  const { describeQueryParameters, resolveQueryParameters } = await import('../src/data/queryParameters.js');
  const concepts = { '2-1185': 201, '2-1': 1, '2-1186': 202, '2-29': 203, '2-67': 204 };
  const defs = { ...dbdefs, localId: (kind, code) => (kind === 'dty' ? concepts[code] || 0 : 0) };
  const files = builtinRecordFilter(defs, [60]);
  assert.equal(files.id, 'files');
  assert.deepEqual(files.query, [
    { 'f:201': '$FILENAME$' }, { url: '$URL$' }, { 'f:1': '$CAPTION$' },
    { 'f:202': '$FILETYPE$' }, { 'f:203': '$MIMETYPE$' }, { 'f:204': '$SIZE$<>$SIZE_TO$' }
  ]);
  assert.deepEqual(files.filterForm.groups[0].children.map((child) => child.input),
    ['FILENAME', 'URL', 'CAPTION', 'FILETYPE', 'MIMETYPE', 'SIZE']);
  // the size is one range input; the empty parameters are left out of the query
  assert.equal(describeQueryParameters(files.query, defs).SIZE.endInput, 'SIZE_TO');
  assert.deepEqual(resolveQueryParameters(files.query, { CAPTION: 'map', SIZE: '1000' }, files.filterForm).q,
    [{ 'f:1': 'map' }, { 'f:204': '>=1000' }]);
  // a field the database lacks is left out
  const fewer = fileFilter({ localId: (kind, code) => (code === '2-1' ? 1 : 0) });
  assert.deepEqual(fewer.query, [{ url: '$URL$' }, { 'f:1': '$CAPTION$' }]);
  // other types, several types, unconstrained: generic (title, tag)
  for (const types of [[10], [60, 10], []]) {
    const generic = builtinRecordFilter(defs, types);
    assert.equal(generic.id, 'generic');
    assert.deepEqual(generic.query, [{ title: '$TITLE$' }, { tag: '$TAG$' }]);
  }
});

test('filter of the manager: the built-in one; none with a browse filter or filter: false', () => {
  assert.equal(manager({ recordTypes: [10] }).widget.filterDefinition().id, 'generic');
  assert.equal(manager({ recordTypes: [10], query: 'f:1:x' }).widget.filterDefinition(), null);
  assert.equal(manager({ recordTypes: [10], filter: false }).widget.filterDefinition(), null);
  const own = { query: [{ title: '$X$' }], filterForm: null };
  assert.equal(manager({ recordTypes: [10], filter: own }).widget.filterDefinition(), own);
});

test('Filter adds its conditions to the record type query; Reset removes them', async () => {
  const { widget, calls } = manager({ recordTypes: [10, 11] });
  const queries = [];
  widget.loader.setQuery = (query) => queries.push(query);
  await widget.applyFilter([{ title: 'abc' }, null]);
  assert.deepEqual(queries.at(-1), [{ t: '10,11' }, { title: 'abc' }]);
  assert.ok(calls.includes('reload'));
  await widget.applyFilter([]);
  assert.deepEqual(queries.at(-1), [{ t: '10,11' }]);
});

test('the filter form pane: west for a vertical form, Filter and Reset reach the list', async () => {
  globalThis.Node ??= globalThis.HTMLElement;
  const { widget } = manager({ recordTypes: [10] });
  const applied = [];
  widget.applyFilter = async (conditions) => { applied.push(conditions); };
  const listHost = document.createElement('div');
  widget._renderFilter(listHost);
  assert.ok(widget.filterForm, 'filter form');
  assert.ok(widget.layout.getRegionElement('center').children.includes(listHost));
  assert.ok(widget.layout.getRegionElement('west').children[0].classList.contains('h-record-manager-filter'));
  widget.filterForm.inputs.get('TITLE').setValue('abc');
  widget.filterForm.container.querySelector('.h-btn-primary').click();
  assert.deepEqual(applied.at(-1), [{ title: 'abc' }]);
  widget.filterForm.reset();
  assert.deepEqual(applied.at(-1), []);
});

test('record list of the manager: Sort and Show owners; no selection menu for one record; no type sort for files', async () => {
  const single = manager({ recordTypes: [10], selectMode: 'select' }).widget._listOptions();
  assert.equal(single.listTools, true);
  assert.equal(single.controls.selectionActions, false);
  const multi = manager({ recordTypes: [10], selectMode: 'select_multi' }).widget._listOptions();
  assert.equal(multi.controls.selectionActions, undefined, 'the menu stays for several records');
  const { createSortSelect, createOwnersCheckbox } = await import('../src/widgets/record-list/ListToolControls.js');
  const sort = createSortSelect({ value: 'title', exclude: ['type'], onChange: () => {} });
  const tokens = sort.querySelector('select').children.map((option) => option.value);
  assert.equal(tokens.includes('type'), false);
  assert.ok(tokens.includes('-modified'));
  let shown = null;
  const owners = createOwnersCheckbox({ checked: false, onChange: (value) => { shown = value; } });
  owners.checkbox.checked = true;
  owners.checkbox.dispatchEvent(new Event('change'));
  assert.equal(shown, true);
});

test('pointer input: record type icon of the chosen record before the picker', async () => {
  const iconBase = { baseUrl: 'http://host/heurist/', database: 'db' };
  const input = await resourceInput({ value: 5, valueLabel: 'Five', valueRectype: 12, targetTypes: [10, 12], iconBase });
  const icon = input.container.querySelector('.h-input-resource-icon');
  assert.deepEqual([...icon.parentElement.children].map((node) => node.className.split(' ')[0]), ['h-input-resource-icon', 'h-input-resource-picker']);
  assert.equal(icon.hidden, false);
  assert.match(icon.getAttribute('src'), /\?db=db&icon=12&/);
  input.setValue(null);
  assert.equal(icon.hidden, true, 'no icon without a record');
  // type unknown: the only allowed type
  const one = await resourceInput({ value: 7, targetTypes: [10], iconBase, pointerMode: 'addorbrowse' });
  assert.match(one.container.querySelector('.h-input-resource-icon').getAttribute('src'), /icon=10&/);
});

test('host Add actions replace the type buttons; a run gives the new record (registered files, plan 20)', async () => {
  const { widget, events } = manager({
    recordTypes: [60],
    addActions: [
      { id: 'upload', icon: 'fa-upload', label: 'Upload and register a new file', run: async () => ({ saved: true, recordId: 91 }) },
      { id: 'url', icon: 'fa-link', label: 'Register an external resource (URL)', run: async () => ({ saved: false }) }
    ]
  });
  const buttons = widget._renderAddBar().querySelectorAll('button');
  assert.deepEqual(buttons.map((button) => button.dataset.action), ['upload', 'url']);
  assert.equal(buttons[0].querySelector('span').textContent, 'Upload and register a new file');
  buttons[0].click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(events.at(-1), { type: 'h-record-manager-finish', ids: [91] });
});

test('a filter form hides the search box of the list', () => {
  const filter = { query: [], filterForm: { settings: {}, items: [] } };
  assert.equal(manager({ recordTypes: [10], filter }).widget._listOptions().controls.search, false);
  assert.equal(manager({ recordTypes: [10], filter: false }).widget._listOptions().controls.search, undefined);
});
