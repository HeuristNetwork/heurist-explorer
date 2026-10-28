/**
 * @file moduleConfigurationDialogFactory.test.js
 * @brief The configuration dialog factory of the modules (plan 29): the form in heurist-explorer
 *        through the bridge, or in the module's own window; publication from Explorer only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfigurationDialogFactory, termsOf } from '../src/ui/config/moduleConfigurationDialogFactory.js';
import { ModuleConfigurationDialog } from '../src/ui/config/ModuleConfigurationDialog.js';
import { patchFormFields } from '../src/data/moduleConfigurationForm.js';

const configuration = {
  type: 'graph',
  form: { groups: [] },
  defaults: () => ({ options: {}, config: {} }),
  normalize: (value) => value,
  serialize: (value) => ({ format: 'heurist-graph-settings', version: 1, ...value })
};

test('with the Explorer bridge: configuration settings come back to onSave', async () => {
  const requests = [];
  const saved = [];
  const bridge = { openConfiguration: async (request) => { requests.push(request); return { options: { a: 1 }, config: {} }; } };
  const factory = createConfigurationDialogFactory({ configuration, bridge });
  const handle = factory({ mode: 'preferences', value: { options: {} }, title: 'Graph options', terms: { x: [] },
    onSave: (settings, context) => saved.push([settings, context]) });
  assert.deepEqual(await handle.result, { options: { a: 1 }, config: {} });
  assert.equal(requests[0].mode, 'configuration');
  assert.equal(requests[0].title, 'Graph options');
  assert.deepEqual(requests[0].terms, { x: [] });
  assert.equal(saved[0][1].mode, 'preferences', 'the mode the module asked for');
  assert.equal(saved[0][1].serialized.format, 'heurist-graph-settings');
});

test('with the Explorer bridge: publication sends settings, state and publication data; nothing is saved', async () => {
  let request;
  let saved = false;
  const bridge = { openConfiguration: async (value) => { request = value; return { id: 4 }; } };
  const handle = createConfigurationDialogFactory({ configuration, bridge })({
    mode: 'publish', value: { options: {} }, state: { q: 1 }, publication: { activeDocumentId: 3 }, onSave: () => { saved = true; }
  });
  assert.deepEqual(await handle.result, { id: 4 });
  assert.equal(request.mode, 'publication');
  assert.deepEqual(request.state, { q: 1 });
  assert.deepEqual(request.publication, { activeDocumentId: 3 });
  assert.equal(saved, false);
});

test('without the bridge: no publication; configuration in the module window with its own lists', async (t) => {
  assert.equal(await createConfigurationDialogFactory({ configuration })({ mode: 'publish' }).result, null);
  const open = ModuleConfigurationDialog.prototype.open;
  let dialog;
  ModuleConfigurationDialog.prototype.open = async function() {
    dialog = this;
    return this.options.onSave({ options: { b: 2 } }) ? { options: { b: 2 } } : null;
  };
  t.after(() => { ModuleConfigurationDialog.prototype.open = open; });
  let saved;
  const handle = createConfigurationDialogFactory({ configuration, termsProviders: { smartyTemplates: async () => [] } })({
    mode: 'website', terms: { baseMaps: [{ id: 'OSM', label: 'OSM' }] }, onSave: (settings) => { saved = settings; }
  });
  await handle.result;
  assert.equal(dialog.mode, 'website');
  assert.deepEqual(Object.keys(dialog.options.termsProviders).sort(), ['baseMaps', 'smartyTemplates']);
  assert.deepEqual(saved, { options: { b: 2 } });
});

test('termsOf: fixed lists as termsSource providers', async () => {
  const providers = termsOf({ maps: [{ id: 1, label: 'A' }] });
  assert.deepEqual(await providers.maps(), [{ id: 1, label: 'A' }]);
  assert.deepEqual(termsOf(null), {});
});

test('a second click while the form is open gives the same form (2026-10-28)', async () => {
  let release;
  let calls = 0;
  const bridge = { openConfiguration: () => { calls++; return new Promise((resolve) => { release = resolve; }); } };
  const factory = createConfigurationDialogFactory({ configuration, bridge });
  const first = factory({ mode: 'preferences' });
  const second = factory({ mode: 'preferences' });
  assert.equal(second, first);
  await Promise.resolve();
  release(null);
  await first.result;
  factory({ mode: 'preferences' });
  await Promise.resolve();
  assert.equal(calls, 2, 'a new form after the first one is closed');
  release(null);
});

test('patchFormFields: properties only the module knows (targetTypes)', () => {
  const json = { groups: [{ children: [{ name: 'a', type: 'resource' }, { name: 'b' }] }] };
  const patched = patchFormFields(json, { a: { targetTypes: [55] } });
  assert.deepEqual(patched.groups[0].children[0].targetTypes, [55]);
  assert.equal(json.groups[0].children[0].targetTypes, undefined, 'the JSON is not changed');
  assert.equal(patchFormFields(json, null), json);
});
