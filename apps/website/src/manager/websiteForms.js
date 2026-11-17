/**
 * @file websiteForms.js
 * @brief Dialogs of the Website manager (plan 27b): new website (HEditForm, plan 27f §13), Generate options (plan 27m
 *        §2.1), add a page to a website menu, and Yes/No questions. Built on the shared message dialog (HMsg).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR, HMsg } from '#shared/ui';
import { hasQueryParameters } from '#shared/data/queryParameters.js';
import { openEditFormDialog } from '#shared/widgets/edit-form/editFormDialog.js';
import { createWebsiteFieldsForm } from './websiteFields.js';

const DIALOG_ID = 'h-website-dialog';

/**
 * The starter pages of a new website (2026-11-14): templates of the website editor; Home (Landing) is always made.
 * `checked`: chosen at first.
 */
const STARTER_PAGES = Object.freeze([
  { id: 'cover', label: 'Cover', checked: false },
  { id: 'landing', label: 'Home (Landing)', checked: true, disabled: true },
  { id: 'about', label: 'About', checked: true },
  { id: 'discover', label: 'Discover', checked: true },
  { id: 'contact', label: 'Contact', checked: true }
]);

/**
 * Yes/No question, with an optional checkbox on the second row (Delete website: "Delete its menu pages too").
 *
 * @param {string} message Message text.
 * @param {{title?: string, yesLabel?: string, noLabel?: string, checkbox?: {label: string, checked?: boolean}}} [options]
 *        `checkbox`: its `checked` is set when the question is answered.
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message, { title = 'Please confirm', yesLabel = 'Yes', noLabel = 'No', checkbox = null } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value) => {
      answered = true;
      HMsg.closeMsgDlg(DIALOG_ID);
      resolve(value);
    };
    const text = document.createElement('p');
    text.className = 'h-website-dialog-text';
    text.textContent = message;
    let content = text;
    let input = null;
    if (checkbox) {
      content = document.createElement('div');
      const row = document.createElement('label');
      row.className = 'h-website-dialog-check';
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checkbox.checked === true;
      input.addEventListener('change', () => { checkbox.checked = input.checked; });
      const caption = document.createElement('span');
      caption.textContent = checkbox.label;
      row.append(input, caption);
      content.append(text, row);
    }
    const dialog = HMsg.showMsgDlg(content, {
      message: true,
      dialogId: DIALOG_ID,
      title,
      buttons: [
        { label: yesLabel, class: 'h-btn h-btn-primary', onClick: () => answer(true) },
        { label: noLabel, class: 'h-btn', onClick: () => answer(false) }
      ]
    });
    // the close event of a previous question on the same dialog element comes later (a task): it is not
    // the answer to this question while the dialog is open again (Delete website, then Delete its pages)
    const onClose = () => {
      if (answered) return;
      if (dialog.open) {
        dialog.addEventListener('close', onClose, { once: true });
        return;
      }
      resolve(false);
    };
    dialog.addEventListener('close', onClose, { once: true });
  });
}

/**
 * New website (plan 27f §13): main language, other languages, and the fields of the website record from its
 * structure: title (required), subtitle, short summary, logo and banner image.
 *
 * @param {object} options
 * @param {string[]} [options.languages] 3-letter codes offered (database translation languages).
 * @param {object} options.dbdefs HDbDefs.
 * @param {object} options.apiClient HeuristApiClient.
 * @param {Object<string, number>} options.codes Local ids of the website codes.
 * @param {object} [options.services] `recordField` of the host (file inputs), `browseRecords`, `createRecordBrowser`.
 * @returns {Promise<{languages: string[], details: Object<string, Array>}|null>}
 */
export async function openNewWebsiteForm({ languages = [], dbdefs, apiClient, codes, services = {} } = {}) {
  const list = [...new Set(['eng', ...languages.map((code) => String(code).toLowerCase())])].filter((code) => /^[a-z]{3}$/.test(code));
  const terms = list.map((code) => ({ id: code, label: code.toUpperCase() }));
  const host = document.createElement('div');
  host.className = 'h-website-fields';
  const fields = await createWebsiteFieldsForm(host, { dbdefs, apiClient, codes, services });
  const note = document.createElement('p');
  note.className = 'h-muted';
  note.textContent = $HR('The website gets a header with a menu, a footer and the chosen pages. It is public.');
  let result = null;
  const answer = await openEditFormDialog({
    title: 'New website',
    className: 'h-dialog-new-website',
    // the fields of the website first (put in by onReady), then the languages and the starter pages (2026-11-14)
    form: {
      groups: [{
        id: 'languages',
        label: 'Languages',
        children: [
          { name: 'main', type: 'enum', label: 'Main language', max: 1, terms },
          { name: 'others', type: 'enum', label: 'Other languages', max: 0, mode: 'checkbox', terms }
        ]
      }, {
        id: 'pages',
        label: 'Pages',
        children: [
          { name: 'pages', type: 'enum', label: 'Pages of the website', max: 0, mode: 'checkbox', terms: STARTER_PAGES,
            help: 'Each page is made from its template with all its sections; change them in the website editor.' }
        ]
      }]
    },
    values: { main: 'eng', others: [], pages: STARTER_PAGES.filter((term) => term.checked).map((term) => term.id) },
    apiClient,
    dbdefs,
    onReady: (edit) => {
      edit.container.prepend(host);
      edit.container.append(note);
    },
    validate: () => fields.validate(),
    buttons: [{ id: 'create', label: 'Create', primary: true }, { id: 'cancel', label: 'Cancel' }],
    onAction: (action, values) => {
      const main = String(values.main || 'eng');
      const others = [values.others].flat().filter(Boolean).map(String).filter((code) => code !== main);
      // Home (Landing) always
      const pages = [...new Set(['landing', ...[values.pages].flat().filter(Boolean).map(String)])];
      result = { languages: [main, ...new Set(others)], details: fields.details(), pages };
      return true;
    }
  }).finally(() => fields.destroy());
  return answer ? result : null;
}

