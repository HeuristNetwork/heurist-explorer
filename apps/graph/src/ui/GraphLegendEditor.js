/**
 * @file GraphLegendEditor.js
 * @brief Session configuration; persisted Dataset editing is delegated to the host.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import { showGraphMessage } from "./graphMessages.js";
import { $HR } from '#shared/ui';

/** Modal dialog for editing the current session's initial-link definitions. */
export class GraphLegendEditor {
  /**
   * @param {object} options Editor dependencies.
   * @param {object} options.api Graph public API instance.
   * @param {Function} [options.onError] Called with the error when applying changes fails.
   */
  constructor({ api, onError }) { Object.assign(this, { api, onError }); }

  /**
   * Build and show the modal dialog, pre-filled with the active session's link definitions.
   *
   * @returns {void}
   */
  open() {
    const app = this.api.application;
    const generation = app.generation;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'heurist-graph-legend-editor h-dialog';
    const header = document.createElement('header');
    header.className = 'h-dialog-header';
    const body = document.createElement('div');
    body.className = 'h-dialog-body';
    const heading = document.createElement('h2');
    heading.className = 'h-dialog-title';
    heading.textContent = $HR('Define initial links');
    this.dialog.setAttribute('aria-label', heading.textContent);
    const note = document.createElement('p');
    note.textContent = $HR('Changes apply to this viewing session. Use Edit Dataset to edit the saved definition.');
    header.append(heading);
    body.append(note);
    this.dialog.append(header, body);
    const field = (title, value, multiline = false) => {
      const label = document.createElement('label'); label.textContent = $HR(title);
      const input = document.createElement(multiline ? 'textarea' : 'input'); input.className = "h-input"; input.value = value;
      label.append(input); body.append(label); return input;
    };
    const current = app.source?.links ?? app.dataset?.links ?? app.config.links ?? 'all';
    const links = field('Links (one definition per line, or all)', Array.isArray(current) ? current.join('\n') : current, true);
    links.placeholder = '10:lt240:48\n10:rt3260:10';
    const footer = document.createElement('footer'); footer.className = 'h-dialog-footer';
    const cancel = document.createElement('button'); cancel.textContent = $HR('Cancel'); cancel.type = 'button'; cancel.className = 'h-btn';
    cancel.addEventListener('click', () => this.destroy());
    const save = document.createElement('button'); save.type = 'button'; save.className = 'h-btn h-btn-primary'; save.textContent = $HR('Apply');
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        if (app.generation !== generation) throw new Error($HR('The active graph changed. Reopen this editor.'));
        if (app.datasetAvailable === false || app.config.persistedSettings?.options?.interaction?.readonly === true || app.config.persistedSettings?.options?.interaction?.editEnabled === false) throw new Error($HR('Editing is disabled.'));
        const value = links.value.trim();
        if (!value) throw new Error($HR('Enter link definitions or all.'));
        const specs = value.toLowerCase() === 'all' ? 'all' : value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        if (specs !== 'all' && specs.some(s => !/^\d+:(?:lt|rt)\d+:\d+$/.test(s))) throw new Error($HR('Use link definitions such as 10:lt240:48 or 10:rt3260:10.'));
        await app.load({ query: app.config.query, links: specs, internal: true, remember: false });
        if (app.source) app.source.links = specs;
        this.destroy();
      } catch (error) {
        if (this.onError) this.onError(error);
        else showGraphMessage(error, { error: true });
      } finally { save.disabled = false; }
    });
    footer.append(cancel, save); this.dialog.append(footer);
    const dialog = this.dialog;
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (this.dialog === dialog) this.dialog = null;
    });
    document.body.append(this.dialog); this.dialog.showModal();
  }

  /**
   * Close and remove the dialog.
   *
   * @returns {void}
   */
  destroy() { this.dialog?.close(); this.dialog?.remove(); this.dialog = null; }
}
