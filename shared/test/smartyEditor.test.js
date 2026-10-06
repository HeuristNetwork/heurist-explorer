import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
const { tokenizeText } = await import('../src/smarty/smartyTokenizer.js');
const { HSmartyEditor } = await import('../src/smarty/HSmartyEditor.js');
const { SMARTY_PATTERNS } = await import('../src/smarty/smartyPatterns.js');
const { HFieldTree } = await import('../src/widgets/field-tree/HFieldTree.js');

/** Tokens of one line without whitespace-only plain tokens. */
const tokens = (line) => tokenizeText(line)[0].filter(([text, style]) => style || text.trim());

test('tokenizer: Smarty tags, variables, keywords, strings and HTML', () => {
  assert.deepEqual(tokens('{foreach $results as $r1}'), [
    ['{', 'bracket'], ['foreach', 'keyword'], ['$results', 'variableName'], ['as', 'keyword'],
    ['$r1', 'variableName'], ['}', 'bracket']
  ]);
  assert.deepEqual(tokens('<b class="x">{$r.recTitle}</b>'), [
    ['<b', 'typeName'], ['class', 'attributeName'], ['=', 'operator'], ['"x"', 'string'], ['>', 'typeName'],
    ['{', 'bracket'], ['$r.recTitle', 'variableName'], ['}', 'bracket'],
    ['</b', 'typeName'], ['>', 'typeName']
  ]);
  assert.deepEqual(tokens("{wrap var=$f5 dt='geo'}").map(([, style]) => style),
    ['bracket', 'keyword', 'attributeName', 'operator', 'variableName', 'attributeName', 'operator', 'string', 'bracket']);
});

test('tokenizer: comments span lines; "{ " is not a Smarty tag', () => {
  const lines = tokenizeText('{* first\nsecond *}\n<style>p { color:red }</style>');
  assert.deepEqual(lines[0], [['{* first', 'comment']]);
  assert.deepEqual(lines[1], [['second *}', 'comment']]);
  assert.ok(!lines[2].some(([, style]) => style === 'bracket'), 'CSS braces stay plain');
});

test('tokenizer: {literal} blocks are not parsed', () => {
  const lines = tokenizeText('{literal}{$x}{/literal}');
  assert.deepEqual(lines[0][0], ['{literal}', 'keyword']);
  assert.ok(!lines[0].some(([, style]) => style === 'variableName'));
});

test('HSmartyEditor falls back to a textarea, inserts at the cursor and tracks changes', async () => {
  const host = document.createElement('div');
  let changed = 0;
  const editor = new HSmartyEditor().attach(host, {
    value: 'AB',
    onChange: () => { changed++; },
    loadSetup: async () => { throw new Error('no CodeMirror in tests'); }
  });
  await editor.load();
  const area = host.querySelector('textarea');
  assert.ok(area, 'textarea fallback');
  assert.equal(editor.isModified(), false);
  area.selectionStart = area.selectionEnd = 1;
  editor.insertAtCursor('{$r.f1}');
  assert.equal(editor.getValue(), 'A{$r.f1}B');
  assert.equal(editor.isModified(), true);
  assert.equal(changed, 1);
  editor.markSaved();
  assert.equal(editor.isModified(), false);
  editor.setValue('new', { saved: true });
  assert.equal(area.value, 'new');
  await editor.destroy();
});

test('patterns have ids, labels and text', () => {
  assert.ok(SMARTY_PATTERNS.length >= 6);
  for (const pattern of SMARTY_PATTERNS) assert.ok(pattern.id && pattern.label && pattern.text.length > 10);
  assert.ok(SMARTY_PATTERNS.find((p) => p.id === 'records-loop').text.includes('{foreach $results as $r}'));
});

const DBDEFS = {
  rectypeName: (id) => ({ 10: 'Person' }[id] || ''),
  rectype: () => ({}),
  fields: () => [
    { id: 1, name: 'Name', type: 'freetext' },
    { id: 20, name: 'Gender', type: 'enum' },
    { id: 30, name: 'Photo', type: 'file' }
  ],
  fieldGlobal: () => ({}),
  linkedRectypes: () => []
};

test('HFieldTree inline: enum outputs and file fields, stays open after a pick', () => {
  const host = document.createElement('div');
  const picks = [];
  const tree = new HFieldTree({ dbdefs: DBDEFS }).mount(host, {
    rtyId: 10, enumOutputs: true, includeFiles: true, includeHeaders: false
  }, (path) => picks.push(path));
  const leafText = (node) => node.textContent.replace(/(freetext|enum|file|term|code|conceptid|desc|internalid)$/, '');
  const leaves = () => host.querySelectorAll('.h-fbtree-leaf');
  assert.deepEqual(leaves().map(leafText), ['Any field', 'Name', 'Photo']);

  const enumHead = host.querySelectorAll('.h-fbtree-folder-head').find((head) => head.textContent.includes('Gender'));
  assert.ok(enumHead, 'enum field is a folder');
  enumHead.click();
  const outputs = host.querySelectorAll('.h-fbtree-term-leaf');
  assert.deepEqual(outputs.map(leafText), ['Term', 'Code', 'Concept ID', 'Description', 'Internal ID']);
  outputs[1].click();
  assert.deepEqual(picks.at(-1), [{ dty: 20, fieldType: 'enum', term: 'code' }]);
  assert.ok(host.querySelector('.h-fbtree-inline'), 'tree still shown after a pick');

  leaves().find((node) => node.textContent.startsWith('Photo')).click();
  assert.deepEqual(picks.at(-1), [{ dty: 30, fieldType: 'file' }]);
  tree.destroy();
});