/**
 * Add a page to a website menu: the website and the parent (top menu or a page).
 *
 * @param {{websites: Array<{id: number, title: string, pages: Array}>}} options Editable v4 websites.
 * @returns {Promise<{siteId: number, parentId: number}|null>}
 */
export function openAddToMenuForm({ websites = [] } = {}) {
  const form = document.createElement('form');
  form.className = 'h-website-form';
  if (!websites.length) {
    HMsg.showMsgFlash($HR('There is no website of format 4 that you can change. Create a website first.'), { showDelay: 3500 });
    return Promise.resolve(null);
  }
  const site = field(form, 'Website', select(websites.map((item) => ({ value: String(item.id), label: item.title || `#${item.id}` }))));
  const parent = field(form, 'Place', document.createElement('select'));
  parent.className = 'h-select';
  const fillParents = () => {
    const chosen = websites.find((item) => String(item.id) === site.value);
    parent.replaceChildren(option('0', $HR('Top menu')));
    const add = (pages, depth) => {
      for (const page of pages || []) {
        parent.append(option(String(page.id), `${'  '.repeat(depth)}${$HR('Under')} "${page.title}"`));
        add(page.children, depth + 1);
      }
    };
    add(chosen?.pages, 1);
  };
  site.addEventListener('change', fillParents);
  fillParents();
  return formDialog(form, 'Add to website menu', 'Add', () => ({ siteId: Number(site.value), parentId: Number(parent.value) || 0 }), site);
}

/** Show a form in the message dialog; `read()` gives the value or null (keeps it open). */
function formDialog(form, title, okLabel, read, focus) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      done = true;
      HMsg.closeMsgDlg(DIALOG_ID);
      resolve(value);
    };
    const submit = () => {
      const value = read();
      if (value) finish(value);
    };
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });
    const dialog = HMsg.showMsgDlg(form, {
      dialogId: DIALOG_ID,
      title,
      buttons: [
        { label: okLabel, class: 'h-btn h-btn-primary', onClick: submit },
        { label: 'Cancel', class: 'h-btn', onClick: () => finish(null) }
      ]
    });
    dialog.addEventListener('close', () => { if (!done) resolve(null); }, { once: true });
    focus?.focus();
  });
}

/** A labelled row of a form; returns the control. */
function field(form, label, control) {
  const row = document.createElement('label');
  row.className = 'h-website-form-row';
  const caption = document.createElement('span');
  caption.textContent = $HR(label);
  row.append(caption, control);
  form.append(row);
  return control;
}

/** A select of codes or `{value, label}` items. */
function select(items) {
  const element = document.createElement('select');
  element.className = 'h-select';
  for (const item of items) {
    element.append(typeof item === 'string' ? option(item, item.toUpperCase()) : option(item.value, item.label));
  }
  return element;
}

function option(value, label) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  return element;
}

/** Targets of Generate (plan 27m §2.1). */
export const GENERATE_TARGETS = Object.freeze([
  { id: 'folder', label: 'On this server (the website address shows the generated pages)' },
  { id: 'zip', label: 'ZIP file to download (for another web server)' },
  { id: 'both', label: 'Both' }
]);

/**
 * The query of a record page in the Generate dialog: a JSON query without parameters, or null.
 *
 * @param {string} text
 * @returns {Array|null}
 */
