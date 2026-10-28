/**
 * @file moduleConfigurationDialog.test.js
 * @brief Module configuration forms (plan 29): modes, merge, options list, template terms,
 *        and ModuleConfigurationDialog (Advanced switch, forced values, Reset, Cancel).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from './helpers/fakeDom.js';

installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
const { HMsg } = await import('../src/ui/HMsg.js');
const { ModuleConfigurationDialog } = await import('../src/ui/config/ModuleConfigurationDialog.js');
const {
  configurationFormMode, describeConfigurationForm, hasOptionalItems, mergeSettings, smartyTemplateTerms
} = await import('../src/data/moduleConfigurationForm.js');

const FORM = {
  format: 'heurist-edit-form/1',
  groups: [
    { id: 'interface', label: 'Interface', children: [
      { name: 'options.ui.showHeader', type: 'boolean', label: 'Show header', req: 'recommended', default: false, mode: 'checkbox', clearable: false },
      { name: 'options.ui.showOptions', type: 'boolean', req: 'forbidden', default: true, forced: { website: false, publication: false } }
    ] },
    { id: 'native', label: 'Native', inner: true, modes: ['configuration', 'website'], children: [
      { name: 'options.nativeControls.zoom', type: 'boolean', label: 'Zoom', req: 'recommended', default: true, mode: 'checkbox', clearable: false }
    ] },
    { id: 'defaults', label: 'Default settings', children: [
      { name: 'config.defaults.limit', type: 'integer', label: 'Limit', req: 'optional', default: 10 },
      { name: 'config.defaults.popupTemplate', type: 'enum', label: 'Popup', req: 'recommended', mode: 'select',
        terms: [{ id: 'none', label: 'None' }], termsSource: 'smartyTemplates', emptyLabel: 'Built-in' }
    ] }
  ]
};

const DEFAULTS = () => ({
  options: { ui: { showHeader: false, showOptions: true }, nativeControls: { zoom: true } },
  config: { defaults: { limit: 10, popupTemplate: null }, other: { kept: 1 } }
});
const normalize = (value) => mergeSettings(DEFAULTS(), value?.options || value?.config ? value : {});

/** Replace HMsg.showMsgDlg; the buttons of each dialog are kept by dialog id. */
function stubDialogs(t) {
  const show = HMsg.showMsgDlg;
  const close = HMsg.closeMsgDlg;
  const dialogs = new Map();
  HMsg.showMsgDlg = (body, options) => {
    const element = document.createElement('dialog');
    dialogs.set(options.dialogId, { body, options, element });
    return element;
  };
  HMsg.closeMsgDlg = (id) => dialogs.delete(id);
  t.after(() => { HMsg.showMsgDlg = show; HMsg.closeMsgDlg = close; });
  return dialogs;
}

/** @returns {Function} The onClick of a dialog button by its label. */
function button(dialog, label) {
  return dialog.options.buttons.find((item) => item.label === label).onClick;
}

test('configurationFormMode accepts the old mode names', () => {
  assert.equal(configurationFormMode('preferences'), 'configuration');
  assert.equal(configurationFormMode('publish'), 'publication');
  assert.equal(configurationFormMode('website'), 'website');
  assert.equal(configurationFormMode('nonsense'), 'configuration');
});

test('mergeSettings keeps the keys the form does not have', () => {
  const merged = mergeSettings({ a: { b: 1, c: [1] }, d: 2 }, { a: { b: 5, c: [3, 4] } });
  assert.deepEqual(merged, { a: { b: 5, c: [3, 4] }, d: 2 });
});

test('describeConfigurationForm: sections, advanced, no UI, forced and shown by mode', () => {
  const rows = describeConfigurationForm(FORM, { mode: 'publication', showOptional: true });
  const row = (key) => rows.find((item) => item.key === key);
  assert.equal(row('options.nativeControls.zoom').section, 'Interface › Native');
  assert.equal(row('options.nativeControls.zoom').shown, false, 'not in publication');
  assert.equal(row('options.ui.showOptions').noUI, true);
  assert.deepEqual(row('options.ui.showOptions').forced, { value: false });
  assert.equal(row('config.defaults.limit').advanced, true);
  assert.equal(row('config.defaults.popupTemplate').termsSource, 'smartyTemplates');
  assert.equal(hasOptionalItems(FORM, { mode: 'configuration' }), true);
});

