/**
 * @file widgetForms.js
 * @brief Forms of the CMS designer for semi-static content (plan 27e): the field of a text element, the configuration
 *        of the widgets Custom report, Record cards and Media gallery, and the same media form for one media element. Pure helpers of the forms
 *        (settings, references, snapshot) are exported for the tests.
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

import { $HR, HMsg } from '#shared/ui';
import { hasQueryParameters } from '#shared/data/queryParameters.js';
import { temporalToHuman } from '#shared/utils/temporal.js';
import { SLIDER_DEFAULTS, SLIDER_FIT } from '#shared/widgets/site/HSlider.js';
import { cmsMediaAction, cmsMediaType } from '#shared/site/cmsMedia.js';
import { RecordEditClient } from '#shared/data/RecordEditClient.js';
import { fieldsToDetails, recordFieldValues } from '#shared/data/recordEditValues.js';
import { structureFields } from '#shared/data/recordEditStructure.js';
import { allowsStoredCode, isStoredCodeField } from '#shared/data/storedTextPolicy.js';
import { multilangFieldIds } from '#shared/data/writableRecordTypes.js';
import { RecordStructureProvider } from '#shared/recordview/RecordStructureProvider.js';
import { HEditForm } from '#shared/widgets/edit-form/HEditForm.js';
import { openEditFormDialog } from '#shared/widgets/edit-form/editFormDialog.js';
import { formDialog } from './designerDialogs.js';
import {
  attachNewRecordPage, recordActionFields, recordActionIssues, recordActionSettings, recordActionValues
} from './recordPageField.js';

/** Width and height of a new gallery: thumbnails. */
const NEW_GALLERY_SIZE = '190px';

/** Hard limit of a cards widget (PageContent::CARD_LIMIT). */
export const CARD_LIMIT = 50;

/** Field types offered for a text element; a file gives an image (the logo of a header). */
const FIELD_TYPES = new Set(['date', 'integer', 'float', 'year', 'numeric', 'freetext', 'blocktext', 'enum', 'file']);

/** The answer of the API (`data` or the body itself). */
const body = (response) => response?.data ?? response;

/**
 * Split a field reference.
 *
 * @param {string|null} reference `207439.2-1`, `website.2-1`, `page.2-1`.
 * @returns {{source: string, record: number, code: string}|null} `source`: website, page or record.
 */
export function parseFieldReference(reference) {
  const match = /^(website|page|\d+)\.(\d+(?:-\d+)?)$/.exec(String(reference ?? ''));
  if (!match) return null;
  const record = /^\d+$/.test(match[1]) ? Number(match[1]) : 0;
  return { source: record ? 'record' : match[1], record, code: match[2] };
}

/**
 * Fields of a record type for the Field list: the types of a text element, no linked records.
 *
 * @param {object} dbdefs HDbDefs.
 * @param {number} rectypeId Record type.
 * @param {number[]} [excluded] Fields not offered.
 * @returns {Array<{id: number, label: string}>}
 */
export function fieldTerms(dbdefs, rectypeId, excluded = []) {
  return (dbdefs?.fields?.(rectypeId) || []).filter((field) => FIELD_TYPES.has(field.type) && !excluded.includes(Number(field.id)))
    .map((field) => ({ id: Number(field.id), label: field.name }));
}

/** @returns {string} Text for HTML. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
}

/**
 * The last resolved value of a field as HTML (`GET /records/{id}/{field}?resolveDetails=1`); the server replaces it
 * when it renders the page. Translated values: the ones without a language.
 *
 * @param {Array<*>} values Values of the field.
 * @param {string} type Field type.
 * @param {{fileUrl?: (key: string) => string}} [options]
 * @returns {string} HTML.
 */
export function fieldSnapshot(values, type, { fileUrl = null } = {}) {
  const list = Array.isArray(values) ? values : [];
  if (type === 'file') {
    const key = list.map((value) => value?.file?.ulf_ObfuscatedFileID).find(Boolean);
    return key && fileUrl ? `<img src="${escapeHtml(fileUrl(key)).replace(/"/g, '&quot;')}" alt="">` : '';
  }
  if (type === 'enum') return escapeHtml(list.map((value) => value?.trm_Label ?? '').filter(Boolean).join(', '));
  const texts = list.map((value) => String(value?.value ?? value ?? ''));
  const plain = texts.filter((text) => !/^[a-z]{3}:/i.test(text));
  const shown = plain.length ? plain : texts.map((text) => text.replace(/^[a-z]{3}:/i, ''));
  if (type === 'date') return escapeHtml(shown.map((text) => temporalToHuman(text)).join(', '));
  return type === 'blocktext' ? shown.join('') : escapeHtml(shown.join(', '));
}

/**
 * Whether guests can see a record (`RecordRepository::accessSql`: `pending` is shown as `public`).
 *
 * @param {string} [visibility] `rec_NonOwnerVisibility`.
 * @returns {boolean}
 */
export function visibleToGuests(visibility) {
  return !['hidden', 'viewable'].includes(visibility);
}

/**
 * The value of one field as record details: only this field goes into the PATCH.
 *
 * @param {object} field Field of the edit structure.
 * @param {{values: Array<object>, translations: Array<object>}} state State of its input.
 * @returns {Object<string, Array>} Details.
 */
export function fieldDetails(field, state) {
  return fieldsToDetails(new Map([[field.dty, state]]), { groups: [{ children: [field] }] });
}

/** Help above the form of a Record field element (2026-11-12). */
const FIELD_HELP = 'Choose a record and one of its fields: the value is shown as a text element of the page. If you may edit'
  + ' the record, you can change the value of the field directly in this form. With the source "A record" the element can'
  + ' have an action: open the record URL or a record page.';

/** Help above the form of a media element (2026-11-12). */
const MEDIA_HELP = 'Shows one image, video, audio, PDF or 3D file. Choose its source: a media record, a registered file (an'
  + ' uploaded file or a URL), or any record and one of its file fields. With the source "Any record" the element can have'
  + ' an action: open the record URL or a record page.';

