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
