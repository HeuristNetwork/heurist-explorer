/**
 * @file EditFormTestTool.js
 * @brief Temporary tool "Test edit form" of the left rail (plan 14a): HEditForm of
 *        a test JSON with every field type on the left, the result JSON and the
 *        editable form JSON on the right. For agreeing the JSON format and for
 *        testing the HInput classes; removed when the format is agreed.
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

import { HMsg, $HR } from '#shared/ui';
import { HEditForm } from '#shared/widgets/edit-form/HEditForm.js';
import { HCardinalLayout } from '#shared/widgets/layout/HCardinalLayout.js';
import sample from './editFormTestSample.json';
import './EditFormTestTool.css';

const DIALOG_ID = 'h-edit-form-test-dialog';

/** Test special editor: Edit puts a time stamp around the value. */
const SPECIAL_EDITORS = {
  'test-stamp': {
    json: true,
    describe: (value) => {
      try {
        const parsed = JSON.parse(value);
        return parsed?.edited ? `${$HR('Edited at')} ${parsed.edited}` : '';
      } catch {
        return '';
      }
    },
    edit: async (value) => JSON.stringify({ edited: new Date().toISOString(), previous: parseOrText(value) }, null, 2)
  }
};

/** Dialog of the test tool. */
export class EditFormTestTool {
  /**
   * @param {object} options
   * @param {() => Promise<object>} options.services Input services (RecordEditorHost.formServices).
   */
  constructor(options = {}) {
    this.options = options;
    this.form = null;
    this.layout = null;
    this.settings = { labelPos: 'auto', inputPos: 'stack', allowHidden: true, readOnly: false };
  }

  /**
   * Open the dialog.
   *
   * @returns {Promise<void>} When the dialog is shown.
   */
  async open() {
    this.services = (await this.options.services?.()) || {};
    this.json = withVocabulary(structuredClone(sample), this.services.dbdefs);
    const host = document.createElement('div');
    host.className = 'h-edit-form-test';
    host.append(this._renderToolbar());
    const layoutHost = document.createElement('div');
    layoutHost.className = 'h-edit-form-test-layout';
    host.append(layoutHost);

    this.formHost = document.createElement('div');
    this.formHost.className = 'h-edit-form-test-form';
    this.layout = new HCardinalLayout(layoutHost, { westSize: 560, minWest: 320, minCenterWidth: 280 });
    this.layout.setContent('west', this.formHost);
    this.layout.show('west');
    this.layout.setContent('center', this._renderJsonPane());

    const dialog = HMsg.showMsgDlg(host, {
      dialogId: DIALOG_ID,
      title: $HR('Test edit form'),
      buttons: [{ label: $HR('Close'), class: 'h-btn', onClick: () => HMsg.closeMsgDlg(DIALOG_ID) }]
    });
    dialog?.classList.add('h-dialog-edit-form-test');
    dialog?.addEventListener('close', () => void this.destroy(), { once: true });
    this._renderForm();
  }

  /** @returns {Promise<void>} Completion after the form is removed. */
  async destroy() {
    await this.form?.destroy();
    this.form = null;
    this.layout?.destroy();
    this.layout = null;
  }

