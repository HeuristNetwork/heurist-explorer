import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { ExplorerToolModule } = await import('../src/tools/ExplorerToolModule.js');

test('a tool module has a caption header without a close button; the tool follows sync', async () => {
  const calls = [];
  const tool = {
    setDataSource: (source) => calls.push(['source', source.title]),
    setSelection: (ids) => calls.push(['selection', ids]),
    setRules: (rules) => calls.push(['rules', rules.length]),
    hasUnsavedChanges: () => true,
    destroy: () => calls.push(['destroy'])
  };
  const container = document.createElement('section');
  const module = new ExplorerToolModule({
    id: 'export', type: 'export', container, title: 'Export records', create: () => tool
  });
  await module.mount();
  assert.equal(await module.ready(), tool);
  assert.equal(container.querySelector('.h-explorer-tool-workspace-title').textContent, 'Export records');
  assert.equal(container.querySelector('.h-explorer-tool-workspace-close'), null, 'tools are hidden like modules');
  // the slot of the tool's buttons on the header (Crosstabs: Publish, Help; review 5)
  assert.equal(module.actions, container.querySelector('.h-explorer-tool-workspace-actions'));

  await module.setDataSource({ title: 'Persons' });
  await module.setSelection([3, '3', 0, 5]);
  await module.setRules([{}]);
  assert.equal(module.hasUnsavedChanges(), true);
  await module.destroy();
  assert.deepEqual(calls, [['source', 'Persons'], ['selection', [3, 5]], ['rules', 1], ['destroy']]);
});

test('a tool without a factory is a placeholder', async () => {
  const container = document.createElement('section');
  const module = new ExplorerToolModule({ id: 'crosstabs', type: 'crosstabs', container, title: 'Crosstabs / Charts' });
  await module.mount();
  assert.match(container.querySelector('.h-explorer-tool-workspace-body').textContent, /Not implemented yet/);
  assert.equal(module.hasUnsavedChanges(), false);
});

test('a tool created after its module was destroyed is destroyed too', async () => {
  let release;
  let destroyed = false;
  const container = document.createElement('section');
  const module = new ExplorerToolModule({
    id: 'report', type: 'report', container, title: 'Report',
    create: () => new Promise((resolve) => { release = resolve; })
  });
  await module.mount();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await module.destroy();
  release({ destroy: () => { destroyed = true; } });
  assert.equal(await module.ready(), null);
  assert.equal(destroyed, true);
});

test('a hidden tool is created when shown and gets only the last changes made while hidden', async () => {
  const calls = [];
  const observers = [];
  const previous = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() {}
  };
  try {
    const container = document.createElement('section');
    let shown = false;
    Object.defineProperty(container, 'isConnected', { get: () => true });
    container.getClientRects = () => (shown ? [{}] : []);
    let created = 0;
    const module = new ExplorerToolModule({
      id: 'crosstabs', type: 'crosstabs', container, title: 'Crosstabs',
      create: () => {
        created += 1;
        return { setDataSource: (source) => calls.push(['source', source.title]), setSelection: (ids) => calls.push(['selection', ids]) };
      }
    });
    await module.mount();
    assert.equal(created, 0, 'not created while hidden');

    shown = true;
    observers[0].callback();
    await module.ready();
    assert.equal(created, 1);

    shown = false;
    await module.setDataSource({ title: 'A' });
    await module.setDataSource({ title: 'B' });
    await module.setSelection([7]);
    assert.deepEqual(calls, [], 'nothing sent while hidden');

    shown = true;
    await module._onShown();
    assert.deepEqual(calls, [['source', 'B'], ['selection', [7]]]);
    await module.destroy();
  } finally {
    globalThis.ResizeObserver = previous;
  }
});
