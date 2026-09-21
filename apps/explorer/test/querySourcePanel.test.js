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

test('Clear detaches a persisted Query Source but preserves its query', () => {
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
  assert.equal(editor.draft.request.q, 't:10');
  assert.equal(editor.draft.title, '');
  assert.equal(editor.draft.presentation.data, null);
  assert.equal(editor.draft.presentation.filterForm, null);
  assert.equal(editor.draft.meta, undefined);
});
