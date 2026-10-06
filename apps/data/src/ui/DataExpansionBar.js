/**
 * @file DataExpansionBar.js
 * @brief Expansion controls of the Data module: the Expansion button in the panel
 *        header and the "Expansion Rules" section of the panel's drop-down body.
 *
 * The section mirrors the Graph's control panel footer: the list of rules, then
 * the navigator - Filter by selection, previous / level / next, "all levels up
 * to n" and, for authors, Edit rules / Quick expansion / Smart expansion
 * (plan 09 §7, §12).
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
import { runSmartExpansion } from "#shared/ui/SmartExpansionDialog.js";

/** Expansion button plus the "Expansion Rules" section of the control panel. */
export class DataExpansionBar {
  /**
   * @param {object} options Bar dependencies.
   * @param {object} options.api Data public API instance.
   * @param {function(Error, string): void} options.onError Called when an action fails.
   * @param {function(string): void} [options.onMessage] Shows an information message.
   * @param {function(): void} [options.onChange] Called after the controls were re-rendered
   *        (the panel shows or hides its drop-down body).
   * @param {function(boolean): void} [options.onOpenChange] Called when expansion is opened or
   *        closed (the panel shows or hides its drop-down body with it).
   */
  constructor({ api, onError, onMessage = null, onChange = null, onOpenChange = null }) {
    this.api = api;
    this.onError = onError;
    this.onMessage = onMessage;
    this.onChange = onChange;
    this.onOpenChange = onOpenChange;
    this.enabled = true;
    this.countingTypes = false;
    // Expansion "open": the panel body and the level pane are shown together
    this.open = false;
    this.wasActive = false;
  }

  /**
   * Build the header button and the panel section.
   *
   * @returns {{button: HTMLElement, section: HTMLElement}} Elements for the panel header and body.
   */
  create() {
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "h-btn heurist-icon-button"; // h-btn-small heurist-data-expansion-button
    const icon = document.createElement("span");
    icon.className = "fa-solid fa-hexagon-nodes";
    icon.setAttribute("aria-hidden", "true");
    //const caption = document.createElement("span");
    //caption.className = "heurist-data-expansion-caption";
    //caption.textContent = $HR("Expansion");
    this.button.append(icon); //, caption
    this.button.title = $HR("Show or hide the expansion rules and the records linked through them");
    this.button.addEventListener("click", (event) => {
      event.stopPropagation();
      this.setOpen(!this.open);
    });

    this.section = document.createElement("section");
    this.section.className = "heurist-data-expansion-section";
    const heading = document.createElement("h4");
    heading.textContent = $HR("Expansion Rules");
    this.rulesList = document.createElement("div");
    this.rulesList.className = "heurist-data-rules-list";

    this.navigator = document.createElement("div");
    this.navigator.className = "heurist-data-expansion-navigator";
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
    this.editButton.classList.add("heurist-data-edit-rules");
    this.quickButton = iconButton("fa-solid fa-circle-plus",
      "Quick expansion: add a step to every rule - any pointer or relationship to any record type",
      () => this.run(() => this.api.quickExpand()));
    this.smartButton = iconButton("fa-solid fa-wand-magic-sparkles",
      "Smart expansion: choose the record types the next step reaches",
      () => this.run(() => this.smartExpand()));
    // as in Graph: Link, Quick and Smart expansion, the levels navigator, all levels, Edit rules at the right
    this.navigator.append(this.filterButton, this.quickButton, this.smartButton, this.prevButton, this.levelSelector,
      this.nextButton, this.cumulativeButton, this.editButton);

    this.section.append(heading, this.rulesList, this.navigator);
    this.onChanged = () => this.render();
    this.api.addEventListener("heurist-data-expansion-changed", this.onChanged);
    // another source or a changed query: close (also when there were no rules to show)
    this.onReset = () => { if (this.open) this.setOpen(false); };
    this.api.addEventListener("heurist-data-expansion-reset", this.onReset);
    this.render();
    return { button: this.button, section: this.section };
  }

  /**
   * Show or hide the whole feature (option "Expansion rules").
   *
   * @param {boolean} enabled Whether the Expansion button and section are offered.
   * @returns {void}
   */
  setEnabled(enabled) {
    this.enabled = enabled !== false;
    if (!this.enabled && this.open) this.setOpen(false);
    this.render();
  }

  /**
   * Open or close expansion: the panel's drop-down body and the level pane
   * together (the pane only when the DataSource has rules).
   *
   * @param {boolean} open Whether expansion is shown.
   * @returns {void}
   */
  setOpen(open) {
    this.open = open === true && this.enabled;
    this.onOpenChange?.(this.open);
    // until the pane has followed, its state must not re-open/close the section
    this.syncing = true;
    this.run(async () => {
      try { await this.api.setExpansionActive(this.open); }
      finally {
        this.syncing = false;
        this.render();
      }
    });
    this.render();
  }

  /**
   * Whether the panel offers the section: the "Expansion rules" option is on
   * (without rules it shows Quick / Smart expansion to create them).
   *
   * @returns {boolean}
   */
  isAvailable() {
    return this.enabled && Boolean(this.api.getExpansionState());
  }

  /** Refresh every control from the level pane's state. */
  render() {
    if (!this.button) return;
    const state = this.api.getExpansionState();
    // the level pane was hidden by the module (another source or query): close
    if (this.syncing) {
      // the Expansion button is showing/hiding the pane
    } else if (state && this.wasActive && !state.active && this.open) {
      this.open = false;
      this.onOpenChange?.(false);
    } else if (state?.active && !this.open) {
      // shown by Quick / Smart expansion
      this.open = true;
      this.onOpenChange?.(true);
    }
    this.wasActive = Boolean(state?.active);
    this.button.hidden = !this.enabled || !state;
    this.section.hidden = !this.isAvailable();
    if (state) {
      // always enabled: without rules it opens Quick / Smart expansion to create them
      this.button.disabled = false;
      this.button.classList.toggle("active", this.open);
      this.button.setAttribute("aria-pressed", String(this.open));
    }
    if (!this.section.hidden) {
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
      // the level controls work on the shown level pane (the Expansion button)
      const inactive = !state.active;
      this.filterButton.disabled = inactive;
      this.cumulativeButton.disabled = inactive;
      this.levelSelector.disabled = inactive || !state.maxDepth;
      this.prevButton.disabled = inactive || state.level <= 1;
      this.nextButton.disabled = inactive || state.level >= state.maxDepth;
      const canEdit = this.api.canEditRules?.() === true;
      this.editButton.hidden = !canEdit;
      this.quickButton.hidden = !canEdit;
      this.smartButton.hidden = !canEdit;
      this.quickButton.disabled = this.api.canQuickExpand?.() !== true;
      this.smartButton.disabled = this.quickButton.disabled || this.countingTypes;
      this.renderRules(state.rules);
    }
    this.onChange?.();
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

  /**
   * Smart expansion: count the records the next step would reach per record
   * type, let the user choose record types, then expand to those only.
   *
   * @returns {Promise<void>}
   */
  async smartExpand() {
    this.countingTypes = true;
    this.render();
    try {
      await runSmartExpansion(this.api, { onEmpty: (message) => this.onMessage?.(message) });
    } finally {
      this.countingTypes = false;
      this.render();
    }
  }

  /** Run an action, reporting a failure. */
  run(action) {
    Promise.resolve().then(action).catch((error) => this.onError?.(error, "expansion"));
  }

  /** Remove listeners. */
  destroy() {
    this.api.removeEventListener("heurist-data-expansion-changed", this.onChanged);
    this.api.removeEventListener("heurist-data-expansion-reset", this.onReset);
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