/** Help of the Source "Record of the page URL" of Record cards (plan 27g, 2026-11-12). */
const CARDS_URL_HELP = 'Record of the page URL: the record id is taken from the address of the page. Such a page is a record'
  + ' page: the action "Open record page" of Record cards, Record fields, media and action menus on other pages opens it'
  + ' with their record.';

/**
 * The form of a Record field element: Source, Record, Field and below the input of this field with its translations. Save
 * writes the field of the record when it changed.
 *
 * @param {object} options
 * @param {string|null} options.reference Current `data-h-field`; null for a new element.
 * @param {{site: number, page: number}} options.records The website and the page of the element (0: none).
 * @param {string[]} [options.languages] Languages of the website.
 * @param {object} options.dbdefs HDbDefs.
 * @param {object} options.apiClient HeuristApiClient.
 * @param {object} options.services `browseRecords`, `createRecordBrowser`, `fileUrl`, `valueLimit`, `translator`, `cmsFields` (fields
 *        of website records that hold the page itself), `recordField` (`richText`, `fileUrl`, `editFile`, `fileViewer` of the
 *        host), `saveField(id, details, modified)`.
 * @param {{width?: string, height?: string}} [options.size] Width and height of the element (its own style); asked for a file field.
 * @param {string|null} [options.link] `data-h-link` of the element: the action of source *A record* (plan 27g §6).
 * @returns {Promise<{reference: string, html: string, link: string, size?: {width: string, height: string}}|null>} Null: cancelled.
 *          `size` only for a file field ('' = auto); `link`: `url`, `page:<id>` or ''.
 */
export async function openFieldForm({ reference, records, languages = [], dbdefs, apiClient, services, size = {}, link = null }) {
  const parsed = parseFieldReference(reference);
  const cmsTypes = ['RT_CMS_HOME', 'RT_CMS_PAGE'].map((name) => Number(dbdefs?.dbconst?.(name)) || 0);
  const client = new RecordEditClient({ apiClient });
  const structures = new RecordStructureProvider({ apiClient });
  const loaded = new Map();
  const recordOf = (id) => {
    if (!loaded.has(id)) loaded.set(id, client.load(id).then((answer) => answer.record));
    return loaded.get(id);
  };
  const recordIdOf = (current) => {
    if (current.source === 'website') return records.site;
    return current.source === 'page' ? records.page : Number(current.record) || 0;
  };
  const termsOf = (type) => fieldTerms(dbdefs, type, cmsTypes.includes(type) ? services.cmsFields || [] : []);
  const start = parsed ? (parsed.source === 'record' ? parsed.record : recordIdOf({ source: parsed.source })) : (records.site || records.page);
  const startRecord = start ? await recordOf(start).catch(() => null) : null;
  const form = {
    groups: [{
      id: 'main',
      children: [
        {
          name: 'source', type: 'enum', label: 'Source', mode: 'radio', max: 1,
          terms: [{ id: 'record', label: 'A record' }, ...(records.site ? [{ id: 'website', label: 'This website' }] : []), { id: 'page', label: 'This page' }]
        },
        { name: 'record', type: 'resource', label: 'Source record', max: 1, targetTypes: [], pointerMode: 'browseonly', showWhen: { source: 'record' } },
        { name: 'field', type: 'enum', label: 'Field', max: 1, terms: termsOf(Number(startRecord?.rec_RecTypeID) || 0) },
        // the link of the value: only for a record (plan 27g §6)
        ...recordActionFields({ pageTerms: services.recordPageTerms?.() || [], showWhen: { source: 'record' } }),
        // the box of an image (a file field, review 2026-11-09)
        { name: 'width', type: 'freetext', label: 'Width', help: 'Empty = auto; a number is px, or %. The image fits inside.', max: 1 },
        { name: 'height', type: 'freetext', label: 'Height', max: 1 }
      ]
    }]
  };
  const localField = parsed ? Number(dbdefs?.localId?.('dty', parsed.code) || parsed.code) || null : null;
  // the input of the field: its own form, made again for another record or field
  const value = { host: document.createElement('div'), form: null, field: null, record: null, baseline: '', turn: 0 };
  value.host.className = 'h-cms-field-value';
  // the chosen field is a file: Width and Height are shown
  let isFile = false;
  const readValue = () => fieldDetails(value.field, value.form.getStates().get(String(value.field.dty)));
  const showValue = async (edit) => {
    const turn = ++value.turn;
    const current = edit.getValues();
    const id = recordIdOf(current);
    const record = id ? await recordOf(id).catch(() => null) : null;
    if (turn !== value.turn) return;
    const type = Number(record?.rec_RecTypeID) || 0;
    const terms = termsOf(type);
    await edit.updateField('field', { terms });
    const dty = terms.some((term) => term.id === Number(current.field)) ? Number(current.field) : 0;
    isFile = dbdefs?.fieldGlobal?.(dty)?.type === 'file';
    edit.showField('width', isFile);
    edit.showField('height', isFile);
    const structure = dty ? await structures.editStructure(type, { multilangIds: multilangFieldIds(dbdefs, type), dbdefs }) : null;
    if (turn !== value.turn) return;
    await value.form?.destroy();
    value.form = null;
    value.field = structureFields(structure).find((field) => field.dty === dty) || null;
    value.record = record;
    value.host.replaceChildren();
    if (!value.field) return;
    const groups = [{ id: 'value', children: [value.field] }];
    const states = new Map([...recordFieldValues(record, { groups })].map(([key, state]) => [String(key), state]));
    const host = document.createElement('div');
    value.host.append(host);
    const { recordField = {} } = services;
    value.form = new HEditForm().attach(host, {
      // labels of the record structure come from the database: not translated
      form: { localized: true, groups },
      states,
      allowHidden: true,
      // the translation rows at once
      showTranslations: true,
      languages: languages.length ? languages.map((code) => code.toUpperCase()) : undefined,
      translator: services.translator || null,
      richText: recordField.richText || null,
      fileUrl: recordField.fileUrl,
      editFile: recordField.editFile,
      fileViewer: recordField.fileViewer,
      textPolicy: (field) => ({ allowCode: allowsStoredCode(dbdefs, type, field.dty), codeField: isStoredCodeField(dbdefs, field.dty) }),
      valueLimit: services.valueLimit,
      apiClient,
      dbdefs,
      browseRecords: services.browseRecords,
      createRecordBrowser: services.createRecordBrowser
    }).render();
    value.baseline = JSON.stringify(readValue());
  };
  let result = null;
  const answer = await openEditFormDialog({
    title: 'Content of element: Record field',
    className: 'h-dialog-cms-field',
    form,
    values: { source: parsed?.source || (records.site ? 'website' : 'page'), record: parsed?.record || null, field: localField,
      width: mediaSizeValue(size.width, true), height: mediaSizeValue(size.height, true), ...linkValues(link) },
    apiClient,
    dbdefs,
    browseRecords: services.browseRecords,
    createRecordBrowser: services.createRecordBrowser,
    onReady: (edit) => {
      addFormHelp(edit, FIELD_HELP);
      edit.showField('width', false);
      edit.showField('height', false);
      attachNewRecordPage(edit, services);
      edit.container.append(value.host);
      void showValue(edit);
    },
    onChange: (edit, change) => {
      if (['source', 'record', 'field'].includes(change.name)) void showValue(edit);
    },
    validate: (current) => {
      if (current.source === 'record' && !current.record) return [{ field: 'record', message: $HR('Choose a record') }];
      if (!current.field) return [{ field: 'field', message: $HR('Choose a field') }];
      if (current.source === 'record' && recordActionIssues(current).length) return recordActionIssues(current);
      const sizes = isFile ? ['width', 'height'].filter((key) => current[key] && !mediaSize(current[key])) : [];
      return sizes.length ? sizes.map((key) => ({ field: key, message: $HR('Width and height: a number (px), px or %, or empty (auto).') })) : null;
    },
    buttons: [{ id: 'save', label: 'Save', primary: true }, { id: 'cancel', label: 'Cancel' }],
    onAction: async (action, values) => {
      if (!value.form || !value.field || value.form.validate().length) return false;
      const { dty } = value.field;
      const id = Number(value.record.rec_ID);
      try {
        const details = readValue();
        if (JSON.stringify(details) !== value.baseline) await services.saveField(id, details, value.record.rec_Modified);
        const global = dbdefs?.fieldGlobal?.(dty);
        const code = global?.concept || String(dty);
        const shown = body(await apiClient.get(`/records/${id}/${code}`, { query: { resolveDetails: 1 } }))?.records?.[0];
        const source = sourceOf(id, records);
        result = {
          reference: `${source === 'record' ? id : source}.${code}`,
          link: source === 'record' ? linkOf(recordActionSettings(values)) : '',
          html: fieldSnapshot(shown?.details?.[String(dty)], global?.type, { fileUrl: services.fileUrl }),
          ...(global?.type === 'file' ? { size: { width: mediaSize(values?.width) || '', height: mediaSize(values?.height) || '' } } : {})
        };
      } catch (error) {
        HMsg.showMsgErr?.(error?.message || String(error));
        return false;
      }
      if (!visibleToGuests(value.record.rec_NonOwnerVisibility)) {
        HMsg.showMsgFlash?.($HR('This record is not public: visitors who may not see it get an empty element.'), { showDelay: 4000 });
      }
      return true;
    }
  }).finally(() => value.form?.destroy());
  return answer ? result : null;
}

