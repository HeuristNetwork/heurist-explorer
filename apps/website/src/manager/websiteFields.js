/**
 * @file websiteFields.js
 * @brief Fields of the website record in a form (plan 27f §13): title, subtitle, short summary, logo and banner image,
 *        made from the record structure of the website type (labels, file inputs and translations of the database).
 *        Used by the New website popup and the Header block of *Navigation and layout* in the Styles popup.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { fieldsToDetails, recordFieldValues } from '#shared/data/recordEditValues.js';
import { structureFields } from '#shared/data/recordEditStructure.js';
import { multilangFieldIds } from '#shared/data/writableRecordTypes.js';
import { RecordStructureProvider } from '#shared/recordview/RecordStructureProvider.js';
import { HEditForm } from '#shared/widgets/edit-form/HEditForm.js';

/** The fields of the website record by their key in the website codes (WebsiteRepository::CONSTANTS), in form order. */
export const WEBSITE_FIELD_KEYS = Object.freeze(['name', 'subtitle', 'shortSummary', 'logo', 'banner']);

/**
 * The prominent fields of a page record (plan 27i §9): name, description (menu rollover), menu icon, menu item. Add page
 * and the page root form of the page editor.
 */
export const PAGE_FIELD_KEYS = Object.freeze(['name', 'shortSummary', 'thumbnail', 'menuFormat']);

/**
 * The fields of the website type in the order of `keys`; a field missing in the structure is left out.
 *
 * @param {object} structure Edit structure of the website type (RecordStructureProvider.editStructure).
 * @param {Object<string, number>} codes Local ids of the website codes.
 * @param {string[]} keys Keys of WEBSITE_FIELD_KEYS.
 * @returns {Array<object>} Fields of the structure.
 */
export function websiteFields(structure, codes, keys) {
  const fields = structureFields(structure);
  return keys.map((key) => fields.find((field) => field.dty === Number(codes?.[key]))).filter(Boolean);
}

/**
 * A form of website or page fields in `host`.
 *
 * @param {HTMLElement} host Element of the form.
 * @param {object} options
 * @param {object} options.dbdefs HDbDefs.
 * @param {object} options.apiClient HeuristApiClient.
 * @param {Object<string, number>} options.codes Local ids of the website codes (`WebsiteClient.codes()`).
 * @param {string} [options.type] Key of the record type in the codes: `home` (a website) or `page`.
 * @param {string[]} [options.keys] Fields to show (WEBSITE_FIELD_KEYS, PAGE_FIELD_KEYS).
 * @param {object|null} [options.record] The record (its values); null: a new record.
 * @param {Object<string, string>} [options.initial] First values of a new record by key of the codes (e.g. `name`).
 * @param {string[]} [options.languages] Languages of the website (translation rows).
 * @param {object} [options.services] `recordField` (`richText`, `fileUrl`, `editFile`, `fileViewer` of the host),
 *        `translator`, `browseRecords`, `createRecordBrowser`.
 * @returns {Promise<{form: HEditForm|null, validate: () => Array<object>, details: () => Object<string, Array>,
 *          changed: () => Object<string, Array>, destroy: () => Promise<void>}>} `details`: all fields; `changed`:
 *          only the fields whose value changed.
 */
export async function createWebsiteFieldsForm(host, {
  dbdefs, apiClient, codes, type: typeKey = 'home', keys = WEBSITE_FIELD_KEYS, record = null, initial = {}, languages = [], services = {}
}) {
  const type = Number(codes?.[typeKey]) || 0;
  const structure = type
    ? await new RecordStructureProvider({ apiClient }).editStructure(type, { multilangIds: multilangFieldIds(dbdefs, type), dbdefs })
    : null;
  const fields = structure ? websiteFields(structure, codes, keys) : [];
  if (!fields.length) {
    return { form: null, validate: () => [], details: () => ({}), changed: () => ({}), destroy: async () => {} };
  }
  const groups = [{ id: 'website', children: fields }];
  const states = record ? new Map([...recordFieldValues(record, { groups })].map(([key, state]) => [String(key), state])) : new Map();
  const { recordField = {} } = services;
  const form = new HEditForm().attach(host, {
    // labels of the record structure come from the database: not translated
    form: { localized: true, groups },
    states,
    allowHidden: true,
    languages: languages.length > 1 ? languages.map((code) => code.toUpperCase()) : undefined,
    translator: services.translator || null,
    richText: recordField.richText || null,
    fileUrl: recordField.fileUrl,
    editFile: recordField.editFile,
    fileViewer: recordField.fileViewer,
    apiClient,
    dbdefs,
    browseRecords: services.browseRecords,
    createRecordBrowser: services.createRecordBrowser
  });
  await form.render();
  if (!record) {
    for (const [key, value] of Object.entries(initial)) {
      if (codes?.[key] && value !== undefined && value !== '') await form.setValue(String(codes[key]), value);
    }
  }
  // the form gives its states by field name (the dty as text), fieldsToDetails reads them by dty
  const details = () => fieldsToDetails(new Map([...form.getStates()].map(([name, state]) => [Number(name), state])), { groups });
  const baseline = details();
  return {
    form,
    validate: () => form.validate(),
    details,
    changed: () => Object.fromEntries(Object.entries(details())
      .filter(([field, values]) => JSON.stringify(values) !== JSON.stringify(baseline[field] ?? []))),
    destroy: () => form.destroy()
  };
}
