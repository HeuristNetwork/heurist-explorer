/**
 * @file ModuleConfigurationDialog.js
 * @brief The common configuration dialog of the presentation modules (plan 29 §11): the
 *        module's form JSON in HEditForm, by mode (configuration, website, publication),
 *        with the Advanced switch, Reset to the defaults and the confirmation of unsaved
 *        changes. Gives the normalized settings. The form itself (`createModuleConfigurationForm`) is also shown
 *        inline, without the dialog (the CMS designer, 2026-11-14).
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
import { applyTermAliases, resolveTermsSources } from '../../data/editFormSchema.js';
import { applyModeDefaults, configurationFormMode, hasOptionalItems, mergeSettings } from '../../data/moduleConfigurationForm.js';
import { HMsg } from '../HMsg.js';
import { $HR } from '../i18n/HResource.js';
import './ModuleConfigurationDialog.css';

/** The Advanced switch per form and mode, for this page (as the Map dialog kept it). */
const advancedState = new Map();

/** Button label per mode. */
const SUBMIT_LABELS = Object.freeze({ configuration: 'Apply', website: 'Save', publication: 'Publish' });

/**
 * The form of a module configuration without a dialog (2026-11-14): the Advanced switch, the module's form JSON in
 * HEditForm and Reset. A new instance (no `value`) and Reset get the module defaults with the defaults of the mode
 * (`modeDefaults` of the fields, e.g. Enable edit off on a website).
 *
 * @param {object} options See ModuleConfigurationDialog (`form`, `formId`, `mode`, `value`, `defaults`, `normalize`,
 *        `simplified`, `termsProviders`, `formOptions`, `slot`); `confirmId`: the dialog id of the Reset question.
 * @returns {Promise<{element: HTMLElement, form: HEditForm, mode: string, getValue: () => object|null,
 *          validate: () => Array<object>, isDirty: () => boolean, reset: (confirm?: boolean) => void,
 *          destroy: () => Promise<void>}>}
 */
export async function createModuleConfigurationForm(options = {}) {
  const mode = configurationFormMode(options.mode);
  const formId = String(options.formId || 'module');
  const json = await resolveTermsSources(options.form, options.termsProviders || {});
  // the module defaults with the defaults of the mode (a new instance, Reset)
  const fresh = () => options.normalize(applyModeDefaults(options.form, options.defaults(), mode));
  const { value } = options;
  const settings = applyTermAliases(json, value && typeof value === 'object' ? options.normalize(value) : fresh());
  const element = document.createElement('div');
  element.className = 'h-module-config';
  const advancedKey = `${formId}:${mode}`;
  const offered = mode !== 'publication' && options.simplified !== true
    && hasOptionalItems(options.form, { mode, simplified: options.simplified === true });
  let advanced = offered && advancedState.get(advancedKey) === true;
  let form = null;
  let wasReset = false;
  if (offered) {
    const label = document.createElement('label');
    label.className = 'h-inline h-module-config-advanced';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = advanced;
    input.addEventListener('change', () => {
      advanced = input.checked;
      advancedState.set(advancedKey, advanced);
      form?.setShowOptional(advanced);
    });
    const text = document.createElement('span');
    text.className = 'h-i18n';
    text.textContent = $HR('Advanced settings');
    label.append(input, text);
    element.append(label);
  }
  if (options.slot) element.append(options.slot);
  const host = document.createElement('div');
  host.className = 'h-module-config-form';
  element.append(host);
  form = new HEditForm().attach(host, {
    labelPos: 'inline',
    inlineCheckboxes: true,
    ...(options.formOptions || {}),
    form: json,
    values: settings,
    mode,
    showOptional: advanced,
    simplified: options.simplified === true,
    keepHidden: true,
    allowHidden: false
  }).render();
  const panel = {
    element,
    form,
    mode,
    getValue: () => (form ? options.normalize(mergeSettings(settings, form.getValues())) : null),
    validate: () => (form ? form.validate() : []),
    // a Reset makes the form again: it counts as a change
    isDirty: () => wasReset || Boolean(form?.isDirty()),
    /** Reset to the defaults (after a confirmation unless `confirm` is false); nothing is saved yet. */
    reset: (confirm = true) => {
      if (!form) return;
      const apply = () => {
        wasReset = true;
        void form?.setValues(fresh());
      };
      if (!confirm) {
        apply();
        return;
      }
      const confirmId = options.confirmId || `h-module-config-reset-${Date.now()}`;
      HMsg.showMsgDlg($HR('Reset all settings to their defaults?'), {
        dialogId: confirmId,
        title: $HR('Confirm'),
        buttons: [
          { label: $HR('Reset'), class: 'h-btn h-btn-danger', onClick: () => { HMsg.closeMsgDlg(confirmId); apply(); } },
          { label: $HR('Cancel'), class: 'h-btn', onClick: () => HMsg.closeMsgDlg(confirmId) }
        ]
      });
    },
    destroy: async () => {
      const current = form;
      form = null;
      await current?.destroy();
    }
  };
  return panel;
}

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

  /** @returns {object} The normalized settings the dialog opens with (a new instance: with the mode defaults). */
  initialSettings() {
    const { value, defaults, normalize } = this.options;
    return normalize(value && typeof value === 'object' ? value : applyModeDefaults(this.options.form, defaults(), this.mode));
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
    this.panel = await createModuleConfigurationForm({ ...this.options, mode: this.mode, formId: this.formId,
      confirmId: `${this.dialogId}-confirm` });
    this.form = this.panel.form;
    const body = this.panel.element;

    return new Promise((resolve) => {
      let finished = false;
      const finish = async (result) => {
        if (finished) return;
        finished = true;
        HMsg.closeMsgDlg(this.dialogId);
        await this.panel?.destroy();
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
    return this.form ? this.panel.getValue() : null;
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

  /** Reset to the module defaults with the mode defaults (after a confirmation); nothing is saved yet. */
  reset() {
    if (this.form) this.panel.reset(true);
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
    if (!this.panel?.isDirty()) {
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
}
