/**
 * @file crosstabsConfiguration.js
 * @brief Configuration entry of the crosstabs (plan 29 shape, review 2026-11-23): one form with modes for the
 *        crosstabs element of a website page (`website`), the publication from the Explorer pane (`publication`) and
 *        the defaults of the Explorer pane (`configuration`). The settings are those of the website element, flat:
 *        `{preset, from?, level?, query?, ui?: {showSourceHeader?, language?}, config?: {defaults?: {maxAutoReload?}}}`;
 *        `records` (publication) and `source` (Explorer pane) are form choices (review 5, 2026-11-23: header, language,
 *        the limit of the automatic count).
 *
 * Lists of the form (`termsSource`): `crosstabPresets` (the crosstabs), `pageSources` (the sources of the page).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { CROSSTAB_LEVELS } from './crosstabModel.js';

/** What visitors may change (the element can only lower the level of the crosstab). */
export const CROSSTABS_LEVEL_TERMS = Object.freeze([
  { id: 'view', label: 'View' },
  { id: 'display', label: 'Change the display' },
  { id: 'pivot', label: 'Choose the fields' }
]);

/** The records counted: Explorer's current result or the query of the crosstab. */
const RECORDS_TERMS = Object.freeze([
  { id: 'current', label: 'Current result' },
  { id: 'own', label: 'Own query of the crosstab' }
]);

/** Languages of a published page (as the module forms). */
const LANGUAGE_TERMS = Object.freeze([
  { id: 'auto', label: 'Automatic' },
  { id: 'eng', label: 'English' },
  { id: 'fre', label: 'French' },
  { id: 'ger', label: 'German' },
  { id: 'por', label: 'Portuguese' }
]);

/** The records counted without Update (`config.defaults.maxAutoReload`); more: the Update button counts them. */
export const CROSSTABS_AUTO_RELOAD_TERMS = Object.freeze([
  { id: 'manual', label: 'Never (Update button)' },
  { id: '25000', label: '25,000 records' },
  { id: '50000', label: '50,000 records' },
  { id: '100000', label: '100,000 records' }
]);

/** The default of `config.defaults.maxAutoReload` (as CROSSTAB_AUTO_LIMIT). */
const AUTO_RELOAD_DEFAULT = '50000';

/** The form (heurist-edit-form/1; field names are the keys of the settings, dotted names nested). */
const form = Object.freeze({
  format: 'heurist-edit-form/1',
  groups: [
    {
      id: 'source',
      label: 'Crosstab',
      children: [
        { name: 'preset', type: 'enum', label: 'Crosstab', mode: 'select', max: 1, req: 'required', termsSource: 'crosstabPresets',
          modes: ['website', 'publication'], help: 'Public crosstabs can be seen by visitors' },
        { name: 'from', req: 'recommended', type: 'enum', label: 'Records from', mode: 'checkbox', max: 0, termsSource: 'pageSources',
          modes: ['website'], help: 'Any of them: the crosstab counts the latest search' },
        { name: 'records', req: 'recommended', type: 'enum', label: 'Records', mode: 'radio', clearable: false, terms: RECORDS_TERMS, default: 'current',
          modes: ['publication'], help: 'Current result: the page counts the records shown now in Explorer' },
        { name: 'source', req: 'recommended', type: 'enum', label: 'Records counted', mode: 'select', clearable: false, terms: RECORDS_TERMS, default: 'current',
          modes: ['configuration'], help: 'At the start of the Crosstabs pane' }
      ]
    },
    {
      id: 'behaviour',
      label: 'Visitors',
      children: [
        { name: 'level', req: 'recommended', type: 'enum', label: 'Visitors can', mode: 'select', max: 1, emptyLabel: 'As in the crosstab',
          terms: CROSSTABS_LEVEL_TERMS, help: 'Lowers what the crosstab allows' },
        { name: 'ui.showSourceHeader', req: 'recommended', type: 'boolean', label: 'Show header', mode: 'checkbox', clearable: false, default: false,
          modes: ['website', 'publication'], help: 'The name of the crosstab above it' },
        { name: 'ui.language', req: 'recommended', type: 'enum', label: 'Language', mode: 'select', clearable: false, terms: LANGUAGE_TERMS,
          default: 'auto', modes: ['publication'], help: 'Language of the published page; Automatic follows the browser of the visitor' }
      ]
    },
    {
      id: 'defaults',
      label: 'Default settings',
      modes: ['website'],
      children: [
        { name: 'config.defaults.maxAutoReload', req: 'recommended', type: 'enum', label: 'Count automatically up to', mode: 'select', clearable: false,
          terms: CROSSTABS_AUTO_RELOAD_TERMS, default: AUTO_RELOAD_DEFAULT, modes: ['website'],
          help: 'More records: the visitor counts them with Update' }
      ]
    }
  ]
});

/**
 * The limit of the automatic count of stored settings: a number of records or `manual`; null: the default (a value no
 * longer in the list too).
 *
 * @param {*} value
 * @returns {string|null}
 */
function autoReload(value) {
  const text = String([value].flat()[0] ?? '');
  return CROSSTABS_AUTO_RELOAD_TERMS.some((term) => term.id === text) ? text : null;
}

