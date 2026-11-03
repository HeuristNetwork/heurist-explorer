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
import { cmsMediaType, isCmsMediaThumbnail } from '#shared/site/cmsMedia.js';
import { HInputFile } from '#shared/widgets/form/inputs/HInputFile.js';
import { openTranslationDialog } from '#shared/widgets/translation/HTranslationDialog.js';
import { confirmNear, createStylesForm, helpLine, presetName, styleRows } from './designerStyles.js';
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
 * @param {{style?: object, title?: string, kind?: string, inFlexGroup?: boolean, presets?: Array<Array<string>>,
 *        preset?: string|null, cssClass?: string, base?: object, files?: object|null, javaScriptAllowed?: boolean,
 *        dialogId?: string}} [options] `kind`, `inFlexGroup`, `presets` ([name, label]), `preset`, `cssClass`, `base`,
 *        `files`: styleRows; without `javaScriptAllowed` no Custom CSS class (no custom CSS for it).
 * @returns {Promise<{style: object, preset: string|null, cssClass: string}|null>}
 */
export function openStyleForm({
  style = {}, title = 'Style', kind = null, inFlexGroup = false, presets = [], preset = null, cssClass = '', base = null,
  files = null, javaScriptAllowed = false, dialogId = INNER_DIALOG_ID
} = {}) {
  const form = element('div', 'h-cms-style-form');
  form.append(helpLine(OWN_STYLE_HELP));
  const editor = styleRows(form, style, null, { kind, inFlexGroup, presets, preset, cssClass, classInput: javaScriptAllowed, base, files });
  const read = () => {
    const className = editor.cssClass();
    return className === null ? null : { style: editor.value(), preset: editor.preset(), cssClass: className };
  };
  return formDialog(form, title, 'OK', read, null, 'h-dialog-cms-style', dialogId);
}

/**
 * Edit media (§33): the registered file (HInputFile, in the record manager when the host has it), the caption and
 * its translations, width and height (empty = auto; under 200 px: the thumbnail), *Show full view or player on
 * click* and the size of the player opened from the thumbnail. Files that can not be media (not an image, video, audio, service, IIIF, 3D or PDF) are refused; a file that
 * needs a login gets a warning. OK does nothing without a file.
 *
 * @param {object} options
 * @param {{file: string, width: string, height: string, player: boolean, playerWidth: string, playerHeight: string}}
 *        options.settings
 * @param {string} [options.caption] Caption in the first language of the website.
 * @param {Object<string, string>} [options.translations] Captions in the other languages.
 * @param {string[]} [options.languages] Languages of the website (the first is the original).
 * @param {(key: string) => Promise<object|null>} options.readFile The file of a key: `{key, id, name, ext, url,
 *        source, public}` (cmsMediaType), or null.
 * @param {object} options.files `{apiClient, baseUrl, database, browseRecords, fileRecordType}` (HInputFile).
 * @param {object} [options.translator] Translation service of the translation popup.
 * @returns {Promise<{settings: object, file: object, caption: string, translations: Object<string, string>}|null>}
 */
