import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const published = [], callbacks = [], listeners = new Map();
  const context = vm.createContext({ window: { hWin: { HAPI4: { Event: { ON_REC_SELECT: 'select' } } } },
    HeuristModuleRecordset: class {}, $: () => ({ trigger: (name, detail) => published.push({ name, detail }) }),
    Promise, clearInterval, clearTimeout });
  vm.runInContext(readFileSync(new URL('../fixtures/legacy/HeuristModuleGraph.txt', import.meta.url), 'utf8'), context);
  const host = Object.create(context.window.HeuristModuleGraph.prototype);
  Object.assign(host, {
    options: { eventbased: true, search_realm: 'realm' }, element: { attr: () => 'graph-widget' },
    _dataEventHandlers: {}, _normalizeRecordIds: ids => [...new Set((ids || []).map(Number))],
    _invokeCallback: (...args) => callbacks.push(args), _reportError: (...args) => callbacks.push(['error', ...args]),
    _openRecordEdit: id => callbacks.push(['edit', id]),
    _moduleApi: { addEventListener: (name, handler) => listeners.set(name, handler),
      removeEventListener: (name, handler) => { assert.equal(listeners.get(name), handler); listeners.delete(name); } },
  });
  host._bindDataEvents();
  return { host, published, callbacks, listeners };
}

test('graph selections publish the data-module host event contract once', () => {
  const { host, published, callbacks, listeners } = fixture();
  listeners.get('heurist-graph-selection-changed')({ detail: { recordIds: ['5', 5, 7] } });
  assert.deepEqual(host.options.selection, [5, 7]);
  assert.equal(published.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(published[0])), { name: 'select', detail: {
    selection: [5, 7], source: 'graph-widget', search_realm: 'realm', reset: false,
  } });
  assert.equal(callbacks.length, 1);
  listeners.get('heurist-graph-selection-changed')({ detail: { selection: [] } });
  assert.equal(published[1].detail.reset, true);
  host.options.eventbased = false;
  listeners.get('heurist-graph-selection-changed')({ detail: { recordIds: [9] } });
  assert.equal(published.length, 2);
  assert.equal(callbacks.length, 3);
});

test('incoming selection is not echoed and suppression clears after failures', async () => {
  const { host, published, callbacks, listeners } = fixture();
  host._moduleApi.setSelection = async ids => {
    listeners.get('heurist-graph-selection-changed')({ detail: { recordIds: ids } });
  };
  await host._setSelectionNow([5]);
  assert.equal(published.length, 0);
  assert.equal(callbacks.length, 0);
  host._moduleApi.setSelection = () => { throw new Error('failed'); };
  await assert.rejects(host._setSelectionNow([5]), /failed/);
  assert.equal(host._suppressSelectionSync, false);
});

test('graph errors, configuration and edit requests follow data bindings and unbind cleanly', () => {
  const { host, callbacks, listeners } = fixture();
  const error = new Error('failed');
  listeners.get('heurist-graph-error')({ detail: { error, operation: 'load' } });
  listeners.get('heurist-graph-configuration-requested')({ detail: { mode: 'preferences' } });
  listeners.get('heurist-graph-edit-record-requested')({ detail: { recordId: 5 } });
  assert.equal(callbacks[0][1], error);
  assert.equal(callbacks[0][2], 'load');
  assert.equal(callbacks[1][0], 'onconfiguration');
  assert.deepEqual(callbacks[2], ['edit', 5]);
  host._unbindDataEvents();
  assert.equal(listeners.size, 0);
});