test('smartyTemplateTerms makes terms of the report template options', async () => {
  const terms = await smartyTemplateTerms({ list: async () => [{ value: 'a.tpl', label: 'A' }, { value: '' }] })();
  assert.deepEqual(terms, [{ id: 'a.tpl', label: 'A' }]);
  assert.deepEqual(await smartyTemplateTerms(null)(), []);
});

test('dialog: website mode forces the Options icon off and keeps other settings', async (t) => {
  const dialogs = stubDialogs(t);
  const dialog = new ModuleConfigurationDialog({
    form: FORM, mode: 'website', defaults: DEFAULTS, normalize,
    value: { options: { ui: { showHeader: true } } },
    termsProviders: { smartyTemplates: async () => [{ id: 'card.tpl', label: 'Card' }] }
  });
  const result = dialog.open();
  await flush();
  const main = [...dialogs.values()][0];
  assert.equal(main.options.buttons[1].label, 'Save');
  const popupTerms = dialog.form.getField('config.defaults.popupTemplate').terms.map((term) => term.id);
  assert.deepEqual(popupTerms, ['none', 'card.tpl'], 'terms of the source after the own terms');
  await button(main, 'Save')();
  const settings = await result;
  assert.equal(settings.options.ui.showHeader, true);
  assert.equal(settings.options.ui.showOptions, false, 'forced in website');
  assert.equal(settings.config.defaults.limit, 10, 'advanced value kept while hidden');
  assert.deepEqual(settings.config.other, { kept: 1 }, 'a key without a field stays');
});

test('dialog: Advanced switch, Reset after a confirmation, Cancel of a changed form asks first', async (t) => {
  const dialogs = stubDialogs(t);
  const dialog = new ModuleConfigurationDialog({
    form: FORM, mode: 'preferences', formId: 'test', defaults: DEFAULTS, normalize,
    value: { options: { ui: { showHeader: true } }, config: { defaults: { limit: 50 } } }
  });
  const result = dialog.open();
  await flush();
  assert.equal(dialog.mode, 'configuration');
  assert.equal(dialog.form.getFieldWidget('config.defaults.limit').container.hidden, true, 'advanced off at first');
  const main = [...dialogs.values()][0];
  const checkbox = main.body.querySelector('.h-module-config-advanced').querySelector('input');
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('change'));
  assert.equal(dialog.form.getFieldWidget('config.defaults.limit').container.hidden, false);

  button(main, 'Reset')();
  const confirm = dialogs.get(`${dialog.dialogId}-confirm`);
  button(confirm, 'Reset')();
  await flush();
  assert.equal(dialog.getValue().config.defaults.limit, 10);
  assert.equal(dialog.getValue().options.ui.showHeader, false);

  button(main, 'Cancel')();
  const discard = dialogs.get(`${dialog.dialogId}-confirm`);
  assert.ok(discard, 'a reset form asks before it is closed');
  button(discard, 'Discard')();
  assert.equal(await result, null);
});

test('dialog: publication asks "Cancel publish?" (Yes closes, No stays), not "Discard changes?"', async (t) => {
  const dialogs = stubDialogs(t);
  const dialog = new ModuleConfigurationDialog({ form: FORM, mode: 'publish', defaults: DEFAULTS, normalize });
  const result = dialog.open();
  await flush();
  const main = [...dialogs.values()][0];
  assert.equal(main.options.buttons[1].label, 'Publish');
  button(main, 'Cancel')();
  const confirm = dialogs.get(`${dialog.dialogId}-confirm`);
  assert.equal(confirm.body, 'Cancel publish?');
  button(confirm, 'No')();
  assert.ok(dialog.form, 'still open');
  button(main, 'Cancel')();
  button(dialogs.get(`${dialog.dialogId}-confirm`), 'Yes')();
  assert.equal(await result, null);
});
