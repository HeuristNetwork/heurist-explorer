/**
 * @file moduleConfigurationForm.js
 * @brief Module configuration forms (plan 29): modes, the settings out of a form, the
 *        list of options for a mode (describeConfiguration) and the Smarty template terms.
 *
 * A module configuration form is an HEditForm JSON whose field names are the dotted keys
 * of the settings envelope `{options, config}`; `req`, `modes`, `forced` and `simplified`
 * say where a field is shown (editFormSchema.js, plan 29 §9).
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

import { defaultValue, forcedValue, normalizeEditForm, ruleHides } from './editFormSchema.js';

/** Modes of a module configuration form (plan 29 §2). */
export const CONFIGURATION_FORM_MODES = Object.freeze(['configuration', 'website', 'publication']);

/** Old dialog mode names (`preferences`, `publish`) to the form modes. */
const OLD_MODES = Object.freeze({ preferences: 'configuration', publish: 'publication' });

/**
 * A form mode from a new or an old mode name.
 *
 * @param {string} value Mode (`configuration`, `website`, `publication`, or `preferences`, `publish`).
 * @returns {string} Form mode; `configuration` when unknown.
 */
export function configurationFormMode(value) {
  const mode = String(value || '').toLowerCase();
  const mapped = OLD_MODES[mode] || mode;
  return CONFIGURATION_FORM_MODES.includes(mapped) ? mapped : 'configuration';
}

/**
 * Settings from the form values over the settings the form was opened with: keys the
 * form does not have stay. Plain objects are merged, everything else is replaced.
 *
 * @param {object} base Settings the form was opened with.
 * @param {object} values HEditForm values (nested by the dotted names).
 * @returns {object} New settings.
 */
export function mergeSettings(base, values) {
  const result = clone(base && typeof base === 'object' ? base : {});
  const merge = (target, source) => {
    for (const [key, value] of Object.entries(source || {})) {
      if (isPlainObject(value) && isPlainObject(target[key])) merge(target[key], value);
      else target[key] = clone(value);
    }
  };
  merge(result, values);
  return result;
}

/**
 * A copy of a form JSON with properties of some fields changed: what only the module knows,
 * e.g. the record type of the map documents (`targetTypes` of a resource field).
 *
 * @param {object} json Form JSON (not changed).
 * @param {Object<string, object>|null} patches Field properties by field name.
 * @returns {object} The form JSON with the patches.
 */
export function patchFormFields(json, patches) {
  if (!patches || !Object.keys(patches).length) return json;
  return {
    ...json,
    groups: (json.groups || []).map((group) => ({
      ...group,
      children: (group.children || []).map((field) => (patches[field.name] ? { ...field, ...patches[field.name] } : field))
    }))
  };
}

/**
 * Whether a form has optional fields or groups shown in a mode (the Advanced switch is offered).
 *
 * @param {object} json Form JSON.
 * @param {{mode?: string, simplified?: boolean}} [context] Form options.
 * @returns {boolean}
 */
export function hasOptionalItems(json, context = {}) {
  const { form } = normalizeEditForm(json);
  const shown = { ...context, showOptional: true };
  return form.groups.some((group) => !ruleHides(group, shown)
    && (group.req === 'optional' || group.children.some((field) => field.req === 'optional' && !ruleHides(field, shown))));
}

/**
 * The options of a form for a mode, as a flat list (the API `describeConfiguration` and the
 * test popup, plan 29 §12-13).
 *
 * @param {object} json Form JSON.
 * @param {{mode?: string, showOptional?: boolean, simplified?: boolean}} [context] Form options.
 * @returns {Array<{key: string, caption: string, type: string, section: string, terms: Array|null,
 *          default: *, advanced: boolean, noUI: boolean, shown: boolean, forced: {value: *}|null,
 *          modes: string[]|null, help: string, termsSource: string|null}>}
 */
export function describeConfigurationForm(json, context = {}) {
  const { form } = normalizeEditForm(json);
  const outer = new Map();
  let current = null;
  for (const group of form.groups) {
    if (!group.inner) current = group;
    outer.set(group.id, group.inner ? current : null);
  }
  const rows = [];
  for (const group of form.groups) {
    const parent = outer.get(group.id);
    const section = [parent?.label, group.label].filter(Boolean).join(' › ');
    const groupHidden = ruleHides(group, context) || (parent ? ruleHides(parent, context) : false);
    const groupAdvanced = group.req === 'optional' || parent?.req === 'optional';
    for (const field of group.children) {
      rows.push({
        key: field.name,
        caption: field.req === 'forbidden' ? '' : field.label,
        type: field.type === 'special' ? `special:${field.special ?? ''}` : field.type,
        section,
        terms: field.terms ? field.terms.map((term) => ({ id: term.id, label: term.label })) : null,
        default: defaultValue(field),
        advanced: groupAdvanced || field.req === 'optional',
        noUI: field.req === 'forbidden',
        shown: !groupHidden && !ruleHides(field, context),
        forced: forcedValue(field, context),
        modes: field.modes || group.modes || parent?.modes || null,
        help: field.help,
        termsSource: field.termsSource
      });
    }
  }
  return rows;
}