export function generateQuery(text) {
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
 * The Generate options as sent to `POST /{website|page}/{id}/execute` (plan 27m §2.1), from the values of the dialog.
 *
 * @param {object} values HEditForm values: `languages`, `target`, `baseUrl`, `record_<page id>`.
 * @param {string[]} allLanguages The languages of the site (all chosen = none sent).
 * @returns {{languages: string[], target: string, baseUrl: string, recordPages: object}}
 */
export function generateOptions(values, allLanguages = []) {
  const chosen = [values.languages].flat().filter(Boolean).map((code) => String(code).toLowerCase());
  const all = allLanguages.map((code) => String(code).toLowerCase());
  const recordPages = {};
  for (const [name, text] of Object.entries(values)) {
    const match = /^record_(\d+)$/.exec(name);
    const query = match && String(text ?? '').trim() ? generateQuery(text) : null;
    if (query) recordPages[match[1]] = query;
  }
  const target = GENERATE_TARGETS.some((item) => item.id === values.target) ? values.target : 'folder';
  return {
    languages: all.length && all.every((code) => chosen.includes(code)) ? [] : chosen,
    target,
    baseUrl: target === 'folder' ? '' : String(values.baseUrl ?? '').trim(),
    recordPages
  };
}

/**
 * Generate dialog (plan 27m §2.1): the languages, where the pages go (this server, a ZIP or both), the public address of
 * a ZIP, and per record page of the website a query of the records whose pages are written (none: the record page stays
 * live). The choices of the last generation come from `previous` (manifest options).
 *
 * @param {object} options
 * @param {string[]} [options.languages] Languages of the site (3 letters).
 * @param {Array<{id: number, title: string}>} [options.recordPages] Record pages of the website.
 * @param {object|null} [options.previous] Options of the last generation.
 * @param {object} [options.services] `editQuery(query, filterForm, {allowParameters})`, `describeQuery(query)`.
 * @returns {Promise<object|null>} generateOptions(), null when cancelled.
 */
export async function openGenerateForm({ languages = [], recordPages = [], previous = null, services = {} } = {}) {
  const codes = languages.map((code) => String(code).toLowerCase());
  const last = previous || {};
  const children = [];
  if (codes.length > 1) {
    children.push({ name: 'languages', type: 'enum', label: 'Languages', max: 0, mode: 'checkbox',
      terms: codes.map((code) => ({ id: code, label: code.toUpperCase() })),
      help: 'Pages in the other languages stay live' });
  }
  children.push(
    { name: 'target', type: 'enum', label: 'Generate', max: 1, mode: 'radio', terms: GENERATE_TARGETS },
    { name: 'baseUrl', type: 'freetext', label: 'Public address of the ZIP', max: 1, showWhen: { target: ['zip', 'both'] },
      help: 'Optional, e.g. https://www.example.org/ - gives the copy its canonical addresses, sitemap.xml and robots.txt' }
  );
  const groups = [{ id: 'generate', children }];
  if (recordPages.length) {
    groups.push({
      id: 'records',
      label: 'Record pages',
      children: recordPages.map((page) => ({
        name: `record_${page.id}`, type: 'freetext', label: page.title || `#${page.id}`, max: 1, special: querySpecial(services),
        help: 'The records whose pages are written (a query without parameters); empty: the record page stays live'
      }))
    });
  }
  const values = {
    languages: Array.isArray(last.languages) && last.languages.length ? last.languages.filter((code) => codes.includes(code)) : codes,
    target: last.target || 'folder',
    baseUrl: last.baseUrl || ''
  };
  for (const page of recordPages) {
    const query = last.recordPages?.[String(page.id)];
    values[`record_${page.id}`] = query ? JSON.stringify(query) : '';
  }
  const answer = await openEditFormDialog({
    title: 'Generate website',
    className: 'h-dialog-generate',
    form: { groups },
    values,
    validate: (current) => {
      const problems = [];
      if (codes.length > 1 && ![current.languages].flat().filter(Boolean).length) {
        problems.push({ field: 'languages', message: $HR('Choose at least one language') });
      }
      const address = String(current.baseUrl ?? '').trim();
      if (address && current.target !== 'folder' && !/^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(address)) {
        problems.push({ field: 'baseUrl', message: $HR('An http or https address without parameters') });
      }
      for (const page of recordPages) {
        const text = String(current[`record_${page.id}`] ?? '').trim();
        if (text && !generateQuery(text)) problems.push({ field: `record_${page.id}`, message: $HR('Not a query without parameters') });
      }
      return problems;
    },
    buttons: [{ id: 'generate', label: 'Generate', primary: true }, { id: 'cancel', label: 'Cancel' }]
  });
  return answer ? generateOptions(answer.values, codes) : null;
}

/** The query field of a record page: the Filter Builder from its icon (as the query of Record cards). */
function querySpecial(services) {
  return {
    json: false,
    icon: 'fa-sliders',
    title: 'Open the Filter Builder',
    describe: (value) => {
      const query = generateQuery(value);
      return query && typeof services.describeQuery === 'function' ? services.describeQuery(query) || '' : '';
    },
    edit: typeof services.editQuery === 'function' ? async (value) => {
      const result = await services.editQuery(generateQuery(value) || [], null, { allowParameters: false });
      return result?.query ? JSON.stringify(result.query) : undefined;
    } : undefined
  };
}
