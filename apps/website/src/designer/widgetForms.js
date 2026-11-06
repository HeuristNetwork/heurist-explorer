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
import { createHInput } from '#shared/widgets/form/inputs/createHInput.js';
import { languageSelect } from '#shared/widgets/translation/translationControls.js';
import { openEditFormDialog } from '#shared/widgets/edit-form/editFormDialog.js';
import { formDialog } from './designerDialogs.js';

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
 * @returns {Promise<{reference: string, html: string}|null>} Null: cancelled.
 */
export async function openFieldForm({ reference, records, languages = [], dbdefs, apiClient, services }) {
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
        { name: 'field', type: 'enum', label: 'Field', max: 1, terms: termsOf(Number(startRecord?.rec_RecTypeID) || 0) }
      ]
    }]
  };
  const localField = parsed ? Number(dbdefs?.localId?.('dty', parsed.code) || parsed.code) || null : null;
  // the input of the field: its own form, made again for another record or field
  const value = { host: document.createElement('div'), form: null, field: null, record: null, baseline: '', turn: 0 };
  value.host.className = 'h-cms-field-value';
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
    values: { source: parsed?.source || (records.site ? 'website' : 'page'), record: parsed?.record || null, field: localField },
    apiClient,
    dbdefs,
    browseRecords: services.browseRecords,
    createRecordBrowser: services.createRecordBrowser,
    onReady: (edit) => {
      edit.container.append(value.host);
      void showValue(edit);
    },
    onChange: (edit, change) => {
      if (['source', 'record', 'field'].includes(change.name)) void showValue(edit);
    },
    validate: (current) => {
      if (current.source === 'record' && !current.record) return [{ field: 'record', message: $HR('Choose a record') }];
      return current.field ? null : [{ field: 'field', message: $HR('Choose a field') }];
    },
    buttons: [{ id: 'save', label: 'Save', primary: true }, { id: 'cancel', label: 'Cancel' }],
    onAction: async () => {
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
          html: fieldSnapshot(shown?.details?.[String(dty)], global?.type, { fileUrl: services.fileUrl })
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

/** Presentation, action and slider fields of the cards and gallery forms. */
function presentationFields(actions) {
  const slider = { presentation: 'slider' };
  return [
    { name: 'action', type: 'enum', label: 'Action', max: 1, terms: actions },
    { name: 'presentation', type: 'enum', label: 'Presentation', mode: 'radio', max: 1,
      terms: [{ id: 'list', label: 'List (all visible)' }, { id: 'slider', label: 'Slider (one visible)' }] },
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

/** Settings from the values of the presentation fields. */
function presentationSettings(values) {
  const settings = { presentation: values.presentation === 'slider' ? 'slider' : 'list', action: values.action || 'none' };
  if (settings.presentation === 'slider') {
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
  const image = Number(dbdefs?.localId?.('dty', '2-38')) || 0;
  const summary = Number(dbdefs?.localId?.('dty', '2-3')) || 0;
  return [
    '{* Team member: a card of one record (website template Team) *}',
    '{foreach $results as $r}',
    '{$r = $heurist->getRecord($r)}',
    '<div class="team-member">',
    ...(image ? [`{if $r.f${image}}{wrap var=$r.f${image}_originalvalue dt="file" width="200" height="auto" auto_play="0" show_artwork="0"}{/if}`] : []),
    '<h3>{$r.recTitle}</h3>',
    ...(summary ? [`{if $r.f${summary}}<p>{$r.f${summary}}</p>{/if}`] : []),
    '</div>',
    '{/foreach}',
    ''
  ].join('\n');
}

/**
 * Configuration of the widget Record cards.
 *
 * @param {object} options
 * @param {object} options.settings Current settings.
 * @param {object} options.dbdefs HDbDefs.
 * @param {object} options.apiClient HeuristApiClient.
 * @param {object} options.services `browseRecords`, `createRecordBrowser`, `editQuery`, `valueLimit`.
 * @returns {Promise<object|null>} The new settings.
 */
export function openCardsForm({ settings = {}, dbdefs, apiClient, services }) {
  const reportType = Number(dbdefs?.dbconst?.('RT_CUSTOM_REPORT')) || 0;
  const cardField = Number(dbdefs?.dbconst?.('DT_IS_CARD_VIEW')) || 0;
  const yes = Number(dbdefs?.dbconst?.('TRM_YES')) || 0;
  const keptFile = typeof settings.template === 'string' ? settings.template : '';
  const form = {
    groups: [{
      id: 'main',
      children: [
        { name: 'mode', type: 'enum', label: 'Type', mode: 'radio', max: 1,
          terms: [{ id: 'manual', label: 'Manual pickup' }, { id: 'query', label: 'Query' }] },
        { name: 'records', type: 'resource', label: 'Source records', max: 0, targetTypes: [], pointerMode: 'browseonly', showWhen: { mode: 'manual' } },
        { name: 'query', type: 'freetext', label: 'Query', showWhen: { mode: 'query' } },
        { name: 'template', type: 'resource', label: 'Smarty template', help: keptFile ? `${$HR('Now')}: ${keptFile}` : '', max: 1, targetTypes: reportType ? [reportType] : [],
          pointerMode: 'browseonly', browseFilter: cardField && yes ? JSON.stringify([{ [`f:${cardField}`]: `=${yes}` }]) : '' },
        ...presentationFields([{ id: 'none', label: 'None' }, { id: 'url', label: 'Open rec_URL in new window' }])
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
      template: Number(settings.template) || null,
      ...presentationValues(settings)
    },
    apiClient,
    dbdefs,
    valueLimit: services.valueLimit,
    browseRecords: services.browseRecords,
    createRecordBrowser: services.createRecordBrowser,
    onReady: (edit) => addFilterBuilder(edit, services.editQuery),
    validate: (values) => {
      const issues = [];
      if (values.mode === 'manual' && !(values.records || []).filter(Boolean).length) issues.push({ field: 'records', message: $HR('Choose the records') });
      if (values.mode === 'query' && !parseCardsQuery(values.query)) issues.push({ field: 'query', message: $HR('A query in JSON without parameters') });
      if (!values.template && !keptFile) issues.push({ field: 'template', message: $HR('Choose a template') });
      return issues;
    }
  }).then((values) => {
    if (!values) return null;
    const records = [values.records].flat().filter(Boolean);
    return {
      mode: values.mode,
      query: values.mode === 'query' ? parseCardsQuery(values.query) : manualQuery(records),
      template: Number(values.template) || keptFile,
      ...presentationSettings(values)
    };
  });
}

/** The limit and a button of the FilterBuilder beside the Query input. */
function addFilterBuilder(edit, editQuery) {
  const field = edit.container?.querySelector?.('[data-name="query"]');
  if (!field) return;
  const hint = document.createElement('div');
  hint.className = 'h-cms-style-note';
  hint.textContent = `${$HR('The limit is')} ${CARD_LIMIT} ${$HR('records')}`;
  edit.container.prepend(hint);
  if (typeof editQuery !== 'function') return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'h-btn h-compact';
  button.textContent = $HR('Filter Builder');
  button.addEventListener('click', async () => {
    const result = await editQuery(parseCardsQuery(edit.getValues().query) || [], null);
    if (result?.query) await edit.setValue('query', JSON.stringify(result.query));
  });
  field.append(button);
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
 *        fields of the chosen records.
 * @returns {Array<object>} HEditForm fields.
 */
export function mediaFormFields({ single = false, multilang = false, mediaType = 0, fileType = 0, fileTerms = [] } = {}) {
  const actions = [{ id: 'none', label: 'None' }, { id: 'viewer', label: 'Player / Viewer' }];
  const source = { type: 'resource', max: single ? 1 : 0, pointerMode: 'addorbrowse' };
  return [
    { name: 'mode', type: 'enum', label: 'Type', mode: 'radio', max: 1,
      terms: [{ id: 'media', label: 'Media records' }, { id: 'files', label: 'Files' }, { id: 'record', label: 'Any record' }] },
    { ...source, name: 'records', label: 'Source records', targetTypes: mediaType ? [mediaType] : [], showWhen: { mode: 'media' } },
    { ...source, name: 'files', label: 'Sources', targetTypes: fileType ? [fileType] : [], showWhen: { mode: 'files' } },
    { ...source, name: 'anyRecords', label: 'Source records', targetTypes: [], showWhen: { mode: 'record' } },
    { name: 'fileField', type: 'enum', label: 'Field', max: 1, terms: fileTerms, showWhen: { mode: 'record' } },
    single ? { name: 'captionText', type: 'freetext', label: 'Caption', max: 1, multilang } : { name: 'caption', type: 'boolean', label: 'Show caption', max: 1 },
    { name: 'width', type: 'freetext', label: 'Width', help: 'Empty = auto; a number is px, or %. Both under 200 px: thumbnails.', max: 1 },
    { name: 'height', type: 'freetext', label: 'Height', max: 1 },
    ...(single
      ? [{ name: 'action', type: 'enum', label: 'Action', max: 1, terms: actions }]
      : [...presentationFields(actions),
        { name: 'fit', type: 'enum', label: 'Position of image', max: 1, terms: FIT_TERMS, showWhen: { presentation: 'slider' } }])
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
    form: { groups: [{ id: 'main', children: mediaFormFields({ single, multilang, mediaType, fileType, fileTerms }) }] },
    values: {
      mode,
      records: sources('media'),
      files: sources('files'),
      anyRecords: sources('record'),
      fileField: storedField,
      ...(single ? { captionText: multilang ? captionValue(caption, translations) : caption, action: cmsMediaAction(settings) }
        : { caption: settings.caption === true, fit: settings.slider?.fit || SLIDER_FIT, ...presentationValues(settings) }),
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
    if (single) {
      return {
        settings: { mode: values.mode, record: chosen(values)[0], ...source, ...size, action: values.action === 'viewer' ? 'viewer' : 'none' },
        items,
        ...readCaption(values.captionText, languages)
      };
    }
    const presentation = presentationSettings(values);
    if (presentation.slider) presentation.slider.fit = values.fit || SLIDER_FIT;
    return { settings: { mode: values.mode, ids: chosen(values), ...source, caption: values.caption === true, ...size, ...presentation }, items };
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
 * @param {Object<string, string>} files Rows `{code: file}`.
 * @returns {Object<string, string>} Rows with a file.
 */
export function reportFiles(files) {
  return Object.fromEntries(Object.entries(files).filter(([, file]) => file));
}

/**
 * Options of a language row: the generated HTML outputs of a report, the outputs of the rows kept. An output
 * without an interval can be chosen too, but nothing updates it.
 *
 * @param {Array<{id: number, title: string, language?: string, intervalMinutes?: number|null, generated?: object|null}>} outputs
 *        Outputs of the report.
 * @param {Array<string|number>} [kept] Outputs stored in the element.
 * @returns {Array<{id: string, label: string}>}
 */
export function generatedFileTerms(outputs, kept = []) {
  const usable = outputs.filter((output) => output.generated?.format === 'html');
  const terms = usable.map((output) => {
    const language = output.language ? ` [${output.language.toUpperCase()}]` : '';
    return { id: String(output.id), label: `${output.title}${language}${output.intervalMinutes > 0 ? '' : ` (${$HR('not scheduled')})`}` };
  });
  const known = new Set(terms.map((term) => term.id));
  return [...terms, ...kept.filter(Boolean).map(String).filter((id) => !known.has(id)).map((id) => ({ id, label: `#${id}` }))];
}

/**
 * Configuration of the element Generated Report: the report, then one row per language as in the translation form (badge, clear on
 * mouse over, the language selector below). The report is edited and generated in the Report section, not here.
 *
 * @param {object} options
 * @param {object} options.settings Current settings (`report`, `files`).
 * @param {string[]} options.languages Languages of the website.
 * @param {object} options.services `reports()` → the reports, `generated(id)` → the outputs of a report, `heuristUrl`.
 * @returns {Promise<object|null>} The new settings.
 */
export async function openReportForm({ settings = {}, languages = [], services }) {
  const values = { ...(settings.files || {}) };
  if (!languages.length) values.def ??= '';
  else if (!Object.keys(values).length) values[languages[0]] = '';
  let reports = await services.reports();
  let current = settings.report ?? null;
  let files = current ? await services.generated(current) : [];
  const element = (tag, className, text = '') => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = $HR(text);
    return node;
  };
  const form = element('div', 'h-cms-form h-cms-report-form');
  const reportRow = element('div', 'h-cms-form-row');
  const reportLabel = element('span', '', 'Report');
  const reportHost = element('div', 'h-translation-input');
  reportRow.append(reportLabel, reportHost);
  const empty = element('div', 'h-cms-styles-warning', 'You have to generate report output first');
  const note = element('div', 'h-cms-style-note');
  const open = element('a', '', 'Open Heurist in a new browser window');
  open.href = services.heuristUrl || '#';
  open.target = '_blank';
  open.rel = 'noreferrer noopener';
  const refresh = element('button', 'h-btn h-compact', 'Refresh');
  refresh.type = 'button';
  note.append(open, document.createTextNode(`, ${$HR('select the desired report, edit it if needed and generate the report output. Then come back to this window and click Refresh.')} `), refresh);
  const root = element('div', 'h-translation');
  const list = element('div', 'h-translation-rows');
  const adder = element('div', 'h-translation-add');
  root.append(list, adder);
  const problems = element('div', 'h-cms-style-problems');
  form.append(element('div', 'h-cms-style-note', 'Select a generated report, one for each language of the website. With a schedule, the content of the element is updated automatically on the next generation run. Edit the report, generate it and set the schedule in the Report section.'),
    reportRow, empty, note, root, problems);

  let inputs = [];
  let reportInput = null;
  const keep = () => {
    for (const { code, input } of inputs) values[code] = String(input.getValue() ?? '');
  };
  const destroyInputs = () => {
    for (const { input } of inputs) void input.destroy();
    inputs = [];
  };
  const renderReport = () => {
    void reportInput?.destroy();
    reportHost.replaceChildren();
    const host = element('div', '');
    reportHost.append(host);
    reportInput = createHInput('enum', host, {
      suppressLabel: true,
      value: current,
      numeric: false,
      terms: reports.map((report) => ({
        id: String(report.id), label: `${report.title} (${Number(report.outputCount) || 0})`, depth: 1
      }))
    });
    host.addEventListener('h-input-change', () => void chooseReport(reportInput.getValue()));
  };
  const renderRows = () => {
    destroyInputs();
    list.replaceChildren();
    const terms = generatedFileTerms(files, current ? [] : Object.values(values));
    const multilingual = languages.length > 0;
    for (const code of Object.keys(values)) {
      const row = element('div', 'h-translation-row');
      const host = element('div', 'h-translation-input');
      row.append(host);
      list.append(row);
      inputs.push({ code, input: createHInput('enum', host, {
        suppressLabel: true, valueTools: true, visibilityToggle: false, numeric: false, terms: terms.map((term) => ({ ...term, depth: 1 })),
        value: terms.some((term) => term.id === values[code]) ? values[code] : null,
        langCode: multilingual ? code.toUpperCase() : ''
      }) });
    }
    empty.hidden = !current || generatedFileTerms(files).length > 0;
    adder.replaceChildren();
    const free = languages.filter((code) => !Object.hasOwn(values, code));
    adder.hidden = !free.length;
    if (!free.length) return;
    adder.append(languageSelect({
      languages: [{ code: '', label: $HR('Add a language') }, ...free.map((code) => ({ code, label: code.toUpperCase() }))],
      value: '',
      title: 'Add a file in this language',
      onChange: (code) => {
        if (!code) return;
        keep();
        values[code] = '';
        renderRows();
      }
    }).element);
  };
  const chooseReport = async (reference) => {
    keep();
    current = reference || null;
    files = current ? await services.generated(current) : [];
    renderRows();
  };
  refresh.addEventListener('click', async () => {
    keep();
    reports = await services.reports();
    files = current ? await services.generated(current) : [];
    renderReport();
    renderRows();
  });
  renderReport();
  renderRows();
  return formDialog(form, 'Generated Report', 'OK', () => {
    keep();
    const chosen = reportFiles(values);
    if (!Object.keys(chosen).length) {
      problems.textContent = $HR('Choose a generated report');
      return null;
    }
    return { ...(current ? { report: current } : {}), files: chosen };
  }, null, 'h-dialog-translation').finally(() => {
    destroyInputs();
    void reportInput?.destroy();
  });
}
