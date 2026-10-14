import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { QuerySourceEditor } = await import('../src/widgets/query-source/QuerySourceEditor.js');

function rendered(options = {}) {
  const qse = new QuerySourceEditor({ dbdefs: {}, onHelp: () => {}, ...options });
  qse.setDataSource({ reference: { type: 'query', key: 'q1' }, title: '', request: { q: { t: 10 } }, presentation: {} });
  qse.attach(document.createElement('div')).render();
  return qse;
}

test('simplified interface: p6 buttons instead of Builder/Save/Add; Save filter passes the query text', () => {
  const saved = [];
  const qse = rendered({ simplified: true, onSaveFilterForReuse: (query) => saved.push(query) });
  assert.ok(qse.container.classList.contains('is-simplified'));
  assert.equal(qse._builder.hidden, true);
  assert.equal(qse.actionsSlot.hidden, true);
  const captions = qse._p6.querySelectorAll('.h-qse-p6-caption').map((label) => label.textContent);
  assert.deepEqual(captions, ['Filter builder', 'Save filter for re-use', 'Filter help']);
  qse._saveForReuse.click();
  assert.deepEqual(saved, ['[{"t":10}]'], 'the JSON query as text');

  qse.setSimplified(false);
  assert.ok(!qse.container.classList.contains('is-simplified'));
  assert.equal(qse._builder.hidden, false);
});

test('Save filter for re-use is hidden when the legacy filter editor is not available', () => {
  const qse = rendered({ simplified: true, canSaveFilterForReuse: () => false });
  assert.equal(qse._saveForReuse.hidden, true);
});

test('hidden Save/Add slot: display:contents of the inline actions does not override [hidden]', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../src/widgets/query-source/DataSourceActions.css', import.meta.url), 'utf8');
  assert.match(css, /\.h-dsa-inline\[hidden\] \{ display:none; \}/);
});

test('simplified interface: the editor has one row; Map/Timeline get no Workspace; a closed Filter Form clears the editor', async () => {
  const qse = rendered({ simplified: true });
  assert.equal(qse._query.rows, 1);
  qse.setSimplified(false);
  assert.equal(qse._query.rows, 3);
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../src/core/ExplorerApplication.js', import.meta.url), 'utf8');
  assert.match(app, /const sources = this\.isSimplifiedUI\(\) \? \[\] : await this\.getWorkspaceDataSources\(\);/);
  const panel = await readFile(new URL('../src/widgets/query-source/QuerySourcePanel.js', import.meta.url), 'utf8');
  assert.match(panel, /onClose: \(\) => void this\.closeFilterForm\(\{ clearEditor: this\.options\.simplified === true \}\),/);
  assert.match(panel, /if \(clearEditor && wasOpen && restoreEditor\) this\.setDataSource\(null\);/);
});

test('a parameterized query is not saved as a new Saved Filter (legacy format can not hold it)', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../src/core/ExplorerApplication.js', import.meta.url), 'utf8');
  assert.match(app, /if \(isNew && hasQueryParameters\(/);
  const { hasQueryParameters } = await import('../../../shared/src/data/queryParameters.js');
  assert.equal(hasQueryParameters('[{"t":"10"},{"f:1":"$X1$"}]'), true, 'JSON text from the editor');
  assert.equal(hasQueryParameters([{ t: '10' }, { 'f:1': '$X1$' }]), true);
  assert.equal(hasQueryParameters('sortby:-m'), false);
});
