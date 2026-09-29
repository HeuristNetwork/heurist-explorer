import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM stand-in: HFieldTree._renderBody only builds buttons/divs.
function fakeElement(tag) {
  return {
    tag, children: [], textContent: '', className: '', disabled: false, dataset: {},
    classList: { add() {} },
    append(...nodes) {
      for (const node of nodes) {
        if (typeof node === 'string') this.textContent += node;
        else this.children.push(node);
      }
    },
    replaceChildren() { this.children = []; },
    addEventListener() {}
  };
}
globalThis.document ??= { createElement: fakeElement };

const { HFieldTree } = await import('../src/widgets/filter-builder/HFieldTree.js');

/** Top-level labels rendered for a scope (leaf text is set before its type badge is appended). */
function labelsFor(scope) {
  const tree = new HFieldTree({ dbdefs: { rectypeName: () => '' } });
  Object.assign(tree, {
    _body: fakeElement('div'),
    _rtyId: scope.rtyId,
    _builderMode: scope.builderMode === true,
    _includeHeaders: scope.includeHeaders !== false,
    _excludedFields: new Set()
  });
  tree._renderBody();
  return tree._body.children.map((node) => node.textContent);
}

test('no record type in the Filter Builder -> any field + title + metadata', () => {
  const labels = labelsFor({ rtyId: '', builderMode: true });
  assert.equal(labels[0], 'Any field');
  for (const label of ['Title', 'ID', 'Added', 'Modified', 'Creator', 'URL', 'Owner', 'Visibility']) {
    assert.ok(labels.includes(label), `missing ${label}`);
  }
});

test('no record type outside the Filter Builder still asks for one', () => {
  assert.deepEqual(labelsFor({ rtyId: '' }), ['Choose a record type first']);
});

// Relationship support: a relmarker is a `related` branch that starts with the
// Relationship record's own conditions.
const RELATION_DBDEFS = {
  rectypeName: (id) => ({ 10: 'Person', 1: 'Record relationship' }[id] || ''),
  dbconst: (name) => ({ RT_RELATION: 1, DT_PRIMARY_RESOURCE: 7, DT_TARGET_RESOURCE: 5, DT_RELATION_TYPE: 6 }[name] ?? null),
  fields: (rty) => (rty === 1
    ? [{ id: 7, name: 'Source record', type: 'resource' }, { id: 6, name: 'Relationship type', type: 'relationtype' },
      { id: 5, name: 'Target record', type: 'resource' }, { id: 10, name: 'Start date/time', type: 'date' },
      { id: 1, name: 'Title for relationship', type: 'freetext' }]
    : [{ id: 1, name: 'Name', type: 'freetext' }, { id: 235, name: 'Related Person(s)', type: 'relmarker' }]),
  fieldGlobal: (id) => (id === 235 ? { targetTypes: [10] } : {})
};

function relationTree() {
  const tree = new HFieldTree({ dbdefs: RELATION_DBDEFS });
  Object.assign(tree, {
    _body: fakeElement('div'), _rtyId: 10, _builderMode: true, _includeHeaders: true,
    _excludedFields: new Set(), _maxDepth: 3, _excludedLinks: new Set()
  });
  return tree;
}
// a leaf carries its label; a folder carries it on its head button
const text = (node) => (node.textContent || node.children[0]?.textContent || '').replace(/^[▾▸]\s*/, '');

test('a relmarker in the Filter Builder is a related branch: Relation type first, then Relationship Fields', () => {
  const tree = relationTree();
  const field = tree._fieldNodes(10, []).find((node) => text(node.children[0] || node) === 'Related Person(s)');
  assert.ok(field, 'relmarker folder rendered');
  const key = field.children[0].dataset.treeKey;
  assert.match(key, /related:235$/);

  tree._openKeys.add(key);
  const open = tree._linkFolder({
    label: 'Related Person(s)', key, via: { link: 'related', dty: 235, targetRty: 10 },
    childRtyId: 10, targets: [10], viaChain: []
  });
  const kids = open.children[1].children.map(text);
  assert.deepEqual(kids.slice(0, 3), ['Relation type', 'Relationship Fields', 'Person records']);

  // the Relationship Fields folder omits source, target and type (implied by the branch)
  tree._openKeys.add(tree._relationNodes([])[1].children[0].dataset.treeKey);
  const [, relFields] = tree._relationNodes([]);
  assert.deepEqual(relFields.children[1].children.map(text), ['Start date/time', 'Title for relationship']);
});

