import { $HR } from '#shared/ui';
import './ExplorerRail.css';

/**
 * @file ExplorerRail.js
 * @brief Vertical Explorer command rail using shared Heurist module buttons.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/** Button presentation modes the rail's toggle cycles through. 'small' is the baseline (no CSS class applied). */
export const VIEW_MODES = [
  { id: 'small', label: 'Small icons' },
  { id: 'small-caption', label: 'Small icons with captions' },
  { id: 'large', label: 'Large icons' },
  { id: 'large-caption', label: 'Large icons with captions' }
];

/**
 * Renders a left or right vertical rail of Explorer commands.
 *
 * The rail emits intent only. It does not manipulate LayoutManager directly.
 */
export class ExplorerRail extends EventTarget {
  /**
   * @param {object} options Rail configuration.
   * @param {'left'|'right'} options.side Rail side.
   * @param {Array<object>} [options.buttons] Button definitions.
   * @param {boolean} [options.followPointer=false] Move button cluster towards pointer Y.
   * @param {Function|null} [options.onRailClick] Handler for empty rail clicks.
   */
  constructor({ side = 'left', buttons = [], followPointer = false, onRailClick = null } = {}) {
    super();

    this.side = side === 'right' ? 'right' : 'left';
    this.buttons = Array.isArray(buttons) ? buttons : [];
    this.followPointer = Boolean(followPointer);
    this.onRailClick = typeof onRailClick === 'function' ? onRailClick : null;
    this.buttonElements = new Map();
    this.activeIds = new Set();
    this.collapsed = false;
    this.viewMode = VIEW_MODES[0].id;
    this._pointerTrackingPaused = false;
    this._pointerFollowReady = !this.followPointer;
    this._pointerFollowTimer = null;
  }

  /**
   * Mounts the rail in a parent element.
   *
   * @param {HTMLElement} parent Parent element.
   * @returns {HTMLElement} Generated rail element.
   */
  mount(parent) {
    if (!(parent instanceof HTMLElement)) {
      throw new TypeError('ExplorerRail parent must be an HTMLElement');
    }

    this.parent = parent;
    this.element = document.createElement('aside');
    this.element.className = `h-explorer-rail h-explorer-rail-${this.side}`;
    this.element.setAttribute('aria-label', $HR(`${capitalize(this.side)} Explorer controls`));

    this.cluster = document.createElement('div');
    this.cluster.className = 'h-explorer-rail-cluster';
    this.element.append(this.cluster);

    this.setButtons(this.buttons);
    this.element.append(this._buildViewModeControl());
    this.setViewMode(this.viewMode);
    this.element.addEventListener('click', (event) => this._handleRailClick(event));

    if (this.followPointer) {
      this.element.addEventListener('pointerenter', () => this._schedulePointerFollow());
      this.element.addEventListener('pointermove', (event) => this._followPointer(event));
      this.element.addEventListener('pointerleave', () => this._stopPointerFollow());
      this.cluster.addEventListener('pointerenter', () => {
        this._pointerTrackingPaused = true;
      });
      this.cluster.addEventListener('pointerleave', () => {
        this._pointerTrackingPaused = false;
      });
    }

    parent.append(this.element);
    return this.element;
  }

  /**
   * Replaces all rail buttons.
   *
   * @param {Array<object>} buttons Button definitions.
   * @returns {ExplorerRail}
   */
  setButtons(buttons = []) {
    this.buttons = Array.isArray(buttons) ? buttons : [];
    this.buttonElements.clear();

    if (!this.cluster) {
      return this;
    }

    this.cluster.replaceChildren();
    let previousGroup = null;

    for (const definition of this.buttons) {
      const group = definition.group || 'default';

      if (previousGroup !== null && group !== previousGroup) {
        const separator = document.createElement('div');
        separator.className = 'h-explorer-rail-separator';
        this.cluster.append(separator);
      }

      const button = this._createButton(definition);
      this.cluster.append(button);
      this.buttonElements.set(definition.id, button);
      previousGroup = group;
    }

    return this;
  }

  /**
   * Sets one toggle button active/inactive.
   *
   * @param {string} id Button id.
   * @param {boolean} [active=true] Active state.
   * @returns {boolean} Applied active state.
   */
  setActive(id, active = true) {
    const button = this.buttonElements.get(id);

    if (!button) {
      return false;
    }

    if (active) {
      this.activeIds.add(id);
    } else {
      this.activeIds.delete(id);
    }

    button.classList.toggle('active', Boolean(active));
    button.setAttribute('aria-pressed', String(Boolean(active)));
    return Boolean(active);
  }

  /**
   * Clears active state from every button.
   *
   * @returns {ExplorerRail}
   */
  clearActive() {
    for (const id of [...this.activeIds]) {
      this.setActive(id, false);
    }

    return this;
  }


  /**
   * Returns a rail button element by command id.
   *
   * @param {string} id Button id.
   * @returns {HTMLButtonElement|null} Button element, when present.
   */
  getButtonElement(id) {
    return this.buttonElements.get(String(id)) || null;
  }

  /**
   * Hides or shows the entire rail.
   *
   * @param {boolean} [collapsed=true] Collapsed state.
   * @returns {boolean} Applied collapsed state.
   */
  setCollapsed(collapsed = true) {
    this.collapsed = Boolean(collapsed);
    this.element?.classList.toggle('is-collapsed', this.collapsed);
    return this.collapsed;
  }

  /**
   * Toggles whole-rail visibility.
   *
   * @returns {boolean} New collapsed state.
   */
  toggleCollapsed() {
    return this.setCollapsed(!this.collapsed);
  }

  /**
   * Removes generated rail DOM.
   */
  destroy() {
    this._cancelPointerFollowTimer();
    this.element?.remove();
    this.buttonElements.clear();
    this.activeIds.clear();
  }

