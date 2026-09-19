/**
 * @file HRuleBuilder.js
 * @brief Expansion-rule editor facade. Uses the existing host Rule Builder when available.
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

import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
import { $HR } from '#shared/ui';
import './QuerySourceHelpers.css';

/** Expansion-rule editor facade. Uses the existing host Rule Builder when available. */
export class HRuleBuilder extends HBaseWidget {
  /**
   * @param {object} [options]
   * @param {Function|null} [options.editRules] Opens the host Rule Builder, resolving to the edited rules.
   * @param {Function|null} [options.describeRules] Resolves rules to human-readable summaries.
   */
  constructor({ editRules = null, describeRules = null } = {}) {
    super();
    this.editRules = editRules;
    this.describeRules = describeRules;
    this.rules = [];
  }

  /**
   * @param {Array} rules Expansion rules to display.
   * @returns {HRuleBuilder} this, for chaining.
   */
  setRules(rules) { this.rules = Array.isArray(rules) ? clone(rules) : []; if (this.isRendered) void this._renderRules(); return this; }

  /** @returns {Array} A clone of the current rules. */
  getRules() { return clone(this.rules); }

  /**
   * Open the host Rule Builder (if configured) and adopt its result.
   * @param {object} [options] Forwarded to `editRules`.
   * @returns {Promise<Array>} The resulting rules.
   */
  async open(options = {}) {
    if (typeof this.editRules !== 'function') return this.getRules();
    const result = await this.editRules(this.getRules(), options);
    const rules = Array.isArray(result) ? result : result?.rules;
    if (Array.isArray(rules)) this.setRules(rules);
    return this.getRules();
  }

  /** @returns {HRuleBuilder} this, for chaining. */
  render() {
    if (!this.container) throw new Error('HRuleBuilder must be attached before render');
    this.container.className = 'h-qse-rule-summary';
    this._list = document.createElement('div');
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'h-btn h-btn-small'; edit.textContent = $HR('Edit rules');
    edit.addEventListener('click', async () => { await this.open(); await this._renderRules(); });
    this.container.replaceChildren(this._list, edit); this.state = 'rendered'; void this._renderRules(); return this;
  }

  async _renderRules() {
    if (!this._list) return;
    let rows = this.rules;
    if (typeof this.describeRules === 'function') {
      try { rows = await this.describeRules(this.rules); } catch { /* use raw summaries */ }
    }
    this._list.textContent = rows.length ? rows.map((r, i) => r?.title || r?.description || `${$HR('Rule')} ${i + 1}`).join('; ') : $HR('No expansion rules');
  }
}

function clone(value) { return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