/** Values of the action fields from `data-h-link` (`url`, `page:<id>`). */
function linkValues(link) {
  const page = /^page:(\d+)$/.exec(String(link ?? ''));
  return recordActionValues(page ? { action: 'recordPage', recordPage: Number(page[1]) } : { action: link === 'url' ? 'url' : 'none' });
}

/** `data-h-link` of the action settings; '' for none. */
function linkOf(settings) {
  if (settings.action === 'url') return 'url';
  return settings.action === 'recordPage' ? `page:${settings.recordPage}` : '';
}

/** The source of a reference: the website, the page, or a record. */
function sourceOf(id, records) {
  if (records.site && id === records.site) return 'website';
  return id === records.page ? 'page' : 'record';
}

/** Position of an image in a slider (the options of the legacy slideshow, `slideshowStretch`). */
const FIT_TERMS = Object.freeze([
  { id: 'contain', label: 'Fit inside container, preserve aspect ratio' },
  { id: 'height', label: 'Full container height' },
  { id: 'width', label: 'Full container width' },
  { id: 'none', label: 'Original size, no stretching' },
  { id: 'cover', label: 'Fill container, crop if needed' },
  { id: 'fill', label: 'Stretch both directions' }
]);

/** Names of the presentation fields (presentationFields), hidden together by code. */
const PRESENTATION_FIELDS = Object.freeze(['presentation', 'duration', 'fade', 'navigation']);

/**
 * Action fields (recordActionFields, plan 27g §6), presentation and slider fields of the cards and gallery forms.
 *
 * @param {Array<object>} actionFields
 * @param {object|null} [showWhen] When the presentation is offered (Record cards: not for the record of the page URL).
 * @returns {Array<object>}
 */
function presentationFields(actionFields, showWhen = null) {
  // the timing and the start / stop button belong to the slideshow only, a carousel moves by its buttons (plan 27e §29)
  const slider = { ...(showWhen || {}), presentation: 'slider' };
  return [
    ...actionFields,
    { name: 'presentation', type: 'enum', label: 'Presentation', mode: 'radio', max: 1, ...(showWhen ? { showWhen } : {}),
      terms: [{ id: 'list', label: 'List (all visible)' }, { id: 'carousel', label: 'Carousel (one visible, buttons)' },
        { id: 'slider', label: 'Slideshow (one visible, automatic)' }] },
    { name: 'duration', type: 'integer', label: 'Duration (ms)', max: 1, minValue: 500, showWhen: slider },
    { name: 'fade', type: 'integer', label: 'Fade out (ms)', max: 1, minValue: 0, showWhen: slider },
    { name: 'navigation', type: 'boolean', label: 'Navigation', help: 'Start / stop buttons and << < > >>', max: 1, showWhen: slider }
  ];
}

