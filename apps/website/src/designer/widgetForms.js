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
import { querySourceAction } from '#shared/widgets/edit-form/querySourceChooser.js';
import { openEditFormDialog } from '#shared/widgets/edit-form/editFormDialog.js';
import { createTranslationForm } from '#shared/widgets/translation/HTranslationDialog.js';
import { sectionTitle, showDomForm, showEditForm } from './panelForms.js';
import { ITEM_COLOR_LABELS, ITEM_STYLES, MENU_LINE_FIELDS, TAB_STYLE_LABELS, menuLineSettings, menuLineValues } from './actionForms.js';
import { ITEM_COLORS, MENU_ANIMATIONS, MENU_COLOR } from '#shared/site/cmsMenu.js';
import {
  attachNewRecordPage, recordActionFields, recordActionIssues, recordActionSettings, recordActionTerms, recordActionValues
} from './recordPageField.js';
import { cmsFilterSettings, cmsFilterTarget } from '#shared/site/cmsSavedFilter.js';
import { CMS_FILTER_WIDGET_MODES, cmsFilterItemKey, cmsFilterWidgetSettings, storedCmsFilterWidget } from '#shared/site/cmsFilterWidget.js';
import { cmsInstanceDataSource } from '#shared/site/cmsDocument.js';
import { cmsTabsLook } from '#shared/site/cmsEdit.js';
import { cmsDefaultRecordsFrom, cmsInstanceRecords } from '#shared/site/cmsRecords.js';
import { attachSavedFilter, queryRecordTypes, recordFilterFieldTerms, recordTypesOf, storedSavedFilter } from './savedFilterField.js';

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
 * @param {string|null} [options.link] `data-h-link` of the element: the action of source *A record* (plan 27g §6), Go to a
 *        page also for *This website* (2026-11-14).
 * @param {Array<{id: number, label: string}>} [options.sitePages] Pages of the website for Go to a page (sitePageTerms).
 * @returns {Promise<{reference: string, html: string, link: string, size?: {width: string, height: string}}|null>} Null: cancelled.
 *          `size` only for a file field ('' = auto); `link`: `url`, `page:<id>` (record page), `goto:<id>` or ''.
 */
