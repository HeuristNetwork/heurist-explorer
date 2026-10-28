/**
 * @file moduleConfigurationDialogFactory.js
 * @brief The configuration dialog factory of the presentation modules (plan 29): one factory
 *        for every module, with the callback contract of the former module dialogs.
 *
 * - With a host bridge `openConfiguration` (heurist-explorer) the form opens in the host's
 *   window: in configuration / website mode the settings come back and `onSave` applies them;
 *   in publication mode the host writes the page from `value`, `state` and `publication`.
 * - Without it the module opens ModuleConfigurationDialog itself. A module is published from
 *   heurist-explorer only: publication mode then opens nothing.
 *
 *   api.setConfigurationDialogFactory(createConfigurationDialogFactory({
 *     configuration: mapConfiguration, bridge: host.bridge, termsProviders
 *   }));
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { configurationFormMode, patchFormFields } from '../../data/moduleConfigurationForm.js';

/**
 * A dialog factory for a module.
 *
 * @param {object} options
 * @param {{type: string, form: object, defaults: Function, normalize: Function, serialize: Function}} options.configuration
 *        The module's configuration entry (`src/configuration.js`).
 * @param {object|null} [options.bridge] Host bridge (`openConfiguration` of heurist-explorer).
 * @param {Object<string, Function>} [options.termsProviders] `termsSource` lists of the module's own dialog.
 * @param {object} [options.formOptions] More HEditForm options of the module's own dialog (special editors).
 * @returns {(options: object) => {result: Promise<object|null>, close: Function}} The factory. Its options:
 *          `mode`, `value`, `title`, `simplified`, `terms` (`{source: [{id, label}]}`), `fields` (properties
 *          of fields by name, e.g. `targetTypes`), `onSave(settings, {mode, serialized})` (configuration /
 *          website), `state` and `publication` (publication). While a form is open the factory gives
 *          its handle again: a second click does not open a second form.
 */
export function createConfigurationDialogFactory({ configuration, bridge = null, termsProviders = {}, formOptions = {} }) {
  let current = null;
  return (options = {}) => {
    if (current) return current;
    const handle = { dialog: null, close: () => handle.dialog?.close() };
    current = handle;
    handle.result = openConfiguration(handle, options, { configuration, bridge, termsProviders, formOptions })
      .finally(() => { current = null; });
    return handle;
  };
}

/** Open the form in the host's window or in the module's own window. */
async function openConfiguration(handle, options, { configuration, bridge, termsProviders, formOptions }) {
  const mode = configurationFormMode(options.mode);
  const simplified = options.simplified === true;
  const save = async (settings) => {
    const result = await options.onSave?.(settings, { mode: options.mode || mode, serialized: configuration.serialize(settings) });
    return result !== false;
  };
  if (typeof bridge?.openConfiguration === 'function') {
    if (mode === 'publication') {
      return bridge.openConfiguration({
        mode, title: options.title, value: options.value || null, state: options.state ?? null,
        publication: options.publication ?? null, terms: options.terms || null, fields: options.fields || null, simplified
      });
    }
    const settings = await bridge.openConfiguration({
      mode, title: options.title, value: options.value || null, terms: options.terms || null,
      fields: options.fields || null, simplified
    });
    if (settings) await save(settings);
    return settings;
  }
  // a module is published from heurist-explorer only
  if (mode === 'publication') return null;
  const { ModuleConfigurationDialog } = await import('./ModuleConfigurationDialog.js');
  handle.dialog = new ModuleConfigurationDialog({
    form: patchFormFields(configuration.form, options.fields),
    formId: configuration.type,
    mode,
    title: options.title,
    value: options.value || null,
    defaults: configuration.defaults,
    normalize: configuration.normalize,
    simplified,
    termsProviders: { ...termsProviders, ...termsOf(options.terms) },
    formOptions,
    onSave: (settings) => save(settings)
  });
  return handle.dialog.open();
}

/**
 * `termsSource` providers of fixed lists.
 *
 * @param {Object<string, Array<{id: *, label: string}>>|null} terms Lists by source name.
 * @returns {Object<string, Function>}
 */
export function termsOf(terms) {
  return Object.fromEntries(Object.entries(terms || {}).map(([name, list]) => [name, async () => list || []]));
}