/** Values of the presentation fields from the settings. */
function presentationValues(settings = {}) {
  const slider = { ...SLIDER_DEFAULTS, ...(settings.slider || {}) };
  return { presentation: settings.presentation || 'list', action: settings.action || 'none',
    duration: slider.duration, fade: slider.fade, navigation: slider.navigation };
}

/**
 * Settings from the values of the presentation fields: `list`, `carousel` (one visible, buttons only) or `slider` (slideshow).
 *
 * @param {object} values Values of the form.
 * @returns {{presentation: string, action: string, slider?: object}}
 */
export function presentationSettings(values) {
  const presentation = ['carousel', 'slider'].includes(values.presentation) ? values.presentation : 'list';
  const settings = { presentation, action: values.action || 'none' };
  if (presentation === 'slider') {
    settings.slider = { duration: Number(values.duration) || SLIDER_DEFAULTS.duration, fade: Number(values.fade) || 0, navigation: values.navigation !== false };
  }
  return settings;
}

/**
 * The query of picked records, in the picked order.
 *
 * @param {Array<number|string>} ids Record ids.
 * @returns {Array<object>} `[{ids}, {sortby: 'set'}]`.
 */
export function manualQuery(ids) {
  return [{ ids: ids.map(Number).filter((id) => id > 0).join(',') }, { sortby: 'set' }];
}

/**
 * Record ids of a manual query.
 *
 * @param {*} query Stored query.
 * @returns {number[]}
 */
export function manualIds(query) {
  const text = Array.isArray(query) ? query[0]?.ids : null;
  return String(text || '').split(',').map(Number).filter((id) => id > 0);
}

/**
 * A query of the Query input: JSON of an array or object, without parameters.
 *
 * @param {string} text Input text.
 * @returns {Array<object>|null} The query, or null when it can not be used.
 */
export function parseCardsQuery(text) {
  let query;
  try {
    query = JSON.parse(String(text ?? ''));
  } catch {
    return null;
  }
  if (query && !Array.isArray(query) && typeof query === 'object') query = [query];
  if (!Array.isArray(query) || !query.length || hasQueryParameters(query)) return null;
  return query;
}

/**
 * The Smarty report of the template Team: a card of one record, the fields by their local ids in this database.
 * Language: values follow the language of the page; a static text of a card goes in `{if $heurist->getSysInfo('lang') == 'FRE'}`.
 *
 * @param {object} dbdefs HDbDefs.
 * @returns {string} Template text.
 */
export function teamReportBody(dbdefs) {
  const role = Number(dbdefs?.localId?.('dty', '1252-619')) || 0;
  const summary = Number(dbdefs?.localId?.('dty', '2-3')) || 0;
  return [
    '{* Team member: a card of one record (website template Team) *}',
    '{foreach $results as $r}',
    '{$r = $heurist->getRecord($r)}',
    '{$thumbnail = $heurist->getRecordThumbnail($r)}',
    '<div class="team-member" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px;text-align:center;">',
    '{if $thumbnail}<img src="{$thumbnail}" alt="" style="width:120px;height:120px;object-fit:cover;border-radius:50%;">{/if}',
    '<h3>{$r.recTitle}</h3>',
    ...(role ? [`{if !empty($r.f${role}s)}<p>{foreach $r.f${role}s as $role}{$role.label}{if !$role@last}, {/if}{/foreach}</p>{/if}`] : []),
    ...(summary ? [`{if $r.f${summary}}<p>{$r.f${summary}}</p>{/if}`] : []),
    '</div>',
    '{/foreach}',
    ''
  ].join('\n');
}

/** Help above the form of the widget Record cards (and its text in Add element). */
export const CARDS_HELP = 'A card for each record, made by a Smarty template: records picked by hand or a query, at most 50. Shown as a list, a carousel or a slideshow.';

/**
 * Terms of the Smarty template of the widget Record cards: the card reports, and a stored template file that has no report.
 *
 * @param {Array<{id: number, title: string, file?: string}>} reports Card reports.
 * @param {number|string} [stored] The stored `template`: a report id or a file name.
 * @returns {{terms: Array<{id: string, label: string}>, value: string|null}}
 */
export function cardTemplateTerms(reports, stored = null) {
  const terms = reports.map((report) => ({ id: String(report.id), label: report.title || report.file || `#${report.id}` }));
  if (stored == null || stored === '') return { terms, value: null };
  const byFile = typeof stored === 'string' && !/^\d+$/.test(stored) ? reports.find((report) => report.file === stored) : null;
  if (byFile) return { terms, value: String(byFile.id) };
  const value = String(stored);
  if (!terms.some((term) => term.id === value)) terms.push({ id: value, label: value });
  return { terms, value };
}

/**
 * The query field of the widget Record cards: the text of the query, the Filter Builder from its icon (as the query of a
 * Query Source in the record editor), no parameters.
 *
 * @param {object} services `editQuery(query, filterForm, {allowParameters})`, `describeQuery(query)`.
 * @returns {object} HEditField `special`.
 */
function cardsQuerySpecial(services) {
  return {
    json: false,
    icon: 'fa-sliders',
    title: 'Open the Filter Builder',
    describe: (value) => {
      const query = parseCardsQuery(value);
      return query && typeof services.describeQuery === 'function' ? services.describeQuery(query) || '' : '';
    },
    edit: typeof services.editQuery === 'function' ? async (value) => {
      const result = await services.editQuery(parseCardsQuery(value) || [], null, { allowParameters: false });
      return result?.query ? JSON.stringify(result.query) : undefined;
    } : undefined
  };
}

/**
 * Configuration of the widget Record cards.
 *
 * @param {object} options
 * @param {object} options.settings Current settings.
 * @param {object} options.dbdefs HDbDefs.
 * @param {object} options.apiClient HeuristApiClient.
 * @param {object} options.services `browseRecords`, `createRecordBrowser`, `editQuery`, `describeQuery`, `valueLimit`,
 *        `cardTemplates()` → the card reports `[{id, title, file}]`.
 * @returns {Promise<object|null>} The new settings.
 */