  /**
   * Applies one of the rail's button presentation modes.
   *
   * @param {string} mode One of the VIEW_MODES ids.
   * @returns {string} Applied mode id.
   */
  setViewMode(mode) {
    const resolved = VIEW_MODES.some((entry) => entry.id === mode) ? mode : VIEW_MODES[0].id;
    this.viewMode = resolved;

    for (const entry of VIEW_MODES) {
      this.element?.classList.toggle(`h-mode-${entry.id}`, entry.id !== VIEW_MODES[0].id && entry.id === resolved);
    }

    if (this._viewModeToggle) {
      const current = VIEW_MODES.find((entry) => entry.id === resolved);
      this._viewModeToggle.title = $HR(`Change button size (${current?.label || ''})`);
      this._viewModeToggle.setAttribute('aria-label', this._viewModeToggle.title);
    }

    return this.viewMode;
  }

  /** Advances to the next presentation mode in VIEW_MODES, wrapping around, and notifies listeners. */
  _cycleViewMode() {
    const currentIndex = VIEW_MODES.findIndex((entry) => entry.id === this.viewMode);
    const next = VIEW_MODES[(currentIndex + 1) % VIEW_MODES.length];
    this.setViewMode(next.id);
    this.dispatchEvent(new CustomEvent('viewmodechange', { detail: { mode: next.id } }));
  }

  /**
   * Build the view-mode toggle button appended after the button cluster.
   *
   * @private
   * @returns {HTMLElement} The generated view-mode control wrapper.
   */
  _buildViewModeControl() {
    const wrap = document.createElement('div');
    wrap.className = 'h-explorer-rail-viewmode';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'heurist-icon-button h-explorer-rail-viewmode-toggle';
    const icon = document.createElement('span');
    icon.className = 'fa-solid fa-ellipsis';
    icon.setAttribute('aria-hidden', 'true');
    toggle.append(icon);
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      this._cycleViewMode();
    });

    wrap.append(toggle);
    this._viewModeToggle = toggle;
    return wrap;
  }

  /**
   * Build one rail button from its definition, wiring its click to a `toolselect` event.
   *
   * @private
   * @param {object} definition Button definition (id, title, hint, icon, group, toggle, disabled).
   *   `title` is the short caption shown as the button's visible label in caption
   *   view modes; `hint` is the longer description shown as its tooltip/aria-label,
   *   falling back to `title` when omitted.
   * @returns {HTMLButtonElement} The generated button element.
   */
  _createButton(definition) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'heurist-icon-button h-explorer-rail-button';
    button.dataset.tool = definition.id;
    button.title = $HR(definition.hint || definition.title || definition.id);
    button.setAttribute('aria-label', $HR(definition.hint || definition.title || definition.id));

    if (definition.toggle) {
      button.setAttribute('aria-pressed', 'false');
    }

    if (definition.disabled) {
      button.disabled = true;
    }

    const icon = document.createElement('span');
    icon.className = definition.icon || 'fa-solid fa-circle';
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);

    const label = document.createElement('span');
    label.className = 'h-explorer-rail-button-label h-i18n';
    label.textContent = definition.title || definition.id;
    button.append(label);

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.dispatchEvent(new CustomEvent('toolselect', {
        detail: {
          id: definition.id,
          definition,
          originalEvent: event
        }
      }));
    });

    return button;
  }

  /**
   * Dispatch a `railclick` event and invoke `onRailClick` for clicks on empty rail space.
   *
   * @private
   * @param {MouseEvent} event Originating click event.
   * @returns {void}
   */
  _handleRailClick(event) {
    if (event.target.closest('button')) {
      return;
    }

    this.dispatchEvent(new CustomEvent('railclick', {
      detail: { side: this.side, originalEvent: event }
    }));
    this.onRailClick?.(event);
  }

  /**
   * Move the button cluster toward the pointer's Y position within the rail.
   *
   * @private
   * @param {PointerEvent} event Originating pointermove event.
   * @returns {void}
   */
  _followPointer(event) {
    if (!this.cluster || !this.element || this._pointerTrackingPaused || !this._pointerFollowReady) {
      return;
    }

    const railRect = this.element.getBoundingClientRect();
    const clusterRect = this.cluster.getBoundingClientRect();
    const searchButton = this.cluster.querySelector('button');
    const searchHeight = searchButton?.getBoundingClientRect().height || 30;
    const desiredTop = event.clientY - railRect.top - (searchHeight / 2);
    const maximum = Math.max(0, railRect.height - clusterRect.height);
    const top = Math.max(0, Math.min(desiredTop, maximum));

    this.cluster.style.transform = `translateY(${Math.round(top)}px)`;
  }

  /**
   * Debounce pointer-follow activation for 250ms after the pointer enters the rail.
   *
   * @private
   * @returns {void}
   */
  _schedulePointerFollow() {
    this._cancelPointerFollowTimer();
    this._pointerFollowReady = false;

    this._pointerFollowTimer = setTimeout(() => {
      this._pointerFollowTimer = null;
      this._pointerFollowReady = true;
    }, 250);
  }

  /**
   * Cancel any pending pointer-follow activation timer.
   *
   * @private
   * @returns {void}
   */
  _cancelPointerFollowTimer() {
    if (this._pointerFollowTimer) {
      clearTimeout(this._pointerFollowTimer);
      this._pointerFollowTimer = null;
    }
  }

  /**
   * Cancel pointer-follow activation and reset tracking state.
   *
   * @private
   * @returns {void}
   */
  _stopPointerFollow() {
    this._cancelPointerFollowTimer();
    this._pointerFollowReady = false;
    this._pointerTrackingPaused = false;
  }
}

/** Capitalize the first letter of a string. */
function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
