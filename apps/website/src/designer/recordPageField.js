/**
 * @file recordPageField.js
 * @brief Actions of elements that show records and the choice of a record page (plan 27g §6).
 *
 * Record cards, a Record field (source *A record*), a media element and a media gallery (Type *Any record*) have the
 * same actions: None, (media: Player / Viewer,) Open record URL, Open record page, Saved filter (plan 27j: the query
 * source, target page and values in the popup of savedFilterField.js, phase A: constant values).
 * *Open record page* shows the field **Record page** (the record pages of the website) and the button **Define new
 * record page**: a small popup with the Smarty report of the new page and **Create page**. The server writes the links
 * (PageContent::recordLinks). The action menu form uses the same select, button and popup (`recordPagePicker`).
 *
 * Stored settings: `action: 'none' | 'url' | 'recordPage' | 'viewer' | 'page' | 'savedFilter'`, `recordPage: <page id>` and
 * `page: <page id>` (Go to a page: a page of the website, 2026-11-14; Saved filter: the target page, with `source` and
 * `values`).
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
import { formDialog } from './designerDialogs.js';
import { helpLine } from './designerStyles.js';
import { savedFilterField } from './savedFilterField.js';
import { cmsFilterKeys } from '#shared/site/cmsSavedFilter.js';

/** Actions of the links of records; `viewer` only for media; `page` (Go to a page) with the pages of the website. */
const ACTIONS = Object.freeze(['none', 'viewer', 'url', 'recordPage', 'page', 'savedFilter']);

/** Dialog id of the popup Define new record page (above the form that opens it). */
const NEW_PAGE_DIALOG = 'h-cms-new-record-page';

/**
 * Terms of the action field.
 *
 * @param {{viewer?: boolean, page?: boolean, record?: boolean}} [options] `viewer`: Player / Viewer (media); `page`: Go to
 *        a page (2026-11-14); `record: false`: without the actions of a record (a Record field of This website).
 * @returns {Array<{id: string, label: string, disabled?: boolean}>}
 */
export function recordActionTerms({ viewer = false, page = false, record = true } = {}) {
  return [
    { id: 'none', label: 'None' },
    ...(viewer ? [{ id: 'viewer', label: 'Player / Viewer' }] : []),
    ...(page ? [{ id: 'page', label: 'Go to a page' }] : []),
    ...(record ? [
      { id: 'url', label: 'Open record URL' },
      { id: 'recordPage', label: 'Open record page' },
      { id: 'savedFilter', label: 'Saved filter' }
    ] : [])
  ];
}

/**
 * The pages of the website as terms of Go to a page: Home, then the menu pages (sub pages indented), not record pages.
 *
 * @param {{id: number, pages?: Array}|null} site Summary of the website (designer `site`).
 * @returns {Array<{id: number, label: string}>}
 */