export async function openCardsForm({ settings = {}, dbdefs, apiClient, services }) {
  const reports = await services.cardTemplates?.().catch(() => []) ?? [];
  const templates = cardTemplateTerms(reports, settings.template);
  // the record of the page URL: one record, no action, no presentation (2026-11-12)
  const listed = { mode: ['manual', 'query'] };
  // one record picked by hand: no presentation
  const showPresentation = (edit) => {
    const values = edit.getValues();
    const single = values.mode === 'manual' && [values.records].flat().filter(Boolean).length === 1;
    for (const name of PRESENTATION_FIELDS) edit.showField(name, !single);
  };
  const form = {
    groups: [{
      id: 'main',
      children: [
        // Record of the page URL: the widget of a record page (plan 27g)
        { name: 'mode', type: 'enum', label: 'Source', mode: 'radio', max: 1,
          terms: [{ id: 'manual', label: 'Manual pickup' }, { id: 'query', label: 'Query' }, { id: 'url', label: 'Record of the page URL' }] },
        { name: 'records', type: 'resource', label: 'Source records', max: 0, targetTypes: [], pointerMode: 'browseonly', showWhen: { mode: 'manual' } },
        { name: 'query', type: 'freetext', label: 'Query', max: 1, special: cardsQuerySpecial(services), showWhen: { mode: 'query' } },
        // a selector also for a few templates (not the radios of a small vocabulary)
        { name: 'template', type: 'enum', label: 'Smarty template', mode: 'select', max: 1, terms: templates.terms,
          help: reports.length ? '' : 'Mark a report "Single record (card)" to use it here' },
        ...presentationFields(recordActionFields({ pageTerms: services.recordPageTerms?.() || [], showWhen: listed }), listed)
      ]
    }]
  };
  return openEditFormDialog({
    title: 'Record cards',
    form,
    values: {
      mode: settings.mode || 'manual',
      records: manualIds(settings.mode === 'query' ? null : settings.query),
      query: settings.mode === 'query' && settings.query ? JSON.stringify(settings.query) : '',
      template: templates.value,
      ...presentationValues(settings),
      ...recordActionValues(settings)
    },
    apiClient,
    dbdefs,
    valueLimit: services.valueLimit,
    browseRecords: services.browseRecords,
    createRecordBrowser: services.createRecordBrowser,
    onReady: (edit) => {
      addFormHelp(edit, `${$HR(CARDS_HELP)} ${$HR(CARDS_URL_HELP)}`);
      attachNewRecordPage(edit, services);
      showPresentation(edit);
    },
    onChange: (edit, change) => {
      if (['mode', 'records'].includes(change.name)) showPresentation(edit);
    },
    validate: (values) => {
      const issues = values.mode === 'url' ? [] : [...recordActionIssues(values)];
      if (values.mode === 'manual' && !(values.records || []).filter(Boolean).length) issues.push({ field: 'records', message: $HR('Choose the records') });
      if (values.mode === 'query' && !parseCardsQuery(values.query)) issues.push({ field: 'query', message: $HR('A query in JSON without parameters') });
      if (!values.template) issues.push({ field: 'template', message: $HR('Choose a template') });
      return issues;
    }
  }).then((values) => {
    if (!values) return null;
    const records = [values.records].flat().filter(Boolean);
    const template = String(values.template);
    const mode = ['query', 'url'].includes(values.mode) ? values.mode : 'manual';
    return {
      mode,
      query: mode === 'query' ? parseCardsQuery(values.query) : (mode === 'url' ? null : manualQuery(records)),
      // a report id, or the file name of a template without a report
      template: /^\d+$/.test(template) ? Number(template) : template,
      ...presentationSettings(values),
      ...recordActionSettings(values, { allowed: mode !== 'url' })
    };
  });
}

/** A help text above a form. */
function addFormHelp(edit, text) {
  if (!edit.container) return;
  const hint = document.createElement('div');
  hint.className = 'h-cms-style-note';
  hint.textContent = $HR(text);
  edit.container.prepend(hint);
}

/**
 * First value of a size input: a new gallery starts with thumbnails, a new single element with auto.
 *
 * @param {string|undefined} value Stored size.
 * @param {boolean} single The single media element.
 * @returns {string} Text of the input.
 */
export function mediaSizeValue(value, single) {
  if (value === undefined) return single ? '' : NEW_GALLERY_SIZE;
  return value && value !== 'auto' ? String(value) : '';
}

/** The field of the sources of each Type of the media form. */
const SOURCE_FIELDS = Object.freeze({ media: 'records', files: 'files', record: 'anyRecords' });

/**
 * The file fields of record types, for the Type *Any record* of the media form.
 *
 * @param {object} dbdefs HDbDefs.
 * @param {number[]} rectypeIds Record types of the chosen records; a field of several types once.
 * @returns {Array<{id: number, label: string}>}
 */
export function fileFieldTerms(dbdefs, rectypeIds) {
  const terms = new Map();
  for (const type of new Set(rectypeIds)) {
    for (const field of dbdefs?.fields?.(type) || []) {
      if (field.type === 'file' && !terms.has(Number(field.id))) terms.set(Number(field.id), { id: Number(field.id), label: field.name });
    }
  }
  return [...terms.values()];
}

/**
 * Fields of the media form.
 *
 * @param {{single?: boolean, multilang?: boolean, mediaType?: number, fileType?: number, fileTerms?: Array<object>}} options
 *        `single`: one source, a typed caption, no presentation; `multilang`: the caption has translations; `fileTerms`: the file
 *        fields of the chosen records; `pageTerms`: the record pages of the website (recordPageTerms).
 * @returns {Array<object>} HEditForm fields.
 */
