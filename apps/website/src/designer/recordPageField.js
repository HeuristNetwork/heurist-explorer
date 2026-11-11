/**
 * @file recordPageField.js
 * @brief Actions of elements that show records and the choice of a record page (plan 27g §6).
 *
 * Record cards, a Record field (source *A record*), a media element and a media gallery (Type *Any record*) have the
 * same actions: None, (media: Player / Viewer,) Open record URL, Open record page, Saved filter (disabled for now).
 * *Open record page* shows the field **Record page** (the record pages of the website) and the button **Define new
 * record page**: a small popup with the Smarty report of the new page and **Create page**. The server writes the links
 * (PageContent::recordLinks). The action menu form uses the same select, button and popup (`recordPagePicker`).
 *
 * Stored settings: `action: 'none' | 'url' | 'recordPage' | 'viewer'` and `recordPage: <page id>`.
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

/** Actions of the links of records; `viewer` only for media. */
const ACTIONS = Object.freeze(['none', 'viewer', 'url', 'recordPage']);

/** Dialog id of the popup Define new record page (above the form that opens it). */
const NEW_PAGE_DIALOG = 'h-cms-new-record-page';

/**
 * Terms of the action field.
 *
 * @param {{viewer?: boolean}} [options] `viewer`: Player / Viewer (media).
 * @returns {Array<{id: string, label: string, disabled?: boolean}>}
 */
export function recordActionTerms({ viewer = false } = {}) {
  return [
    { id: 'none', label: 'None' },
    ...(viewer ? [{ id: 'viewer', label: 'Player / Viewer' }] : []),
    { id: 'url', label: 'Open record URL' },
    { id: 'recordPage', label: 'Open record page' },
    { id: 'savedFilter', label: 'Saved filter', disabled: true }
  ];
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
 * @param {object} [options.showWhen] When the action is offered (Record field: source *A record*; media: Type *Any
 *        record*); the Record page field also needs the action *Open record page*.
 * @returns {Array<object>} HEditForm fields: the action and `recordPage`.
 */
export function recordActionFields({ name = 'action', viewer = false, pageTerms = [], showWhen = null } = {}) {
  return [
    { name, type: 'enum', label: 'Action', mode: 'radio', max: 1, terms: recordActionTerms({ viewer }), ...(showWhen ? { showWhen } : {}) },
    { name: 'recordPage', type: 'enum', label: 'Record page', mode: 'select', max: 1, terms: pageTerms,
      showWhen: { ...(showWhen || {}), [name]: 'recordPage' } }
  ];
}

/**
 * Values of the action fields from settings.
 *
 * @param {{action?: string, recordPage?: number}} settings
 * @param {{viewer?: boolean}} [options]
 * @returns {{action: string, recordPage: number|null}}
 */
export function recordActionValues(settings = {}, { viewer = false } = {}) {
  const action = ACTIONS.includes(settings.action) && (viewer || settings.action !== 'viewer') ? settings.action : 'none';
  return { action, recordPage: Number(settings.recordPage) > 0 ? Number(settings.recordPage) : null };
}

/**
 * Settings of the action from the values of the form.
 *
 * @param {{action?: string, recordPage?: number|string}} values
 * @param {{viewer?: boolean, allowed?: boolean}} [options] `allowed`: false when the action is not offered (another
 *        source or Type): `none`.
 * @returns {{action: string, recordPage?: number}}
 */
export function recordActionSettings(values = {}, { viewer = false, allowed = true } = {}) {
  const { action, recordPage } = recordActionValues(values, { viewer });
  if (!allowed) return { action: 'none' };
  return action === 'recordPage' && recordPage ? { action, recordPage } : { action: action === 'recordPage' ? 'none' : action };
}

/** Issues of the action fields: Open record page needs a page. */
export function recordActionIssues(values = {}) {
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
 * The Record page select and Define new record page as plain controls (the action menu form).
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
    empty.textContent = $HR('Record page');
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
  if (typeof services.createRecordPage === 'function') {
    const button = newPageButton();
    button.addEventListener('click', async () => {
      const page = await openNewRecordPageForm(services);
      if (page) fill(page.id);
    });
    element.append(button);
  }
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
