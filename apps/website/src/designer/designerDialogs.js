/**
 * @file designerDialogs.js
 * @brief Popups of the CMS designer (plan 27c): add page (title, preset), remove a page from the website, Save /
 *        Discard / Cancel, a save conflict, add element, group caption, a confirmation next to a button, a style
 *        form (own style of a node, kind defaults, presets) and the website Styles dialog. Texts and their
 *        translations: the shared HTextTranslationDialog (§26).
 *
 * Every popup returns a promise of its answer (null when cancelled).
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
import { SCREENS } from '#shared/site/cmsDocument.js';
import { confirmNear, createStylesForm, presetName, styleRows } from './designerStyles.js';
import { ELEMENT_GROUPS, PAGE_TEMPLATES, previewSvg } from './designerCatalog.js';

export { confirmNear, presetName };

const DIALOG_ID = 'h-cms-dialog';
const INNER_DIALOG_ID = 'h-cms-dialog-inner';

/**
 * Title and template of a new page (§19): a template that is chosen fills an empty title with its default name.
 *
 * @param {{title?: string}} [options] Dialog title.
 * @returns {Promise<{title: string, template: string}|null>}
 */
export function openAddPageForm({ title = 'Add page' } = {}) {
  return catalogDialog({
    title,
    groups: PAGE_TEMPLATES,
    titleRequired: true,
    onPick: (item, name, previous) => {
      const shown = name.value.trim();
      if (!shown || (previous && shown === $HR(previous.defaultTitle || ''))) name.value = $HR(item.defaultTitle || '');
    }
  }).then((answer) => (answer ? { title: answer.title, template: answer.value } : null));
}

/**
 * Remove a page from the website (review 2026-11-01): out of the menu with its sub menus; with the box checked
 * the page records are deleted too.
 *
 * @param {string} title Page title.
 * @returns {Promise<{deletePages: boolean}|null>}
 */
export function askRemovePage(title) {
  const body = element('span');
  body.innerHTML = `${$HR('This removes the menu entry from the website, as well as all sub-menus of this menu (if any).')}<br><br>`
    + `${$HR('To avoid removing sub-menus, move them out of this menu before removing it.')}<br><br>`;
  const box = input('checkbox');
  box.id = 'del_menu';
  const label = element('label', 'h-cms-remove-label');
  label.htmlFor = 'del_menu';
  label.textContent = $HR('If you want to delete the actual web pages from the database, not simply remove the menu entries'
    + ' from this website, check this box. Note that this is not reversible.');
  const line = element('span', 'h-cms-remove-line');
  line.append(box, label);
  body.append(line);
  return formDialog(body, `${$HR('Remove')} ${title} ${$HR('from website')}`, 'Remove', () => ({ deletePages: box.checked }),
    null, 'h-dialog-cms-narrow');
}

/**
 * The part has changes: Save / Discard / Cancel (§8).
 *
 * @param {string} name Name of the part: a page title, Header, Home or Footer.
 * @returns {Promise<'save'|'discard'|null>}
 */
export function askSaveDiscard(name) {
  return choice(`"${name}" ${$HR('has changes that are not saved.')}`, 'Unsaved changes', [['save', 'Save'], ['discard', 'Discard']],
    'h-dialog-cms-narrow');
}

/**
 * A new element (§19; + on the root or a group of the part tree, Add below the tree). The title is the heading of a
 * text or the caption of a group; other elements have none.
 *
 * @returns {Promise<{element: string, title: string}|null>}
 */
export function openAddElementForm() {
  return catalogDialog({
    title: 'Add element',
    groups: ELEMENT_GROUPS,
    onPick: (item, name) => {
      name.disabled = !item.title;
      name.placeholder = $HR(item.title === 'heading' ? 'Heading of the text (optional)'
        : item.title === 'caption' ? 'Caption of the group (optional)' : 'Not used for this element');
    }
  }).then((answer) => (answer ? { element: answer.value, title: answer.title } : null));
}

/**
 * A catalog popup (Add page, Add element; like the legacy editCMS_SelectElement): a title on top, the entries on the
 * left (in groups), the description and a preview of the selected one on the right. Entries not available yet are
 * grey and can not be added.
 *
 * @param {{title: string, groups: Array<{label: string, items: Array<object>}>, okLabel?: string,
 *        titleRequired?: boolean, onPick?: (item: object, titleInput: HTMLInputElement, previous: object|null) => void}} options
 * @returns {Promise<{value: string, title: string}|null>}
 */