test('linked-from list: one entry per field, relmarkers as related (Filter Builder only), sorted alphanumerically', () => {
  const dbdefs = {
    ...RELATION_DBDEFS,
    rectypeName: (id) => ({ 10: 'Person', 48: 'Life event', 2: 'Type 2', 11: 'Type 10' }[id] || ''),
    linkedRectypes: (_rty, { relation }) => (relation ? [48] : [11, 2, 48]),
    pointerFieldsBetween: (from) => ({ 48: [134, 246], 11: [5], 2: [6] }[from] || []),
    fieldGlobal: (id) => ({ type: id === 246 ? 'relmarker' : 'resource', name: `field ${id}` }),
    fieldName: (_rty, id) => ({ 134: 'Place(s)', 246: 'Other persons involved', 5: 'Owner', 6: 'Owner' }[id])
  };
  const tree = new HFieldTree({ dbdefs });
  tree._builderMode = true;
  assert.deepEqual(tree._reverseLinks(10).map((x) => `${x.link} ${x.label}`), [
    'related « Life event · Other persons involved (relationship)',
    'lf « Life event · Place(s)',
    'lf « Type 2 · Owner',
    'lf « Type 10 · Owner'
  ]);
  // field-path editors (not the Filter Builder) get no relationship entries
  tree._builderMode = false;
  assert.ok(tree._reverseLinks(10).every((x) => x.link === 'lf'));
});

test('Escape and the host dialog closing both close the popover', () => {
  const listeners = [];
  globalThis.document.addEventListener ??= (...args) => listeners.push(args);
  globalThis.document.removeEventListener ??= () => {};
  const tree = new HFieldTree({ dbdefs: RELATION_DBDEFS });
  let closed = 0;
  tree.close = () => { closed++; };
  tree.element = {};
  let prevented = false;
  tree._onKeyDown({ key: 'Escape', preventDefault: () => { prevented = true; }, stopPropagation: () => {} });
  assert.equal(closed, 1);
  assert.ok(prevented, 'Escape is consumed so the dialog underneath stays open');
  tree._onKeyDown({ key: 'Enter', preventDefault: () => {}, stopPropagation: () => {} });
  assert.equal(closed, 1);
  tree._onHostClose();
  assert.equal(closed, 2);
});

// Linked-from branches whose source record type has no records are hidden
// (always in field-path editors; per the checkbox in the Filter Builder).
test('linked-from branches skip record types without records when requested', () => {
  const dbdefs = {
    rectypeName: (id) => ({ 10: 'Place', 20: 'Event', 30: 'Letter' }[id] || ''),
    linkedRectypes: () => [20, 30],
    pointerFieldsBetween: (from) => (from === 20 ? [4] : [5]),
    fieldGlobal: () => ({ type: 'resource', name: 'Where' }),
    isRectypeUsed: (id) => id !== 30
  };
  const tree = new HFieldTree({ dbdefs });
  tree._hideUnused = true;
  assert.deepEqual(tree._reverseLinks(10).map((item) => item.fromRty), [20]);
  tree._hideUnused = false;
  assert.deepEqual(tree._reverseLinks(10).map((item) => item.fromRty), [20, 30]);
});

/** All texts of a rendered tree, depth-first (folder heads and leaves). */
function texts(node) {
  return [node.textContent, ...node.children.flatMap((child) => texts(child))].filter(Boolean);
}

function recordTree({ typeFilter = 'all', showMetadata = true } = {}) {
  const fields = [
    { id: 1, name: 'Name', type: 'freetext' }, { id: 2, name: 'Notes', type: 'blocktext' },
    { id: 10, name: 'Start', type: 'date' }, { id: 26, name: 'Country', type: 'enum' },
    { id: 3, name: 'Size', type: 'float' }, { id: 5, name: 'Photo', type: 'file' },
    { id: 7, name: 'Place', type: 'resource' }
  ];
  const tree = new HFieldTree({ dbdefs: {
    rectypeName: () => 'Event', fields: () => fields.map((field) => ({ ...field })),
    fieldGlobal: (id) => ({ targetTypes: [12] })
  } });
  Object.assign(tree, {
    _body: fakeElement('div'), _rtyId: 10, _builderMode: true, _includeHeaders: true,
    _excludedFields: new Set(), _excludedLinks: new Set(), _maxDepth: 1,
    _typeFilter: typeFilter, _showMetadata: showMetadata
  });
  tree._openKeys.add('rty:10');
  tree._openKeys.add('root:fields:10');
  tree._openKeys.add('root:metadata:10');
  tree._renderBody();
  return texts(tree._body).map((text) => text.replace(/^[▾▸] /, ''));
}

