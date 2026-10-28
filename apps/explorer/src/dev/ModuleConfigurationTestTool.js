/**
 * @file ModuleConfigurationTestTool.js
 * @brief Temporary tool "Test module configuration" of the Options menu (plan 29 §13): the
 *        configuration form of a presentation module by mode (configuration, website,
 *        publication), with the Advanced and Simplified switches; the settings as JSON,
 *        the editable form JSON and the table of options for comparing with the plan.
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
import { resolveTermsSources, setPath } from '#shared/data/editFormSchema.js';
import { ReportTemplateProvider } from '#shared/data/ReportTemplateProvider.js';
import {
  CONFIGURATION_FORM_MODES, describeConfigurationForm, hasOptionalItems, mergeSettings, smartyTemplateTerms
} from '#shared/data/moduleConfigurationForm.js';
import './EditFormTestTool.css';
import './ModuleConfigurationTestTool.css';

const DIALOG_ID = 'h-module-config-test-dialog';

/** The modules and their configuration entries (lazy chunks). */
const MODULES = Object.freeze({
  map: async () => (await import('../../../map/src/configuration.js')).mapConfiguration,
  timeline: async () => (await import('../../../timeline/src/configuration.js')).timelineConfiguration,
  graph: async () => (await import('../../../graph/src/configuration.js')).graphConfiguration,
  data: async () => (await import('../../../data/src/configuration.js')).dataConfiguration,
  recordview: async () => (await import('../../../recordview/src/configuration.js')).recordViewConfiguration
});

/** Dialog of the test tool. */
export class ModuleConfigurationTestTool {
  /**
   * @param {object} options
   * @param {() => Promise<object>} [options.services] Input services (RecordEditorHost.formServices).
   * @param {string} [options.baseUrl] Heurist base URL (the Smarty template list).
   * @param {string} [options.database] Database name.
   */
  constructor(options = {}) {
    this.options = options;
    this.form = null;
    this.layout = null;
    this.settings = {
      module: 'map', mode: 'configuration', advanced: false, simplified: false, labelPos: 'inline', inlineCheckboxes: true
    };
    this.templates = smartyTemplateTerms(new ReportTemplateProvider({ baseUrl: options.baseUrl, database: options.database }));
  }

  /**
   * Open the dialog.
   *
   * @returns {Promise<void>} When the dialog is shown.
   */
  async open() {
    this.services = (await this.options.services?.()) || {};
    const host = document.createElement('div');
    host.className = 'h-edit-form-test h-module-config-test';
    host.append(this._renderToolbar());
    const layoutHost = document.createElement('div');
    layoutHost.className = 'h-edit-form-test-layout';
    host.append(layoutHost);

    this.formHost = document.createElement('div');
    this.formHost.className = 'h-edit-form-test-form';
    this.layout = new HCardinalLayout(layoutHost, { westSize: 520, minWest: 320, minCenterWidth: 280 });
    this.layout.setContent('west', this.formHost);
    this.layout.show('west');
    this.layout.setContent('center', this._renderJsonPane());

    const dialog = HMsg.showMsgDlg(host, {
      dialogId: DIALOG_ID,
      title: $HR('Test module configuration'),
      buttons: [{ label: $HR('Close'), class: 'h-btn', onClick: () => HMsg.closeMsgDlg(DIALOG_ID) }]
    });
    dialog?.classList.add('h-dialog-edit-form-test');
    dialog?.addEventListener('close', () => void this.destroy(), { once: true });
    await this._loadModule();
  }

  /** @returns {Promise<void>} Completion after the form is removed. */
  async destroy() {
    await this.form?.destroy();
    this.form = null;
    this.layout?.destroy();
    this.layout = null;
  }