export function sitePageTerms(site) {
  if (!site) return [];
  const terms = [{ id: Number(site.id), label: $HR('Home') }];
  const walk = (pages, depth) => {
    for (const page of pages || []) {
      if (page.record) continue;
      terms.push({ id: Number(page.id), label: `${'\u00a0\u00a0'.repeat(depth)}${page.title || `#${page.id}`}` });
      walk(page.children, depth + 1);
    }
  };
  walk(site.pages, 1);
  return terms;
}

/**
 * The record pages of a website (`site.pages` of the summary, all levels) as terms.
 *
 * @param {Array<object>} pages `site.pages`: {id, title, record, template, children}.
 * @param {Array<{id: string, label: string}>} [templates] Terms of the card templates (cardTemplateTerms): the name of
 *        the template after the title.
 * @returns {Array<{id: number, label: string}>}
 */
export function recordPageTerms(pages = [], templates = []) {
  const terms = [];
  const walk = (list) => {
    for (const page of list || []) {
      if (page.record) {
        const template = templates.find((term) => String(term.id) === String(page.template))?.label || '';
        terms.push({ id: Number(page.id), label: `${page.title || `#${page.id}`}${template ? ` · ${template}` : ''}` });
      }
      walk(page.children);
    }
  };
  walk(pages);
  return terms;
}

/**
 * The action field and the Record page field of a form.
 *
 * @param {object} options
 * @param {string} [options.name='action'] Name of the action field (media: `recordAction` beside the action of the
 *        other Types).
 * @param {boolean} [options.viewer] Player / Viewer (media).
 * @param {Array<object>} [options.pageTerms] recordPageTerms.
 * @param {Array<object>|null} [options.sitePages] sitePageTerms: Go to a page with the field `page` (2026-11-14).
 * @param {object} [options.showWhen] When the action is offered (Record field: source *A record*; media: Type *Any
 *        record*); the Record page field also needs the action *Open record page*.
 * @returns {Array<object>} HEditForm fields: the action, `recordPage`, (sitePages) `page` and `savedFilter` (the summary of
 *          the Saved filter, attachSavedFilter).
 */
export function recordActionFields({ name = 'action', viewer = false, pageTerms = [], sitePages = null, showWhen = null } = {}) {
  const page = Array.isArray(sitePages) && sitePages.length > 0;
  return [
    { name, type: 'enum', label: 'Action', mode: 'radio', max: 1, terms: recordActionTerms({ viewer, page }), ...(showWhen ? { showWhen } : {}) },
    { name: 'recordPage', type: 'enum', label: 'Record page', mode: 'select', max: 1, terms: pageTerms,
      showWhen: { ...(showWhen || {}), [name]: 'recordPage' } },
    ...(page ? [{ name: 'page', type: 'enum', label: 'Page', mode: 'select', max: 1, terms: sitePages,
      showWhen: { ...(showWhen || {}), [name]: 'page' } }] : []),
    savedFilterField({ ...(showWhen || {}), [name]: 'savedFilter' })
  ];
}

/**
 * Values of the action fields from settings.
 *
 * @param {{action?: string, recordPage?: number, page?: number}} settings
 * @param {{viewer?: boolean}} [options]
 * @returns {{action: string, recordPage: number|null, page: number|null}}
 */
export function recordActionValues(settings = {}, { viewer = false } = {}) {
  const action = ACTIONS.includes(settings.action) && (viewer || settings.action !== 'viewer') ? settings.action : 'none';
  return { action, recordPage: Number(settings.recordPage) > 0 ? Number(settings.recordPage) : null,
    page: Number(settings.page) > 0 ? Number(settings.page) : null };
}

/**
 * Settings of the action from the values of the form.
 *
 * @param {{action?: string, recordPage?: number|string, page?: number|string}} values
 * @param {{viewer?: boolean, allowed?: boolean, filter?: object|null}} [options] `allowed`: false when the action is not
 *        offered (another source or Type): `none`; `filter`: the Saved filter of the popup `{source|filter, page, values}`.
 * @returns {{action: string, recordPage?: number, page?: number, source?: number, filter?: number, values?: object}}
 */
export function recordActionSettings(values = {}, { viewer = false, allowed = true, filter = null } = {}) {
  const { action, recordPage, page } = recordActionValues(values, { viewer });
  if (!allowed) return { action: 'none' };
  if (action === 'savedFilter') return filter ? { action, page: filter.page, ...cmsFilterKeys(filter), values: filter.values } : { action: 'none' };
  if (action === 'page') return page ? { action, page } : { action: 'none' };
  return action === 'recordPage' && recordPage ? { action, recordPage } : { action: action === 'recordPage' ? 'none' : action };
}

/** Issues of the action fields: Open record page needs a record page, Go to a page a page, Saved filter its popup. */
export function recordActionIssues(values = {}, filter = null) {
  if (values.action === 'savedFilter' && !filter) return [{ field: 'savedFilter', message: $HR('Define the saved filter') }];
  if (values.action === 'page' && !(Number(values.page) > 0)) return [{ field: 'page', message: $HR('Choose a page') }];
  return values.action === 'recordPage' && !(Number(values.recordPage) > 0)
    ? [{ field: 'recordPage', message: $HR('Choose a record page or define a new one') }]
    : [];
}

/**
 * The popup Define new record page: the Smarty report of the page and Create page.
 *
 * @param {object} services `cardTemplates()` → reports `[{id, title, file}]`, `templateTerms(reports)` → terms,
 *        `createRecordPage(template, title)` → `{id, title}`.
 * @returns {Promise<{id: number, title: string}|null>} The new page.
 */
export async function openNewRecordPageForm(services) {
  const reports = await services.cardTemplates?.().catch(() => []) ?? [];
  const terms = services.templateTerms ? services.templateTerms(reports) : reports.map((report) => ({ id: String(report.id), label: report.title }));
  const form = document.createElement('form');
  form.className = 'h-cms-form h-cms-new-record-page-form';
  form.append(helpLine(terms.length
    ? 'A new page that shows one record with this Smarty report. Its links come from Record cards, Record fields, media and action menus.'
    : 'Mark a report "Single record (card)" to use it for a record page.'));
  const line = document.createElement('label');
  line.className = 'h-cms-styles-field';
  const caption = document.createElement('span');
  caption.textContent = $HR('Smarty report');
  const select = document.createElement('select');
  select.className = 'h-select h-compact';
  for (const term of terms) {
    const option = document.createElement('option');
    option.value = String(term.id);
    option.textContent = term.label;
    select.append(option);
  }
  line.append(caption, select);
  form.append(line);
  const chosen = await formDialog(form, 'Define new record page', 'Create page', () => (select.value ? { template: select.value } : null),
    select, 'h-dialog-cms-narrow', NEW_PAGE_DIALOG);
  if (!chosen) return null;
  const template = /^\d+$/.test(chosen.template) ? Number(chosen.template) : chosen.template;
  const title = terms.find((term) => String(term.id) === chosen.template)?.label || $HR('Record page');
  try {
    return await services.createRecordPage(template, title);
  } catch (error) {
    HMsg.showMsgErr?.(error?.message || String(error));
    return null;
  }
}

/**
 * Put the button Define new record page right after the select of the Record page field of a form (`onReady`; an icon
 * with a tooltip, always shown): the new page is added to the select and chosen.
 *
 * @param {object} edit HEditForm.
 * @param {object} services See openNewRecordPageForm; also `recordPageTerms()` → the current terms.
 */
export function attachNewRecordPage(edit, services) {
  const widget = edit.getFieldWidget?.('recordPage');
  const host = widget?.container?.querySelector?.('.h-edit-field-value') || widget?.container;
  if (!host || typeof services?.createRecordPage !== 'function') return;
  const button = newPageButton();
  button.addEventListener('click', async () => {
    const page = await openNewRecordPageForm(services);
    if (!page) return;
    await edit.updateField('recordPage', { terms: services.recordPageTerms() });
    await edit.setValue('recordPage', page.id);
  });
  host.append(button);
}

/**
 * The Record page select and Define new record page as plain controls (the action menu form). No record page yet
 * (2026-11-14): only the button, with its caption "Define new record page"; the select is shown after the first page.
 *
 * @param {object} services See attachNewRecordPage.
 * @param {number|null} [value] The chosen page.
 * @returns {{element: HTMLElement, select: HTMLSelectElement}}
 */
export function recordPagePicker(services, value = null) {
  const element = document.createElement('span');
  element.className = 'h-cms-record-page';
  const select = document.createElement('select');
  select.className = 'h-select h-compact';
  const fill = (chosen) => {
    select.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = $HR('Select Record page');
    select.append(empty);
    for (const term of services.recordPageTerms?.() || []) {
      const option = document.createElement('option');
      option.value = String(term.id);
      option.textContent = term.label;
      select.append(option);
    }
    select.value = chosen ? String(chosen) : '';
  };
  fill(value);
  element.append(select);
  let button = null;
  const show = () => {
    const none = select.querySelectorAll('option').length < 2;
    select.hidden = none && Boolean(button);
    if (button) newPageCaption(button, none);
  };
  if (typeof services.createRecordPage === 'function') {
    button = newPageButton();
    button.addEventListener('click', async () => {
      const page = await openNewRecordPageForm(services);
      if (!page) return;
      fill(page.id);
      show();
    });
    element.append(button);
  }
  show();
  return { element, select };
}

/** Define new record page: an icon with a tooltip (cosmetics 2026-11-11). */
function newPageButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'h-btn h-compact h-cms-new-record-page';
  button.title = $HR('Define new record page');
  button.setAttribute('aria-label', button.title);
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-plus';
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon);
  return button;
}

/** The caption of the button beside its icon: shown while the website has no record page (2026-11-14). */
function newPageCaption(button, shown) {
  let caption = button.querySelector('.h-cms-new-record-page-caption');
  if (!shown) {
    caption?.remove();
    return;
  }
  if (caption) return;
  caption = document.createElement('span');
  caption.className = 'h-cms-new-record-page-caption';
  caption.textContent = ` ${$HR('Define new record page')}`;
  button.append(caption);
}
