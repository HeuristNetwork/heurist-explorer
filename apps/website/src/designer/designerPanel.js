/**
 * @file designerPanel.js
 * @brief The element panel of the page editor of the CMS designer (plan 27n §2): the tabs *Configuration* and *Own
 *        style* of the selected element with Help, Undock / Dock and Close on the row of the tabs. Docked: below the
 *        part tree (a narrow west pane) or beside the tabs Site / Page (a wide one); undocked: a popup without a veil,
 *        stuck to the left side of the window, as large as its content, closed by a click outside (the changes stay),
 *        with Dock, Cancel and Apply in its footer. Every visual change goes to the draft and the preview at once.
 *        *Show advanced settings* (review 27n §21) shows the fields hidden in the simple forms (`req: 'optional'`,
 *        class `h-cms-advanced-only`, the module forms, Own style).
 *
 *   const panel = createElementPanel({ onClose, onUndock, onDock, onCancel, onApply });
 *   panel.show({ title, tabs: [{id: 'config', label: 'Configuration', help, sections: [...]}, {id: 'style', ...}] });
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

import { $HR } from '#shared/ui';

/** Minimum width of the docked panel (also of the west pane while it is open). */
export const PANEL_MIN_WIDTH = 370;

/** Width of the west pane from which the docked panel is beside the tabs Site / Page: tree 250px + panel. */
export const PANEL_SIDE_WIDTH = 250 + PANEL_MIN_WIDTH;

/** Positions of the panel: docked (below the tree or beside the tabs, by the width of the pane) or a popup. */
export const PANEL_MODES = Object.freeze(['docked', 'popup']);

const MODE_KEY = 'heurist.cms.panel';
const TIPS_KEY = 'heurist.cms.panel.tips';
const ADVANCED_KEY = 'heurist.cms.panel.advanced';

/**
 * Whether the advanced settings are shown (review 27n §21): the panel button, kept in the browser; off by default. The
 * popups of new elements use the same choice.
 *
 * @returns {boolean}
 */
export function advancedShown() {
  return readFlag(ADVANCED_KEY, false);
}

/**
 * Keep the choice of the advanced settings (the switch of a popup of a new element, review 27n §23.4); the panel takes
 * it on its next show.
 *
 * @param {boolean} shown
 */
export function setAdvancedShown(shown) {
  writeFlag(ADVANCED_KEY, shown === true);
}

/**
 * The switch *Show advanced settings* (fa-chess-board) of a popup form: it keeps the choice (setAdvancedShown) and
 * calls `onSwitch(shown)`.
 *
 * @param {(shown: boolean) => void} onSwitch
 * @returns {HTMLElement} A row with the button on the right.
 */
export function advancedSwitch(onSwitch) {
  const row = element('div', 'h-cms-advanced-switch');
  const button = iconButton('fa-chess-board', 'Show advanced settings');
  const mark = (shown) => {
    button.classList.toggle('is-active', shown);
    button.setAttribute('aria-pressed', String(shown));
    button.title = $HR(shown ? 'Hide advanced settings' : 'Show advanced settings');
    button.setAttribute('aria-label', button.title);
  };
  mark(advancedShown());
  button.addEventListener('click', () => {
    const shown = !advancedShown();
    setAdvancedShown(shown);
    mark(shown);
    onSwitch(shown);
  });
  row.append(button);
  return row;
}

/**
 * Create the element panel.
 *
 * @param {object} [options]
 * @param {() => void} [options.onClose] Close (the changes stay).
 * @param {(mode: string) => void} [options.onModeChange] Undock / Dock.
 * @param {() => void} [options.onCancel] Cancel of the popup: the draft as it was when the popup opened.
 * @param {() => (void|Promise<void>)} [options.onApply] Apply of the popup (a module configuration waits for it).
 * @param {(target: Element) => boolean} [options.keepOpen] A click there does not close the popup (the part tree,
 *        dialogs opened from the panel).
 * @returns {object} The panel API.
 */