  /** Module, mode, Advanced, Simplified, Labels; Validate and Reset. */
  _renderToolbar() {
    const bar = document.createElement('div');
    bar.className = 'h-edit-form-test-toolbar';
    const select = (label, key, choices, onChange) => {
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
        onChange();
      });
      caption.append(' ', control);
      bar.append(caption);
    };
    const check = (label, key, onChange) => {
      const caption = document.createElement('label');
      const control = document.createElement('input');
      control.type = 'checkbox';
      control.checked = this.settings[key];
      control.addEventListener('change', () => {
        this.settings[key] = control.checked;
        onChange();
      });
      caption.append(control, ` ${$HR(label)}`);
      bar.append(caption);
      return control;
    };
    select('Module', 'module', Object.keys(MODULES), () => void this._loadModule());
    select('Mode', 'mode', CONFIGURATION_FORM_MODES, () => this._renderForm());
    this.advancedCheck = check('Advanced', 'advanced', () => {
      this.form?.setShowOptional(this.settings.advanced);
      this._showResult();
    });
    check('Simplified', 'simplified', () => this._renderForm());
    select('Labels', 'labelPos', ['inline', 'above', 'auto'], () => this._renderForm());
    check('Checkboxes in a row', 'inlineCheckboxes', () => this._renderForm());
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
    button('Reset to defaults', false, () => this._renderForm(this.module.normalize(this.module.defaults())));
    return bar;
  }

  /** Right side: tabs Result JSON, Form JSON and Options table. */
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
    this.source.setAttribute('aria-label', $HR('Form JSON'));
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'h-btn h-btn-primary h-i18n';
    apply.textContent = $HR('Apply');
    apply.addEventListener('click', () => this._applySource());
    this.sourceMessage = document.createElement('div');
    this.sourceMessage.className = 'h-edit-form-test-message';
    const sourceBar = document.createElement('div');
    sourceBar.className = 'h-edit-form-test-panel-bar';
    sourceBar.append(apply, this.sourceMessage);
    const sourcePanel = document.createElement('div');
    sourcePanel.className = 'h-edit-form-test-panel';
    sourcePanel.append(sourceBar, this.source);
    const resultPanel = document.createElement('div');
    resultPanel.className = 'h-edit-form-test-panel';
    resultPanel.append(this.result);
    this.tablePanel = document.createElement('div');
    this.tablePanel.className = 'h-edit-form-test-panel h-module-config-test-table';

    const tabs = [['Result JSON', resultPanel], ['Form JSON', sourcePanel], ['Options table', this.tablePanel]];
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
    pane.append(strip, resultPanel, sourcePanel, this.tablePanel);
    sourcePanel.hidden = true;
    this.tablePanel.hidden = true;
    buttons[0].classList.add('is-active');
    return pane;
  }

  /** Load the configuration entry of the chosen module and show its form with the defaults. */
  async _loadModule() {
    this.module = await MODULES[this.settings.module]();
    this.json = await resolveTermsSources(this.module.form, { smartyTemplates: this.templates });
    this.source.value = JSON.stringify(this.module.form, null, 2);
    this._renderForm(this.module.normalize(this.module.defaults()));
  }

  /**
   * Render the form of the current JSON and mode. `this.base` holds the settings with the
   * user's changes but without the forced values of a mode, so another mode starts from them.
   */
  _renderForm(settings = null) {
    const previous = this.form;
    this.form = null;
    void previous?.destroy();
    this.formHost.replaceChildren();
    if (settings) this.base = settings;
    const host = document.createElement('div');
    this.formHost.append(host);
    const context = { mode: this.settings.mode, simplified: this.settings.simplified };
    this.advancedCheck.disabled = this.settings.mode === 'publication' || this.settings.simplified
      || !hasOptionalItems(this.json, context);
    this.form = new HEditForm().attach(host, {
      ...this.services,
      labelPos: this.settings.labelPos,
      inlineCheckboxes: this.settings.inlineCheckboxes,
      form: this.json,
      values: this.base,
      mode: this.settings.mode,
      showOptional: this.settings.advanced && !this.advancedCheck.disabled,
      simplified: this.settings.simplified,
      keepHidden: true,
      onChange: (form, change) => {
        if (change.name) setPath(this.base, change.name, change.value ?? null);
        this._showResult();
      }
    }).render();
    this.sourceMessage.textContent = this.form.warnings.join('; ');
    this._showResult();
  }

  /** @returns {object|undefined} The settings now in the form (normalized). */
  _settings() {
    if (!this.form || !this.module) return undefined;
    return this.module.normalize(mergeSettings(this.base, this.form.getValues()));
  }

  /** Read the edited form JSON and render it. */
  async _applySource() {
    let json;
    try {
      json = JSON.parse(this.source.value);
    } catch (error) {
      this.sourceMessage.textContent = `${$HR('Not valid JSON')}: ${error.message}`;
      return;
    }
    this.json = await resolveTermsSources(json, { smartyTemplates: this.templates });
    this._renderForm();
  }

  /** The settings envelope (and the problems of a check), and the options table. */
  _showResult(extra = null) {
    if (!this.form || !this.result) return;
    const settings = this.module.serialize(this._settings());
    const result = { settings, dirty: this.form.isDirty(), ...(extra || {}) };
    this.result.value = JSON.stringify(result, null, 2);
    this._renderTable();
  }

  /** Options table of the form for the mode (describeConfigurationForm). */
  _renderTable() {
    const rows = describeConfigurationForm(this.json, {
      mode: this.settings.mode, showOptional: this.settings.advanced, simplified: this.settings.simplified
    });
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const label of ['system name', 'caption', 'type', 'section', 'adv', 'shown', 'forced', 'default', 'help']) {
      const cell = document.createElement('th');
      cell.textContent = label;
      head.append(cell);
    }
    const body = table.createTBody();
    for (const row of rows) {
      const line = body.insertRow();
      line.classList.toggle('is-hidden', !row.shown);
      const values = [
        row.key,
        row.noUI ? '(no UI)' : row.caption,
        row.type + (row.termsSource ? ` (${row.termsSource})` : ''),
        row.section,
        row.advanced ? 'x' : '',
        row.shown ? 'x' : '',
        row.forced ? `=${JSON.stringify(row.forced.value)}` : '',
        row.default === null ? '' : JSON.stringify(row.default),
        row.help
      ];
      for (const value of values) line.insertCell().textContent = value;
    }
    this.tablePanel.replaceChildren(table);
  }
}
