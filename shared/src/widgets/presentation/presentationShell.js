/**
 * @file presentationShell.js
 * @brief The common parts of the presentation editors and lists (plan 27q3 §1-§3): the full screen host, its header
 *        with the title and Close, the toolbar with the fixed groups of buttons, and the question about unsaved changes.
 *
 * Toolbar (27q3 §3, agreed 2026-11-24), always in this order:
 *
 *   New | Selector ▾ | Properties | Save | Save as  ‖  Scope ▾ + parameters | Refresh  ‖  Publish | Generate  ‖  ⋯ | Help
 *
 * A slot that does not apply to a type is not given (hidden); a slot that does not apply now is `disabled`. Close is on
 * the header only, Delete is in the List only. Publish (fa-share-nodes) makes a page, Generate (fa-bolt) a file. Used by
 * the Crosstabs, Story map and Report editors, the Export pane and the Website manager.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR } from '../../ui/i18n/HResource.js';
import { askSaveDiscard } from '../../ui/askChoice.js';
import { closePopover, showPopover } from '../popover/popover.js';
import './presentationShell.css';

/** The groups of the toolbar and their slots, in order. */
export const PRESENTATION_TOOLBAR_GROUPS = Object.freeze([
  Object.freeze(['new', 'selector', 'properties', 'save', 'saveAs']),
  Object.freeze(['scope', 'refresh']),
  Object.freeze(['publish', 'generate']),
  Object.freeze(['more', 'help'])
]);

/** Icon, label and tip of the slots that are buttons (a slot spec may change them). */
const SLOT_DEFAULTS = Object.freeze({
  new: { icon: 'fa-plus', label: 'New', title: 'New' },
  properties: { icon: 'fa-pen', label: 'Properties', title: 'Name, description, owner and visibility', caption: false },
  save: { icon: 'fa-floppy-disk', label: 'Save', title: 'Save', primary: true },
  saveAs: { icon: 'fa-copy', label: 'Save as', title: 'Save as a new one' },
  refresh: { icon: 'fa-rotate', label: 'Refresh', title: 'Run the preview again' },
  publish: { icon: 'fa-share-nodes', label: 'Publish', title: 'Publish as a web page' },
  generate: { icon: 'fa-bolt', label: 'Generate', title: 'Generate the output' },
  help: { icon: 'fa-circle-question', label: 'Help', title: 'Help', caption: false }
});

/**
 * Create an element with classes.
 *
 * @param {string} tag
 * @param {string} [className]
 * @param {HTMLElement|null} [parent]
 * @returns {HTMLElement}
 */
export function element(tag, className = '', parent = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent?.append(node);
  return node;
}

/**
 * The host of a full screen view (an editor or the Website manager), added to the page.
 *
 * @param {string} [className] An own class of the host.
 * @returns {HTMLElement}
 */
export function openFullScreenHost(className = '') {
  const host = element('div', `h-presentation-fullscreen${className ? ` ${className}` : ''}`);
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  document.body.append(host);
  return host;
}

/**
 * The header of a full screen view (`heurist-source-header`): the title and Close.
 *
 * @param {object} options
 * @param {string} options.title The title ("Crosstab editor: <name>").
 * @param {Function|null} [options.onClose] Close (no button without it).
 * @param {string} [options.closeTitle] Tip of Close.
 * @param {string} [options.className] An own class of the header.
 * @returns {{element: HTMLElement, setTitle: function(string): void, close: HTMLButtonElement|null}}
 */
export function createSourceHeader({ title = '', onClose = null, closeTitle = 'Close', className = '' } = {}) {
  const header = element('div', `heurist-source-header h-presentation-header${className ? ` ${className}` : ''}`);
  const caption = element('span', 'h-presentation-header-title', header);
  caption.textContent = title;
  let close = null;
  if (typeof onClose === 'function') {
    close = element('button', 'h-btn h-presentation-header-close', header);
    close.type = 'button';
    close.title = $HR(closeTitle);
    element('i', 'fa-solid fa-xmark', close).setAttribute('aria-hidden', 'true');
    element('span', '', close).textContent = $HR('Close');
    close.addEventListener('click', () => onClose());
  }
  return {
    element: header,
    close,
    setTitle: (text) => { caption.textContent = text; }
  };
}