test('metadata checkbox hides the metadata section; fields stay', () => {
  assert.ok(recordTree().includes('metadata'));
  const hidden = recordTree({ showMetadata: false });
  assert.ok(!hidden.includes('metadata'));
  assert.ok(!hidden.includes('Added'));
  assert.ok(hidden.includes('Title') && hidden.includes('Name'));
});

test('type filter groups: text, date, numeric, enum; branches stay; file fields hidden', () => {
  const pick = (filter) => recordTree({ typeFilter: filter });
  assert.deepEqual(['Name', 'Notes', 'Title', 'Any field'].filter((label) => pick('text').includes(label)), ['Name', 'Notes', 'Title', 'Any field']);
  assert.ok(!pick('text').includes('Start'));
  const date = pick('date');
  assert.ok(date.includes('Start') && date.includes('Added') && date.includes('Modified'));
  assert.ok(!date.includes('Name') && !date.includes('Title') && !date.includes('Any field'));
  assert.ok(date.includes('Place'), 'pointer branch kept');
  assert.ok(pick('numeric').includes('Size') && pick('numeric').includes('ID'));
  assert.ok(pick('enum').includes('Country') && pick('enum').includes('Owner'));
  assert.ok(!pick('all').includes('Photo'), 'file fields stay hidden');
  assert.ok(!pick('geo').includes('metadata'), 'metadata folder without matches is dropped');
});

// Field-path editors (geo/time/columns): directed paths, trees limited to their types.
function pathTree(dbdefs, scope = {}) {
  const tree = new HFieldTree({ dbdefs });
  const selectable = scope.selectableTypes ? new Set(scope.selectableTypes) : null;
  Object.assign(tree, {
    _body: fakeElement('div'), _rtyId: 10, _builderMode: false, _includeHeaders: false,
    _excludedFields: new Set(), _excludedLinks: new Set(), _maxDepth: 3, _openKeys: new Set(),
    _selectableTypes: selectable, _hideUnselectable: Boolean(selectable),
    _fixedTypes: Boolean(selectable)
  });
  return tree;
}

test('field-path editors follow a relationship with rt and a pointer with lt', () => {
  const dbdefs = {
    rectypeName: () => '',
    fields: () => [{ id: 155, name: 'Located at', type: 'relmarker' }, { id: 134, name: 'Place', type: 'resource' }],
    fieldGlobal: (id) => ({ targetTypes: [14] })
  };
  const tree = pathTree(dbdefs, { selectableTypes: ['geo'] });
  const links = [];
  tree._linkFolder = (options) => { links.push(options.via.link + options.via.dty); return fakeElement('div'); };
  tree._fieldNodes(10, []);
  assert.deepEqual(links, ['rt155', 'lt134']);
});

test('a tree limited to its types has no Any field, "<type> records" or type filter', () => {
  const dbdefs = {
    rectypeName: (id) => ({ 14: 'Place' }[id] || ''),
    fields: () => [{ id: 28, name: 'Location', type: 'geo' }, { id: 1, name: 'Name', type: 'freetext' }],
    fieldGlobal: () => ({})
  };
  const tree = pathTree(dbdefs, { selectableTypes: ['geo'] });
  const via = [{ via: { link: 'rt', dty: 155, targetRty: 14 } }];
  tree._openKeys.add('rt:155:14:fields:14');
  const [fields, ...rest] = tree._scopeNodes(14, via, true);
  assert.equal(rest.length, 0, 'no "Place records" leaf');
  const labels = fields.children[1].children.map((node) => node.textContent);
  assert.deepEqual(labels, ['Location']);
  assert.equal(tree._typeShown('freetext'), false);
});