export async function openFieldForm({ reference, records, languages = [], dbdefs, apiClient, services, size = {}, link = null, sitePages = [],
  linkValues: storedLinkValues = null, inline = null }) {
  const parsed = parseFieldReference(reference);
  // the Saved filter of the link (plan 27j): `filter:<page>:<source>` (`f<id>` a saved filter) with its values
  const filter = { value: filterOfLink(link, storedLinkValues) };
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
        // the link of the value: a record (plan 27g §6); This website: None or Go to a page (2026-11-14)
        ...recordActionFields({ pageTerms: services.recordPageTerms?.() || [], sitePages, showWhen: { source: ['record', 'website'] } }),
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
  // the result of the values: the reference, its link and the value shown now (read from the server)
  const compute = async (values) => {
    const { dty } = value.field;
    const id = Number(value.record.rec_ID);
    const global = dbdefs?.fieldGlobal?.(dty);
    const code = global?.concept || String(dty);
    const shown = body(await apiClient.get(`/records/${id}/${code}`, { query: { resolveDetails: 1 } }))?.records?.[0];
    const source = sourceOf(id, records);
    return {
      reference: `${source === 'record' ? id : source}.${code}`,
      link: fieldLinkOf(source, values, filter.value),
      linkValues: values.action === 'savedFilter' && source === 'record' ? filter.value?.values || null : null,
      html: fieldSnapshot(shown?.details?.[String(dty)], global?.type, { fileUrl: services.fileUrl }),
      ...(global?.type === 'file' ? { size: { width: mediaSize(values?.width) || '', height: mediaSize(values?.height) || '' } } : {})
    };
  };
  // the value of the field: saved to its record (Apply of the popup; Update value in the element panel)
  const saveValue = async () => {
    const details = readValue();
    if (JSON.stringify(details) === value.baseline) return false;
    await services.saveField(Number(value.record.rec_ID), details, value.record.rec_Modified);
    value.baseline = JSON.stringify(details);
    return true;
  };
  let result = null;
  const options = {
    title: 'Content of element: Record field',
    className: 'h-dialog-cms-field',
    form,
    values: { source: parsed?.source || (records.site ? 'website' : 'page'), record: parsed?.record || null, field: localField,
      width: mediaSizeValue(size.width, true), height: mediaSizeValue(size.height, true), ...linkValues(link, records.site),
      savedFilter: '' },
    apiClient,
    dbdefs,
    browseRecords: services.browseRecords,
    createRecordBrowser: services.createRecordBrowser,
    onReady: (edit) => {
      addFormHelp(edit, FIELD_HELP);
      edit.showField('width', false);
      edit.showField('height', false);
      attachNewRecordPage(edit, services);
      // values from the record (plan 27j phase B): the fields of the source record
      attachSavedFilter(edit, services, filter, 'savedFilter', { recordFields: async (current) => {
        const id = recordIdOf(current);
        const record = id ? await recordOf(id).catch(() => null) : null;
        return recordFilterFieldTerms(dbdefs, record ? [Number(record.rec_RecTypeID)] : []);
      } });
      // the value below the field (the Source section in the element panel)
      (edit._groups?.get?.('source')?.element || edit.container).append(value.host);
      void actionsOfSource(edit);
      void showValue(edit);
    },
    onChange: (edit, change) => {
      if (change.name === 'source') void actionsOfSource(edit);
      if (['source', 'record', 'field'].includes(change.name)) void showValue(edit);
    },
    validate: (current) => {
      if (current.source === 'record' && !current.record) return [{ field: 'record', message: $HR('Choose a record') }];
      if (!current.field) return [{ field: 'field', message: $HR('Choose a field') }];
      if (current.source !== 'page' && recordActionIssues(current, filter.value).length) return recordActionIssues(current, filter.value);
      const sizes = isFile ? ['width', 'height'].filter((key) => current[key] && !mediaSize(current[key])) : [];
      return sizes.length ? sizes.map((key) => ({ field: key, message: $HR('Width and height: a number (px), px or %, or empty (auto).') })) : null;
    }
  };
  // in the element panel (review 27n §14.12): the element follows each valid change; the value of the field is saved to its
  // record by its own button Update value
  if (inline) {
    let edit = null;
    const update = document.createElement('button');
    update.type = 'button';
    update.className = 'h-btn h-compact h-cms-field-update';
    update.textContent = $HR('Update value');
    update.title = $HR('Save the value to the record now');
    // primary when the value was changed (review §16.12)
    const markUpdate = () => {
      const changed = Boolean(value.form && value.field) && JSON.stringify(readValue()) !== value.baseline;
      update.classList.toggle('h-btn-primary', changed);
    };
    for (const type of ['input', 'change', 'h-input-change']) value.host.addEventListener(type, () => globalThis.setTimeout(markUpdate, 0));
    update.addEventListener('click', async () => {
      if (!value.form || !value.field || value.form.validate().length) return;
      update.disabled = true;
      try {
        if (!(await saveValue())) {
          HMsg.showMsgFlash?.($HR('No changes'), { showDelay: 1500 });
          return;
        }
        HMsg.showMsgFlash?.($HR('The value is saved in the record'), { showDelay: 1500 });
        markUpdate();
        // the snapshot of the element shows the new value
        if (edit && !edit.validate().length) inline.onResult(await compute(edit.getValues()));
      } catch (error) {
        HMsg.showMsgErr?.(error?.message || String(error));
      } finally {
        update.disabled = false;
      }
    });
    edit = showEditForm({
      ...options,
      onReady: (form) => {
        options.onReady(form);
        value.host.after(update);
      }
    }, async (values) => (value.field && value.record ? compute(values) : null), {
      inline: { ...inline, register: (cleanup) => inline.register?.(async () => {
        await cleanup();
        await value.form?.destroy();
      }) },
      sections: { source: ['source', 'record', 'field'], behaviour: ['action', 'recordPage', 'page', 'savedFilter'] }
    });
    return edit;
  }
  const answer = await openEditFormDialog({
    ...options,
    buttons: [{ id: 'save', label: 'Apply', primary: true }, { id: 'cancel', label: 'Cancel' }],
    onAction: async (action, values) => {
      if (!value.form || !value.field || value.form.validate().length) return false;
      try {
        await saveValue();
        result = await compute(values);
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

/**
 * Values of the action fields from `data-h-link` (`url`, `page:<id>` a record page, `goto:<id>` Go to a page; `goto:home`
 * the home page = the website).
 */
function linkValues(link, siteId = 0) {
  const text = String(link ?? '');
  if (/^filter:\d+:f?\d+$/.test(text)) return recordActionValues({ action: 'savedFilter' });
  const page = /^page:(\d+)$/.exec(text);
  const goto = /^goto:(\d+|home)$/.exec(text);
  if (goto) return recordActionValues({ action: 'page', page: goto[1] === 'home' ? Number(siteId) || null : Number(goto[1]) });
  return recordActionValues(page ? { action: 'recordPage', recordPage: Number(page[1]) } : { action: text === 'url' ? 'url' : 'none' });
}

/**
 * The Saved filter of a `data-h-link` `filter:<page>:<source>` (`filter:<page>:f<saved filter>`, plan 27l §7.2) and its
 * values (plan 27j), or null.
 */
function filterOfLink(link, values) {
  const found = /^filter:(\d+):(f?)(\d+)$/.exec(String(link ?? ''));
  return found ? cmsFilterSettings({ page: Number(found[1]), [found[2] ? 'filter' : 'source']: Number(found[3]), values: values || {} }) : null;
}

/** `data-h-link` of the action settings; '' for none. */
function linkOf(settings) {
  if (settings.action === 'url') return 'url';
  if (settings.action === 'savedFilter') {
    const target = cmsFilterTarget(settings);
    return settings.page && target ? `filter:${settings.page}:${target.kind === 'filter' ? 'f' : ''}${target.id}` : '';
  }
  if (settings.action === 'page') return `goto:${settings.page}`;
  return settings.action === 'recordPage' ? `page:${settings.recordPage}` : '';
}

/** `data-h-link` of a Record field: every action for a record, Go to a page for This website, none for This page. */
function fieldLinkOf(source, values, filter = null) {
  if (source === 'page') return '';
  const link = linkOf(recordActionSettings(values, { filter }));
  return source === 'website' && !link.startsWith('goto:') ? '' : link;
}

/**
 * The actions of the source of a Record field (2026-11-14): a record all of them, This website None and Go to a page;
 * an action the source does not have becomes None.
 */
async function actionsOfSource(edit) {
  const source = edit.getValues().source;
  if (source === 'page') return;
  const page = Boolean(edit.getFieldWidget?.('page'));
  const terms = recordActionTerms({ page, record: source === 'record' });
  await edit.updateField('action', { terms });
  if (!terms.some((term) => term.id === edit.getValues().action && !term.disabled)) await edit.setValue('action', 'none');
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
const PRESENTATION_FIELDS = Object.freeze(['presentation', 'duration', 'fade', 'navigation', 'tabOrientation', 'tabStyle']);

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
  const tabs = { ...(showWhen || {}), presentation: 'tabs' };
  return [
    ...actionFields,
    // short labels (plan 27n1 §2c)
    { name: 'presentation', type: 'enum', label: 'Show as', mode: 'radio', max: 1, ...(showWhen ? { showWhen } : {}),
      terms: [{ id: 'list', label: 'List' }, { id: 'carousel', label: 'Carousel' }, { id: 'slider', label: 'Slideshow' },
        { id: 'tabs', label: 'Tabs' }] },
    // the look of the tabs, as the Tabs element (plan 27n1 §2d)
    { name: 'tabOrientation', type: 'enum', label: 'Orientation', mode: 'radio', max: 1, showWhen: tabs,
      terms: [{ id: 'horizontal', label: 'Horizontal' }, { id: 'vertical', label: 'Vertical' }] },
    { name: 'tabStyle', type: 'enum', label: 'Style of the tabs', mode: 'select', max: 1, showWhen: tabs,
      terms: TAB_STYLE_LABELS.map(([id, label]) => ({ id, label })) },
    // advanced settings (review 27n §21: `req: 'optional'`, the defaults 4000 / 500 / on)
    { name: 'duration', type: 'integer', label: 'Duration (ms)', max: 1, minValue: 500, showWhen: slider, req: 'optional' },
    { name: 'fade', type: 'integer', label: 'Fade out (ms)', max: 1, minValue: 0, showWhen: slider, req: 'optional' },
    { name: 'navigation', type: 'boolean', label: 'Navigation', help: 'Start / stop buttons and << < > >>', max: 1, showWhen: slider,
      req: 'optional' }
  ];
}

/** Values of the presentation fields from the settings. */
function presentationValues(settings = {}) {
  const slider = { ...SLIDER_DEFAULTS, ...(settings.slider || {}) };
  const tabs = cmsTabsLook(settings.tabs);
  return { presentation: settings.presentation || 'list', action: settings.action || 'none',
    duration: slider.duration, fade: slider.fade, navigation: slider.navigation, tabOrientation: tabs.orientation, tabStyle: tabs.style };
}

/**
 * Settings from the values of the presentation fields: `list`, `carousel` (one visible, buttons only), `slider` (slideshow)
 * or `tabs` (plan 27q1 §5) with `tabs: {orientation, style}` when not the default (plan 27n1 §2d).
 *
 * @param {object} values Values of the form.
 * @returns {{presentation: string, action: string, slider?: object, tabs?: object}}
 */
export function presentationSettings(values) {
  const presentation = ['carousel', 'slider', 'tabs'].includes(values.presentation) ? values.presentation : 'list';
  const settings = { presentation, action: values.action || 'none' };
  if (presentation === 'slider') {
    settings.slider = { duration: Number(values.duration) || SLIDER_DEFAULTS.duration, fade: Number(values.fade) || 0, navigation: values.navigation !== false };
  }
  if (presentation === 'tabs') {
    const tabs = cmsTabsLook({ orientation: values.tabOrientation, style: values.tabStyle });
    const stored = { ...(tabs.orientation === 'vertical' ? { orientation: 'vertical' } : {}), ...(tabs.style !== 'tabs' ? { style: tabs.style } : {}) };
    if (Object.keys(stored).length) settings.tabs = stored;
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
 * The query field of Record cards and of *Records and selection*: the text of the query, the Filter Builder from Edit (as
 * the query of a Query Source in the record editor), no parameters; ▾ copies the query of a query source (plan 27n1 §4:
 * by value, no id is kept).
 *
 * @param {object} services `editQuery(query, filterForm, {allowParameters})`, `describeQuery(query)`, `querySources()`,
 *        `querySourceDefinition(id)`, `savedFilters()`, `savedFilterDefinition(id)`.
 * @param {{filters?: boolean}} [options] `filters`: the saved filters of "Website filters" in the list too.
 * @returns {object} HEditField `special`.
 */
export function cardsQuerySpecial(services, { filters = false } = {}) {
  const edit = typeof services.editQuery === 'function' ? async (value) => {
    const result = await services.editQuery(parseCardsQuery(value) || [], null, { allowParameters: false });
    return result?.query ? JSON.stringify(result.query) : undefined;
  } : undefined;
  const actions = [];
  if (edit) actions.push({ label: 'Edit', icon: 'fa-sliders', title: 'Open the Filter Builder', primary: true, run: edit });
  if (typeof services.querySources === 'function' && typeof services.querySourceDefinition === 'function') {
    actions.push(querySourceAction({
      list: async () => {
        const [sources, saved] = await Promise.all([services.querySources().catch(() => []),
          filters && typeof services.savedFilters === 'function' ? services.savedFilters().catch(() => []) : []]);
        return [...sources.map((item) => ({ ...item, kind: 'source' })), ...saved.map((item) => ({ ...item, kind: 'filter' }))];
      },
      definition: (item) => (item.kind === 'filter' ? services.savedFilterDefinition(item.id) : services.querySourceDefinition(item.id)),
      apply: (definition) => queryText(definition?.source?.query)
    }));
  }
  return {
    json: false,
    describe: (value) => {
      const query = parseCardsQuery(value);
      return query && typeof services.describeQuery === 'function' ? services.describeQuery(query) || '' : '';
    },
    actions
  };
}

/** The text of a copied query (undefined: none). */
function queryText(query) {
  if (query == null || query === '') return undefined;
  return typeof query === 'string' ? query : JSON.stringify(query);
}

/** Note of a module with its own query and other sources (plan 27l §12.1). */
export const RECORDS_MIXED_NOTE = 'The first records come from the own query; a later search from the other sources replaces them.';

/**
 * The form of the section *Records and selection* of a module on a website page (plan 27l §12.3): where its records come
 * from (own query, Saved filter links, Filter widgets, other modules with an own query; any of them: the latest search
 * wins), its own query (by value; ▾ copies a query source or saved filter without parameters, plan 27n1 §4) and whether it
 * shares the selection. Record View: its own record or the selected record. Explorer: own filters and Saved filter links
 * (its filters are in its own form, phase E2).
 *
 * @param {object} options
 * @param {string} options.type Module type.
 * @param {Array<{id: string, label: string}>} [options.sources] The other sources of the page: `links`,
 *        `filter:<id>`, `module:<id>` (Own query is added here).
 * @param {object} [options.services] `editQuery`, `describeQuery`, `querySources`, `savedFilters` ... (the query field).
 * @param {boolean} [options.legend=true] The legend of the fieldset (Explorer: its filters fieldset has it, phase E2).
 * @returns {object} Form JSON: one group, a fieldset with its legend as the other sections.
 */
export function recordsForm({ type, sources = [], services = {}, legend = true }) {
  const own = { from: 'own' };
  let children;
  if (type === 'recordview') {
    children = [
      { name: 'shows', type: 'enum', label: 'Shows', mode: 'radio', max: 1,
        terms: [{ id: 'own', label: 'Own record' }, { id: 'selection', label: 'Selected record' }] },
      { name: 'record', type: 'resource', label: 'Record', max: 1, targetTypes: [], pointerMode: 'browseonly',
        showWhen: { shows: 'own' } }
    ];
  } else if (type === 'explorer') {
    children = [
      { name: 'from', type: 'enum', label: 'Records from', mode: 'checkbox', max: 0,
        terms: [{ id: 'own', label: 'Own filters' }, ...sources.filter((term) => term.id === 'links')] }
    ];
  } else {
    children = [
      { name: 'from', type: 'enum', label: 'Records from', mode: 'checkbox', max: 0,
        terms: [{ id: 'own', label: 'Own query' }, ...sources],
        help: 'Any of them: the module shows the latest search' },
      // one query (plan 27n1 §4): ▾ copies a query source or a saved filter of "Website filters" (by value)
      { name: 'query', type: 'freetext', label: 'Query', max: 1, special: cardsQuerySpecial(services, { filters: true }), showWhen: own,
        help: 'A query without parameters' },
      { name: 'selection', type: 'boolean', label: 'Share selection with other modules', mode: 'checkbox', max: 1 }
    ];
  }
  return { groups: [{ id: 'records', ...(legend ? { label: 'Records and selection' } : {}), children }] };
}

/**
 * The values of recordsForm from an instance (cmsInstanceRecords: the defaults and an older `sync`).
 *
 * @param {object} instance Instance configuration.
 * @param {object} [instances] The instances of the page.
 * @returns {{from: string[], source: string, query: string, selection: boolean, shows: string, record: number|null}}
 */
export function recordsValues(instance = {}, instances = {}) {
  const links = cmsInstanceRecords(instance, instances);
  const source = cmsInstanceDataSource(instance.dataSource, instance.type) || {};
  return {
    from: links.from,
    source: source.source ? `source:${source.source}` : (source.filter ? `filter:${source.filter}` : ''),
    query: source.query ? JSON.stringify(source.query) : '',
    selection: links.selection,
    shows: source.record ? 'own' : 'selection',
    record: Number(source.record) > 0 ? Number(source.record) : null
  };
}

/**
 * The stored `records`, `selection` and `dataSource` of recordsForm values (`records` null: the default sources).
 *
 * @param {object} values
 * @param {string} type Module type.
 * @param {object} [instances] The instances of the page (the default sources).
 * @returns {{records: {from: string[]}|null, selection: boolean, dataSource: object|null}}
 */
export function recordsResult(values = {}, type = '', instances = {}) {
  if (type === 'recordview') {
    const record = Number([values.record].flat()[0]) || 0;
    const own = values.shows === 'own' && record > 0;
    return { records: null, selection: !own, dataSource: own ? { record } : null };
  }
  const from = [...new Set([values.from].flat().filter((token) => typeof token === 'string' && token))];
  const fallback = cmsDefaultRecordsFrom(type, instances);
  const same = from.length === fallback.length && fallback.every((token) => from.includes(token));
  const records = same ? null : { from };
  if (type === 'explorer') return { records, selection: true, dataSource: null };
  let dataSource = null;
  if (from.includes('own')) {
    const [kind, id] = String(values.source || '').split(':');
    if (['source', 'filter'].includes(kind) && Number(id) > 0) dataSource = { [kind]: Number(id) };
    else if (String(values.query ?? '').trim()) dataSource = parseCardsQuery(values.query) ? { query: parseCardsQuery(values.query) } : null;
  }
  return { records, selection: values.selection !== false, dataSource };
}

/**
 * Problems of recordsForm values: a query that can not be used, Own query without a query source or query, a Record
 * View without its record.
 *
 * @param {object} values
 * @param {string} type Module type.
 * @returns {Array<{field: string, message: string}>}
 */
export function recordsIssues(values = {}, type = '') {
  if (type === 'recordview') {
    return values.shows === 'own' && !(Number([values.record].flat()[0]) > 0) ? [{ field: 'record', message: $HR('Choose the record') }] : [];
  }
  if (type === 'explorer' || ![values.from].flat().includes('own')) return [];
  const text = String(values.query ?? '').trim();
  if (!values.source && !text) return [{ field: 'query', message: $HR('Write a query or copy one with the arrow') }];
  return !values.source && !parseCardsQuery(text) ? [{ field: 'query', message: $HR('A query in JSON without parameters') }] : [];
}

/**
 * The section *Records and selection* of the configuration form of a module on a website page (plan 27l §12.3): an
 * inline HEditForm (a fieldset with its legend, as the other sections) above the module form, applied with its Apply.
 * A stored query source or saved filter (by id, before plan 27n1 §4) becomes its query when the form opens; a note with an
 * own query and other sources.
 *
 * @param {object} options
 * @param {object} options.instance Instance configuration.
 * @param {object} [options.instances] The instances of the page.
 * @param {Array<{id: string, label: string}>} [options.sources] recordsForm `sources`.
 * @param {object} [options.services] The services of the designer forms (`editQuery`, `describeQuery`, `browseRecords`,
 *        `createRecordBrowser`, `valueLimit`, `querySources`, `querySourceDefinition`, `savedFilters`, `savedFilterDefinition`).
 * @param {object} [options.apiClient]
 * @param {object} [options.dbdefs]
 * @param {boolean} [options.inline=false] Without its own fieldset legend: put into the filters fieldset of Explorer
 *        (phase E2).
 * @param {(from: string[]) => void} [options.onFromChange] *Records from* changed (also once at start): Explorer shows its
 *        filters with Own filters only.
 * @returns {{element: HTMLElement, read: () => ({records: object|null, selection: boolean, dataSource: object|null}|null),
 *          from: () => string[], destroy: () => Promise<void>}} `read()`: null while a value can not be used (shown
 *          beside the field).
 */
export function createRecordsSection({ instance, instances = {}, sources = [], services = {}, apiClient = null,
  dbdefs = null, inline = false, onFromChange = null }) {
  const values = recordsValues(instance, instances);
  // a stored query source / saved filter: kept until its query is read (or when it can not be read)
  let stored = values.source || '';
  // a source of the page that is not there any more (a widget removed): kept until it is unchecked
  const known = new Set(['own', ...sources.map((term) => term.id)]);
  const terms = [...sources, ...values.from.filter((token) => !known.has(token)).map((token) => ({ id: token, label: token }))];
  const element = document.createElement('div');
  element.className = `h-cms-config-records${inline ? ' is-inline' : ''}`;
  const note = document.createElement('div');
  note.className = 'h-cms-style-note';
  note.textContent = $HR(RECORDS_MIXED_NOTE);
  const showNote = (current) => {
    const from = [current.from].flat();
    note.hidden = !(from.includes('own') && from.length > 1);
  };
  const form = new HEditForm().attach(element, {
    form: recordsForm({ type: instance.type, sources: terms, services, legend: !inline }),
    values,
    apiClient,
    dbdefs,
    labelPos: 'above',
    valueLimit: services.valueLimit,
    browseRecords: services.browseRecords,
    createRecordBrowser: services.createRecordBrowser,
    validate: (current) => recordsIssues({ ...current, source: stored }, instance.type),
    onReady: (edit) => {
      // the note in the fieldset, after the sources
      const fieldset = element.querySelector('fieldset') || element;
      fieldset.append(note);
      showNote(edit.getValues());
      // the stored query source becomes its query (plan 27n1 §4)
      if (stored) {
        void storedQuery(stored, services).then((text) => {
          if (!text || !stored) return;
          stored = '';
          edit.setValue('query', text);
        }).catch(() => {});
      }
    },
    onChange: (edit, change) => {
      if (change.name === 'from') {
        showNote(edit.getValues());
        onFromChange?.([edit.getValues().from].flat().filter(Boolean));
      }
      // a query typed or copied replaces the stored query source
      if (change.name === 'query' && String(change.value ?? '').trim()) stored = '';
    }
  }).render();
  if (instance.type === 'recordview' || instance.type === 'explorer') note.hidden = true;
  return {
    element,
    read: () => (form.validate().length ? null : recordsResult({ ...form.getValues(), source: stored }, instance.type, instances)),
    from: () => [form.getValues().from].flat().filter(Boolean),
    destroy: () => form.destroy()
  };
}

/**
 * The query of a stored query source or saved filter (`source:<id>` / `filter:<id>`), as the text of the query field: a
 * reference by id becomes a query by value when its form is opened (plan 27n1 §4).
 *
 * @param {string} key `source:<id>` or `filter:<id>`.
 * @param {object} services `querySourceDefinition(id)`, `savedFilterDefinition(id)`.
 * @returns {Promise<string|undefined>} The text of the query; undefined when it can not be read.
 */
export async function storedQuery(key, services) {
  const [kind, id] = String(key || '').split(':');
  if (!(Number(id) > 0)) return undefined;
  const read = { filter: services?.savedFilterDefinition, source: services?.querySourceDefinition }[kind];
  if (typeof read !== 'function') return undefined;
  return queryText((await read(Number(id)))?.source?.query);
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
export async function openCardsForm({ settings = {}, dbdefs, apiClient, services, inline = null }) {
  const reports = await services.cardTemplates?.().catch(() => []) ?? [];
  // a query source by id (plan 27l §11.4) becomes its query, by value (plan 27n1 §2b); one that can not be read is kept
  let storedSource = settings.mode === 'source' ? Number(settings.querySource) || 0 : 0;
  const copied = storedSource ? await storedQuery(`source:${storedSource}`, services).catch(() => undefined) : undefined;
  if (copied) storedSource = 0;
  const mode = copied ? 'query' : (settings.mode || 'manual');
  // the Saved filter of the action (plan 27j)
  const filter = { value: storedSavedFilter(settings) };
  const templates = cardTemplateTerms(reports, settings.template);
  // the record of the page URL: one record, no action, no presentation (2026-11-12)
  const listed = { mode: ['manual', 'source', 'query'] };
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
        // Manual pickup by default; shown again, one Query (plan 27n1 §2a-b): ▾ copies the query of a query source; a query
        // source by id that could not be read stays as it is
        { name: 'mode', type: 'enum', label: 'Source', mode: 'radio', max: 1,
          terms: [{ id: 'manual', label: 'Manual pickup' }, { id: 'query', label: 'Query' },
            ...(storedSource ? [{ id: 'source', label: `${$HR('Query source')} #${storedSource}` }] : []),
            { id: 'url', label: 'Record of the page URL' }] },
        { name: 'records', type: 'resource', label: 'Source records', max: 0, targetTypes: [], pointerMode: 'browseonly', showWhen: { mode: 'manual' } },
        { name: 'query', type: 'freetext', label: 'Query', max: 1, special: cardsQuerySpecial(services), showWhen: { mode: 'query' } },
        // a selector also for a few templates (not the radios of a small vocabulary)
        { name: 'template', type: 'enum', label: 'Smarty template', mode: 'select', max: 1, terms: templates.terms,
          help: reports.length ? '' : 'Mark a report "Single record (card)" to use it here' },
        ...presentationFields(recordActionFields({ pageTerms: services.recordPageTerms?.() || [], showWhen: listed }), listed)
      ]
    }]
  };
  return showEditForm({
    title: 'Record cards',
    form,
    values: {
      mode,
      records: manualIds(['query', 'source', 'url'].includes(settings.mode) ? null : settings.query),
      query: copied || (settings.mode === 'query' && settings.query ? JSON.stringify(settings.query) : ''),
      template: templates.value,
      ...presentationValues(settings),
      ...recordActionValues(settings),
      savedFilter: ''
    },
    apiClient,
    dbdefs,
    valueLimit: services.valueLimit,
    browseRecords: services.browseRecords,
    createRecordBrowser: services.createRecordBrowser,
    onReady: (edit) => {
      addFormHelp(edit, `${$HR(CARDS_HELP)} ${$HR(CARDS_URL_HELP)}`);
      attachNewRecordPage(edit, services);
      // values from the record (plan 27j phase B): the fields of the chosen records or of the types of the query
      attachSavedFilter(edit, services, filter, 'savedFilter', { recordFields: async (values) => {
        const types = values.mode === 'query' ? queryRecordTypes(parseCardsQuery(values.query))
          : values.mode === 'source' ? []
          : await recordTypesOf(apiClient, [values.records].flat().filter(Boolean)).catch(() => []);
        return recordFilterFieldTerms(dbdefs, types);
      } });
      showPresentation(edit);
    },
    onChange: (edit, change) => {
      if (['mode', 'records'].includes(change.name)) showPresentation(edit);
    },
    validate: (values) => {
      const issues = values.mode === 'url' ? [] : [...recordActionIssues(values, filter.value)];
      if (values.mode === 'manual' && !(values.records || []).filter(Boolean).length) issues.push({ field: 'records', message: $HR('Choose the records') });
      if (values.mode === 'query' && !parseCardsQuery(values.query)) issues.push({ field: 'query', message: $HR('A query in JSON without parameters') });
      if (!values.template) issues.push({ field: 'template', message: $HR('Choose a template') });
      return issues;
    }
  }, (values) => {
    if (!values) return null;
    const records = [values.records].flat().filter(Boolean);
    const template = String(values.template);
    // `source` only for a stored query source that could not be read (plan 27n1 §2b)
    const mode = ['query', 'url'].includes(values.mode) || (values.mode === 'source' && storedSource) ? values.mode : 'manual';
    return {
      mode,
      query: mode === 'query' ? parseCardsQuery(values.query) : (['url', 'source'].includes(mode) ? null : manualQuery(records)),
      ...(mode === 'source' ? { querySource: storedSource } : {}),
      // a report id, or the file name of a template without a report
      template: /^\d+$/.test(template) ? Number(template) : template,
      ...presentationSettings(values),
      ...recordActionSettings(values, { allowed: mode !== 'url', filter: filter.value })
    };
  }, { inline, sections: { source: ['mode', 'records', 'query'], behaviour: ['action', 'recordAction', 'recordPage', 'page', 'savedFilter'] } });
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
export function mediaFormFields({ single = false, multilang = false, mediaType = 0, fileType = 0, fileTerms = [], pageTerms = [], sitePages = [],
  mediaRecords = false } = {}) {
  // Media records and Files: None or Player / Viewer; Any record also the links of the record (plan 27g §6); one media
  // element: Go to a page for every Type (2026-11-14)
  const goPage = single && sitePages.length > 0;
  const actionFields = [
    { name: 'action', type: 'enum', label: 'Action', mode: 'radio', max: 1, showWhen: { mode: ['media', 'files'] },
      terms: [{ id: 'none', label: 'None' }, { id: 'viewer', label: 'Player / Viewer' }, ...(goPage ? [{ id: 'page', label: 'Go to a page' }] : [])] },
    ...recordActionFields({ name: 'recordAction', viewer: true, pageTerms, sitePages: goPage ? sitePages : null, showWhen: { mode: 'record' } })
  ];
  // one Page field for both action fields: shown by code (mediaPageField)
  if (goPage) {
    const page = actionFields.find((field) => field.name === 'page');
    if (page) delete page.showWhen;
  }
  const source = { type: 'resource', max: single ? 1 : 0, pointerMode: 'addorbrowse' };
  return [
    // one media element: singular names (2026-11-12); File for a new element (review 27n §21); Source shown again, Media
    // record(s) only for an element that has it already (plan 27n1 §1)
    { name: 'mode', type: 'enum', label: 'Source', mode: 'radio', max: 1,
      terms: [...(mediaRecords ? [{ id: 'media', label: single ? 'Media record' : 'Media records' }] : []),
        { id: 'files', label: single ? 'File' : 'Files' }, { id: 'record', label: 'Any record' }] },
    { ...source, name: 'records', label: single ? 'Source record' : 'Source records', targetTypes: mediaType ? [mediaType] : [], showWhen: { mode: 'media' } },
    { ...source, name: 'files', label: single ? 'Source file' : 'Source files', targetTypes: fileType ? [fileType] : [], showWhen: { mode: 'files' } },
    { ...source, name: 'anyRecords', label: single ? 'Source record' : 'Source records', targetTypes: [], showWhen: { mode: 'record' } },
    { name: 'fileField', type: 'enum', label: 'Field', max: 1, terms: fileTerms, showWhen: { mode: 'record' } },
    single ? { name: 'captionText', type: 'freetext', label: 'Caption', max: 1, multilang }
      : { name: 'caption', type: 'boolean', label: 'Show caption', max: 1, req: 'optional' },
    { name: 'width', type: 'freetext', label: 'Width', help: 'Empty = auto; a number is px, or %. Both under 200 px: thumbnails.', max: 1 },
    { name: 'height', type: 'freetext', label: 'Height', max: 1 },
    // one media element: the image (player) and its caption left, centred or right in the element (2026-11-14)
    // not an advanced setting (plan 27n1 §6)
    ...(single ? [{ name: 'align', type: 'enum', label: 'Alignment', mode: 'radio', max: 1,
      terms: [{ id: 'left', label: 'Left' }, { id: 'center', label: 'Center' }, { id: 'right', label: 'Right' }] }] : []),
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
 * @returns {{action: string, recordAction: string, recordPage: number|null, page: number|null}}
 */
export function mediaActionValues(settings = {}, mode = 'media') {
  // an element saved before plan 27e §20 has `player` (cmsMediaAction)
  const values = recordActionValues(cmsMediaAction(settings) === 'viewer' ? { ...settings, action: 'viewer' } : settings, { viewer: true });
  return {
    action: ['viewer', 'page'].includes(values.action) ? values.action : 'none',
    recordAction: mode === 'record' ? values.action : 'none',
    recordPage: values.recordPage,
    page: values.page
  };
}

/**
 * The action settings of the media form: Player / Viewer for every Type, the links of the record for Any record only.
 *
 * @param {object} values Values of the form.
 * @returns {{action: string, recordPage?: number}}
 */
export function mediaActionSettings(values = {}, filter = null) {
  if (values.mode !== 'record') {
    if (values.action === 'page') return Number(values.page) > 0 ? { action: 'page', page: Number(values.page) } : { action: 'none' };
    return { action: values.action === 'viewer' ? 'viewer' : 'none' };
  }
  return recordActionSettings({ action: values.recordAction, recordPage: values.recordPage, page: values.page }, { viewer: true, filter });
}

/** The action of the media form that is shown: `action` (Media records, Files) or `recordAction` (Any record). */
function mediaAction(values) {
  return values.mode === 'record' ? values.recordAction : values.action;
}

/** The Page field of Go to a page: shown when the shown action is Go to a page. */
function mediaPageField(edit) {
  if (edit.getFieldWidget?.('page')) edit.showField('page', mediaAction(edit.getValues()) === 'page');
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
 * @param {Array<{id: number, label: string}>} [options.sitePages] Single: pages of the website for Go to a page (sitePageTerms).
 * @returns {Promise<{settings: object, items: Array<object>, caption?: string, translations?: Object<string, string>}|null>}
 *          Gallery: the settings without `html`. Single: the settings without `file`, the first of `items` has it.
 */
export async function openMediaForm({
  single = false, settings = {}, caption = '', translations = {}, languages = [], translator = null, dbdefs, apiClient, services,
  sitePages = [], inline = null
}) {
  const mediaType = Number(dbdefs?.dbconst?.('RT_MEDIA_RECORD')) || 0;
  const fileType = Number(dbdefs?.dbconst?.('RT_REGISTERED_FILE')) || 0;
  const ids = single ? (Number(settings.record) > 0 ? [Number(settings.record)] : []) : settings.ids || [];
  // a new element (nothing chosen yet): files (review 27n §21); a stored one without a mode: media records
  const fresh = !settings.mode && !ids.length;
  const mode = Object.hasOwn(SOURCE_FIELDS, settings.mode) ? settings.mode : (fresh ? 'files' : 'media');
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
  // the Saved filter of the action of Any record (plan 27j)
  const filter = { value: storedSavedFilter(settings) };
  // one media element in the element panel (review 27n §15.17): its caption as the caption of a group, the input and Add a
  // language below it (the translation rows), not a field of the form
  let edit = null;
  const captionForm = inline && single ? createTranslationForm({
    value: caption,
    translations,
    languages,
    original: languages[0] || '',
    translator,
    onChange: () => edit?.panelChanged?.()
  }) : null;
  const fields = mediaFormFields({ single, multilang, mediaType, fileType, fileTerms, pageTerms: services.recordPageTerms?.() || [], sitePages,
    mediaRecords: mode === 'media' })
    .filter((field) => !(captionForm && field.name === 'captionText'));
  edit = showEditForm({
    title: single ? 'Edit media' : 'Media gallery',
    form: { groups: [{ id: 'main', children: fields }] },
    values: {
      mode,
      records: sources('media'),
      files: sources('files'),
      anyRecords: sources('record'),
      fileField: storedField,
      ...(single ? { captionText: multilang ? captionValue(caption, translations) : caption, action: cmsMediaAction(settings) }
        : { caption: settings.caption === true, fit: settings.slider?.fit || SLIDER_FIT, ...presentationValues(settings) }),
      ...mediaActionValues(settings, mode),
      savedFilter: '',
      width: mediaSizeValue(settings.width, single),
      height: mediaSizeValue(settings.height, single),
      // a new media element: centred (review 27n §21)
      ...(single ? { align: ['center', 'right'].includes(settings.align) ? settings.align : (fresh ? 'center' : 'left') } : {})
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
      if (captionForm) {
        const block = document.createElement('fieldset');
        block.className = 'h-edit-form-group h-cms-media-caption';
        const legend = document.createElement('legend');
        legend.textContent = $HR('Caption');
        block.append(legend, captionForm.element);
        const before = edit._groups?.get?.('behaviour')?.element || edit._groups?.get?.('identification')?.element || null;
        if (before) before.before(block); else edit.container.append(block);
      }
      attachNewRecordPage(edit, services);
      // values from the record (plan 27j phase B): the fields of the chosen records (Any record)
      attachSavedFilter(edit, services, filter, 'savedFilter', { recordFields: async (values) => {
        const types = await recordTypesOf(apiClient, chosen(values)).catch(() => []);
        return recordFilterFieldTerms(dbdefs, types);
      } });
      mediaPageField(edit);
    },
    onChange: async (edit, change) => {
      if (['mode', 'action', 'recordAction'].includes(change.name)) mediaPageField(edit);
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
      issues.push(...recordActionIssues({ action: mediaAction(values), recordPage: values.recordPage, page: values.page }, filter.value));
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
  }, (result) => {
    if (!result) return null;
    const { values } = result;
    const size = { width: mediaSize(values.width) || 'auto', height: mediaSize(values.height) || 'auto' };
    const source = values.mode === 'record' ? { field: dbdefs?.fieldGlobal?.(Number(values.fileField))?.concept || String(values.fileField) } : {};
    const action = mediaActionSettings(values, filter.value);
    if (single) {
      const captions = captionForm?.read?.();
      return {
        settings: { mode: values.mode, record: chosen(values)[0], ...source, ...size, ...action,
          ...(['center', 'right'].includes(values.align) ? { align: values.align } : {}) },
        items,
        ...(captionForm ? { caption: (captions?.value || '').trim(), translations: Object.fromEntries(languages.slice(1)
          .map((code) => [code, String(captions?.translations?.[code] || '').trim()])) } : readCaption(values.captionText, languages))
      };
    }
    const presentation = presentationSettings(values);
    if (presentation.presentation !== 'list') presentation.slider = { ...(presentation.slider || {}), fit: values.fit || SLIDER_FIT };
    return { settings: { mode: values.mode, ids: chosen(values), ...source, caption: values.caption === true, ...size, ...presentation, ...action }, items };
  }, {
    inline: inline && captionForm ? { ...inline, register: (cleanup) => inline.register?.(async () => {
      await cleanup();
      captionForm.destroy?.();
    }) } : inline,
    sections: { source: ['mode', 'records', 'files', 'anyRecords', 'fileField'], caption: ['captionText', 'caption'],
      behaviour: ['action', 'recordAction', 'recordPage', 'page', 'savedFilter'] }
  });
  return edit;
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
 * @param {object|null} [options.inline] In the element panel (panelForms.showDomForm).
 * @param {HTMLElement|null} [options.presentationExtra] A field of the designer at the end of Presentation (Reveal).
 * @returns {Promise<object|null>} The new settings.
 */
export async function openReportForm({ settings = {}, languages = [], services, inline = null, presentationExtra = null, compact = false }) {
  if (typeof services?.createOutputsPanel !== 'function') {
    HMsg.showMsgErr($HR('Generated reports can be chosen only in Heurist Explorer'));
    return null;
  }
  let files = reportFiles(settings.files);
  let chosen = [];
  let display = REPORT_DISPLAY.includes(settings.display) ? settings.display : 'full';
  let form = null;
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
      // the docked element panel: visibility, choice, language, name and size only (review 27n §14.16)
      compact,
      onChange: (picked, outputs) => {
        files = picked;
        chosen = outputs;
        problems.textContent = '';
        showWarning();
        // applied in the element panel (plan 27n §6)
        form?.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
  form = element('div', 'h-cms-form h-cms-report-form');
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
  // the sections of plan 27n §6: Source (the generated report of each language), Presentation (how it is shown)
  form.append(sectionTitle($HR('Source')), element('div', 'h-cms-style-note', 'Select a generated report, one for each language of the website. A page in a language without its own report shows the default one. With a schedule, the content of the element is updated automatically on the next generation run.'),
    panel.element, sectionTitle($HR('Presentation')), radios, warning, problems);
  if (presentationExtra) form.append(presentationExtra);
  showWarning();
  return showDomForm(form, $HR('Generated report'), () => {
    if (!Object.keys(files).length) {
      problems.textContent = $HR('Choose a generated report');
      return null;
    }
    const report = chosen[0]?.reportId ?? settings.report;
    return { ...(report != null ? { report } : {}), files, display };
  }, { inline, className: 'h-cms-report-dialog', cleanup: () => panel.destroy() });
}

/**
 * Settings of the Filter widget (plan 27l §3): the filters offered (saved filters of the group "Website filters" and
 * public query sources: visitors must be able to read them), the one run when the page opens, the presentation.
 *
 * @param {object} options
 * @param {object} [options.settings]
 * @param {Array<{kind: string, id: number, title: string}>} options.choices The filters that can be offered.
 * @returns {Promise<object|null>} The stored settings (storedCmsFilterWidget).
 */
export function openFilterWidgetForm({ settings = {}, choices = [], inline = null } = {}) {
  const current = cmsFilterWidgetSettings(settings);
  // a filter of the widget that is not public any more stays offered (it can be removed)
  const all = [...choices.map((choice) => ({ ...choice, key: cmsFilterItemKey(choice.kind, choice.id) }))];
  for (const item of current.items) if (!all.some((choice) => choice.key === item.key)) all.push(item);
  const terms = all.map((choice) => ({ id: choice.key, label: `${choice.title} [${choice.kind === 'filter' ? 'filter' : 'source'}]` }));
  const modeLabels = { buttons: 'Buttons', list: 'List', select: 'Select' };
  return showEditForm({
    title: 'Filter',
    form: {
      groups: [{
        id: 'main',
        children: [
          { name: 'items', type: 'enum', label: 'Available filters', req: 'required', mode: 'select', multiple: true, max: 0, terms,
            help: 'Saved filters of the group "Website filters" and public query sources' },
          { name: 'active', type: 'enum', label: 'Active on start', mode: 'select', terms, emptyLabel: 'None',
            help: 'One of the available filters; it runs when the page opens without a Saved filter in its address' },
          { name: 'mode', type: 'enum', label: 'Show as', mode: 'radio', max: 1,
            terms: CMS_FILTER_WIDGET_MODES.map((id) => ({ id, label: modeLabels[id] })) }
        ]
      }]
    },
    values: { items: current.items.map((item) => item.key), active: current.active, mode: current.mode },
    onReady: (edit) => addFormHelp(edit, 'The chosen filter shows its records in the modules of the page that take their records'
      + ' from this widget (Records and selection of the module); a filter with parameters shows its form first.')
  }, (values) => {
    if (!values) return null;
    const keys = [values.items].flat().filter(Boolean).map(String);
    const items = keys.map((key) => all.find((choice) => choice.key === key)).filter(Boolean);
    if (!items.length) {
      HMsg.showMsgErr?.($HR('Choose at least one filter'));
      return null;
    }
    return storedCmsFilterWidget({ items, active: values.active ? String(values.active) : null, mode: values.mode });
  }, { inline, sections: { source: ['items', 'active'] } });
}

/**
 * Settings of the breadcrumbs (plan 27k §6): `mode` path (default, not written) or history.
 *
 * @param {{settings?: object}} options
 * @returns {Promise<object|null>}
 */
export function openBreadcrumbsForm({ settings = {}, inline = null } = {}) {
  return showEditForm({
    title: 'Breadcrumbs',
    form: {
      groups: [{
        id: 'main',
        children: [
          { name: 'mode', type: 'enum', label: 'Show', mode: 'radio', max: 1,
            terms: [{ id: 'path', label: 'The path of the page: Home › Section › Page' },
              { id: 'history', label: 'History: the record pages visited before' }] }
        ]
      }]
    },
    values: { mode: settings.mode === 'history' ? 'history' : 'path' },
    onReady: (edit) => addFormHelp(edit, 'On a record page the record is the last entry. History keeps the record pages the visitor opened on'
      + ' this website (in this browser tab); before the first one, and without JavaScript, the path is shown.')
  }, (values) => (values.mode === 'history' ? { mode: 'history' } : {}), { inline, sections: { source: ['mode'] } });
}

/**
 * Settings of the website menu (plan 27f §4): orientation, Home entry, whether a page with sub pages opens; style of the
 * items (plan 27k §1); the collapsed menu below the header or full screen with its animation, always collapsed (§5).
 *
 * @param {{settings?: object}} options
 * @returns {Promise<object|null>} The settings (default values left out).
 */
export function openMenuForm({ settings = {}, inline = null } = {}) {
  return showEditForm({
    title: 'Menu',
    form: {
      groups: [{
        id: 'main',
        children: [
          // advanced settings (review 27n §21, `req: 'optional'`): the source, orientation (auto for a new menu), the collapsed
          // menu and colours
          { name: 'orientation', type: 'enum', label: 'Orientation', mode: 'radio', max: 1, req: 'optional',
            terms: [{ id: 'horizontal', label: 'Horizontal (drop-down sub pages)' }, { id: 'vertical', label: 'Vertical (a tree)' },
              { id: 'auto', label: 'Auto: vertical in a vertical header' }] },
          // the look of the items of the first level (plan 27k §1)
          { name: 'style', type: 'enum', label: 'Style of the items', max: 1,
            terms: ITEM_STYLES.map(([id, label]) => ({ id, label })) },
          // the line of the underline style (review 2026-11-16)
          ...MENU_LINE_FIELDS,
          // colours of the items (plan 27n §7)
          { name: 'colors', type: 'enum', label: 'Colours', max: 1, req: 'optional',
            terms: ITEM_COLOR_LABELS.map(([id, label]) => ({ id: id || 'site', label })) },
          { name: 'showHome', type: 'boolean', label: 'Show Home', help: 'The home page as the first entry of the menu', max: 1, req: 'optional' },
          { name: 'selectableParent', type: 'boolean', label: 'Pages with sub pages open', max: 1, req: 'optional',
            help: 'Unchecked: the title of such a page only opens its sub pages' },
          // the collapsed menu (plan 27k §5): below the header row, or over the whole window with an animation
          { name: 'collapse', type: 'enum', label: 'Open collapsed menu', mode: 'radio', max: 1, req: 'optional',
            help: 'The menu collapses behind its button when it does not fit (narrow screens)',
            terms: [{ id: 'panel', label: 'Below the header' }, { id: 'fullscreen', label: 'Full screen' }] },
          { name: 'animation', type: 'enum', label: 'Animation', max: 1, showWhen: { collapse: 'fullscreen' }, req: 'optional',
            terms: [{ id: 'down', label: 'Slide down' }, { id: 'right', label: 'Slide in from the right' }, { id: 'fade', label: 'Fade in' }] },
          // the colours of the full-screen menu (review 2026-11-16); empty: the colours of the page
          { name: 'overlayBg', type: 'color', label: 'Background of the full-screen menu', max: 1, showWhen: { collapse: 'fullscreen' },
            req: 'optional' },
          { name: 'overlayText', type: 'color', label: 'Text colour of the full-screen menu', max: 1, showWhen: { collapse: 'fullscreen' },
            req: 'optional' },
          { name: 'alwaysCollapsed', type: 'boolean', label: 'Always collapsed', max: 1, req: 'optional',
            help: 'The menu button on every screen, also when the menu fits' },
          // the pages of the menu (plan 27k §6, the last option since 2026-11-16): the whole website or the section of the page
          { name: 'scope', type: 'enum', label: 'Pages', mode: 'radio', max: 1, hidden: true, req: 'optional',
            terms: [{ id: 'site', label: 'All pages of the website' },
              { id: 'section', label: 'The section of the page: its sub pages, else its parent and the pages beside it; on the home page'
                + ' and on a page of the first level without sub pages: the pages of the first level' }] }
        ]
      }]
    },
    values: {
      scope: settings.scope === 'section' ? 'section' : 'site',
      orientation: ['vertical', 'auto'].includes(settings.orientation) ? settings.orientation : 'horizontal',
      style: ITEM_STYLES.some(([id]) => id === settings.style) ? settings.style : 'plain',
      colors: ITEM_COLORS.includes(settings.colors) ? settings.colors : 'site',
      showHome: settings.showHome === true,
      selectableParent: settings.selectableParent !== false,
      collapse: settings.collapse === 'fullscreen' ? 'fullscreen' : 'panel',
      animation: MENU_ANIMATIONS.includes(settings.animation) ? settings.animation : MENU_ANIMATIONS[0],
      ...menuLineValues(settings),
      overlayBg: settings.overlayBg || '',
      overlayText: settings.overlayText || '',
      alwaysCollapsed: settings.alwaysCollapsed === true
    },
    onReady: (edit) => addFormHelp(edit, 'The pages of the website in the order of the website tree. The icon of a page and whether the'
      + ' menu shows its name, its icon or both are fields of the page record (Edit record in the website tree).')
  }, (values) => {
    if (!values) return null;
    const result = {};
    if (values.scope === 'section') result.scope = 'section';
    if (['vertical', 'auto'].includes(values.orientation)) result.orientation = values.orientation;
    if (ITEM_STYLES.some(([id]) => id === values.style) && values.style !== 'plain') result.style = values.style;
    if (ITEM_COLORS.includes(values.colors)) result.colors = values.colors;
    if (values.showHome === true) result.showHome = true;
    if (values.selectableParent === false) result.selectableParent = false;
    // defaults are not written; the animation only for the full-screen menu
    Object.assign(result, menuLineSettings(values));
    if (values.collapse === 'fullscreen') {
      result.collapse = 'fullscreen';
      if (MENU_ANIMATIONS.includes(values.animation) && values.animation !== MENU_ANIMATIONS[0]) result.animation = values.animation;
      for (const key of ['overlayBg', 'overlayText']) {
        const colour = String(values[key] || '').trim();
        if (colour && MENU_COLOR.test(colour)) result[key] = colour;
      }
    }
    if (values.alwaysCollapsed === true) result.alwaysCollapsed = true;
    return result;
  }, { inline, sections: { source: ['showHome', 'selectableParent', 'scope'] } });
}

/**
 * Settings of the language switch (plan 27f §5): links, a drop-down, or auto (a drop-down when the links do not fit).
 *
 * @param {{settings?: object}} options
 * @returns {Promise<object|null>}
 */
export function openLanguageForm({ settings = {}, inline = null } = {}) {
  return showEditForm({
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
  }, (values) => {
    if (!values) return null;
    return ['list', 'select'].includes(values.appearance) ? { appearance: values.appearance } : {};
  }, { inline, sections: {} });
}

/** Help above the form of the email form widget (plan 27h). */
export const EMAIL_FORM_HELP = 'Visitors send a message to the email address of the website (field Email of the website record)'
  + ' or, without it, to the database owner. The address is not shown on the page. Visitors answer a simple question'
  + ' to prove they are human.';

/**
 * Settings of the email form (plan 27h): the form on the page, or a button that opens it in a popup; the caption of
 * the button with its translations.
 *
 * @param {{settings?: object, languages?: string[], translator?: object}} options `languages`: of the website (the
 *        first is the original).
 * @returns {Promise<object|null>} `display`, `label`, `labels` {lang: caption} (default values left out).
 */
export function openEmailForm({ settings = {}, languages = [], translator = null, inline = null } = {}) {
  const multilang = languages.length > 1;
  const caption = String(settings.label ?? '');
  return showEditForm({
    title: 'Email form',
    form: {
      groups: [{
        id: 'main',
        children: [
          // Form on the page by default; not an advanced setting any more (plan 27n1 §6)
          { name: 'display', type: 'enum', label: 'Display', mode: 'radio', max: 1,
            terms: [{ id: 'inline', label: 'Form on the page' }, { id: 'button', label: 'Button that opens the form in a popup' }] },
          { name: 'label', type: 'freetext', label: 'Button caption', help: 'Empty: "Email us"', max: 1, multilang,
            showWhen: { display: 'button' } }
        ]
      }]
    },
    values: {
      display: settings.display === 'button' ? 'button' : 'inline',
      label: multilang ? captionValue(caption, settings.labels || {}) : caption
    },
    ...(multilang ? { languages: languages.map((code) => code.toUpperCase()), translator } : {}),
    onReady: (edit) => addFormHelp(edit, EMAIL_FORM_HELP)
  }, (values) => {
    if (!values) return null;
    if (values.display !== 'button') return {};
    const { caption: label, translations } = readCaption(values.label, languages);
    const labels = Object.fromEntries(Object.entries(translations).filter(([, text]) => text));
    return { display: 'button', ...(label ? { label } : {}), ...(Object.keys(labels).length ? { labels } : {}) };
  }, { inline, sections: { caption: ['label'], when: { caption: { display: 'button' } } } });
}

/** Help of the story map form (plan 27q1 §8). */
export const STORYMAP_HELP = 'A story map is made in Explorer (tool Story map): its source records, the story elements, the'
  + ' cards and the map. Here you choose one and the map of the page that shows the current element. A Result module can'
  + ' list its source records: in its Records and selection choose this story map.';

/**
 * Terms of the story maps (Presentation sets of kind StoryMap); a stored one that is not offered stays as #id.
 *
 * @param {Array<{id: number, title: string, public?: boolean}>} presets
 * @param {number|string|null} [stored]
 * @returns {Array<{id: string, label: string}>}
 */
export function storyMapTerms(presets, stored = null) {
  const terms = presets.map((item) => ({ id: String(item.id), label: `${item.title}${item.public === false ? ` (${$HR('not public')})` : ''}` }));
  if (Number(stored) > 0 && !terms.some((term) => term.id === String(stored))) terms.push({ id: String(stored), label: `#${stored}` });
  return terms;
}

/**
 * Settings of the story map element (plan 27q1 §8): the story map (a Presentation set) and the map module of the page;
 * Edit in new window (Explorer with the story map) and Refresh (the preview again).
 *
 * @param {object} options
 * @param {object} [options.settings] `{preset, map}`.
 * @param {Array<{id: number, title: string, public?: boolean}>} options.presets
 * @param {Array<{id: string, label: string}>} options.maps Map instances of the page.
 * @param {(presetId: number) => void} [options.onEdit] Open the story map in Explorer.
 * @param {() => void} [options.onRefresh] Load the preview again.
 * @returns {Promise<object|null>} `{preset, map?}`.
 */
export function openStoryMapForm({ settings = {}, presets = [], maps = [], onEdit = null, onRefresh = null, inline = null } = {}) {
  return showEditForm({
    title: 'Story map',
    form: {
      groups: [{
        id: 'main',
        children: [
          { name: 'preset', type: 'enum', label: 'Story map', mode: 'select', max: 1, req: 'required', terms: storyMapTerms(presets, settings.preset),
            help: presets.length ? 'Public story maps can be seen by visitors' : 'Make a story map in Explorer first (tool Story map)' },
          { name: 'map', type: 'enum', label: 'Map', mode: 'select', max: 1, emptyLabel: 'None (cards only)',
            terms: maps.map((item) => ({ id: item.id, label: item.label })), help: 'The map of the page that shows the current element' }
        ]
      }]
    },
    values: { preset: Number(settings.preset) > 0 ? String(settings.preset) : null, map: settings.map || null },
    onReady: (edit) => {
      addFormHelp(edit, STORYMAP_HELP);
      if (!edit.container) return;
      const bar = document.createElement('div');
      bar.className = 'h-cms-storymap-actions';
      const action = (icon, text, run) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'h-btn h-compact';
        const glyph = document.createElement('i');
        glyph.className = `fa-solid ${icon}`;
        glyph.setAttribute('aria-hidden', 'true');
        button.append(glyph, document.createTextNode(` ${$HR(text)}`));
        button.addEventListener('click', run);
        bar.append(button);
      };
      if (onEdit) action('fa-up-right-from-square', 'Edit in new window', () => onEdit(Number(edit.getValues().preset) || 0));
      if (onRefresh) action('fa-rotate', 'Refresh', () => onRefresh());
      edit.container.append(bar);
    },
    validate: (values) => (Number(values.preset) > 0 ? [] : [{ field: 'preset', message: $HR('Choose a story map') }])
  }, (values) => {
    if (!values) return null;
    return { preset: Number(values.preset), ...(values.map ? { map: String(values.map) } : {}) };
  }, { inline, sections: { source: ['preset'], behaviour: ['map'] } });
}

/** Help of the crosstabs form (plan 27q2 §10). */
export const CROSSTABS_HELP = 'A crosstab is made in Explorer (tool Crosstabs): its fields, ranges, measure, chart and what'
  + ' visitors may change. Here you choose one and where its records come from: its own query, the Filter widgets of the'
  + ' page (the facets), the Saved filter links or another module. The latest search counts.';

/**
 * Settings of the crosstabs element (plan 27q2 §10): the crosstab (a Presentation set), where its records come from
 * (`from`: own = its query, links, filter:<id>, module:<id>) and the level of the visitor (it can only lower the level of
 * the crosstab); Edit in new window (Explorer with the crosstab) and Refresh. A crosstab published from Explorer keeps
 * the query of the records shown there in `settings.query` (presentation-sources.md §6): it is the own query then.
 *
 * @param {object} options
 * @param {object} [options.settings] `{preset, from, level, query}`.
 * @param {Array<{id: number, title: string, public?: boolean}>} options.presets
 * @param {Array<{id: string, label: string}>} options.sources The sources of the page (links, Filter widgets, modules).
 * @param {(presetId: number) => void} [options.onEdit] Open the crosstab in Explorer.
 * @param {() => void} [options.onRefresh] Load the preview again.
 * @returns {Promise<object|null>} `{preset, from?, level?}`.
 */
export function openCrosstabsForm({ settings = {}, presets = [], sources = [], onEdit = null, onRefresh = null, inline = null } = {}) {
  const known = new Set(['own', ...sources.map((item) => item.id)]);
  const stored = Array.isArray(settings.from) ? settings.from : null;
  const publishedQuery = settings.query != null && settings.query !== '';
  const terms = [{ id: 'own', label: publishedQuery ? 'Query published from Explorer' : 'Query of the crosstab' }, ...sources,
    ...(stored || []).filter((token) => !known.has(token)).map((token) => ({ id: token, label: token }))];
  const fallback = ['own', ...sources.filter((item) => item.id === 'links' || item.id.startsWith('filter:')).map((item) => item.id)];
  return showEditForm({
    title: 'Crosstabs',
    form: {
      groups: [{
        id: 'main',
        children: [
          { name: 'preset', type: 'enum', label: 'Crosstab', mode: 'select', max: 1, req: 'required', terms: storyMapTerms(presets, settings.preset),
            help: presets.length ? 'Public crosstabs can be seen by visitors' : 'Make a crosstab in Explorer first (tool Crosstabs)' },
          { name: 'from', type: 'enum', label: 'Records from', mode: 'checkbox', max: 0, terms,
            help: 'Any of them: the crosstab counts the latest search' },
          { name: 'level', type: 'enum', label: 'Visitors can', mode: 'select', max: 1, emptyLabel: 'As in the crosstab',
            terms: [{ id: 'view', label: 'View' }, { id: 'display', label: 'Change the display' }, { id: 'pivot', label: 'Choose the fields' }],
            help: 'Lowers what the crosstab allows' }
        ]
      }]
    },
    values: {
      preset: Number(settings.preset) > 0 ? String(settings.preset) : null,
      from: stored || fallback,
      level: settings.level || null
    },
    onReady: (edit) => {
      addFormHelp(edit, CROSSTABS_HELP);
      if (!edit.container) return;
      const bar = document.createElement('div');
      bar.className = 'h-cms-storymap-actions';
      const action = (icon, text, run) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'h-btn h-compact';
        const glyph = document.createElement('i');
        glyph.className = `fa-solid ${icon}`;
        glyph.setAttribute('aria-hidden', 'true');
        button.append(glyph, document.createTextNode(` ${$HR(text)}`));
        button.addEventListener('click', run);
        bar.append(button);
      };
      if (onEdit) action('fa-up-right-from-square', 'Edit in new window', () => onEdit(Number(edit.getValues().preset) || 0));
      if (onRefresh) action('fa-rotate', 'Refresh', () => onRefresh());
      edit.container.append(bar);
    },
    validate: (values) => (Number(values.preset) > 0 ? [] : [{ field: 'preset', message: $HR('Choose a crosstab') }])
  }, (values) => {
    if (!values) return null;
    const from = [...new Set([values.from].flat().filter((token) => typeof token === 'string' && token))];
    const same = from.length === fallback.length && fallback.every((token) => from.includes(token));
    const level = [values.level].flat()[0];
    return {
      preset: Number(values.preset), ...(same ? {} : { from }), ...(level ? { level: String(level) } : {}),
      ...(publishedQuery ? { query: settings.query } : {})
    };
  }, { inline, sections: { source: ['preset', 'from'], behaviour: ['level'] } });
}