/**
 * A partial settings value as a nested object: dotted key paths (`{'config.defaults.pageSize': 500}`)
 * are expanded, nested objects are kept (the API `patchConfiguration`, plan 29 §12).
 *
 * @param {object} partial Partial settings.
 * @returns {object} Nested partial settings.
 */
export function expandSettingsPatch(partial) {
  const result = {};
  for (const [key, value] of Object.entries(isPlainObject(partial) ? partial : {})) {
    const path = key.split('.').filter(Boolean);
    let target = result;
    path.slice(0, -1).forEach((part) => {
      if (!isPlainObject(target[part])) target[part] = {};
      target = target[part];
    });
    const last = path[path.length - 1];
    if (last === undefined) continue;
    target[last] = isPlainObject(value) && isPlainObject(target[last])
      ? mergeSettings(target[last], value) : clone(value);
  }
  return result;
}

/**
 * The leaves of the `options` and `config` parts of a settings value by dotted key: lists,
 * null and empty objects are leaves.
 *
 * @param {object} settings Settings `{options, config}` or an envelope.
 * @returns {Map<string, *>}
 */
export function flattenSettings(settings) {
  const leaves = new Map();
  const walk = (value, path) => {
    if (isPlainObject(value) && Object.keys(value).length) {
      for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`);
    } else leaves.set(path, value);
  };
  for (const part of ['options', 'config']) {
    if (isPlainObject(settings?.[part])) walk(settings[part], part);
  }
  return leaves;
}

/**
 * The keys whose values differ between two settings values (the `configuration-changed` event).
 *
 * @param {object} before Settings before.
 * @param {object} after Settings after.
 * @returns {string[]} Dotted keys, sorted.
 */
export function changedSettingKeys(before, after) {
  const a = flattenSettings(before);
  const b = flattenSettings(after);
  const keys = new Set([...a.keys(), ...b.keys()]);
  return [...keys].filter((key) => JSON.stringify(a.get(key)) !== JSON.stringify(b.get(key))).sort();
}

/**
 * Check settings against a module configuration: keys the module does not know, and values it
 * does not accept (its normalizer changes them). Missing keys are not errors: they get defaults.
 *
 * @param {{normalize: Function}} configuration Module configuration entry.
 * @param {object} settings Settings `{options, config}` or an envelope.
 * @returns {Array<{key: string, message: string, value?: *}>} Errors; empty when valid.
 */
export function validateModuleSettings(configuration, settings) {
  if (!isPlainObject(settings)) return [{ key: '', message: 'Settings must be an object' }];
  const errors = [];
  for (const key of Object.keys(settings)) {
    if (!['format', 'version', 'options', 'config'].includes(key)) errors.push({ key, message: 'Unknown key' });
  }
  const normalized = flattenSettings(configuration.normalize(clone(settings)));
  // groups of keys (`options`, `options.ui` of `options.ui.language`)
  const prefixes = new Set();
  for (const key of normalized.keys()) {
    const parts = key.split('.');
    for (let length = 1; length < parts.length; length++) prefixes.add(parts.slice(0, length).join('.'));
  }
  for (const [key, value] of flattenSettings(settings)) {
    if (!normalized.has(key)) {
      // an empty object or null given for a group of keys is accepted (the defaults are used)
      if (!(prefixes.has(key) && (value == null || isPlainObject(value)))) errors.push({ key, message: 'Unknown key' });
      continue;
    }
    const used = normalized.get(key);
    if (JSON.stringify(used) !== JSON.stringify(value) && String(used) !== String(value)) {
      errors.push({ key, message: 'Value not accepted', value: used });
    }
  }
  return errors;
}

/**
 * The configuration of a module for a mode, without the UI (the API `describeConfiguration`,
 * plan 29 §12): its form and the flat list of its options.
 *
 * @param {{type: string, form: object}} configuration Module configuration entry.
 * @param {{mode?: string, advanced?: boolean, simplified?: boolean}} [options] `advanced`: whether the
 *        optional (Advanced) options count as shown; default true.
 * @returns {{module: string, mode: string, form: object, options: Array<object>}}
 */
export function describeModuleConfiguration(configuration, { mode = 'configuration', advanced = true, simplified = false } = {}) {
  const formMode = configurationFormMode(mode);
  return {
    module: configuration.type,
    mode: formMode,
    form: clone(configuration.form),
    options: describeConfigurationForm(configuration.form, { mode: formMode, showOptional: advanced !== false, simplified: simplified === true })
  };
}

/**
 * A `termsSource` provider of the Smarty report templates (the template pickers, plan 29
 * §3): the `{value, label}` options of a ReportTemplateProvider as terms.
 *
 * @param {{list: () => Promise<Array<{value: string, label: string}>>}|null} provider ReportTemplateProvider.
 * @returns {() => Promise<Array<{id: string, label: string}>>}
 */
export function smartyTemplateTerms(provider) {
  return async () => {
    if (!provider || typeof provider.list !== 'function') return [];
    const items = await provider.list();
    return (Array.isArray(items) ? items : [])
      .filter((item) => item && item.value)
      .map((item) => ({ id: String(item.value), label: String(item.label ?? item.value) }));
  };
}

/** @returns {boolean} Whether a value is a plain object (not a list, not null). */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @returns {*} A deep copy of a JSON value. */
function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