test('HFieldTree multiSelect: clicks mark leaves, "Select all visible options", inserted leaves', () => {
  const host = document.createElement('div');
  const counts = [];
  const picks = [];
  const dbdefs = {
    ...DBDEFS,
    dbconst: (name) => ({ RT_RELATION: 1, DT_PRIMARY_RESOURCE: 7, DT_TARGET_RESOURCE: 5, DT_RELATION_TYPE: 6 }[name] ?? null),
    fields: (rty) => (Number(rty) === 1
      ? [{ id: 6, name: 'Relation type', type: 'relationtype' }, { id: 3, name: 'Note', type: 'blocktext' }]
      : DBDEFS.fields())
  };
  const tree = new HFieldTree({ dbdefs }).mount(host, {
    rtyId: 10, enumOutputs: true, includeHeaders: false, multiSelect: true, relationships: true, valuesOnly: true,
    onSelectionChange: (count) => counts.push(count)
  }, (path) => picks.push(path));
  const leaf = (text) => host.querySelectorAll('.h-fbtree-leaf').find((node) => node.textContent.startsWith(text));

  leaf('Name').click();
  assert.equal(picks.length, 0, 'a click marks, it does not pick');
  assert.deepEqual(tree.getSelectedPaths(), [[{ dty: 1, fieldType: 'freetext' }]]);
  assert.equal(leaf('Name').getAttribute('aria-pressed'), 'true');
  leaf('Name').click();
  assert.deepEqual(tree.getSelectedPaths(), []);

  // the Relationship folder: properties and the other relationship fields
  host.querySelectorAll('.h-fbtree-folder-head').find((head) => head.textContent.includes('Relationship')).click();
  leaf('Relation Type').click();
  leaf('Relation Noteblocktext').click();
  assert.deepEqual(tree.getSelectedPaths(), [
    [{ dty: 'recRelationType', fieldType: 'relationship', relationship: true }],
    [{ dty: 3, fieldType: 'blocktext', relationship: true }]
  ]);
  tree.clearSelection(null, { inserted: true });
  assert.ok(leaf('Relation Type').classList.contains('is-inserted'));

  const all = host.querySelector('.h-fbtree-select-all').querySelector('input');
  all.checked = true;
  all.fire('change');
  // Name (no Any field; Photo hidden without includeFiles), 4 properties + Note
  assert.equal(tree.getSelectedPaths().length, 6);
  all.checked = false;
  all.fire('change');
  assert.equal(tree.getSelectedPaths().length, 0);
  assert.deepEqual(counts.slice(0, 2), [1, 0]);
  tree.destroy();
});

test('HFieldTree valuesOnly: no "Any field" and no "<type> records" leaf in linked branches', () => {
  const dbdefs = {
    ...DBDEFS,
    rectypeName: (id) => ({ 10: 'Person', 12: 'Place' }[id] || ''),
    fields: (rty) => (Number(rty) === 12
      ? [{ id: 2, name: 'Place name', type: 'freetext' }]
      : [{ id: 1, name: 'Name', type: 'freetext' }, { id: 77, name: 'Born in', type: 'resource' }]),
    fieldGlobal: (id) => (Number(id) === 77 ? { targetTypes: [12] } : {})
  };
  const labels = (scope) => {
    const host = document.createElement('div');
    new HFieldTree({ dbdefs }).mount(host, { rtyId: 10, maxDepth: 2, includeHeaders: false, ...scope }, () => {});
    host.querySelectorAll('.h-fbtree-folder-head').find((head) => head.textContent.includes('Born in')).click();
    return host.querySelectorAll('.h-fbtree-leaf').map((node) => node.textContent.replace(/(freetext|exists)$/, ''));
  };
  assert.ok(labels({}).includes('Place records') && labels({}).includes('Any field'), 'shown by default');
  assert.deepEqual(labels({ valuesOnly: true }), ['Name', 'Place name']);
});

test('HFieldTree enumOutputs list and "Add selected fields" (column fields)', () => {
  const host = document.createElement('div');
  const added = [];
  const tree = new HFieldTree({ dbdefs: DBDEFS }).mount(host, {
    rtyId: 10, includeHeaders: false, multiSelect: true, valuesOnly: true,
    enumOutputs: ['term', 'code', 'conceptid', 'internalid'],
    onAddSelected: (paths) => added.push(paths)
  }, () => {});
  const add = host.querySelector('.h-fbtree-footer').querySelector('button');
  assert.equal(add.disabled, true, 'nothing marked yet');

  host.querySelectorAll('.h-fbtree-folder-head').find((head) => head.textContent.includes('Gender')).click();
  const outputs = host.querySelectorAll('.h-fbtree-term-leaf');
  assert.deepEqual(outputs.map((node) => node.textContent.replace(/(term|code|conceptid|internalid)$/, '')),
    ['Term', 'Code', 'Concept ID', 'Internal ID'], 'no description');
  outputs[0].click();
  host.querySelectorAll('.h-fbtree-leaf').find((node) => node.textContent.startsWith('Name')).click();
  assert.equal(add.disabled, false);
  add.click();
  assert.deepEqual(added, [[[{ dty: 20, fieldType: 'enum', term: 'term' }], [{ dty: 1, fieldType: 'freetext' }]]]);
  assert.deepEqual(tree.getSelectedPaths(), [], 'selection cleared after adding');
  tree.destroy();
});