export function mediaFormFields({ single = false, multilang = false, mediaType = 0, fileType = 0, fileTerms = [], pageTerms = [] } = {}) {
  // Media records and Files: None or Player / Viewer; Any record also the links of the record (plan 27g §6)
  const actionFields = [
    { name: 'action', type: 'enum', label: 'Action', mode: 'radio', max: 1, showWhen: { mode: ['media', 'files'] },
      terms: [{ id: 'none', label: 'None' }, { id: 'viewer', label: 'Player / Viewer' }] },
    ...recordActionFields({ name: 'recordAction', viewer: true, pageTerms, showWhen: { mode: 'record' } })
  ];
  const source = { type: 'resource', max: single ? 1 : 0, pointerMode: 'addorbrowse' };
  return [
    // one media element: singular names (2026-11-12)
    { name: 'mode', type: 'enum', label: 'Source', mode: 'radio', max: 1,
      terms: [{ id: 'media', label: single ? 'Media record' : 'Media records' }, { id: 'files', label: single ? 'File' : 'Files' },
        { id: 'record', label: 'Any record' }] },
    { ...source, name: 'records', label: single ? 'Source record' : 'Source records', targetTypes: mediaType ? [mediaType] : [], showWhen: { mode: 'media' } },
    { ...source, name: 'files', label: single ? 'Source file' : 'Source files', targetTypes: fileType ? [fileType] : [], showWhen: { mode: 'files' } },
    { ...source, name: 'anyRecords', label: single ? 'Source record' : 'Source records', targetTypes: [], showWhen: { mode: 'record' } },
    { name: 'fileField', type: 'enum', label: 'Field', max: 1, terms: fileTerms, showWhen: { mode: 'record' } },
    single ? { name: 'captionText', type: 'freetext', label: 'Caption', max: 1, multilang } : { name: 'caption', type: 'boolean', label: 'Show caption', max: 1 },
    { name: 'width', type: 'freetext', label: 'Width', help: 'Empty = auto; a number is px, or %. Both under 200 px: thumbnails.', max: 1 },
    { name: 'height', type: 'freetext', label: 'Height', max: 1 },
    ...(single
      ? actionFields
      : [...presentationFields(actionFields),
        { name: 'fit', type: 'enum', label: 'Position of image', max: 1, terms: FIT_TERMS, showWhen: { presentation: ['slider', 'carousel'] } }])
  ];
}

/**
 * Value of the multilingual Caption field: the caption and its translations with their language code.
 *
 * @param {string} caption In the first language of the website.
 * @param {Object<string, string>} translations By language code.
 * @returns {string[]}
 */
export function captionValue(caption, translations = {}) {
  const rows = Object.entries(translations).filter(([, text]) => text).map(([code, text]) => `${code.toUpperCase()}:${text}`);
  return [caption, ...rows].filter(Boolean);
}

/**
 * The caption and its translations from the value of the Caption field.
 *
 * @param {string|string[]|null} value
 * @param {string[]} languages Languages of the website (the first is the original).
 * @returns {{caption: string, translations: Object<string, string>}} A translation for every other language.
 */
export function readCaption(value, languages = []) {
  const others = languages.slice(1);
  const translations = Object.fromEntries(others.map((code) => [code, '']));
  let caption = '';
  for (const item of [value].flat()) {
    const text = String(item ?? '');
    const code = text.slice(0, 3).toLowerCase();
    if (text[3] === ':' && others.includes(code)) translations[code] = text.slice(4).trim();
    else caption ||= text.trim();
  }
  return { caption, translations };
}

/**
 * Values of the two action fields of the media form: `action` (Media records, Files) and `recordAction` (Any record).
 *
 * @param {object} settings `action`, `recordPage`.
 * @param {string} mode Type of the media.
 * @returns {{action: string, recordAction: string, recordPage: number|null}}
 */
export function mediaActionValues(settings = {}, mode = 'media') {
  // an element saved before plan 27e §20 has `player` (cmsMediaAction)
  const values = recordActionValues(cmsMediaAction(settings) === 'viewer' ? { ...settings, action: 'viewer' } : settings, { viewer: true });
  return {
    action: values.action === 'viewer' ? 'viewer' : 'none',
    recordAction: mode === 'record' ? values.action : 'none',
    recordPage: values.recordPage
  };
}

/**
 * The action settings of the media form: Player / Viewer for every Type, the links of the record for Any record only.
 *
 * @param {object} values Values of the form.
 * @returns {{action: string, recordPage?: number}}
 */
export function mediaActionSettings(values = {}) {
  if (values.mode !== 'record') return { action: values.action === 'viewer' ? 'viewer' : 'none' };
  return recordActionSettings({ action: values.recordAction, recordPage: values.recordPage }, { viewer: true });
}

/**
 * The media form: the widget Media gallery, or one media element (`single`).
 *
 * @param {object} options
 * @param {boolean} [options.single=false] One media element.
 * @param {object} options.settings Current settings. Gallery: `mode`, `ids`...; single: `mode`, `record`, `width`, `height`, `action`.
 *        Type *Any record* also `field`: the concept code of the file field.
 * @param {string} [options.caption] Single: the caption in the first language of the website.
 * @param {Object<string, string>} [options.translations] Single: the captions in the other languages.
 * @param {string[]} [options.languages] Single: languages of the website (the first is the original).
 * @param {object} [options.translator] Single: translation service of the translation popup.
 * @param {object} options.dbdefs HDbDefs.
 * @param {object} options.apiClient HeuristApiClient.
 * @param {object} options.services `browseRecords`, `createRecordBrowser`, `addRecord`, `valueLimit`, and `mediaItems({mode, ids, field,
 *        single})` → `[{file, caption, label}]`: `file` (cmsMediaType) null when it is not found, `label` its name in a message.
 * @returns {Promise<{settings: object, items: Array<object>, caption?: string, translations?: Object<string, string>}|null>}
 *          Gallery: the settings without `html`. Single: the settings without `file`, the first of `items` has it.
 */
