/**
 * @file websiteForms.js
 * @brief Dialogs of the Website manager (plan 27b): new website (HEditForm, plan 27f §13), add a page to a
 *        website menu, and Yes/No questions. Built on the shared message dialog (HMsg).
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
import { openEditFormDialog } from '#shared/widgets/edit-form/editFormDialog.js';
import { createWebsiteFieldsForm } from './websiteFields.js';

const DIALOG_ID = 'h-website-dialog';

/**
 * Yes/No question.
 *
 * @param {string} message Message text.
 * @param {{title?: string, yesLabel?: string, noLabel?: string}} [options]
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message, { title = 'Please confirm', yesLabel = 'Yes', noLabel = 'No' } = {}) {
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
    const dialog = HMsg.showMsgDlg(text, {
      message: true,
      dialogId: DIALOG_ID,
      title,
      buttons: [
        { label: yesLabel, class: 'h-btn h-btn-primary', onClick: () => answer(true) },
        { label: noLabel, class: 'h-btn', onClick: () => answer(false) }
      ]
    });
    dialog.addEventListener('close', () => { if (!answered) resolve(false); }, { once: true });
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
  note.textContent = $HR('The website gets a header with a menu, a home page, a footer and one page "About". It is public.');
  let result = null;
  const answer = await openEditFormDialog({
    title: 'New website',
    className: 'h-dialog-new-website',
    form: {
      groups: [{
        id: 'languages',
        children: [
          { name: 'main', type: 'enum', label: 'Main language', max: 1, terms },
          { name: 'others', type: 'enum', label: 'Other languages', max: 0, mode: 'checkbox', terms }
        ]
      }]
    },
    values: { main: 'eng', others: [] },
    apiClient,
    dbdefs,
    onReady: (edit) => edit.container.append(host, note),
    validate: () => fields.validate(),
    buttons: [{ id: 'create', label: 'Create', primary: true }, { id: 'cancel', label: 'Cancel' }],
    onAction: (action, values) => {
      const main = String(values.main || 'eng');
      const others = [values.others].flat().filter(Boolean).map(String).filter((code) => code !== main);
      result = { languages: [main, ...new Set(others)], details: fields.details() };
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
