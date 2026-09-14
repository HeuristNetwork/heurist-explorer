/**
 * @file HFilterForm.js
 * @brief Base container reserved for parametrized saved-filter input forms.
 * @package heurist-explorer.ui
 *
 * The persisted parameter schema is intentionally not guessed here. A concrete
 * form renderer can attach fields once that schema is defined.
 */
import { HBaseWidget } from '#shared/widgets';

export class HFilterForm extends HBaseWidget {
  constructor() {
    super();
    this.filter = null;
    this.values = {};
  }

  attach(container, options = {}) {
    super.attach(container, options);
    this.filter = options.filter ?? null;
    this.values = { ...(options.values || {}) };
    return this;
  }

  render() {
    if (!this.container) throw new Error('HFilterForm must be attached before render');
    this.container.classList.add('h-widget', 'h-filter-form');
    this.state = 'rendered';
    return this;
  }

  getValues() { return { ...this.values }; }
  setValues(values = {}) { this.values = { ...values }; return this; }
}