export async function openMediaForm({
  single = false, settings = {}, caption = '', translations = {}, languages = [], translator = null, dbdefs, apiClient, services
}) {
  const mediaType = Number(dbdefs?.dbconst?.('RT_MEDIA_RECORD')) || 0;
  const fileType = Number(dbdefs?.dbconst?.('RT_REGISTERED_FILE')) || 0;
  const mode = Object.hasOwn(SOURCE_FIELDS, settings.mode) ? settings.mode : 'media';
  const ids = single ? (Number(settings.record) > 0 ? [Number(settings.record)] : []) : settings.ids || [];
  const sources = (name) => (mode === name ? (single ? ids[0] ?? null : ids) : (single ? null : []));
  const multilang = single && languages.length > 1;
  const chosen = (values) => [values[SOURCE_FIELDS[values.mode]]].flat().filter(Boolean).map(Number);
  // the file fields of the chosen records (Any record)
  const fileTermsOf = async (list) => {
    if (!list.length) return [];
    const answer = body(await apiClient.get('/records', { query: { ids: list.join(','), fields: 'rec_ID,rec_RecTypeID', limit: list.length } }));
    return fileFieldTerms(dbdefs, (answer?.records || []).map((record) => Number(record.rec_RecTypeID)));
  };
  const fileTerms = mode === 'record' ? await fileTermsOf(ids).catch(() => []) : [];
  const storedField = settings.field ? Number(dbdefs?.localId?.('dty', settings.field) || settings.field) || null : null;
  let items = [];
  return openEditFormDialog({
    title: single ? 'Edit media' : 'Media gallery',
    form: { groups: [{ id: 'main', children: mediaFormFields({ single, multilang, mediaType, fileType, fileTerms,
      pageTerms: services.recordPageTerms?.() || [] }) }] },
    values: {
      mode,
      records: sources('media'),
      files: sources('files'),
      anyRecords: sources('record'),
      fileField: storedField,
      ...(single ? { captionText: multilang ? captionValue(caption, translations) : caption, action: cmsMediaAction(settings) }
        : { caption: settings.caption === true, fit: settings.slider?.fit || SLIDER_FIT, ...presentationValues(settings) }),
      ...mediaActionValues(settings, mode),
      width: mediaSizeValue(settings.width, single),
      height: mediaSizeValue(settings.height, single)
    },
    apiClient,
    dbdefs,
    ...(multilang ? { languages: languages.map((code) => code.toUpperCase()), translator } : {}),
    valueLimit: services.valueLimit,
    browseRecords: services.browseRecords,
    createRecordBrowser: services.createRecordBrowser,
    addRecord: services.addRecord,
    onReady: (edit) => {
      if (single) addFormHelp(edit, MEDIA_HELP);
      attachNewRecordPage(edit, services);
    },
    onChange: async (edit, change) => {
      if (change.name !== 'anyRecords') return;
      const terms = await fileTermsOf(chosen(edit.getValues())).catch(() => []);
      await edit.updateField('fileField', { terms });
      const field = Number(edit.getValues().fileField) || 0;
      if (!terms.some((term) => term.id === field)) await edit.setValue('fileField', terms.length === 1 ? terms[0].id : null);
    },
    validate: (values) => {
      const issues = [];
      if (!chosen(values).length) issues.push({ field: SOURCE_FIELDS[values.mode], message: $HR('Choose the media') });
      if (values.mode === 'record' && !values.fileField) issues.push({ field: 'fileField', message: $HR('Choose a field') });
      if (values.mode === 'record') issues.push(...recordActionIssues({ action: values.recordAction, recordPage: values.recordPage }));
      for (const key of ['width', 'height']) {
        if (values[key] && !mediaSize(values[key])) issues.push({ field: key, message: $HR('Width and height: a number (px), px or %, or empty (auto).') });
      }
      return issues;
    },
    buttons: [{ id: 'ok', label: 'OK', primary: true }, { id: 'cancel', label: 'Cancel' }],
    // the files are read here: the form stays open when one of them can not be media
    onAction: async (action, values) => {
      try {
        items = await services.mediaItems({ mode: values.mode, ids: chosen(values), field: Number(values.fileField) || 0, single });
      } catch (error) {
        HMsg.showMsgErr?.(error?.message || String(error));
        return false;
      }
      const refused = items.filter((item) => !item.file || !cmsMediaType(item.file));
      if (refused.length) {
        HMsg.showMsgErr?.(`${$HR('This file can not be shown as media: choose an image, video, audio, a YouTube, Vimeo or SoundCloud link, IIIF, a 3D file or PDF.')} ${refused.map((item) => item.label).join(', ')}`);
        return false;
      }
      const hidden = items.filter((item) => item.file.public === false);
      if (hidden.length) {
        HMsg.showMsgFlash?.(`${$HR('This file can be seen by logged-in users only: visitors of the website will not see it.')} ${hidden.map((item) => item.label).join(', ')}`, { showDelay: 4000 });
      }
      return true;
    }
  }).then((result) => {
    if (!result) return null;
    const { values } = result;
    const size = { width: mediaSize(values.width) || 'auto', height: mediaSize(values.height) || 'auto' };
    const source = values.mode === 'record' ? { field: dbdefs?.fieldGlobal?.(Number(values.fileField))?.concept || String(values.fileField) } : {};
    const action = mediaActionSettings(values);
    if (single) {
      return {
        settings: { mode: values.mode, record: chosen(values)[0], ...source, ...size, ...action },
        items,
        ...readCaption(values.captionText, languages)
      };
    }
    const presentation = presentationSettings(values);
    if (presentation.presentation !== 'list') presentation.slider = { ...(presentation.slider || {}), fit: values.fit || SLIDER_FIT };
    return { settings: { mode: values.mode, ids: chosen(values), ...source, caption: values.caption === true, ...size, ...presentation, ...action }, items };
  });
}

/** @returns {string|null} A size of a media element: px or %; null when empty or not valid. */
function mediaSize(value) {
  const text = String(value ?? '').trim();
  if (/^(?:\d+\.?\d*|\.\d+)$/.test(text)) return `${text}px`;
  return /^(?:\d+\.?\d*|\.\d+)(?:px|%)$/.test(text) ? text : null;
}

/**
 * The generated file of each language of the element Generated Report.
 *
 * @param {Object<string, string|number>} files Rows `{code: output id}`.
 * @returns {Object<string, number>} Rows with an output.
 */
export function reportFiles(files) {
  return Object.fromEntries(Object.entries(files || {}).map(([code, id]) => [code, Number(id)]).filter(([, id]) => id > 0));
}

/** How the element Generated Report shows the report (plan 27e §28). */
export const REPORT_DISPLAY = Object.freeze(['full', 'cut', 'link']);

