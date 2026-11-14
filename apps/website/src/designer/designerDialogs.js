/**
 * @file designerDialogs.js
 * @brief Popups of the CMS designer (plan 27c): add page (title, preset), remove a page from the website, Save /
 *        Discard / Cancel, a save conflict, add element, a confirmation next to a button, a style
 *        form (own style of a node, kind defaults, presets) and the website Styles dialog. Texts, captions and
 *        their translations: the shared HTextTranslationDialog / HTranslationDialog (§26).
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
import { confirmNear, createStylesForm, helpLine, presetName, styleRows } from './designerStyles.js';
import { ELEMENT_GROUPS, PAGE_TEMPLATES, previewSvg } from './designerCatalog.js';

export { confirmNear, presetName };

const DIALOG_ID = 'h-cms-dialog';
const INNER_DIALOG_ID = 'h-cms-dialog-inner';

/**
 * Template and form of a new page (review 2026-11-14, 2026-11-14 round 2): the templates on the left, the description
 * and preview of the chosen one on the right; Add hides both and shows the form of the template in the same popup
 * (templateForms.createTemplateForm), Create page makes the page. A template without a form (Record page) is answered
 * at once; its next step follows the popup.
 *
 * @param {{title?: string, createForm?: (host: HTMLElement, template: string, title: string) => ({ready?: Promise<void>,
 *        read: () => Promise<object|null>, destroy: () => Promise<void>}|null)}} [options] Dialog title; `createForm`: the
 *        form of a template (null: none), `title` its default title.
 * @returns {Promise<{template: string, title: string, form: object|null}|null>} `form`: the answer of the form.
 */
export function openAddPageForm({ title = 'Add page', createForm = null } = {}) {
  let session = null;
  return catalogDialog({
    title,
    groups: PAGE_TEMPLATES,
    titleInput: false,
    nextLabel: 'Create page',
    next: (item, host) => {
      if (typeof createForm !== 'function') return false;
      session = createForm(host, item.value, $HR(item.defaultTitle || ''));
      return Boolean(session);
    },
    read: async (item) => {
      const answer = session ? await session.read() : null;
      if (session && !answer) return null;
      return { template: item.value, title: $HR(item.defaultTitle || ''), form: answer };
    }
  }).then(async (answer) => {
    await session?.destroy().catch(() => {});
    return answer;
  });
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
 *        titleRequired?: boolean, titleInput?: boolean, onPick?: (item: object, titleInput: HTMLInputElement, previous: object|null) => void,
 *        next?: (item: object, host: HTMLElement) => boolean, nextLabel?: string, read?: (item: object) => *}} options
 *        `next`: a second step, the form of the item in `host` instead of the list (true: shown; the button gets
 *        `nextLabel`); `read`: the answer instead of {value, title}.
 * @returns {Promise<{value: string, title: string}|null>}
 */
