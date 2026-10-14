/**
 * @file ExplorerToolModule.js
 * @brief A tool (Report, Crosstabs, Actions, Export, Publish) as an Explorer module:
 *        placed in a pane by the Explorer configuration like the presentations.
 *
 * The module owns the tool's panel (caption header and body); the tool itself is
 * created lazily into the body by the `create` callback (its own chunk). DataSource,
 * selection and rule changes reach the tool through the SyncEngine like any module.
 * There is no close button: the tool is shown and hidden like the presentations
 * (toolbar button, pane tab). See docs/development/16 Compact-Toolbar-Plan.md, Part 2.
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

import { $HR } from '#shared/ui';
import { ExplorerModule, normalizeIds } from '../core/ExplorerModule.js';

/** Explorer module adapter around a lazily created tool. */
export class ExplorerToolModule extends ExplorerModule {
  /**
   * @param {object} options Module configuration.
   * @param {string} options.id Module id.
   * @param {string} options.type Tool type (`report`, `crosstabs`, `actions`, `export`, `publish`).
   * @param {HTMLElement} options.container Module slot.
   * @param {string} options.title Header caption.
   * @param {function(HTMLElement, ExplorerToolModule): (Promise<object|null>|object|null)} [options.create]
   *        Creates the tool in the body; the tool may have `setDataSource`, `setSelection`,
   *        `setRules`, `resize`, `hasUnsavedChanges` and `destroy`. Without it the
   *        tool is a "not implemented yet" placeholder.
   */
  constructor({ id, type, container, title, create = null }) {
    super({ id, type, container });
    this.title = title || type;
    this.create = typeof create === 'function' ? create : null;
    this.tool = null;
    this.body = null;
  }

  /**
   * Build the panel and start creating the tool.
   *
   * @returns {Promise<ExplorerToolModule>}
   */
  async mount() {
    const panel = document.createElement('div');
    panel.className = `h-explorer-tool-workspace h-explorer-tool-${this.type}`;
    const header = document.createElement('div');
    header.className = 'heurist-source-header h-explorer-tool-workspace-header';
    const caption = document.createElement('span');
    caption.className = 'h-explorer-tool-workspace-title';
    caption.textContent = $HR(this.title);
    header.append(caption);
    this.body = document.createElement('div');
    this.body.className = `h-explorer-tool-workspace-body h-explorer-tool-${this.type}-body`;
    panel.append(header, this.body);
    this.container.replaceChildren(panel);

    if (!this.create) {
      this.body.textContent = `${$HR(this.title)}: ${$HR('Not implemented yet')}`;
      return this;
    }
    this.body.textContent = $HR('Loading...');
    // not awaited: Explorer goes on while the tool's chunk loads
    this._pending = Promise.resolve()
      .then(() => this.create(this.body, this))
      .then((tool) => {
        if (this._destroyed) void tool?.destroy?.();
        else this.tool = tool || null;
        return this.tool;
      })
      .catch((error) => {
        if (this.body) this.body.textContent = error?.message || String(error);
        console.error(`Unable to open the ${this.type} tool`, error);
        return null;
      });
    return this;
  }

  /** @returns {Promise<object|null>} The tool once created (null when it failed). */
  ready() {
    return this._pending || Promise.resolve(this.tool);
  }

  /** @inheritdoc */
  async setDataSource(source) {
    await super.setDataSource(source);
    await this.tool?.setDataSource?.(source);
    return source;
  }

  /** @inheritdoc */
  async setSelection(ids) {
    this.selection = normalizeIds(ids);
    await this.tool?.setSelection?.(this.selection);
    return this.selection;
  }

  /**
   * The DataSource rules changed.
   *
   * @param {Array<object>} rules New expansion rules.
   * @returns {Promise<void>}
   */
  async setRules(rules) {
    if (this.dataSource) this.dataSource = { ...this.dataSource, request: { ...(this.dataSource.request || {}), rules } };
    await this.tool?.setRules?.(rules);
  }

  /** @inheritdoc */
  async resize() {
    await this.tool?.resize?.();
    return true;
  }

  /** @returns {boolean} Whether the tool has unsaved work (e.g. a report template). */
  hasUnsavedChanges() {
    return this.tool?.hasUnsavedChanges?.() === true;
  }

  /** @inheritdoc */
  async destroy() {
    this._destroyed = true;
    await this.tool?.destroy?.();
    this.tool = null;
    this.body = null;
    this.container?.replaceChildren();
  }
}