  /** Layout options of the form, Validate and Reset. */
  _renderToolbar() {
    const bar = document.createElement('div');
    bar.className = 'h-edit-form-test-toolbar';
    const select = (label, key, choices) => {
      const caption = document.createElement('label');
      caption.className = 'h-i18n';
      caption.textContent = $HR(label);
      const control = document.createElement('select');
      control.className = 'h-select';
      for (const value of choices) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        control.append(option);
      }
      control.value = this.settings[key];
      control.addEventListener('change', () => {
        this.settings[key] = control.value;
        this._renderForm();
      });
      caption.append(' ', control);
      bar.append(caption);
    };
    const check = (label, key) => {
      const caption = document.createElement('label');
      const control = document.createElement('input');
      control.type = 'checkbox';
      control.checked = this.settings[key];
      control.addEventListener('change', () => {
        this.settings[key] = control.checked;
        this._renderForm();
      });
      caption.append(control, ` ${$HR(label)}`);
      bar.append(caption);
    };
    select('Labels', 'labelPos', ['auto', 'inline', 'above']);
    select('Inputs', 'inputPos', ['stack', 'flow']);
    check('Hidden switch', 'allowHidden');
    check('Read only', 'readOnly');
    const button = (label, primary, onClick) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `h-btn${primary ? ' h-btn-primary' : ''} h-i18n`;
      element.textContent = $HR(label);
      element.addEventListener('click', onClick);
      bar.append(element);
    };
    button('Validate', true, () => {
      const problems = this.form?.validate() || [];
      this._showResult(problems.length ? { problems } : null);
    });
    button('Reset values', false, () => this._renderForm(null));
    return bar;
  }

  /** Right side: tabs Result JSON and Form JSON. */
  _renderJsonPane() {
    const pane = document.createElement('div');
    pane.className = 'h-edit-form-test-json';
    const strip = document.createElement('div');
    strip.className = 'h-edit-form-test-tabs';
    this.result = document.createElement('textarea');
    this.result.className = 'h-input h-edit-form-test-text';
    this.result.readOnly = true;
    this.result.setAttribute('aria-label', $HR('Result JSON'));
    this.source = document.createElement('textarea');
    this.source.className = 'h-input h-edit-form-test-text';
    this.source.value = JSON.stringify(this.json, null, 2);
    this.source.setAttribute('aria-label', $HR('Form JSON'));
    this.sourcePanel = document.createElement('div');
    this.sourcePanel.className = 'h-edit-form-test-panel';
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'h-btn h-btn-primary h-i18n';
    apply.textContent = $HR('Apply');
    this.sourceMessage = document.createElement('div');
    this.sourceMessage.className = 'h-edit-form-test-message';
    apply.addEventListener('click', () => this._applySource());
    const sourceBar = document.createElement('div');
    sourceBar.className = 'h-edit-form-test-panel-bar';
    sourceBar.append(apply, this.sourceMessage);
    this.sourcePanel.append(sourceBar, this.source);
    this.resultPanel = document.createElement('div');
    this.resultPanel.className = 'h-edit-form-test-panel';
    this.resultPanel.append(this.result);

    const tabs = [['Result JSON', this.resultPanel], ['Form JSON', this.sourcePanel]];
    const buttons = tabs.map(([label, panel], index) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'h-edit-form-tab h-i18n';
      tab.textContent = $HR(label);
      tab.addEventListener('click', () => {
        for (const [position, [, other]] of tabs.entries()) {
          other.hidden = position !== index;
          buttons[position].classList.toggle('is-active', position === index);
        }
      });
      return tab;
    });
    strip.append(...buttons);
    pane.append(strip, this.resultPanel, this.sourcePanel);
    this.sourcePanel.hidden = true;
    buttons[0].classList.add('is-active');
    return pane;
  }

  /** Render the form of the current JSON (keeping the values unless `values` is null). */
  _renderForm(values = this.form ? this.form.getValues() : undefined) {
    const previous = this.form;
    this.form = null;
    void previous?.destroy();
    this.formHost.replaceChildren();
    const host = document.createElement('div');
    this.formHost.append(host);
    this.form = new HEditForm().attach(host, {
      ...this.services,
      ...this.settings,
      form: this.json,
      values: values || null,
      specialEditors: SPECIAL_EDITORS,
      // point 4 of the request: behaviour by code after render and on a change
      onReady: (form) => {
        form.showGroup('advanced', form.getValue('enabled') === true);
        const slot = form.getSlot('advanced-note');
        if (slot) slot.textContent = $HR('This group is shown by code: showGroup() in onReady and onChange.');
      },
      onChange: (form, change) => {
        if (change.name === 'enabled') form.showGroup('advanced', change.value === true);
        this._showResult();
      }
    }).render();
    this.sourceMessage.textContent = this.form.warnings.join('; ');
    this._showResult();
  }

  /** Read the edited form JSON and render it. */
  _applySource() {
    try {
      this.json = JSON.parse(this.source.value);
    } catch (error) {
      this.sourceMessage.textContent = `${$HR('Not valid JSON')}: ${error.message}`;
      return;
    }
    this._renderForm();
  }

  /** The values of the form (and the problems of a check). */
  _showResult(extra = null) {
    if (!this.form || !this.result) return;
    const result = { values: this.form.getValues(), dirty: this.form.isDirty(), ...(extra || {}) };
    this.result.value = JSON.stringify(result, null, 2);
  }
}

/** The vocabulary of the first enum field of the database for the vocabulary test field. */
function withVocabulary(json, dbdefs) {
  let vocabulary = 0;
  for (const rectype of dbdefs?.rectypes?.() || []) {
    const field = (dbdefs.fields(rectype.id) || []).find((item) => item.type === 'enum' && dbdefs.vocabRoot(item.id) > 0);
    if (field) {
      vocabulary = dbdefs.vocabRoot(field.id);
      break;
    }
  }
  for (const group of json.groups || []) {
    for (const field of group.children || []) {
      if (field.name === 'enumVocabulary' && !field.vocabulary) field.vocabulary = vocabulary || null;
    }
  }
  return json;
}

/** @returns {*} Parsed JSON, or the text itself. */
function parseOrText(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value ?? null;
  }
}
