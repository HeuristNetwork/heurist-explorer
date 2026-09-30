/**
 * @file DataExpansionBar.js
 * @brief Expansion controls in the Data module header: the Expansion button and the level bar.
 *
 * The level bar mirrors the Graph's expansion navigator (previous / level / next,
 * and for authors Edit rules / Quick expansion), plus the Filter by selection
 * toggle, the "all levels up to n" toggle and the list of rules (plan 09 §7, U3–U6).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR } from "#shared/ui";

/** Expansion button plus the level bar shown while the level pane is open. */
export class DataExpansionBar {
  /**
   * @param {object} options Bar dependencies.
   * @param {object} options.api Data public API instance.
   * @param {function(Error, string): void} options.onError Called when an action fails.
   */
  constructor({ api, onError }) {
    this.api = api;
    this.onError = onError;
    this.enabled = true;
  }

  /**
   * Build the button and the bar.
   *
   * @returns {{button: HTMLElement, bar: HTMLElement}} Elements for the panel header.
   */
  create() {
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "h-btn h-btn-small heurist-data-expansion-button";
    this.button.innerHTML = '<span class="fa-solid fa-hexagon-nodes" aria-hidden="true"></span>'
      + '<span class="heurist-data-expansion-caption"></span>';
    this.button.querySelector(".heurist-data-expansion-caption").textContent = $HR("Expansion");
    this.button.title = $HR("Show records linked through the expansion rules");
    this.button.addEventListener("click", (event) => {
      event.stopPropagation();
      const state = this.api.getExpansionState();
      this.run(() => this.api.setExpansionActive(!state?.active));
    });

    this.bar = document.createElement("span");
    this.bar.className = "heurist-data-expansion-bar";
    this.filterButton = toggleButton("fa-solid fa-link", "Filter by selection: show only records linked to the records selected in the main list",
      () => this.run(() => this.api.setExpansionFilterBySelection(!this.api.getExpansionState().filterBySelection)));
    this.prevButton = iconButton("fa-solid fa-angle-left", "Previous level",
      () => this.run(() => this.api.setExpansionLevel(this.api.getExpansionState().level - 1)));
    this.levelSelector = document.createElement("select");
    this.levelSelector.className = "h-select heurist-data-level-selector";
    this.levelSelector.setAttribute("aria-label", $HR("Expansion level"));
    this.levelSelector.title = $HR("Expansion level: n is what step n of the enabled rules reaches from the main list");
    this.levelSelector.addEventListener("change", () =>
      this.run(() => this.api.setExpansionLevel(Number(this.levelSelector.value))));
    this.nextButton = iconButton("fa-solid fa-angle-right", "Next level",
      () => this.run(() => this.api.setExpansionLevel(this.api.getExpansionState().level + 1)));
    this.cumulativeButton = toggleButton("fa-solid fa-layer-group", "Show all levels up to the selected one",
      () => this.run(() => this.api.setExpansionCumulative(!this.api.getExpansionState().cumulative)));
    this.editButton = iconButton("fa-solid fa-pen", "Edit expansion rules", () => this.run(() => this.api.editRules()));
    this.quickButton = iconButton("fa-solid fa-circle-plus",
      "Quick expansion: add a step to every rule - any pointer or relationship to any record type",
      () => this.run(() => this.api.quickExpand()));

    this.rulesMenu = document.createElement("details");
    this.rulesMenu.className = "h-dropdown heurist-data-rules-menu";
    const summary = document.createElement("summary");
    summary.className = "heurist-icon-button";
    summary.title = $HR("Expansion Rules");
    summary.innerHTML = '<span class="fa-solid fa-list-check" aria-hidden="true"></span>';
    this.rulesList = document.createElement("div");
    this.rulesList.className = "h-menu heurist-data-rules-list";
    this.rulesMenu.append(summary, this.rulesList);
    this.closeMenu = (event) => {
      if (!this.rulesMenu.contains(event.target)) this.rulesMenu.removeAttribute("open");
    };
    document.addEventListener("click", this.closeMenu);

    this.bar.append(this.filterButton, this.prevButton, this.levelSelector, this.nextButton,
      this.cumulativeButton, this.rulesMenu, this.editButton, this.quickButton);
    this.onChanged = () => this.render();
    this.api.addEventListener("heurist-data-expansion-changed", this.onChanged);
    this.render();
    return { button: this.button, bar: this.bar };
  }

