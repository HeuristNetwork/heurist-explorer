import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
const { ExplorerAuthoringDock } = await import('../src/ui/ExplorerAuthoringDock.js');
const { ExplorerControlPanel } = await import('../src/ui/ExplorerControlPanel.js');
const { ExplorerRail } = await import('../src/ui/ExplorerRail.js');

/** Control panel with a real dock and rail, over a minimal application. */
function setup({ lists = 'docked', cover = false } = {}) {
  const dock = new ExplorerAuthoringDock(document.createElement('div'), { database: 'db', storage: null });
  if (cover) dock.setFormCover(true);
  const closed = [];
  const application = {
    authoringDock: dock,
    uiConfigValue: { lists },
    isListsDocked: () => lists === 'docked',
    isQuerySourceEditorVisible: () => dock.isVisible(),
    closeCoveringFilterForm: async () => {
      if (!dock.isFormCover()) return false;
      closed.push(true);
      dock.setFormCover(false);
      return true;
    }
  };
  const panel = new ExplorerControlPanel({ application });
  panel.leftRail = new ExplorerRail({
    side: 'left',
    buttons: ['search', 'saved-filters', 'record-types', 'query-sources', 'favorites', 'history', 'workspace'].map((id) => ({ id, title: id }))
  });
  panel.leftRail.mount(document.createElement('div'));
  for (const name of ['_buildSavedFiltersPanel', '_buildRecordTypesPanel', '_buildQuerySourcesPanel',
    '_buildFavoritesPanel', '_buildHistoryPanel', '_buildWorkspacePanel']) {
    panel[name] = () => Object.assign(document.createElement('div'), { textContent: name });
  }
  const active = (id) => panel.leftRail.getButtonElement(id).classList.contains('active');
  return { dock, panel, closed, active };
}

test('docked lists are exclusive and toggle like modules of one pane', async () => {
  const { dock, panel, active } = setup();
  await panel._toggleDockedList('saved-filters');
  assert.equal(dock.isListShown(), true);
  assert.equal(panel.dockedList, 'saved-filters');
  assert.ok(active('saved-filters'));
  assert.ok(active('search'), 'the editor stays shown above the list');

  await panel._toggleDockedList('record-types');
  assert.equal(panel.dockedList, 'record-types');
  assert.ok(active('record-types'));
  assert.ok(!active('saved-filters'), 'one list at a time');

  await panel._toggleDockedList('record-types');
  assert.equal(dock.isListShown(), false, 'a second click hides it');
  assert.ok(!active('record-types'));
});

test('a list button over the Filter Form closes the form and shows the list', async () => {
  const { dock, panel, closed, active } = setup({ cover: true });
  panel.syncAuthoringButtons();
  assert.ok(!active('search'), 'the form deselects Search');
  await panel._toggleDockedList('query-sources');
  assert.equal(closed.length, 1);
  assert.equal(dock.isListShown(), true);
  assert.ok(active('query-sources'));
  assert.ok(active('search'));
});

test('popup mode leaves the West pane alone', () => {
  const { dock, panel } = setup({ lists: 'popup' });
  assert.equal(panel._dockList('saved-filters'), false);
  assert.equal(dock.isListShown(), false);
});

test('Favorites, History and Workspace dock like the other lists', async () => {
  const { dock, panel, active } = setup();
  panel.openFavorites();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(panel.dockedList, 'favorites');
  assert.equal(dock.isListShown(), true);
  assert.equal(panel.flyout, undefined, 'no popup');
  assert.ok(active('favorites'));

  panel.openHistory();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(panel.dockedList, 'history');
  assert.ok(!active('favorites'));

  panel.openWorkspace();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(panel.dockedList, 'workspace');
  assert.ok(active('workspace'));
});