/**
 * A button of the toolbar: icon and label (the label is hidden in a narrow view); `caption: false` gives the icon only.
 *
 * @param {HTMLElement} parent
 * @param {object} spec
 * @param {string} spec.icon Font Awesome class (`fa-plus`).
 * @param {string} spec.label
 * @param {string} [spec.title] Tip.
 * @param {Function} [spec.run]
 * @param {boolean} [spec.caption=true]
 * @param {boolean} [spec.primary]
 * @param {boolean} [spec.disabled]
 * @param {boolean} [spec.busy] A spinner instead of the icon (and disabled).
 * @returns {HTMLButtonElement}
 */
export function presentationButton(parent, spec) {
  const button = element('button', 'h-btn h-presentation-btn', parent);
  button.type = 'button';
  button.title = $HR(spec.title || spec.label);
  button.setAttribute('aria-label', $HR(spec.label));
  element('i', `fa-solid ${spec.busy ? 'fa-spinner fa-spin' : spec.icon}`, button).setAttribute('aria-hidden', 'true');
  if (spec.caption !== false) element('span', 'h-presentation-btn-label', button).textContent = $HR(spec.label);
  if (spec.primary) button.classList.add('h-btn-primary');
  button.disabled = spec.disabled === true || spec.busy === true;
  if (typeof spec.run === 'function') button.addEventListener('click', () => spec.run(button));
  return button;
}

/**
 * The selector of the saved configurations: a button with the name and ▾; `run(button)` opens the list under it.
 *
 * @param {HTMLElement} parent
 * @param {{icon?: string, label: string, title?: string, run: Function, disabled?: boolean}} spec
 * @returns {HTMLButtonElement}
 */
export function presentationSelector(parent, spec) {
  const button = element('button', 'h-btn h-presentation-selector', parent);
  button.type = 'button';
  button.title = $HR(spec.title || 'Choose');
  button.setAttribute('aria-haspopup', 'listbox');
  element('i', `fa-solid ${spec.icon || 'fa-list'}`, button).setAttribute('aria-hidden', 'true');
  element('span', 'h-presentation-selector-label', button).textContent = spec.label || '';
  element('span', 'h-caret', button).setAttribute('aria-hidden', 'true');
  button.disabled = spec.disabled === true;
  button.addEventListener('click', () => spec.run?.(button));
  return button;
}

/**
 * Fill a toolbar with the slots of 27q3 §3. Each slot is optional: a missing (or `hidden`) one is not shown; a group
 * with no slot shown has no separator.
 *
 * Slot specs: `new`, `properties`, `save`, `saveAs`, `refresh`, `publish`, `generate`, `help` - button specs
 * (presentationButton; icon, label and tip have defaults); `selector` - a selector spec (presentationSelector);
 * `scope` - an element (the select of the records and its parameters); `more` - `[{icon, label, run}]`, the items of ⋯.
 *
 * @param {HTMLElement} bar The toolbar (emptied).
 * @param {Object<string, object>} slots
 * @returns {Object<string, HTMLElement>} The elements by slot.
 */
export function renderPresentationToolbar(bar, slots = {}) {
  bar.replaceChildren();
  bar.classList.add('h-toolbar', 'h-presentation-toolbar');
  bar.setAttribute('role', 'toolbar');
  const made = {};
  let previous = false;
  PRESENTATION_TOOLBAR_GROUPS.forEach((group, index) => {
    const present = group.filter((name) => slots[name] && slots[name].hidden !== true
      && !(name === 'more' && !(Array.isArray(slots.more) && slots.more.length)));
    if (!present.length) return;
    // the last group (⋯, Help) at the right end
    if (index === PRESENTATION_TOOLBAR_GROUPS.length - 1) {
      element('span', 'h-presentation-toolbar-fill', bar).setAttribute('aria-hidden', 'true');
    } else if (previous) {
      element('span', 'h-presentation-separator', bar).setAttribute('aria-hidden', 'true');
    }
    previous = true;
    for (const name of present) {
      const spec = slots[name];
      if (name === 'selector') made.selector = presentationSelector(bar, spec);
      else if (name === 'scope') made.scope = bar.appendChild(spec instanceof Node ? spec : spec.element);
      else if (name === 'more') made.more = moreButton(bar, spec);
      else made[name] = presentationButton(bar, { ...SLOT_DEFAULTS[name], ...spec });
    }
  });
  return made;
}

