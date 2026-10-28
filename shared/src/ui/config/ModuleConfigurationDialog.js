/**
 * @file ModuleConfigurationDialog.js
 * @brief The common configuration dialog of the presentation modules (plan 29 §11): the
 *        module's form JSON in HEditForm, by mode (configuration, website, publication),
 *        with the Advanced switch, Reset to the defaults and the confirmation of unsaved
 *        changes. Gives the normalized settings.
 *
 *   const settings = await new ModuleConfigurationDialog({
 *     form: mapConfigurationForm, mode: 'configuration', value,
 *     defaults: createMapConfigurationDefaults, normalize: normalizeMapConfigurationSettings,
 *     termsProviders: { smartyTemplates: smartyTemplateTerms(reportTemplateProvider) }
 *   }).open();
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HEditForm } from '../../widgets/edit-form/HEditForm.js';
import { resolveTermsSources } from '../../data/editFormSchema.js';
import { configurationFormMode, hasOptionalItems, mergeSettings } from '../../data/moduleConfigurationForm.js';
import { HMsg } from '../HMsg.js';
import { $HR } from '../i18n/HResource.js';
import './ModuleConfigurationDialog.css';

/** The Advanced switch per form and mode, for this page (as the Map dialog kept it). */
const advancedState = new Map();

/** Button label per mode. */
const SUBMIT_LABELS = Object.freeze({ configuration: 'Apply', website: 'Save', publication: 'Publish' });

