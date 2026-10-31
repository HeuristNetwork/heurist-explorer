/**
 * @file designerDialogs.js
 * @brief Popups of the CMS designer (plan 27c): add page (title, preset), sub pages of a deleted page, Save /
 *        Discard / Cancel, a save conflict, the text and translation editors (TinyMCE), a style form (own style
 *        of a node, kind defaults, presets) and the website Styles dialog.
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
import { BASE_SETTINGS, CMS_KINDS, CMS_STYLE_PROPERTIES, compileCmsStyles, SCREENS } from '#shared/site/cmsDocument.js';
import { CMS_PAGE_PRESETS } from '#shared/site/cmsEdit.js';

const DIALOG_ID = 'h-cms-dialog';
const INNER_DIALOG_ID = 'h-cms-dialog-inner';

/** Labels of the page presets (§4). */
export const PAGE_PRESET_LABELS = Object.freeze({
  text: 'Text',
  columns2: 'Two columns',
  columns3: 'Three columns',
  textColumns2: 'Text, then two columns',
  textColumns3: 'Text, then three columns'
});

/**
 * Title and preset of a new page.
 *
 * @param {{title?: string}} [options] Dialog title.
 * @returns {Promise<{title: string, preset: string}|null>}
 */
export function openAddPageForm({ title = 'Add page' } = {}) {
  const form = element('form', 'h-cms-form');
  const name = row(form, 'Title', input('text'));
  name.required = true;
  const preset = row(form, 'Preset', select(CMS_PAGE_PRESETS.map((value) => ({ value, label: $HR(PAGE_PRESET_LABELS[value]) }))));
  return formDialog(form, title, 'Add', () => {
    const value = name.value.trim();
    if (!value) {
      name.focus();
      return null;
    }
    return { title: value, preset: preset.value };
  }, name);
}

/**
 * What to do with the sub pages of a page that is deleted (§15 #3).
 *
 * @param {string} title Page title.
 * @param {number} count Number of sub pages.
 * @returns {Promise<'delete'|'up'|null>}
 */
export function chooseSubPages(title, count) {
  return choice(`${$HR('Page')} "${title}" ${$HR('has')} ${count} ${$HR('sub page(s). Delete them too, or move them one level up?')}`,
    'Delete page', [['delete', 'Delete sub pages too'], ['up', 'Move them up']]);
}

/**
 * The part has changes: Save / Discard / Cancel (§8).
 *
 * @returns {Promise<'save'|'discard'|null>}
 */
