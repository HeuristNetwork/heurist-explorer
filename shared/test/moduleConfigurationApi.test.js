/**
 * @file moduleConfigurationApi.test.js
 * @brief The configuration API of the modules (plan 29 §12): patch by key path, changed keys,
 *        validation, description for an AI agent, set / patch / reset with the event.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { HeuristModulePublicApi } from '../src/host/HeuristModulePublicApi.js';
import { HeuristModuleConfigurationApi } from '../src/host/HeuristModuleConfigurationApi.js';
import { HEURIST_MODULE_EVENTS } from '../src/contracts/moduleContracts.js';
import {
  changedSettingKeys,
  expandSettingsPatch,
  validateModuleSettings
} from '../src/data/moduleConfigurationForm.js';

const SIZES = [25, 100, 500];

/** A small module configuration: one enum, one boolean, one list. */
const configuration = {
  type: 'test',
  form: {
    format: 'heurist-edit-form/1',
    groups: [{ id: 'main', label: 'Main', children: [
      { name: 'config.defaults.pageSize', type: 'enum', label: 'Page size', terms: SIZES.map((id) => ({ id, label: String(id) })) },
      { name: 'options.ui.showHelp', type: 'boolean', label: 'Show help', forced: { publication: false } },
      { name: 'options.mapDocuments.allowed', type: 'freetext', label: 'Allowed', req: 'optional' }
    ] }]
  },
  defaults: () => ({ options: { ui: { showHelp: true }, mapDocuments: { allowed: null } }, config: { defaults: { pageSize: 100 } } }),
  normalize: (value = {}) => {
    const size = Number(value.config?.defaults?.pageSize);
    return {
      options: {
        ui: { showHelp: value.options?.ui?.showHelp !== false },
        mapDocuments: { allowed: Array.isArray(value.options?.mapDocuments?.allowed) ? value.options.mapDocuments.allowed : null }
      },
      config: { defaults: { pageSize: SIZES.includes(size) ? size : 100 } }
    };
  },
  serialize: (value) => ({ format: 'heurist-test-settings', version: 1, ...configuration.normalize(value) })
};

/** A running module: settings applied and saved, events recorded. */
function application() {
  const app = {
    config: { persistedSettings: configuration.defaults() },
    events: [],
    saved: [],
    host: { savePreferences: async (value) => { app.saved.push(value); } },
    applyConfiguration: async (value) => { app.config.persistedSettings = configuration.normalize(value); },
    dispatch: (name, detail) => app.events.push({ name, detail }),
    getState: () => ({ q: 1 })
  };
  return app;
}

test('expandSettingsPatch: dotted keys and nested values', () => {
  assert.deepEqual(expandSettingsPatch({ 'config.defaults.pageSize': 500, options: { ui: { showHelp: false } } }),
    { config: { defaults: { pageSize: 500 } }, options: { ui: { showHelp: false } } });
});

test('changedSettingKeys: the leaves that differ', () => {
  const a = configuration.defaults();
  const b = configuration.normalize({ ...a, config: { defaults: { pageSize: 500 } } });
  assert.deepEqual(changedSettingKeys(a, b), ['config.defaults.pageSize']);
});

test('validateModuleSettings: unknown keys and values not accepted', () => {
  assert.deepEqual(validateModuleSettings(configuration, configuration.defaults()), []);
  assert.deepEqual(validateModuleSettings(configuration, { format: 'x', version: 1, options: {} }), []);
  const errors = validateModuleSettings(configuration, {
    options: { ui: { showHelp: true, colour: 'red' } },
    config: { defaults: { pageSize: 30 } },
    extra: 1
  });
  assert.deepEqual(errors.map((error) => error.key).sort(), ['config.defaults.pageSize', 'extra', 'options.ui.colour']);
  assert.equal(errors.find((error) => error.key === 'config.defaults.pageSize').value, 100, 'what the module uses');
});

test('describeConfiguration: the options of a mode, forced values, advanced', () => {
  const api = new HeuristModuleConfigurationApi({ configuration, dialogFactory: false });
  const publication = api.describeConfiguration({ mode: 'publish' });
  assert.equal(publication.module, 'test');
  assert.equal(publication.mode, 'publication');
  const help = publication.options.find((row) => row.key === 'options.ui.showHelp');
  assert.deepEqual(help.forced, { value: false });
  const basic = api.describeConfiguration({ advanced: false }).options.find((row) => row.key === 'options.mapDocuments.allowed');
  assert.equal(basic.advanced, true);
  assert.equal(basic.shown, false);
  assert.equal(api.getConfigurationDefaults().format, 'heurist-test-settings');
});

test('set, patch, reset: applied, saved on request, event with the changed keys', async () => {
  const app = application();
  const api = new HeuristModulePublicApi(app, { configuration });
  const patched = await api.patchConfiguration({ 'config.defaults.pageSize': 500 });
  assert.equal(patched.config.defaults.pageSize, 500);
  assert.equal(patched.options.ui.showHelp, true, 'other settings are kept');
  assert.equal(app.saved.length, 0);
  assert.equal(app.events[0].name, HEURIST_MODULE_EVENTS.CONFIGURATION_CHANGED);
  assert.deepEqual(app.events[0].detail.changedKeys, ['config.defaults.pageSize']);
  assert.equal(app.events[0].detail.module, 'test');

  await api.setConfiguration({ options: { ui: { showHelp: false } } }, { save: true });
  assert.equal(api.getConfiguration().config.defaults.pageSize, 100, 'set: keys not given get the defaults');
  assert.equal(app.saved.length, 1);

  const reset = await api.resetConfiguration();
  assert.deepEqual(reset, configuration.serialize(configuration.defaults()));
});

test('state: getState of the application; setState only when the module can restore', async () => {
  const app = application();
  const api = new HeuristModulePublicApi(app, { configuration });
  assert.deepEqual(api.getState(), { q: 1 });
  await assert.rejects(api.setState({}), /can not restore/);
  app.restoreState = async (state) => state;
  assert.deepEqual(await api.setState({ q: 2 }), { q: 2 });
});

test('the form factory of a running module is set by its start', () => {
  const api = new HeuristModulePublicApi(application(), { configuration });
  assert.throws(() => api.openConfigurationDialog({}), /not available/);
  const handle = { result: Promise.resolve(null), close() {} };
  api.setConfigurationDialogFactory(() => handle);
  assert.equal(api.openConfigurationDialog({ mode: 'preferences' }), handle);
});