function catalogDialog({ title, groups, okLabel = 'Add', titleRequired = false, onPick = null }) {
  const form = element('form', 'h-cms-catalog');
  const name = row(form, 'Title', input('text'));
  const main = element('div', 'h-cms-catalog-main');
  const list = element('div', 'h-cms-catalog-list');
  list.setAttribute('role', 'listbox');
  list.tabIndex = 0;
  const info = element('div', 'h-cms-catalog-info');
  main.append(list, info);
  form.append(main);
  const entries = [];
  let current = null;
  let ok = null;
  const pick = (item) => {
    const previous = current;
    current = item;
    for (const entry of entries) {
      entry.button.classList.toggle('h-cms-catalog-selected', entry.item === item);
      entry.button.setAttribute('aria-selected', String(entry.item === item));
    }
    const heading = element('h3', 'h-cms-catalog-name');
    heading.textContent = $HR(item.label);
    const description = element('div', 'h-cms-catalog-description');
    description.innerHTML = $HR(item.description || '');
    info.replaceChildren(heading);
    if (!item.available || item.pending) {
      const soon = element('div', 'h-cms-catalog-soon-note');
      soon.textContent = $HR(item.pending ? 'To be implemented soon: a blank page with this title is created for now.'
        : 'To be implemented soon...');
      info.append(soon);
    }
    info.append(description, previewSvg(item.preview));
    onPick?.(item, name, previous);
    if (ok) ok.disabled = !item.available;
  };
  for (const group of groups) {
    if (group.label) {
      const header = element('div', 'h-cms-catalog-group');
      header.textContent = $HR(group.label);
      list.append(header);
    }
    for (const item of group.items) {
      const entry = element('button', `h-cms-catalog-item${item.available ? '' : ' h-cms-catalog-soon'}`);
      entry.type = 'button';
      entry.setAttribute('role', 'option');
      entry.textContent = $HR(item.label);
      entry.addEventListener('click', () => pick(item));
      entry.addEventListener('dblclick', () => {
        pick(item);
        if (item.available) form.requestSubmit?.();
      });
      entries.push({ item, button: entry });
      list.append(entry);
    }
  }
  list.addEventListener('keydown', (event) => {
    const index = entries.findIndex((entry) => entry.item === current);
    const next = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 : null;
    if (next === null || !entries[next]) return;
    event.preventDefault();
    pick(entries[next].item);
    entries[next].button.focus?.();
  });
  const result = formDialog(form, title, okLabel, () => {
    if (!current?.available) return null;
    const value = name.disabled ? '' : name.value.trim();
    if (titleRequired && !value) {
      name.focus();
      return null;
    }
    return { value: current.value, title: value };
  }, name, 'h-dialog-cms-catalog');
  ok = HMsg.getMsgDlg?.(DIALOG_ID)?.querySelector?.('.h-dialog-footer .h-btn-primary') || null;
  pick(entries.find((entry) => entry.item.available)?.item || entries[0].item);
  return result;
}

/**
 * The caption of a group and its translations (plain text).
 *
 * @param {{caption?: string, translations?: Object<string, string>, languages?: string[], required?: boolean}} options
 *        languages: the other languages of the website; required: a panel label can not be empty.
 * @returns {Promise<{caption: string, translations: Object<string, string>}|null>}
 */
export function openCaptionForm({ caption = '', translations = {}, languages = [], required = false } = {}) {
  const form = element('form', 'h-cms-form');
  const text = row(form, 'Caption', input('text'));
  text.value = caption;
  if (!required) text.placeholder = $HR('(none)');
  const inputs = {};
  for (const language of languages) {
    inputs[language] = row(form, language.toUpperCase(), input('text'));
    inputs[language].value = translations[language] || '';
  }
  return formDialog(form, 'Caption', 'OK', () => {
    if (required && !text.value.trim()) {
      text.focus();
      return null;
    }
    return {
      caption: text.value.trim(),
      translations: Object.fromEntries(Object.entries(inputs).map(([language, control]) => [language, control.value.trim()]))
    };
  }, text, 'h-dialog-cms-narrow');
}

/**
 * The record was changed by someone else (409): Reload (lose the draft) or Overwrite (§8).
 *
 * @returns {Promise<'reload'|'overwrite'|null>}
 */
export function askConflict() {
  return choice('The record was changed by someone else after it was loaded.', 'Save conflict',
    [['reload', 'Reload (lose my changes)'], ['overwrite', 'Overwrite']]);
}

/**
 * A choice between some answers (and Cancel).
 *
 * @param {string} message
 * @param {string} title
 * @param {Array<[string, string]>} answers Value and label.
 * @returns {Promise<string|null>}
 */
export function chooseOption(message, title, answers) {
  return choice(message, title, answers);
}

/** A yes / no question; `narrow`: a narrower dialog. */
export function confirm(message, { title = 'Please confirm', yes = 'Yes', narrow = false } = {}) {
  return choice(message, title, [['yes', yes]], narrow ? 'h-dialog-cms-narrow' : '').then((answer) => answer === 'yes');
}