export function askSaveDiscard() {
  return choice('This part has changes that are not saved.', 'Unsaved changes', [['save', 'Save'], ['discard', 'Discard']]);
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

/** A yes / no question. */
export function confirm(message, { title = 'Please confirm', yes = 'Yes' } = {}) {
  return choice(message, title, [['yes', yes]]).then((answer) => answer === 'yes');
}

/**
 * Edit the inner HTML of a text block (TinyMCE, §9).
 *
 * @param {{html: string, baseUrl?: string, title?: string, original?: string, createEditor: Function}} options
 *        createEditor: createTinyMceEditor (injected: a lazy chunk, and tests).
 * @returns {Promise<string|null>}
 */
export async function openTextEditor({ html = '', baseUrl = '', title = 'Edit text', original = null, createEditor }) {
  const body = element('div', 'h-cms-text-editor');
  if (original !== null) {
    const source = element('div', 'h-cms-text-original');
    const caption = element('div', 'h-cms-caption');
    caption.textContent = $HR('Original');
    const content = element('div', 'h-cms-text-original-content');
    content.innerHTML = original;
    source.append(caption, content);
    body.append(source);
  }
  const host = element('div', 'h-cms-text-host');
  body.append(host);
  let editor = null;
  const result = formDialog(body, title, 'OK', () => ({ html: editor ? editor.getValue() : html }), null, 'h-dialog-cms-text');
  editor = await createEditor(host, { value: html, baseUrl });
  editor.focus?.();
  return result.then((answer) => (answer ? answer.html : null)).finally(() => editor?.destroy?.());
}

/**
 * A style form (§6a): property rows for the normal, medium and narrow screens. Problems are shown as they are
 * found by compileCmsStyles.
 *
 * @param {{style?: object, title?: string, label?: string|null, dialogId?: string}} [options] `label`: a preset
 *        label field (null = none).
 * @returns {Promise<object|null>} The style (with `label` for a preset), or null.
 */
export function openStyleForm({ style = {}, title = 'Style', label = null, dialogId = INNER_DIALOG_ID } = {}) {
  const form = element('div', 'h-cms-style-form');
  const labelInput = label !== null ? row(form, 'Label', input('text')) : null;
  if (labelInput) labelInput.value = label;
  const editor = styleRows(form, style);
  return formDialog(form, title, 'OK', () => {
    const value = editor.value();
    if (labelInput) value.label = labelInput.value.trim() || 'Preset';
    return value;
  }, labelInput, 'h-dialog-cms-style', dialogId);
}

/**
 * The website Styles dialog (§4, §6a): base settings, kind defaults and presets. Saved at once by the caller.
 *
 * @param {{base: object, kinds: object, presets: object}} values
 * @returns {Promise<{base: object, kinds: object, presets: object}|null>}
 */
export function openStylesDialog({ base = {}, kinds = {}, presets = {} } = {}) {
  const state = { base: { ...base }, kinds: structuredClone(kinds), presets: structuredClone(presets) };
  const form = element('div', 'h-cms-styles');

  const baseBox = section(form, 'Base settings');
  const baseInputs = {};
  for (const key of BASE_SETTINGS) {
    const control = row(baseBox, key, input('text'));
    control.value = state.base[key] ?? '';
    control.placeholder = $HR('Heurist default');
    baseInputs[key] = control;
  }

  const kindBox = section(form, 'Kind defaults');
  const kindList = element('div', 'h-cms-styles-list');
  kindBox.append(kindList);
  const drawKinds = () => {
    kindList.replaceChildren();
    for (const kind of Object.keys(CMS_KINDS)) {
      listRow(kindList, kind, cssText(state.kinds[kind]), [['fa-pen', 'Edit', async () => {
        const value = await openStyleForm({ style: state.kinds[kind] || {}, title: `${$HR('Kind default')}: ${kind}` });
        if (value) {
          if (Object.keys(value).length) state.kinds[kind] = value; else delete state.kinds[kind];
          drawKinds();
        }
      }]]);
    }
  };
  drawKinds();

  const presetBox = section(form, 'Presets');
  const presetList = element('div', 'h-cms-styles-list');
  const addPreset = button('Add preset', 'fa-plus');
  presetBox.append(presetList, addPreset);
  const drawPresets = () => {
    presetList.replaceChildren();
    for (const [name, preset] of Object.entries(state.presets)) {
      const { label, ...style } = preset || {};
      listRow(presetList, `${label || name} (${name})`, cssText(style), [
        ['fa-pen', 'Edit', async () => {
          const value = await openStyleForm({ style, label: label || name, title: `${$HR('Preset')}: ${name}` });
          if (value) {
            state.presets[name] = value;
            drawPresets();
          }
        }],
        ['fa-trash', 'Delete', () => {
          delete state.presets[name];
          drawPresets();
        }]
      ]);
    }
  };
  addPreset.addEventListener('click', async () => {
    const value = await openStyleForm({ style: {}, label: '', title: 'New preset' });
    if (!value) return;
    const name = presetName(value.label, Object.keys(state.presets));
    state.presets[name] = value;
    drawPresets();
  });
  drawPresets();

  return formDialog(form, 'Website styles', 'Save', () => {
    const baseValues = {};
    for (const [key, control] of Object.entries(baseInputs)) if (control.value.trim()) baseValues[key] = control.value.trim();
    return { base: baseValues, kinds: state.kinds, presets: state.presets };
  }, null, 'h-dialog-cms-styles');
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

/** A preset name (an id) from a label, not one of `used`. */
export function presetName(label, used = []) {
  const base = String(label || 'preset').normalize('NFKD').replace(/[^A-Za-z0-9]+(.)?/g, (match, next) => (next ? next.toUpperCase() : ''))
    .replace(/^[^A-Za-z]+/, '') || 'preset';
  const name = base.charAt(0).toLowerCase() + base.slice(1);
  let result = name;
  for (let number = 2; used.includes(result); number++) result = `${name}${number}`;
  return result;
}

/** Property rows of a style with Normal / Medium / Narrow tabs; `value()` gives the style. */
function styleRows(parent, style) {
  const screens = ['normal', ...Object.keys(SCREENS)];
  const values = { normal: {} };
  for (const screen of Object.keys(SCREENS)) values[screen] = { ...(style?.[screen] || {}) };
  for (const [property, value] of Object.entries(style || {})) {
    if (property !== 'label' && !Object.hasOwn(SCREENS, property)) values.normal[property] = value;
  }
  let screen = 'normal';
  const tabs = element('div', 'h-cms-style-tabs');
  const list = element('div', 'h-cms-style-rows');
  const problems = element('div', 'h-cms-style-problems');
  const add = button('Add property', 'fa-plus');
  parent.append(tabs, list, add, problems);
  const check = () => {
    const { issues } = compileCmsStyles({}, [{ n: build() }]);
    problems.textContent = issues.map((issue) => issue.message).join('\n');
  };
  const draw = () => {
    tabs.replaceChildren(...screens.map((name) => {
      const tab = button(name === 'normal' ? 'Normal' : name === 'medium' ? 'Medium (≤ 1024 px)' : 'Narrow (≤ 640 px)');
      tab.classList.toggle('h-cms-tab-active', name === screen);
      tab.addEventListener('click', () => { screen = name; draw(); });
      return tab;
    }));
    list.replaceChildren();
    for (const [property, value] of Object.entries(values[screen])) {
      const line = element('div', 'h-cms-style-row');
      const name = select(CMS_STYLE_PROPERTIES.map((item) => ({ value: item, label: item })));
      name.value = property;
      const text = input('text');
      text.value = String(value);
      const remove = button('', 'fa-xmark');
      remove.title = $HR('Remove');
      name.addEventListener('change', () => {
        const entries = Object.entries(values[screen]).map(([key, item]) => (key === property ? [name.value, item] : [key, item]));
        values[screen] = Object.fromEntries(entries);
        draw();
      });
      text.addEventListener('input', () => { values[screen][property] = text.value; check(); });
      remove.addEventListener('click', () => { delete values[screen][property]; draw(); });
      line.append(name, text, remove);
      list.append(line);
    }
    check();
  };
  add.addEventListener('click', () => {
    const free = CMS_STYLE_PROPERTIES.find((property) => !(property in values[screen]));
    if (free) values[screen][free] = '';
    draw();
  });
  const build = () => {
    const result = {};
    for (const [property, value] of Object.entries(values.normal)) if (String(value).trim()) result[property] = String(value).trim();
    for (const name of Object.keys(SCREENS)) {
      const entries = Object.entries(values[name]).filter(([, value]) => String(value).trim());
      if (entries.length) result[name] = Object.fromEntries(entries.map(([key, value]) => [key, String(value).trim()]));
    }
    return result;
  };
  draw();
  return { value: build };
}

/** A question with answer buttons and Cancel. */
function choice(message, title, answers) {
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
    dialog.addEventListener('close', () => { if (!done) resolve(null); }, { once: true });
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

function section(parent, title) {
  const box = element('fieldset', 'h-cms-styles-section');
  const legend = element('legend');
  legend.textContent = $HR(title);
  box.append(legend);
  parent.append(box);
  return box;
}

function listRow(parent, name, text, actions) {
  const line = element('div', 'h-cms-styles-row');
  const caption = element('span', 'h-cms-styles-name');
  caption.textContent = name;
  const css = element('span', 'h-cms-styles-css');
  css.textContent = text || $HR('(none)');
  line.append(caption, css);
  for (const [icon, title, run] of actions) {
    const action = button('', icon);
    action.title = $HR(title);
    action.addEventListener('click', run);
    line.append(action);
  }
  parent.append(line);
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

function select(items) {
  const node = element('select', 'h-select h-compact');
  for (const item of items) {
    const option = element('option');
    option.value = item.value;
    option.textContent = item.label;
    node.append(option);
  }
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
