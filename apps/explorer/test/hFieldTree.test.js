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