  /**
   * Show or hide the whole feature (option "Expansion rules").
   *
   * @param {boolean} enabled Whether the Expansion button is offered.
   * @returns {void}
   */
  setEnabled(enabled) {
    this.enabled = enabled !== false;
    if (!this.enabled && this.api.getExpansionState()?.active) this.run(() => this.api.setExpansionActive(false));
    this.render();
  }

  /** Refresh every control from the level pane's state. */
  render() {
    if (!this.button) return;
    const state = this.api.getExpansionState();
    this.button.hidden = !this.enabled || !state;
    if (!state) { this.bar.hidden = true; return; }
    this.button.disabled = !state.available;
    this.button.title = $HR(state.available
      ? "Show records linked through the expansion rules"
      : "The current source has no expansion rules");
    this.button.classList.toggle("active", state.active);
    this.button.setAttribute("aria-pressed", String(state.active));
    this.bar.hidden = !this.enabled || !state.active;
    if (this.bar.hidden) return;

    setPressed(this.filterButton, state.filterBySelection);
    setPressed(this.cumulativeButton, state.cumulative);
    this.levelSelector.replaceChildren();
    for (let level = 1; level <= Math.max(1, state.maxDepth); level++) {
      const option = document.createElement("option");
      option.value = String(level);
      option.textContent = String(level);
      this.levelSelector.append(option);
    }
    this.levelSelector.value = String(state.level);
    this.levelSelector.disabled = !state.maxDepth;
    this.prevButton.disabled = state.level <= 1;
    this.nextButton.disabled = state.level >= state.maxDepth;
    const canEdit = this.api.canEditRules?.() === true;
    this.editButton.hidden = !canEdit;
    this.quickButton.hidden = !canEdit;
    this.quickButton.disabled = this.api.canQuickExpand?.() !== true;
    this.renderRules(state.rules);
  }

  /** Rebuild the checkbox list of rules. */
  renderRules(rules) {
    this.rulesList.replaceChildren();
    for (const rule of rules) {
      const row = document.createElement("label");
      row.className = "heurist-data-rule-row";
      row.title = rule.description || "";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "h-checkbox";
      input.checked = rule.enabled;
      input.addEventListener("change", () =>
        this.run(() => this.api.setExpansionRuleEnabled(rule.index, input.checked)));
      const text = document.createElement("span");
      text.textContent = rule.name || `${$HR("Rule")} ${rule.index + 1}`;
      row.append(input, text);
      this.rulesList.append(row);
    }
  }

  /** Run an action, reporting a failure. */
  run(action) {
    Promise.resolve().then(action).catch((error) => this.onError?.(error, "expansion"));
  }

  /** Remove listeners. */
  destroy() {
    document.removeEventListener("click", this.closeMenu);
    this.api.removeEventListener("heurist-data-expansion-changed", this.onChanged);
  }
}

/** Icon-only button with a localized title. */
function iconButton(icon, title, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "heurist-icon-button";
  button.title = $HR(title);
  button.setAttribute("aria-label", button.title);
  button.innerHTML = `<span class="${icon}" aria-hidden="true"></span>`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    handler();
  });
  return button;
}

/** Icon-only on/off button. */
function toggleButton(icon, title, handler) {
  const button = iconButton(icon, title, handler);
  button.classList.add("heurist-data-toggle");
  button.setAttribute("aria-pressed", "false");
  return button;
}

/** Reflect a toggle button's state. */
function setPressed(button, pressed) {
  button.classList.toggle("active", pressed);
  button.setAttribute("aria-pressed", String(pressed));
}