/**
 * Whether a chosen output is not public: guests do not see it on the page (PageContent::report checks the output record) and
 * can not open its link (`/output/{id}/asset`), whatever the display.
 *
 * @param {Array<{visibility?: string}>} outputs The chosen outputs.
 * @returns {boolean}
 */
export function reportNotPublic(outputs) {
  return outputs.some((output) => output.visibility != null && !visibleToGuests(output.visibility));
}

/**
 * Configuration of the element Generated Report (plan 27e §28): the generated reports panel of heurist-reports
 * (Explorer's bridge: search, report filter, New Report, Bolt, Edit; a checkbox and a language on each row), then
 * how the report is shown.
 *
 * @param {object} options
 * @param {object} options.settings Current settings (`report`, `files`, `display`).
 * @param {string[]} options.languages Languages of the website.
 * @param {object} options.services `createOutputsPanel({report, pick})` → `{element, ready, destroy}`.
 * @returns {Promise<object|null>} The new settings.
 */
export async function openReportForm({ settings = {}, languages = [], services }) {
  if (typeof services?.createOutputsPanel !== 'function') {
    HMsg.showMsgErr($HR('Generated reports can be chosen only in Heurist Explorer'));
    return null;
  }
  let files = reportFiles(settings.files);
  let chosen = [];
  let display = REPORT_DISPLAY.includes(settings.display) ? settings.display : 'full';
  const element = (tag, className, text = '') => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = $HR(text);
    return node;
  };
  const warning = element('div', 'h-cms-styles-warning', 'Visitors who are not logged in will not see this report: make it public.');
  const problems = element('div', 'h-cms-style-problems');
  const showWarning = () => {
    warning.hidden = !reportNotPublic(chosen);
  };
  const panel = await services.createOutputsPanel({
    report: settings.report ?? null,
    pick: {
      languages,
      files,
      onChange: (picked, outputs) => {
        files = picked;
        chosen = outputs;
        problems.textContent = '';
        showWarning();
      }
    }
  });
  const form = element('div', 'h-cms-form h-cms-report-form');
  const radios = element('div', 'h-cms-report-display');
  for (const [value, label] of [['full', 'Full report'], ['cut', 'Cut, with "Show more"'], ['link', 'Show link only']]) {
    const line = element('label', '');
    const radio = element('input', '');
    radio.type = 'radio';
    radio.name = 'h-cms-report-display';
    radio.value = value;
    radio.checked = value === display;
    radio.addEventListener('change', () => {
      display = value;
      showWarning();
    });
    line.append(radio, ` ${$HR(label)}`);
    radios.append(line);
  }
  form.append(element('div', 'h-cms-style-note', 'Select a generated report, one for each language of the website. A page in a language without its own report shows the default one. With a schedule, the content of the element is updated automatically on the next generation run.'),
    panel.element, radios, warning, problems);
  showWarning();
  return formDialog(form, 'Generated Report', 'OK', () => {
    if (!Object.keys(files).length) {
      problems.textContent = $HR('Choose a generated report');
      return null;
    }
    const report = chosen[0]?.reportId ?? settings.report;
    return { ...(report != null ? { report } : {}), files, display };
  }, null, 'h-cms-report-dialog').finally(() => panel.destroy());
}

/**
 * Settings of the website menu (plan 27f §4): orientation, Home entry, whether a page with sub pages opens.
 *
 * @param {{settings?: object}} options
 * @returns {Promise<object|null>} The settings (default values left out).
 */
export function openMenuForm({ settings = {} } = {}) {
  return openEditFormDialog({
    title: 'Menu',
    form: {
      groups: [{
        id: 'main',
        children: [
          { name: 'orientation', type: 'enum', label: 'Orientation', mode: 'radio', max: 1,
            terms: [{ id: 'horizontal', label: 'Horizontal (drop-down sub pages)' }, { id: 'vertical', label: 'Vertical (a tree)' },
              { id: 'auto', label: 'Auto: vertical in a vertical header' }] },
          { name: 'showHome', type: 'boolean', label: 'Show Home', help: 'The home page as the first entry of the menu', max: 1 },
          { name: 'selectableParent', type: 'boolean', label: 'Pages with sub pages open', max: 1,
            help: 'Unchecked: the title of such a page only opens its sub pages' }
        ]
      }]
    },
    values: {
      orientation: ['vertical', 'auto'].includes(settings.orientation) ? settings.orientation : 'horizontal',
      showHome: settings.showHome === true,
      selectableParent: settings.selectableParent !== false
    },
    onReady: (edit) => addFormHelp(edit, 'The pages of the website in the order of the website tree. The icon of a page and whether the'
      + ' menu shows its name, its icon or both are fields of the page record (Edit record in the website tree).')
  }).then((values) => {
    if (!values) return null;
    const result = {};
    if (['vertical', 'auto'].includes(values.orientation)) result.orientation = values.orientation;
    if (values.showHome === true) result.showHome = true;
    if (values.selectableParent === false) result.selectableParent = false;
    return result;
  });
}

/**
 * Settings of the language switch (plan 27f §5): links, a drop-down, or auto (a drop-down when the links do not fit).
 *
 * @param {{settings?: object}} options
 * @returns {Promise<object|null>}
 */
export function openLanguageForm({ settings = {} } = {}) {
  return openEditFormDialog({
    title: 'Language switch',
    form: {
      groups: [{
        id: 'main',
        children: [
          { name: 'appearance', type: 'enum', label: 'Appearance', mode: 'radio', max: 1,
            terms: [{ id: 'auto', label: 'Auto (a drop-down when the links do not fit)' }, { id: 'list', label: 'Links' },
              { id: 'select', label: 'Drop-down' }] }
        ]
      }]
    },
    values: { appearance: ['list', 'select'].includes(settings.appearance) ? settings.appearance : 'auto' },
    onReady: (edit) => addFormHelp(edit, 'The current page in the other languages of the website. A website with one language does'
      + ' not show it.')
  }).then((values) => {
    if (!values) return null;
    return ['list', 'select'].includes(values.appearance) ? { appearance: values.appearance } : {};
  });
}