/**
 * The `autoLimit` of HCrosstab from `config.defaults.maxAutoReload`: 0 never (Update), else the number
 * of records; undefined: the default of HCrosstab.
 *
 * @param {object} [settings] Settings of the element.
 * @returns {number|undefined}
 */
export function crosstabsAutoLimit(settings) {
  const value = autoReload(settings?.config?.defaults?.maxAutoReload);
  if (value === 'manual') return 0;
  return value ? Number(value) : undefined;
}

/** @returns {object} The settings of a new crosstabs element. */
function defaults() {
  return { preset: null, level: null, records: 'current', source: 'current' };
}

/**
 * Settings from stored or form values: the keys of the form (and the published query), checked.
 *
 * @param {object} value
 * @returns {object}
 */
function normalize(value) {
  const input = value && typeof value === 'object' ? value : {};
  const one = (item) => [item].flat()[0];
  const preset = Number(one(input.preset));
  const level = String(one(input.level) ?? '');
  const records = String(one(input.records) ?? '');
  const source = String(one(input.source) ?? '');
  const settings = {
    preset: preset > 0 ? preset : null,
    level: CROSSTAB_LEVELS.includes(level) ? level : null,
    records: records === 'own' ? 'own' : 'current',
    source: source === 'own' ? 'own' : 'current'
  };
  if (Array.isArray(input.from)) settings.from = [...new Set(input.from.filter((token) => typeof token === 'string' && token))];
  if (input.query != null && input.query !== '') settings.query = input.query;
  const ui = {};
  if (input.ui?.showSourceHeader != null) ui.showSourceHeader = [input.ui.showSourceHeader].flat()[0] === true;
  const language = String([input.ui?.language].flat()[0] ?? '');
  if (LANGUAGE_TERMS.some((term) => term.id === language)) ui.language = language;
  if (Object.keys(ui).length) settings.ui = ui;
  const limit = autoReload(input.config?.defaults?.maxAutoReload);
  if (limit) settings.config = { defaults: { maxAutoReload: limit } };
  return settings;
}

/**
 * The settings stored in a page: without the empty ones and the form choices of the other modes.
 *
 * @param {object} settings Normalized settings.
 * @returns {object}
 */
function serialize(settings) {
  const value = normalize(settings);
  return {
    preset: value.preset,
    ...(value.from ? { from: value.from } : {}),
    ...(value.level ? { level: value.level } : {}),
    ...(value.query != null ? { query: value.query } : {}),
    // the header; the language of a published page (not Automatic, review 7)
    ...(value.ui?.showSourceHeader || (value.ui?.language && value.ui.language !== 'auto') ? {
      ui: {
        ...(value.ui.showSourceHeader ? { showSourceHeader: true } : {}),
        ...(value.ui.language && value.ui.language !== 'auto' ? { language: value.ui.language } : {})
      }
    } : {}),
    ...(value.config?.defaults?.maxAutoReload && value.config.defaults.maxAutoReload !== AUTO_RELOAD_DEFAULT
      ? { config: value.config } : {})
  };
}

/**
 * The page of a publication (presentation-sources.md §6): the crosstab counts its own query on the page; with
 * *Current result* the query of the records shown in Explorer (`publication.query`) is kept in the page. `values`: the
 * form values (`records` and `ui.language` are not in the serialized settings; review 5: Own query published the current
 * result).
 *
 * @param {{settings: object, values?: object, publication?: {query?: *}|null}} input
 * @returns {{settings: object, state: null}}
 */
function preparePublication({ settings, values = null, publication = null }) {
  const value = normalize({ ...(settings || {}), ...(values || {}) });
  const query = value.records === 'current' ? publication?.query ?? null : null;
  const ui = {
    ...(value.ui?.showSourceHeader ? { showSourceHeader: true } : {}),
    language: value.ui?.language || 'auto'
  };
  return {
    settings: {
      preset: value.preset,
      from: ['own'],
      ...(value.level ? { level: value.level } : {}),
      ...(query != null && query !== '' ? { query } : {}),
      ui
    },
    state: null
  };
}

/**
 * The fields of a mode with their lists filled in (the CMS element form, built with HEditForm directly).
 *
 * @param {string} mode Form mode.
 * @param {Object<string, Array<{id: string, label: string}>>} [terms] Lists by `termsSource`.
 * @returns {Array<object>} The fields (each with `terms`, without `modes`).
 */
export function crosstabsFormFields(mode, terms = {}) {
  const fields = [];
  for (const group of form.groups) {
    for (const field of group.children) {
      if (field.modes && !field.modes.includes(mode)) continue;
      const { modes: _modes, termsSource, ...rest } = field;
      fields.push(termsSource ? { ...rest, terms: terms[termsSource] || [] } : { ...rest });
    }
  }
  return fields;
}

/** The configuration of the crosstabs: form JSON, defaults, normalizer, serializer, publication. */
export const crosstabsConfiguration = Object.freeze({
  type: 'crosstabs',
  form,
  defaults,
  normalize,
  serialize,
  preparePublication
});
