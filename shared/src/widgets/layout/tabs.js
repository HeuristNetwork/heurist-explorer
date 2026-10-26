/**
 * @file tabs.js
 * @brief A tab strip with panels: the tabs of HEditForm groups and of v4 website pages (plan 27a).
 *
 * Classes are `<prefix>-tabs`, `<prefix>-tab-strip`, `<prefix>-tab` (`is-active`) and
 * `<prefix>-tab-panel`; each user styles its own prefix.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/**
 * Create an empty tab set; add panels with `add()` and choose the first with `select(0)`.
 *
 * @param {object} [options]
 * @param {string} [options.prefix] Class prefix.
 * @param {HTMLElement|null} [options.element] Element to use as the tab set (a new div by default).
 * @param {function(EventTarget,string,Function):void} [options.listen] Adds a listener (a widget's `listen`, for clean-up).
 * @param {function(number):void} [options.onSelect] Called after a tab is selected.
 * @returns {{element: HTMLElement, strip: HTMLElement, tabs: HTMLButtonElement[], panels: HTMLElement[],
 *   selected: number, add: function(string, HTMLElement): HTMLButtonElement, select: function(number): void}}
 */
export function createTabSet({ prefix = 'h-tabs', element = null, listen = null, onSelect = null } = {}) {
  const set = element || document.createElement('div');
  set.classList.add(`${prefix}-tabs`);
  const strip = document.createElement('div');
  strip.className = `${prefix}-tab-strip`;
  strip.setAttribute('role', 'tablist');
  set.prepend(strip);
  const on = listen || ((target, type, handler) => target.addEventListener(type, handler));
  const run = {
    element: set,
    strip,
    tabs: [],
    panels: [],
    selected: 0,
    /**
     * Add a panel with its tab label.
     *
     * @param {string} label Tab label.
     * @param {HTMLElement} panel Panel element (appended to the tab set unless it is in it already).
     * @returns {HTMLButtonElement} The tab button.
     */
    add(label, panel) {
      const position = run.tabs.length;
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `${prefix}-tab`;
      tab.setAttribute('role', 'tab');
      tab.textContent = label;
      on(tab, 'click', () => run.select(position));
      strip.append(tab);
      panel.classList.add(`${prefix}-tab-panel`);
      panel.setAttribute('role', 'tabpanel');
      if (panel.parentElement !== set) set.append(panel);
      run.tabs.push(tab);
      run.panels.push(panel);
      return tab;
    },
    /**
     * Show one panel and hide the others.
     *
     * @param {number} selected Position of the tab.
     * @returns {void}
     */
    select(selected) {
      for (const [position, panel] of run.panels.entries()) {
        const active = position === selected;
        panel.hidden = !active;
        run.tabs[position].classList.toggle('is-active', active);
        run.tabs[position].setAttribute('aria-selected', String(active));
      }
      run.selected = selected;
      onSelect?.(selected);
    }
  };
  return run;
}