/** The configuration dialog of a module, made from its form JSON. */
export class ModuleConfigurationDialog {
  /**
   * @param {object} options
   * @param {object} options.form Form JSON (heurist-edit-form/1 with the plan 29 rules).
   * @param {string} [options.formId] Name of the form (the Advanced switch is kept per form and mode).
   * @param {string} [options.mode='configuration'] Mode; the old names `preferences` and `publish` are accepted.
   * @param {object} [options.value] Settings `{options, config}` (or an envelope); the defaults when missing.
   * @param {() => object} options.defaults Fresh module defaults (Reset).
   * @param {(value: object) => object} options.normalize The module's settings normalizer.
   * @param {string} [options.title] Dialog title.
   * @param {string} [options.submitLabel] Label of the save button (default by mode).
   * @param {boolean} [options.simplified=false] Explorer's simplified interface.
   * @param {Object<string, Function>} [options.termsProviders] `termsSource` lists (resolveTermsSources).
   * @param {object} [options.formOptions] More HEditForm options (special editors, services).
   * @param {HTMLElement|null} [options.slot] Content shown above the form (a mode's own controls).
   * @param {(settings: object, context: {mode: string, form: HEditForm}) => Promise<boolean>|boolean} [options.onSave]
   *        Work after the check; false keeps the dialog open.
   */
  constructor(options = {}) {
    this.options = options;
    this.mode = configurationFormMode(options.mode);
    this.formId = String(options.formId || 'module');
    this.dialogId = `h-module-config-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.form = null;
  }

  /** @returns {object} The normalized settings the dialog opens with. */
  initialSettings() {
    const { value, defaults, normalize } = this.options;
    return normalize(value && typeof value === 'object' ? value : defaults());
  }

  /** @returns {boolean} Whether the Advanced switch is shown (not in publication, not simplified, optional items). */
  hasAdvancedSwitch() {
    return this.mode !== 'publication' && this.options.simplified !== true
      && hasOptionalItems(this.options.form, { mode: this.mode, simplified: this.options.simplified === true });
  }

  /**
   * Open the dialog.
   *
   * @returns {Promise<object|null>} The normalized settings after Apply / Save / Publish; null when cancelled.
   */
  async open() {
    const json = await resolveTermsSources(this.options.form, this.options.termsProviders || {});
    this.settings = this.initialSettings();
    const body = document.createElement('div');
    body.className = 'h-module-config';
    const advancedKey = `${this.formId}:${this.mode}`;
    this.advanced = this.hasAdvancedSwitch() && advancedState.get(advancedKey) === true;
    if (this.hasAdvancedSwitch()) body.append(this._advancedSwitch(advancedKey));
    if (this.options.slot) body.append(this.options.slot);
    const host = document.createElement('div');
    host.className = 'h-module-config-form';
    body.append(host);
    this.form = new HEditForm().attach(host, {
      labelPos: 'inline',
      inlineCheckboxes: true,
      ...(this.options.formOptions || {}),
      form: json,
      values: this.settings,
      mode: this.mode,
      showOptional: this.advanced,
      simplified: this.options.simplified === true,
      keepHidden: true,
      allowHidden: false
    }).render();

    return new Promise((resolve) => {
      let finished = false;
      const finish = async (result) => {
        if (finished) return;
        finished = true;
        HMsg.closeMsgDlg(this.dialogId);
        await this.form?.destroy();
        this.form = null;
        resolve(result);
      };
      this._finish = finish;
      const dialog = HMsg.showMsgDlg(body, {
        dialogId: this.dialogId,
        title: $HR(this.options.title || 'Configuration'),
        preventClose: true,
        buttons: [
          { label: $HR('Reset'), class: 'h-btn h-module-config-reset', onClick: () => this.reset() },
          { label: $HR(this.options.submitLabel || SUBMIT_LABELS[this.mode]), class: 'h-btn h-btn-primary', onClick: () => void this.save() },
          { label: $HR('Cancel'), class: 'h-btn', onClick: () => this.cancel() }
        ]
      });
      dialog?.classList.add('h-module-config-dialog');
      dialog?.addEventListener('close', () => void finish(null), { once: true });
    });
  }

  /** Close without saving (the owner closes the dialog). */
  close() {
    void this._finish?.(null);
  }

  /** @returns {object|null} The settings now in the form (normalized), or null when the dialog is closed. */
  getValue() {
    if (!this.form) return null;
    return this.options.normalize(mergeSettings(this.settings, this.form.getValues()));
  }

  /** Check the form, then the owner's work, then close with the settings. */
  async save() {
    if (!this.form || this._busy || this.form.validate().length) return;
    const settings = this.getValue();
    this._busy = true;
    try {
      if (this.options.onSave && (await this.options.onSave(settings, { mode: this.mode, form: this.form })) === false) return;
    } finally {
      this._busy = false;
    }
    void this._finish?.(settings);
  }

  /** Reset to the module defaults (after a confirmation); nothing is saved yet. */
  reset() {
    if (!this.form) return;
    const confirmId = `${this.dialogId}-confirm`;
    HMsg.showMsgDlg($HR('Reset all settings to their defaults?'), {
      dialogId: confirmId,
      title: $HR('Confirm'),
      buttons: [
        {
          label: $HR('Reset'),
          class: 'h-btn h-btn-danger',
          onClick: () => {
            HMsg.closeMsgDlg(confirmId);
            this._wasReset = true;
            void this.form?.setValues(this.options.normalize(this.options.defaults()));
          }
        },
        { label: $HR('Cancel'), class: 'h-btn', onClick: () => HMsg.closeMsgDlg(confirmId) }
      ]
    });
  }

  /** Close; unsaved changes are confirmed first (publication: "Cancel publish?" always). */
  cancel() {
    if (this.mode === 'publication') {
      const confirmId = `${this.dialogId}-confirm`;
      HMsg.showMsgDlg($HR('Cancel publish?'), {
        dialogId: confirmId,
        title: $HR('Confirm'),
        buttons: [
          {
            label: $HR('Yes'),
            class: 'h-btn h-btn-primary',
            onClick: () => {
              HMsg.closeMsgDlg(confirmId);
              void this._finish?.(null);
            }
          },
          { label: $HR('No'), class: 'h-btn', onClick: () => HMsg.closeMsgDlg(confirmId) }
        ]
      });
      return;
    }
    // a Reset makes the form again: it counts as a change
    if (!this._wasReset && !this.form?.isDirty()) {
      void this._finish?.(null);
      return;
    }
    const confirmId = `${this.dialogId}-confirm`;
    HMsg.showMsgDlg($HR('Discard changes?'), {
      dialogId: confirmId,
      title: $HR('Confirm'),
      buttons: [
        {
          label: $HR('Discard'),
          class: 'h-btn h-btn-danger',
          onClick: () => {
            HMsg.closeMsgDlg(confirmId);
            void this._finish?.(null);
          }
        },
        { label: $HR('Cancel'), class: 'h-btn', onClick: () => HMsg.closeMsgDlg(confirmId) }
      ]
    });
  }

  /** The Advanced switch above the form. */
  _advancedSwitch(key) {
    const label = document.createElement('label');
    label.className = 'h-inline h-module-config-advanced';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.advanced;
    input.addEventListener('change', () => {
      this.advanced = input.checked;
      advancedState.set(key, this.advanced);
      this.form?.setShowOptional(this.advanced);
    });
    const text = document.createElement('span');
    text.className = 'h-i18n';
    text.textContent = $HR('Advanced settings');
    label.append(input, text);
    return label;
  }
}
