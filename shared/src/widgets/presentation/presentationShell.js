/**
 * @file presentationShell.js
 * @brief The common parts of the presentation editors and lists (plan 27q3 §1-§3): the full screen host, its header
 *        with the title and Close, the toolbar with the fixed groups of buttons, and the question about unsaved changes.
 *
 * Toolbar (27q3 §3, agreed 2026-11-24), always in this order:
 *
 *   New | Selector ▾ | Edit | Properties | Save | Save as  ‖  Scope ▾ + parameters | Refresh  ‖  Publish | Generate  ‖  ⋯ | Help
 *
 * Edit is the viewer's (it opens the Editor). New, Properties, Refresh, Publish and Help are icons only. Crosstabs put
 * Publish and Help on the header instead (27q3 review 1, 2026-11-25): header right = Publish | Help | List / View / Close.
 * Story map and Reports follow (review 3): a slot `placeholder: true` keeps its place hidden, `tools` are icon buttons at
 * the right end (Import | Export | Unregistered of the reports), the selector may end with a `badge` (card / list).
 * Review 4 (2026-11-25): the first group is on the left, all the others (Show for, Refresh, Generate, tools) are right
 * aligned together and wrap to the next row in a narrow pane.
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
  Object.freeze(['new', 'selector', 'edit', 'properties', 'save', 'saveAs']),
  Object.freeze(['scope', 'refresh']),
  Object.freeze(['publish', 'generate']),
  Object.freeze(['more', 'tools', 'help'])
]);

/** Icon, label and tip of the slots that are buttons (a slot spec may change them). */
const SLOT_DEFAULTS = Object.freeze({
  new: { icon: 'fa-circle-plus', label: 'New', title: 'New', caption: false },
  // the viewer: Edit opens the Editor (27q3 review 1, 2026-11-25)
  edit: { icon: 'fa-pen-ruler', label: 'Edit', title: 'Open the editor', primary: true },
  properties: { icon: 'fa-pen', label: 'Properties', title: 'Name, description, owner and visibility', caption: false },
  save: { icon: 'fa-floppy-disk', label: 'Save', title: 'Save', primary: true },
  saveAs: { icon: 'fa-copy', label: 'Save as', title: 'Save as a new one' },
  refresh: { icon: 'fa-rotate', label: 'Refresh', title: 'Run the preview again', caption: false },
  publish: { icon: 'fa-share-nodes', label: 'Publish', title: 'Publish as a web page', caption: false },
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
 * The header of a full screen view (`heurist-source-header`): the title, icon buttons (Publish, Help) and Close last
 * (27q3 review 1, 2026-11-25: the mode switch is the last button on the right in every mode).
 *
 * @param {object} options
 * @param {string} options.title The title ("Crosstab editor: <name>").
 * @param {Function|null} [options.onClose] Close (no button without it).
 * @param {string} [options.closeTitle] Tip of Close.
 * @param {string} [options.className] An own class of the header.
 * @param {Array<{icon: string, label: string, title?: string, run: Function, disabled?: boolean}>} [options.actions]
 *        Icon buttons before Close.
 * @param {string} [options.note] A warning between the title and the buttons (the JS/CSS note of the report editor).
 * @returns {{element: HTMLElement, setTitle: function(string): void, setActions: function(Array<object>): void,
 *   setNote: function(string): void, close: HTMLButtonElement|null}}
 */
export function createSourceHeader({ title = '', onClose = null, closeTitle = 'Close', className = '', actions = [], note = '' } = {}) {
  const header = element('div', `heurist-source-header h-presentation-header${className ? ` ${className}` : ''}`);
  const caption = element('span', 'h-presentation-header-title', header);
  caption.textContent = title;
  const noteBox = element('span', 'h-presentation-header-note', header);
  const setNote = (text = '') => {
    noteBox.replaceChildren();
    noteBox.hidden = !text;
    if (!text) return;
    noteBox.title = $HR(text);
    element('i', 'fa-solid fa-triangle-exclamation', noteBox).setAttribute('aria-hidden', 'true');
    element('span', 'h-presentation-header-note-text', noteBox).textContent = $HR(text);
  };
  setNote(note);
  const actionsBox = element('span', 'h-presentation-header-actions', header);
  const setActions = (specs = []) => renderHeaderActions(actionsBox, specs);
  setActions(actions);
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
    setActions,
    setNote,
    setTitle: (text) => { caption.textContent = text; }
  };
}

/**
 * The icon buttons on a header (the full screen header or the header of a pane), in the given order; the mode switch
 * (List / View / Close) is the last one (27q3 review 1). The host is emptied first.
 *
 * @param {HTMLElement|null} host
 * @param {Array<{icon: string, label: string, title?: string, run: Function, disabled?: boolean, active?: boolean}|null>} specs
 * @returns {HTMLButtonElement[]} The buttons.
 */
export function renderHeaderActions(host, specs = []) {
  if (!host) return [];
  host.replaceChildren();
  return specs.filter(Boolean).map((spec) => {
    const button = element('button', 'heurist-icon-button', host);
    button.type = 'button';
    button.title = $HR(spec.title || spec.label);
    button.setAttribute('aria-label', $HR(spec.label || spec.title));
    element('i', `fa-solid ${spec.icon}`, button).setAttribute('aria-hidden', 'true');
    button.disabled = spec.disabled === true;
    if (spec.active) button.classList.add('is-active');
    if (typeof spec.run === 'function') button.addEventListener('click', () => spec.run(button));
    return button;
  });
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
 * @param {{icon?: string, label: string, title?: string, run: Function, disabled?: boolean, badge?: string,
 *   count?: {text: string, icon?: string, title?: string}|null}} spec `badge`: a short word at the end (card / list of
 *        the reports); `count`: a number badge before it (the generated reports of a template).
 * @returns {HTMLButtonElement}
 */
export function presentationSelector(parent, spec) {
  const button = element('button', 'h-btn h-presentation-selector', parent);
  button.type = 'button';
  button.title = $HR(spec.title || 'Choose');
  button.setAttribute('aria-haspopup', 'listbox');
  element('i', `fa-solid ${spec.icon || 'fa-list'}`, button).setAttribute('aria-hidden', 'true');
  element('span', 'h-presentation-selector-label', button).textContent = spec.label || '';
  presentationCount(button, spec.count);
  if (spec.badge) element('span', 'h-presentation-badge', button).textContent = $HR(spec.badge);
  element('span', 'h-caret', button).setAttribute('aria-hidden', 'true');
  button.disabled = spec.disabled === true;
  button.addEventListener('click', () => spec.run?.(button));
  return button;
}

/**
 * A number badge (the generated reports of a report template, as the old report list showed it): an icon and the
 * number, muted (27q3 review 4).
 *
 * @param {HTMLElement} parent
 * @param {{text: string, icon?: string, title?: string}|null} count Nothing without a text.
 * @returns {HTMLElement|null}
 */
export function presentationCount(parent, count) {
  if (!count?.text) return null;
  const badge = element('span', 'h-presentation-count', parent);
  if (count.icon) element('i', count.icon, badge).setAttribute('aria-hidden', 'true');
  element('span', '', badge).textContent = count.text;
  if (count.title) badge.title = $HR(count.title);
  return badge;
}

/**
 * Fill a toolbar with the slots of 27q3 §3. Each slot is optional: a missing (or `hidden`) one is not shown; a group
 * with no slot shown has no separator.
 *
 * Slot specs: `new`, `edit`, `properties`, `save`, `saveAs`, `refresh`, `publish`, `generate`, `help` - button specs
 * (presentationButton; icon, label and tip have defaults); `selector` - a selector spec (presentationSelector);
 * `scope` - an element (the select of the records and its parameters); `more` - `[{icon, label, run}]`, the items of ⋯;
 * `tools` - `[{icon, label, title, run, disabled}]`, icon buttons at the right end. A spec with `placeholder: true`
 * keeps its place but is not seen.
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
  // the groups after the first are right aligned, together; in a narrow pane they wrap to the next row (review 4)
  let end = null;
  PRESENTATION_TOOLBAR_GROUPS.forEach((group, index) => {
    const present = group.filter((name) => slots[name] && slots[name].hidden !== true
      && !(['more', 'tools'].includes(name) && !(Array.isArray(slots[name]) && slots[name].filter(Boolean).length)));
    if (!present.length) return;
    let parent = bar;
    if (index > 0) {
      if (!end) end = element('span', 'h-presentation-toolbar-end', bar);
      else element('span', 'h-presentation-separator', end).setAttribute('aria-hidden', 'true');
      parent = end;
    }
    for (const name of present) {
      const spec = slots[name];
      if (name === 'selector') made.selector = presentationSelector(parent, spec);
      else if (name === 'scope') {
        made.scope = spec.element || spec;
        parent.append(made.scope);
      }
      else if (name === 'more') made.more = moreButton(parent, spec);
      else if (name === 'tools') made.tools = spec.filter(Boolean).map((tool) => presentationButton(parent, { caption: false, ...tool }));
      else made[name] = presentationButton(parent, { ...SLOT_DEFAULTS[name], ...spec });
      // its place is kept, not seen (the Reports List: Show for does not move, review 3)
      if (spec.placeholder === true && made[name]?.classList) {
        made[name].classList.add('is-placeholder');
        made[name].setAttribute('aria-hidden', 'true');
        made[name].tabIndex = -1;
      }
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
 * @param {Array<{id?: number, title?: string, note?: string, heading?: string, disabled?: boolean, count?: object}>} items
 *        `count`: a number badge after the title (presentationCount).
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
    presentationCount(row, item.count);
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