/** ⋯ with a list of actions under it (Import, Export of a report template). */
function moreButton(parent, items) {
  const button = presentationButton(parent, { icon: 'fa-ellipsis', label: 'More', title: 'More actions', caption: false });
  button.setAttribute('aria-haspopup', 'menu');
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-expanded') === 'true') {
      closePopover();
      return;
    }
    const menu = element('div', 'h-presentation-menu');
    menu.setAttribute('role', 'menu');
    for (const item of items) {
      const entry = element('button', 'h-presentation-menu-item', menu);
      entry.type = 'button';
      entry.setAttribute('role', 'menuitem');
      entry.disabled = item.disabled === true;
      element('i', `fa-solid ${item.icon || 'fa-circle'}`, entry).setAttribute('aria-hidden', 'true');
      element('span', '', entry).textContent = $HR(item.label);
      if (item.title) entry.title = $HR(item.title);
      entry.addEventListener('click', () => {
        closePopover();
        item.run?.();
      });
    }
    showPopover(button, menu, { className: 'h-presentation-menu-popover' });
  });
  return button;
}

/**
 * The list of the saved configurations under the selector: a popover with one row per item (the current one marked);
 * `heading` rows group them, `disabled` rows are shown greyed out.
 *
 * @param {HTMLElement} anchor The selector.
 * @param {Array<{id?: number, title?: string, note?: string, heading?: string, disabled?: boolean}>} items
 * @param {object} options
 * @param {number} [options.current] Id of the current item.
 * @param {function(object): void} options.onSelect
 * @returns {void}
 */
export function togglePresentationList(anchor, items, { current = 0, onSelect } = {}) {
  if (anchor.getAttribute('aria-expanded') === 'true') {
    closePopover();
    return;
  }
  const list = element('div', 'h-presentation-list-popup');
  list.setAttribute('role', 'listbox');
  list.classList.toggle('has-groups', items.some((item) => item.heading));
  for (const item of items) {
    if (item.heading) {
      element('div', 'h-presentation-list-heading', list).textContent = $HR(item.heading);
      continue;
    }
    const row = element('button', 'h-presentation-list-item', list);
    row.type = 'button';
    row.textContent = item.title || `#${item.id}`;
    if (item.note) element('span', 'h-presentation-list-note', row).textContent = item.note;
    row.classList.toggle('is-active', Number(item.id) === Number(current));
    row.disabled = item.disabled === true;
    row.addEventListener('click', () => {
      closePopover();
      onSelect?.(item);
    });
  }
  if (!items.length) element('div', 'h-presentation-list-empty h-muted', list).textContent = $HR('Nothing saved yet');
  showPopover(anchor, list, { className: 'h-presentation-list-popover' });
}

/**
 * The scope select of an editor (27q3 §3): *Current result* / *Own query* (and more choices of Export). In an editor
 * the scope is the test data only.
 *
 * @param {object} options
 * @param {Array<[string, string]>} [options.choices] Value and label.
 * @param {string} options.value
 * @param {string} [options.label] Caption before the select ("Test on").
 * @param {string} [options.title] Tip.
 * @param {Object<string, boolean>} [options.disabled] Disabled choices by value.
 * @param {function(string): void} options.onChange
 * @returns {HTMLElement} The label with the select (`.select` is the select).
 */
export function createScopeSelect({
  choices = [['current', 'Current result'], ['own', 'Own query']], value, label = '', title = '', disabled = {}, onChange
} = {}) {
  const box = element('label', 'h-presentation-scope');
  if (label) element('span', 'h-presentation-scope-label', box).textContent = $HR(label);
  const select = element('select', 'h-select h-presentation-scope-select', box);
  if (title) select.title = $HR(title);
  for (const [optionValue, text] of choices) {
    const option = element('option', '', select);
    option.value = optionValue;
    option.textContent = $HR(text);
    option.disabled = disabled[optionValue] === true;
  }
  select.value = value;
  select.addEventListener('change', () => onChange?.(select.value));
  box.select = select;
  return box;
}

/**
 * Unsaved changes before Close, another configuration or New (27q3 §3.2): *Save / Discard / Cancel*.
 *
 * @param {object} options
 * @param {boolean} options.dirty There are changes.
 * @param {function(): Promise<boolean>} options.save Save them; resolves false when it failed.
 * @param {string} [options.message]
 * @returns {Promise<boolean>} The caller may go on.
 */
export async function confirmLeave({ dirty, save, message = 'There are unsaved changes. Save changes?' }) {
  if (!dirty) return true;
  const answer = await askSaveDiscard(message);
  if (answer === 'save') return (await save()) !== false;
  return answer === 'discard';
}
