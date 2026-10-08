import test from 'node:test';
import assert from 'node:assert/strict';
import { QuerySourcePanel } from '../src/widgets/query-source/QuerySourcePanel.js';
import { QuerySourceEditor } from '../src/widgets/query-source/QuerySourceEditor.js';

test('setDataSource preserves the query while the editor input is synchronized', () => {
  const panel = new QuerySourcePanel();
  const editor = new QuerySourceEditor({
    dbdefs: {},
    onDirtyChange: (_dirty, draft) => panel._updateFormAction(draft)
  });
  editor.state = 'rendered';
  editor._query = { value: '', disabled: false, readOnly: false, hidden: false };
  editor._renderSummary = () => {};
  panel.editor = editor;
  panel.openFormButton = { hidden: false };
  panel.closeFormButton = { hidden: false };

  const source = {
    title: 'People',
    request: { q: [{ t: '10' }, { 'f:1': 'Smith' }] },
    presentation: {}
  };

  panel.setDataSource(source);

  assert.deepEqual(editor.getQuery(), source.request.q);
  assert.equal(editor._query.value, JSON.stringify(source.request.q));
});

test('Clear detaches a persisted Query Source and clears its query', () => {
  const editor = new QuerySourceEditor({ dbdefs: {} });
  editor.setDataSource({
    reference: { type: 'source', id: 44, key: 'source:44' },
    title: 'Named source',
    request: { q: 't:10', rules: [{ levels: [] }] },
    presentation: { data: { fields: ['1'] }, filterForm: { groups: [] } },
    meta: { origin: 'source' }
  });

  editor.clearSettings();

  assert.deepEqual(editor.draft.reference, { type: 'query', id: null, key: 'query:draft' });
  assert.equal(editor.draft.request.q, '');
  assert.equal(editor.draft.title, '');
  assert.equal(editor.draft.presentation.data, null);
  assert.equal(editor.draft.presentation.filterForm, null);
  assert.equal(editor.draft.meta, undefined);
});

test('Clear turns a parameterized query into an empty, editable one', () => {
  const editor = new QuerySourceEditor({ dbdefs: {} });
  editor.setDataSource({
    reference: { type: 'source', id: 45, key: 'source:45' },
    request: { q: [{ t: '10' }, { 'f:1': '$X1$' }] },
    presentation: { filterForm: { groups: [] } }
  });
  editor.clearSettings();
  assert.equal(editor.draft.request.q, '');
  assert.equal(editor.draft.presentation.filterForm, null);
});

test('the More state is the host\'s: hidden by default, kept when a source is loaded or saved', () => {
  const editor = new QuerySourceEditor({ dbdefs: {} });
  assert.equal(editor.isExpanded(), false);
  const shown = new QuerySourceEditor({ dbdefs: {}, expanded: true });
  shown.setDataSource({ reference: { type: 'source', id: 3, key: 'source:3' }, request: { q: 't:10' }, presentation: {} });
  shown.markCommitted();
  assert.equal(shown.isExpanded(), true);
  shown.setExpanded(false);
  assert.equal(shown.isExpanded(), false);
});

test('orientation: vertical by default, set by the host', () => {
  const editor = new QuerySourceEditor({ dbdefs: {} });
  assert.equal(editor.getOrientation(), 'vertical');
  editor.setOrientation('horizontal');
  assert.equal(editor.getOrientation(), 'horizontal');
  editor.setOrientation('anything');
  assert.equal(editor.getOrientation(), 'vertical');
});

test('the panel returns a copy of the last Filter Form values of a source', () => {
  const panel = new QuerySourcePanel();
  assert.equal(panel.lastParameterValues('source:5'), null);
  panel._lastValues.set('source:5', { X1: '12' });
  const values = panel.lastParameterValues('source:5');
  values.X1 = 'changed';
  assert.deepEqual(panel.lastParameterValues('source:5'), { X1: '12' });
});
