/**
 * @file tabs.js
 * @brief A tab strip with panels: the tabs of HEditForm groups and of v4 website pages (plan 27a).
 *
 * Classes are `<prefix>-tabs`, `<prefix>-tab-strip`, `<prefix>-tab` (`is-active`) and
 * `<prefix>-tab-panel`; each user styles its own prefix. Option `scroll` (plan 27n1 §2e): too many tabs for one line
 * scroll sideways, the buttons `<prefix>-tab-scroll` ‹ › show while they do not fit.
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

/** Part of the visible width one ‹ › click scrolls. */
const SCROLL_STEP = 0.8;

/**
 * Create an empty tab set; add panels with `add()` and choose the first with `select(0)`.
 *
 * @param {object} [options]
 * @param {string} [options.prefix] Class prefix.
 * @param {HTMLElement|null} [options.element] Element to use as the tab set (a new div by default).
 * @param {function(EventTarget,string,Function):void} [options.listen] Adds a listener (a widget's `listen`, for clean-up).
 * @param {function(number):void} [options.onSelect] Called after a tab is selected.
 * @param {boolean} [options.scroll=false] One line of tabs that scrolls, with ‹ › while the tabs do not fit.
 * @returns {{element: HTMLElement, strip: HTMLElement, tabs: HTMLButtonElement[], panels: HTMLElement[],
 *   selected: number, add: function(string, HTMLElement): HTMLButtonElement, select: function(number): void,
 *   update: function(): void, destroy: function(): void}}
 */
export function createTabSet({ prefix = 'h-tabs', element = null, listen = null, onSelect = null, scroll = false } = {}) {
  const set = element || document.createElement('div');
  set.classList.add(`${prefix}-tabs`);
  const strip = document.createElement('div');
  strip.className = `${prefix}-tab-strip`;
  strip.setAttribute('role', 'tablist');
  set.prepend(strip);
  const on = listen || ((target, type, handler) => target.addEventListener(type, handler));
  const scroller = scroll ? scrollButtons(strip, prefix, on) : null;
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
      // the whole label of a tab cut by its width (vertical tabs, plan 27n1 §2f)
      tab.title = label;
      on(tab, 'click', () => run.select(position));
      // arrow keys move between the tabs
      on(tab, 'keydown', (event) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (!step || run.tabs.length < 2) return;
        event.preventDefault();
        run.select((run.selected + step + run.tabs.length) % run.tabs.length);
        run.tabs[run.selected]?.focus();
      });
      if (scroller) scroller.next.before(tab); else strip.append(tab);
      panel.classList.add(`${prefix}-tab-panel`);
      panel.setAttribute('role', 'tabpanel');
      if (panel.parentElement !== set) set.append(panel);
      run.tabs.push(tab);
      run.panels.push(panel);
      scroller?.update();
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
        run.tabs[position].tabIndex = active ? 0 : -1;
      }
      run.selected = selected;
      scroller?.reveal(run.tabs[selected]);
      onSelect?.(selected);
    },
    /** Show or hide ‹ › again (after the tab set was shown or resized). */
    update() {
      scroller?.update();
    },
    /** Stop watching the size of the strip. */
    destroy() {
      scroller?.destroy();
    }
  };
  return run;
}

/**
 * The ‹ › buttons of a scrolling strip: first and last in the strip (sticky at its edges), shown while the tabs do not fit
 * and the strip can move that way.
 *
 * @param {HTMLElement} strip
 * @param {string} prefix
 * @param {function(EventTarget,string,Function):void} on
 * @returns {{next: HTMLButtonElement, update: function(): void, reveal: function(HTMLElement): void, destroy: function(): void}}
 */
function scrollButtons(strip, prefix, on) {
  strip.classList.add('is-scrolling');
  const button = (direction) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `${prefix}-tab-scroll is-${direction}`;
    element.tabIndex = -1;
    element.setAttribute('aria-hidden', 'true');
    element.textContent = direction === 'prev' ? '‹' : '›';
    element.hidden = true;
    on(element, 'click', () => {
      const step = Math.max(40, strip.clientWidth * SCROLL_STEP);
      strip.scrollBy?.({ left: direction === 'prev' ? -step : step, behavior: 'smooth' });
    });
    return element;
  };
  const prev = button('prev');
  const next = button('next');
  strip.append(prev, next);
  const update = () => {
    // a column of tabs (vertical) does not scroll sideways
    const overflow = strip.scrollWidth > strip.clientWidth + 1;
    prev.hidden = !overflow || strip.scrollLeft <= 1;
    next.hidden = !overflow || strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
  };
  on(strip, 'scroll', update);
  const observer = typeof globalThis.ResizeObserver === 'function' ? new globalThis.ResizeObserver(update) : null;
  observer?.observe(strip);
  return {
    next,
    update,
    // the chosen tab in view; only the strip moves, never the page
    reveal(tab) {
      if (!tab || strip.scrollWidth <= strip.clientWidth + 1) return;
      const edge = (prev.offsetWidth || 0) + 4;
      if (tab.offsetLeft - edge < strip.scrollLeft) strip.scrollLeft = Math.max(0, tab.offsetLeft - edge);
      else if (tab.offsetLeft + tab.offsetWidth + edge > strip.scrollLeft + strip.clientWidth) {
        strip.scrollLeft = tab.offsetLeft + tab.offsetWidth + edge - strip.clientWidth;
      }
      update();
    },
    destroy() {
      observer?.disconnect();
    }
  };
}
