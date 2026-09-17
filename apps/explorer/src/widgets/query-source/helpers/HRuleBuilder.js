import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
import { $HR } from '#shared/ui';
import './QuerySourceHelpers.css';

/** Expansion-rule editor facade. Uses the existing host Rule Builder when available. */
export class HRuleBuilder extends HBaseWidget {
  constructor({ editRules = null, describeRules = null } = {}) {
    super();
    this.editRules = editRules;
    this.describeRules = describeRules;
    this.rules = [];
  }
  setRules(rules) { this.rules = Array.isArray(rules) ? clone(rules) : []; if (this.isRendered) void this._renderRules(); return this; }
  getRules() { return clone(this.rules); }
  async open(options = {}) {
    if (typeof this.editRules !== 'function') return this.getRules();
    const result = await this.editRules(this.getRules(), options);
    const rules = Array.isArray(result) ? result : result?.rules;
    if (Array.isArray(rules)) this.setRules(rules);
    return this.getRules();
  }
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