/**
 * The own style of an element (§6a, §25): its preset above the style editor (styleRows), property rows for the
 * normal, medium and narrow screens. Problems are shown as they are found by compileCmsStyles.
 *
 * @param {{style?: object, title?: string, kind?: string, inFlexGroup?: boolean, presets?: Array<Array<string>>,
 *        preset?: string|null, files?: object|null, dialogId?: string}} [options] `kind`, `inFlexGroup`, `presets`
 *        ([name, label]), `preset`, `files`: styleRows.
 * @returns {Promise<{style: object, preset: string|null}|null>}
 */
export function openStyleForm({
  style = {}, title = 'Style', kind = null, inFlexGroup = false, presets = [], preset = null, files = null, dialogId = INNER_DIALOG_ID
} = {}) {
  const form = element('div', 'h-cms-style-form');
  const editor = styleRows(form, style, null, { kind, inFlexGroup, presets, preset, files });
  return formDialog(form, title, 'OK', () => ({ style: editor.value(), preset: editor.preset() }), null, 'h-dialog-cms-style', dialogId);
}

/**
 * The Styles popup of a website or standalone page (§6a, §21): tabs Base settings, Layout styles, Presets and
 * Custom CSS (designerStyles.js). Saved at once by the caller.
 *
 * @param {{base: object, kinds: object, presets: object, css: string, javaScriptAllowed: boolean,
 *        createCodeEditor?: Function}} values createCodeEditor: createCodeTextEditor (lazy).
 * @returns {Promise<{base: object, kinds: object, presets: object, css: string}|null>}
 */
export async function openStylesDialog(values = {}) {
  const form = createStylesForm(values);
  const result = formDialog(form.element, 'Styles', 'Save', () => form.read(), null, 'h-dialog-cms-styles');
  await form.ready;
  return result.finally(() => form.destroy());
}

/** A short CSS text of a style (one line, screen styles marked). */
export function cssText(style) {
  const parts = [];
  for (const [property, value] of Object.entries(style || {})) {
    if (property === 'label') continue;
    if (Object.hasOwn(SCREENS, property)) parts.push(`${property}: {${cssText(value)}}`);
    else parts.push(`${property}: ${value}`);
  }
  return parts.join('; ');
}

/** A question with answer buttons and Cancel; `className` on the dialog while it is open. */
function choice(message, title, answers, className = '') {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      done = true;
      HMsg.closeMsgDlg(DIALOG_ID);
      resolve(value);
    };
    const text = element('p', 'h-cms-dialog-text');
    text.textContent = $HR(message);
    const dialog = HMsg.showMsgDlg(text, {
      dialogId: DIALOG_ID,
      title,
      buttons: [
        ...answers.map(([value, label], index) => ({ label, class: `h-btn${index ? '' : ' h-btn-primary'}`, onClick: () => finish(value) })),
        { label: 'Cancel', class: 'h-btn', onClick: () => finish(null) }
      ]
    });
    if (className) dialog?.classList.add(className);
    dialog?.addEventListener('close', () => {
      if (className) dialog.classList.remove(className);
      if (!done) resolve(null);
    }, { once: true });
  });
}

/** Show content in a message dialog; `read()` gives the value or null (keeps it open). */
function formDialog(content, title, okLabel, read, focus, className = '', dialogId = DIALOG_ID) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      done = true;
      HMsg.closeMsgDlg(dialogId);
      resolve(value);
    };
    const submit = () => {
      const value = read();
      if (value) finish(value);
    };
    if (content.tagName === 'FORM') {
      content.addEventListener('submit', (event) => {
        event.preventDefault();
        submit();
      });
    }
    const dialog = HMsg.showMsgDlg(content, {
      dialogId,
      title,
      buttons: [
        { label: okLabel, class: 'h-btn h-btn-primary', onClick: submit },
        { label: 'Cancel', class: 'h-btn', onClick: () => finish(null) }
      ]
    });
    if (className) dialog?.classList.add(className);
    dialog?.addEventListener('close', () => {
      if (className) dialog.classList.remove(className);
      if (!done) resolve(null);
    }, { once: true });
    focus?.focus();
  });
}

function row(parent, label, control) {
  const line = element('label', 'h-cms-form-row');
  const caption = element('span');
  caption.textContent = $HR(label);
  line.append(caption, control);
  parent.append(line);
  return control;
}

function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function input(type) {
  const node = element('input', type === 'text' ? 'h-input h-compact' : '');
  node.type = type;
  return node;
}

function button(label, icon = null) {
  const node = element('button', 'h-btn h-compact');
  node.type = 'button';
  if (icon) {
    const glyph = element('i', `fa-solid ${icon}`);
    glyph.setAttribute('aria-hidden', 'true');
    node.append(glyph);
  }
  if (label) node.append(document.createTextNode(`${icon ? ' ' : ''}${$HR(label)}`));
  return node;
}