function catalogDialog({
  title, groups, okLabel = 'Add', titleRequired = false, titleInput = true, onPick = null, next = null, nextLabel = '', read = null
}) {
  const form = element('form', 'h-cms-catalog');
  const name = titleInput ? row(form, 'Title', input('text')) : null;
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
  // the second step (Add page): the list and the preview make room for the form of the chosen item
  let step = null;
  const result = formDialog(form, title, okLabel, () => {
    if (!current?.available) return null;
    if (next && !step) {
      const host = element('div', 'h-cms-catalog-form');
      if (next(current, host)) {
        step = host;
        main.hidden = true;
        if (name) name.closest('.h-cms-form-row').hidden = true;
        form.append(host);
        if (ok && nextLabel) ok.textContent = $HR(nextLabel);
        return null;
      }
    }
    if (read) return read(current);
    const value = !name || name.disabled ? '' : name.value.trim();
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

/** The help line of the own style popup. */
const OWN_STYLE_HELP = 'It is not recommended to use individual style per element. Use own style with caution and moderately.'
  + ' It is preferred to use general website styles and Presets to make website consistent and follow the same style'
  + ' design. If you are confident in CSS you can define your own style sheets (see Website styles -> Custom CSS) and use'
  + ' Class name instead of Presets.';

/**
 * The own style of an element (§6a, §25): a help line, its preset and custom CSS class above the style editor
 * (styleRows), property rows for the normal, medium and narrow screens. Problems are shown as they are found by
 * compileCmsStyles; OK does nothing while the class has characters that are not allowed.
 *
 * @param {{style?: object, title?: string, kind?: string, inFlexGroup?: boolean, presets?: Array<Array<string>>|null,
 *        preset?: string|null, cssClass?: string, base?: object, files?: object|null, javaScriptAllowed?: boolean,
 *        video?: string|null, dialogId?: string}} [options] `kind`, `inFlexGroup`, `presets` ([name, label]; null: no
 *        preset selector), `preset`, `cssClass`, `base`, `files`, `video`: styleRows; without `javaScriptAllowed` no
 *        Custom CSS class (no custom CSS for it).
 * @returns {Promise<{style: object, preset: string|null, cssClass: string, video: string}|null>}
 */
export function openStyleForm({
  style = {}, title = 'Style', kind = null, inFlexGroup = false, presets = [], preset = null, cssClass = '', base = null,
  files = null, javaScriptAllowed = false, video = null, dialogId = INNER_DIALOG_ID
} = {}) {
  const form = element('div', 'h-cms-style-form');
  form.append(helpLine(OWN_STYLE_HELP));
  const editor = styleRows(form, style, null, {
    kind, inFlexGroup, presets, preset, cssClass, classInput: javaScriptAllowed, base, files, video
  });
  const read = () => {
    const className = editor.cssClass();
    return className === null ? null : { style: editor.value(), preset: editor.preset(), cssClass: className, video: editor.video() };
  };
  return formDialog(form, title, 'OK', read, null, 'h-dialog-cms-style', dialogId);
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
  const result = formDialog(form.element, 'General Website Styles', 'Save', () => form.read(), null, 'h-dialog-cms-styles');
  await form.ready;
  return result.finally(() => form.destroy());
}

/**
 * The page popup of the page editor (review 2026-11-14; pen of the page in the part tree): the prominent fields of the
 * page record (websiteFields.js) and, at the end, the hide header / footer checkboxes.
 *
 * @param {{title?: string, createFields: (host: HTMLElement) => Promise<{validate: Function, changed: Function,
 *        destroy: Function}>, layout?: object}} options `createFields`: the form of the fields (createWebsiteFieldsForm).
 * @returns {Promise<{fields: Object<string, Array>, layout: object}|null>} `fields`: the changed fields by field id.
 */
export function openPageForm({ title = 'Page', createFields, layout = {} }) {
  const form = element('div', 'h-cms-page-form');
  const fieldsHost = element('div', 'h-cms-page-fields');
  form.append(fieldsHost);
  let fields = null;
  const ready = Promise.resolve()
    .then(() => createFields(fieldsHost))
    .then((made) => { fields = made; })
    .catch((error) => HMsg.showMsgErr?.(error?.message || String(error)));
  const boxes = [['hideHeader', 'Hide header'], ['hideFooter', 'Hide footer']].map(([key, label]) => {
    const line = element('label', 'h-cms-check');
    const box = input('checkbox');
    box.checked = layout[key] === true;
    line.append(box, document.createTextNode(` ${$HR(label)}`));
    form.append(line);
    return [key, box];
  });
  return formDialog(form, title, 'OK', async () => {
    await ready;
    if (!fields || fields.validate().length) return null;
    const next = { ...layout };
    for (const [key, box] of boxes) if (box.checked) next[key] = true; else delete next[key];
    return { fields: fields.changed(), layout: next };
  }, null, 'h-dialog-cms-new-page').finally(() => ready.then(() => fields?.destroy()));
}

/** Blocks of the footer composer: name, label (plan 27f §3.2). */
const FOOTER_BLOCK_LABELS = Object.freeze([
  ['badges', 'Partners and sponsors (logos with links)'],
  ['links', 'Links to selected pages (Legal information, Conditions of use, Contact ...)'], ['social', 'Follow us on social media'],
  ['copyright', 'Copyright text'],
  ['heurist', 'Powered by Heurist'], ['host', 'Hosted at: the organisation that hosts this Heurist']
]);

/**
 * The footer composer (plan 27f §3.2): the blocks of a new footer. The footer is made of ordinary elements that are
 * changed afterwards in the designer.
 *
 * @returns {Promise<{blocks: string[]}|null>}
 */
export function openFooterForm() {
  const form = element('form', 'h-cms-form');
  form.append(helpLine('Choose the blocks of the footer. Each block is an ordinary element: change or remove it afterwards.'));
  const boxes = FOOTER_BLOCK_LABELS.map(([name, label]) => {
    const line = element('label', 'h-cms-check');
    const input = element('input');
    input.type = 'checkbox';
    input.checked = name !== 'badges';
    line.append(input, document.createTextNode(` ${$HR(label)}`));
    form.append(line);
    return [name, input];
  });
  return formDialog(form, 'Footer composer', 'Add', () => {
    const blocks = boxes.filter(([, input]) => input.checked).map(([name]) => name);
    return blocks.length ? { blocks } : null;
  });
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
      message: true,
      dialogId: DIALOG_ID,
      title,
      buttons: [
        ...answers.map(([value, label], index) => ({ label, class: `h-btn${index ? '' : ' h-btn-primary'}`, onClick: () => finish(value) })),
        { label: 'Cancel', class: 'h-btn', onClick: () => finish(null) }
      ]
    });
    if (className) dialog?.classList.add(className);
    // a close event of the dialog shown before in the same element (see formDialog) is not this one's
    const onClose = () => {
      if (dialog.open) return;
      dialog.removeEventListener('close', onClose);
      if (className) dialog.classList.remove(className);
      if (!done) resolve(null);
    };
    dialog?.addEventListener('close', onClose);
  });
}

/** Show content in a message dialog; `read()` gives the value or null (keeps it open). */
export function formDialog(content, title, okLabel, read, focus, className = '', dialogId = DIALOG_ID) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      done = true;
      HMsg.closeMsgDlg(dialogId);
      resolve(value);
    };
    let busy = false;
    // read() may be async (a form that checks its fields): one at a time
    const submit = async () => {
      if (busy || done) return;
      busy = true;
      try {
        const value = await read();
        if (value && !done) finish(value);
      } catch (error) {
        HMsg.showMsgErr?.(error?.message || String(error));
      } finally {
        busy = false;
      }
    };
    if (content.tagName === 'FORM') {
      content.addEventListener('submit', (event) => {
        event.preventDefault();
        void submit();
      });
    }
    const dialog = HMsg.showMsgDlg(content, {
      dialogId,
      title,
      buttons: [
        { label: okLabel, class: 'h-btn h-btn-primary', onClick: () => void submit() },
        { label: 'Cancel', class: 'h-btn', onClick: () => finish(null) }
      ]
    });
    if (className) dialog?.classList.add(className);
    // the dialog element is shared: the close event of the dialog shown before in it (Add element, then Edit media)
    // comes after this one is shown (dialog open again): it is not this one's close
    const onClose = () => {
      if (dialog.open) return;
      dialog.removeEventListener('close', onClose);
      if (className) dialog.classList.remove(className);
      if (!done) resolve(null);
    };
    dialog?.addEventListener('close', onClose);
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