export function createElementPanel({ onClose = null, onModeChange = null, onCancel = null, onApply = null, keepOpen = null } = {}) {
  const panel = element('div', 'h-cms-panel');
  panel.hidden = true;
  panel.classList.toggle('h-cms-panel-tips', readFlag(TIPS_KEY, true));
  panel.classList.toggle('is-advanced', advancedShown());
  // the row of the tabs: the tabs on the left, Help, Undock / Dock and Close on the right
  const head = element('div', 'h-cms-panel-head');
  const strip = element('div', 'h-cms-panel-tabs');
  strip.setAttribute('role', 'tablist');
  let headActions = element('span', 'h-cms-panel-head-actions');
  let showTicket = 0;
  // the forms of this show that follow Show advanced settings (context.onAdvanced)
  let advancedHandlers = [];
  const advanced = iconButton('fa-chess-board', 'Show advanced settings');
  advanced.classList.add('h-cms-panel-advanced');
  const help = iconButton('fa-circle-question', 'Show or hide the help of this form');
  const dock = iconButton(UNDOCK_ICON, 'Undock: show the form in a popup');
  const close = iconButton('fa-xmark', 'Close the form (the changes stay)');
  head.append(strip, element('span', 'h-cms-toolbar-spacer'), advanced, help, dock, close);
  const markAdvanced = () => {
    const shown = panel.classList.contains('is-advanced');
    advanced.classList.toggle('is-active', shown);
    advanced.setAttribute('aria-pressed', String(shown));
    advanced.title = $HR(shown ? 'Hide advanced settings' : 'Show advanced settings');
    advanced.setAttribute('aria-label', advanced.title);
  };
  markAdvanced();
  // the title of the element with the buttons of its form (Apply of a module, review §15.20)
  const title = element('div', 'h-cms-panel-title');
  const titleText = element('span', 'h-cms-panel-title-text');
  title.append(titleText, headActions);
  const body = element('div', 'h-cms-panel-body');
  // the footer of the popup: Dock on the left, Cancel and Apply on the right
  const foot = element('div', 'h-cms-panel-foot');
  const footDock = textButton('Dock', 'Show the form beside the tree again');
  const cancel = textButton('Cancel', 'The element as it was when the popup opened');
  const apply = textButton('Apply', 'Keep the changes and close the popup (saved with Save Page)');
  apply.classList.add('h-btn-primary');
  foot.append(footDock, element('span', 'h-cms-toolbar-spacer'), cancel, apply);
  panel.append(head, title, body, foot);

  let mode = PANEL_MODES.includes(readText(MODE_KEY)) ? readText(MODE_KEY) : 'docked';
  let tabs = [];
  let active = 'config';
  let cleanups = [];

  const clear = async () => {
    const list = cleanups;
    cleanups = [];
    for (const cleanup of list) await cleanup?.();
    strip.replaceChildren();
    body.replaceChildren();
    headActions.replaceChildren();
    tabs = [];
    advancedHandlers = [];
  };
  const select = (id) => {
    const chosen = tabs.find((tab) => tab.id === id) || tabs[0];
    if (!chosen) return;
    active = chosen.id;
    for (const tab of tabs) {
      tab.button.classList.toggle('is-active', tab === chosen);
      tab.button.setAttribute('aria-selected', String(tab === chosen));
      tab.pane.hidden = tab !== chosen;
    }
  };
  const setMode = (next) => {
    mode = PANEL_MODES.includes(next) ? next : 'docked';
    writeText(MODE_KEY, mode);
    panel.classList.toggle('is-popup', mode === 'popup');
    dock.title = $HR(mode === 'popup' ? 'Dock: show the form beside the tree' : 'Undock: show the form in a popup');
    // undocked: the size of the shown element (setMode runs before fitPopup is defined at start)
    if (mode === 'popup') globalThis.setTimeout?.(() => fitPopup?.(), 0);
    dock.setAttribute('aria-label', dock.title);
    dock.querySelector('i').className = `fa-solid ${mode === 'popup' ? DOCK_ICON : UNDOCK_ICON}`;
    foot.hidden = mode !== 'popup';
    if (mode !== 'popup') {
      panel.style.minWidth = '';
      panel.style.minHeight = '';
    }
  };
  // the popup keeps its size while it shows one element (review §14.14): as large as its largest tab with the help shown
  const fitPopup = () => {
    if (mode !== 'popup' || panel.hidden || !tabs.length) return;
    panel.style.minWidth = '';
    panel.style.minHeight = '';
    const tips = panel.classList.contains('h-cms-panel-tips');
    const shown = tabs.find((tab) => !tab.pane.hidden) || tabs[0];
    panel.classList.add('h-cms-panel-tips');
    let width = 0;
    let height = 0;
    for (const tab of tabs) {
      for (const other of tabs) other.pane.hidden = other !== tab;
      width = Math.max(width, panel.offsetWidth || 0);
      height = Math.max(height, panel.offsetHeight || 0);
    }
    for (const other of tabs) other.pane.hidden = other !== shown;
    panel.classList.toggle('h-cms-panel-tips', tips);
    const top = panel.getBoundingClientRect?.().top || 0;
    const view = globalThis.window || {};
    if (width) panel.style.minWidth = `${Math.min(width, (view.innerWidth || width + 40) - 40)}px`;
    if (height) panel.style.minHeight = `${Math.min(height, (view.innerHeight || height + top + 8) - top - 8)}px`;
  };
  setMode(mode);

  advanced.addEventListener('click', () => {
    const shown = !panel.classList.contains('is-advanced');
    panel.classList.toggle('is-advanced', shown);
    writeFlag(ADVANCED_KEY, shown);
    markAdvanced();
    for (const handler of advancedHandlers) handler(shown);
  });
  help.addEventListener('click', () => {
    const shown = !panel.classList.contains('h-cms-panel-tips');
    panel.classList.toggle('h-cms-panel-tips', shown);
    writeFlag(TIPS_KEY, shown);
  });
  dock.addEventListener('click', () => onModeChange?.(mode === 'popup' ? 'docked' : 'popup'));
  footDock.addEventListener('click', () => onModeChange?.('docked'));
  close.addEventListener('click', () => onClose?.());
  cancel.addEventListener('click', () => onCancel?.());
  apply.addEventListener('click', () => void onApply?.());

  // the popup: a click outside closes it (the changes stay, plan 27n §12.1); Escape is Cancel
  const outside = (event) => {
    if (panel.hidden || mode !== 'popup') return;
    const target = event.target;
    if (!target || panel.contains(target)) return;
    // drop-downs of the form outside the panel (review §21.1a: HValueCombo, colours)
    if (target.closest?.('dialog, .h-popover, .h-menu, .h-value-combo-popover, .h-input-color-menu, .tox, .tox-tinymce-aux')) return;
    if (keepOpen?.(target)) return;
    onClose?.();
  };
  const key = (event) => {
    if (panel.hidden || mode !== 'popup' || event.key !== 'Escape') return;
    // a dialog over the popup closes first
    if (globalThis.document?.querySelector?.('dialog[open]')) return;
    event.preventDefault?.();
    onCancel?.();
  };
  globalThis.document?.addEventListener?.('mousedown', outside, true);
  globalThis.document?.addEventListener?.('keydown', key);

  return {
    element: panel,
    isOpen: () => !panel.hidden,
    /** @returns {string} `docked` or `popup`. */
    mode: () => mode,
    /** @param {string} next `docked` or `popup`. */
    setMode,
    /** @returns {string} Id of the shown tab. */
    activeTab: () => active,
    /** @returns {boolean} Whether the help texts of the form are shown. */
    tipsShown: () => panel.classList.contains('h-cms-panel-tips'),
    /** @returns {boolean} Whether the advanced settings are shown (review §21). */
    advancedShown: () => panel.classList.contains('is-advanced'),
    /**
     * Buttons on the row of the tabs, until the panel shows another element (Apply of a module configuration).
     *
     * @param {...HTMLElement} buttons
     */
    addHeadActions: (...buttons) => headActions.append(...buttons),
    /**
     * Show the tabs of an element. `build(host, context)` fills a section and may return its cleanup (`context.addHeadActions`:
     * buttons in the title row for this show; `context.advanced`: whether the advanced settings are shown,
     * `context.onAdvanced(fn)`: called with true / false when they are switched); `help` is the help of the tab shown below
     * the title (with the help of the form).
     *
     * @param {{title?: string, tab?: string, tabs: Array<{id: string, label: string, help?: string[],
     *        sections: Array<{label?: string, build: Function}>}>}} options
     */
    async show({ title: text = '', tab = null, tabs: given = [] } = {}) {
      // one show at a time (review §15.19): a later show stops an earlier one that is still building its sections
      const ticket = ++showTicket;
      await clear();
      if (ticket !== showTicket) return;
      panel.hidden = false;
      titleText.textContent = text;
      // the choice may have changed in a popup of a new element (review §23.4)
      panel.classList.toggle('is-advanced', advancedShown());
      markAdvanced();
      // the buttons of this show only: a section built for an earlier show can not add its own here
      const actions = element('span', 'h-cms-panel-head-actions');
      headActions.replaceWith(actions);
      headActions = actions;
      advancedHandlers = [];
      const context = {
        addHeadActions: (...buttons) => { if (ticket === showTicket) actions.append(...buttons); },
        advanced: panel.classList.contains('is-advanced'),
        onAdvanced: (handler) => { if (ticket === showTicket) advancedHandlers.push(handler); }
      };
      for (const entry of given) {
        const button = element('button', 'h-cms-panel-tab');
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.textContent = entry.label;
        button.addEventListener('click', () => select(entry.id));
        strip.append(button);
        const pane = element('div', 'h-cms-panel-pane');
        pane.setAttribute('role', 'tabpanel');
        if (entry.help?.length) {
          const tips = element('div', 'h-cms-panel-help');
          tips.append(...entry.help.map((line) => {
            const paragraph = element('p');
            paragraph.textContent = line;
            return paragraph;
          }));
          pane.append(tips);
        }
        body.append(pane);
        tabs.push({ id: entry.id, button, pane, sections: entry.sections });
      }
      // one tab: no strip of tabs, its label is the title (a module of an Explorer)
      strip.hidden = tabs.length < 2;
      select(tab || active);
      for (const entry of tabs) {
        for (const section of entry.sections) {
          const host = element('div', 'h-cms-form-section');
          if (section.label) {
            const caption = element('div', 'h-cms-form-section-title');
            caption.textContent = section.label;
            host.append(caption);
          }
          entry.pane.append(host);
          const cleanup = await section.build(host, context);
          if (ticket !== showTicket) {
            // a later show cleared the panel meanwhile: this section is not shown
            await cleanup?.();
            host.remove();
            return;
          }
          cleanups.push(cleanup);
        }
      }
      // the button only when a form of this show has advanced settings (plan 27n1 §6)
      advanced.hidden = !advancedHandlers.length && !body.querySelector('.h-cms-advanced-only');
      fitPopup();
    },
    /** Hide the panel and destroy its forms. */
    async hide() {
      // a show still building its sections stops
      showTicket += 1;
      advancedHandlers = [];
      await clear();
      panel.hidden = true;
    },
    /** Remove the listeners of the popup (the designer closes). */
    destroy() {
      globalThis.document?.removeEventListener?.('mousedown', outside, true);
      globalThis.document?.removeEventListener?.('keydown', key);
    }
  };
}

/** Undock and Dock icons (review 27n §21.5). */
const UNDOCK_ICON = 'fa-up-right-and-down-left-from-center';
const DOCK_ICON = 'fa-down-left-and-up-right-to-center';

function iconButton(icon, title) {
  const button = element('button', 'h-btn h-compact h-cms-panel-icon');
  button.type = 'button';
  button.title = $HR(title);
  button.setAttribute('aria-label', button.title);
  const glyph = element('i', `fa-solid ${icon}`);
  glyph.setAttribute('aria-hidden', 'true');
  button.append(glyph);
  return button;
}

function textButton(label, title) {
  const button = element('button', 'h-btn h-compact');
  button.type = 'button';
  button.textContent = $HR(label);
  button.title = $HR(title);
  return button;
}

function readText(key) {
  try {
    return globalThis.localStorage?.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeText(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // the default next time
  }
}

function readFlag(key, fallback) {
  const value = readText(key);
  return value ? value === '1' : fallback;
}

function writeFlag(key, value) {
  writeText(key, value ? '1' : '0');
}

function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