export function openMediaForm({
  settings, caption = '', translations = {}, languages = [], readFile, files, translator = null
} = {}) {
  const form = element('div', 'h-cms-form h-cms-media-form');
  const state = { file: null, caption: String(caption || ''), translations: { ...translations } };
  const problems = element('div', 'h-cms-style-problems');
  const warning = element('div', 'h-cms-styles-warning');
  warning.hidden = true;
  const row = (label, ...controls) => {
    const line = element('div', 'h-cms-form-row');
    const text = element('span');
    text.textContent = $HR(label);
    const box = element('div', 'h-cms-media-controls');
    box.append(...controls);
    line.append(text, box);
    form.append(line);
    return box;
  };
  // the file
  const fileHost = element('div');
  row('Source', fileHost);
  const input = new HInputFile().attach(fileHost, {
    suppressLabel: true, apiClient: files?.apiClient, fileQuery: [],
    browseRecords: files?.browseRecords || null, fileRecordType: Number(files?.fileRecordType) || 0,
    fileViewer: files?.baseUrl ? { baseUrl: files.baseUrl, database: files.database } : null
  }).render();
  const useFile = (file) => {
    state.file = null;
    warning.hidden = true;
    problems.textContent = '';
    if (!file) return;
    if (!cmsMediaType(file)) {
      problems.textContent = $HR('This file can not be shown as media: choose an image, video, audio, a YouTube, Vimeo or SoundCloud link, IIIF, a 3D file or PDF.');
      return;
    }
    state.file = file;
    if (file.public === false) {
      warning.textContent = $HR('This file can be seen by logged-in users only: visitors of the website will not see it.');
      warning.hidden = false;
    }
  };
  const load = async (key) => {
    const file = key ? await readFile(key).catch(() => null) : null;
    if (key && !file) problems.textContent = $HR('The file was not found.');
    else useFile(file);
    return file;
  };
  if (settings?.file) {
    void load(settings.file).then((file) => {
      if (file?.id) input.setValue(file.id, { ulf_ID: file.id, ulf_OrigFileName: file.name, ulf_ObfuscatedFileID: file.key, ulf_ExternalFileReference: file.url || null });
    });
  }
  fileHost.addEventListener('h-input-change', async () => {
    const id = input.getValue();
    if (!id) {
      useFile(null);
      return;
    }
    let key = input.file?.ulf_ObfuscatedFileID;
    if (!key) {
      await input.source?.fetchLabels?.([id]);
      key = input.source?.fileFor?.(id)?.key;
    }
    await load(key || '');
  });
  // the caption, and its translations in the translation popup
  const captionInput = element('input', 'h-input h-compact');
  captionInput.type = 'text';
  captionInput.value = state.caption;
  captionInput.addEventListener('input', () => { state.caption = captionInput.value; });
  const captionBox = row('Caption', captionInput);
  if (languages.length > 1) {
    const translate = element('button', 'h-btn h-compact');
    translate.type = 'button';
    translate.title = $HR('Translations of the caption');
    translate.innerHTML = '<i class="fa-solid fa-language" aria-hidden="true"></i>';
    translate.addEventListener('click', async () => {
      const result = await openTranslationDialog({
        title: 'Caption', value: state.caption, translations: state.translations, languages, original: languages[0], translator
      });
      if (!result) return;
      state.caption = result.value;
      captionInput.value = result.value;
      state.translations = { ...result.translations };
    });
    captionBox.append(translate);
  }
  // the size: empty = auto, a number = px
  const sizeInput = (value) => {
    const text = element('input', 'h-input h-compact h-cms-media-size');
    text.type = 'text';
    text.placeholder = $HR('auto');
    text.value = value && value !== 'auto' ? value : '';
    return text;
  };
  const width = sizeInput(settings?.width);
  const height = sizeInput(settings?.height);
  const times = element('span');
  times.textContent = '×';
  row('Size (width × height)', width, times, height);
  const note = element('div', 'h-cms-style-note');
  note.textContent = $HR('Empty = auto; a number is px, or %. Both under 200 px (or one under 200 px and the other auto): the thumbnail is shown.');
  form.append(note);
  // full view or player on a click
  const player = element('input');
  player.type = 'checkbox';
  player.checked = settings?.player === true;
  const playerLabel = element('label', 'h-cms-media-player');
  playerLabel.append(player, document.createTextNode(` ${$HR('Show full view or player on click')}`));
  form.append(playerLabel);
  // the player opened from the thumbnail (audio, video, services): its size; auto: the natural size, a service 480 × 270
  const playerWidth = sizeInput(settings?.playerWidth);
  const playerHeight = sizeInput(settings?.playerHeight);
  const playerTimes = element('span');
  playerTimes.textContent = '×';
  row('Player size (width × height)', playerWidth, playerTimes, playerHeight);
  const syncPlayer = () => {
    playerWidth.disabled = !player.checked;
    playerHeight.disabled = !player.checked;
  };
  player.addEventListener('change', syncPlayer);
  syncPlayer();
  const playerNote = element('div', 'h-cms-style-note');
  playerNote.textContent = $HR('The size of the player that a click on the thumbnail of audio, video or a YouTube, Vimeo or SoundCloud link opens.');
  form.append(playerNote, warning, problems);
  const size = (text) => {
    const value = text.value.trim();
    if (!value || value === 'auto') return 'auto';
    if (/^(?:\d+\.?\d*|\.\d+)$/.test(value)) return `${value}px`;
    return /^(?:\d+\.?\d*|\.\d+)(?:px|%)$/.test(value) ? value : null;
  };
  const read = () => {
    const values = { width: size(width), height: size(height), playerWidth: size(playerWidth), playerHeight: size(playerHeight) };
    if (!state.file) {
      problems.textContent ||= $HR('Choose a file.');
      return null;
    }
    if (Object.values(values).includes(null)) {
      problems.textContent = $HR('Width and height: a number (px), px or %, or empty (auto).');
      return null;
    }
    const result = { file: state.file.key, ...values, player: player.checked };
    return {
      settings: result,
      thumbnail: isCmsMediaThumbnail(result),
      file: state.file,
      caption: state.caption.trim(),
      translations: Object.fromEntries(languages.slice(1).map((code) => [code, String(state.translations[code] || '').trim()]))
    };
  };
  return formDialog(form, 'Edit media', 'OK', read, null, 'h-dialog-cms-media').finally(() => void input.destroy?.());
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
