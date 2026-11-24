/**
 * @file HPresentationList.js
 * @brief The List of a presentation type (plan 27q3 §2.1): its configurations on the left (HRecordManager of the
 *        Presentation sets of some kinds), the outputs of the selected one on the right.
 *
 * Left: the title of the type and **New**; the list with search, sort and *Show owners*. A row shows the Edit icon
 * (leftmost, opens the Editor), visibility and owner, the title, the kind and the short summary (2-3), and the row
 * tools Properties (the record editor) and Delete. A click selects the row and shows its outputs on the right; a double
 * click opens the Editor. Delete asks first and tells the use of the item (`describeUse`). The list is in a pane or full
 * screen; with no configuration yet `onEmpty` is called (the Editor at once, 27q3 §2.2).
 *
 * The view mode is `list` (one row and the summary under it): the Extended view of HRecordManager shows the whole record
 * with its Configuration JSON (deviation from 27q3 §2.1, 2026-11-24).
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

import { HBaseWidget } from '../HBaseWidget.js';
import { HRecordManager } from '../record-manager/HRecordManager.js';
import { HCardinalLayout } from '../layout/HCardinalLayout.js';
import { $HR } from '../../ui/i18n/HResource.js';
import { HMsg } from '../../ui/HMsg.js';
import { askChoice } from '../../ui/askChoice.js';
import { element, presentationButton } from './presentationShell.js';
import { presentationKindTerms } from './presentationKinds.js';
import './HPresentationList.css';

/** The List of a presentation type. */
export class HPresentationList extends HBaseWidget {
  /**
   * @param {HTMLElement} container Host.
   * @param {object} options
   * @param {object} options.apiClient HeuristApiClient.
   * @param {object} options.dbdefs HDbDefs.
   * @param {string[]} options.kinds Kinds of the Presentation sets listed (presentationKinds.js: crosstabs, storymap,
   *        export, cardreport, listreport).
   * @param {string} options.title Title of the list ("Crosstabs").
   * @param {string} [options.newLabel='New'] Label of New.
   * @param {function(): *} [options.onNew] New (none: no button).
   * @param {Array<{icon: string, label: string, title?: string, run: Function}>} [options.barTools] More buttons beside New
   *        (Import of the reports).
   * @param {function(number): *} [options.onEdit] Open the Editor of an item.
   * @param {function(number): Promise<{saved?: boolean}>} [options.editRecord] The record editor (Properties).
   * @param {function(number): Promise<string|null>} [options.describeUse] A text of the use of an item before Delete
   *        ("Used by 2 website pages"); a text that starts with "!" refuses the delete.
   * @param {function(number): void} [options.onDeleted] An item was deleted.
   * @param {function(number|null, HTMLElement): Promise<void>|void} [options.renderOutputs] Fill the right panel for the
   *        selected item (null: none selected).
   * @param {function(): void} [options.onEmpty] Called once when there is no item yet.
   * @param {number} [options.selectedId] The item selected at first.
   * @param {boolean} [options.canEdit=true] The user may change records (Properties, Delete, New).
   * @param {string} [options.baseUrl] Heurist base URL (record type icons).
   * @param {string} [options.database] Database name.
   * @returns {HPresentationList}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.selectedId = Number(options.selectedId) || null;
    return this;
  }

  /** @returns {{rectype: number, type: number, summary: number, terms: number[]}} Ids of the database. */
  ids() {
    const id = (code) => Number(this.options.dbdefs?.dbconst?.(code)) || 0;
    return {
      rectype: id('RT_PRESENTATION_SET'), type: id('DT_PRESENTATION_TYPE'), summary: id('DT_SHORT_SUMMARY'),
      terms: presentationKindTerms(this.options.dbdefs, this.options.kinds || [])
    };
  }

  /**
   * Build the two panes and load the list.
   *
   * @returns {Promise<HPresentationList>}
   */
  async render() {
    const ids = this.ids();
    const root = element('div', 'h-presentation-list');
    this.container.replaceChildren(root);
    this.layout = new HCardinalLayout(root, { westRatio: 0.5, minWest: 240, minCenterWidth: 260 });
    const west = element('div', 'h-presentation-list-west');
    const bar = element('div', 'h-presentation-list-bar', west);
    element('span', 'h-presentation-list-title', bar).textContent = $HR(this.options.title || '');
    if (typeof this.options.onNew === 'function' && this.options.canEdit !== false) {
      presentationButton(bar, { icon: 'fa-plus', label: this.options.newLabel || 'New', title: this.options.newLabel || 'New',
        run: () => this.options.onNew() });
    }
    for (const tool of this.options.barTools || []) presentationButton(bar, { caption: false, ...tool });
    this.listHost = element('div', 'h-presentation-list-records', west);
    this.outputs = element('div', 'h-presentation-list-outputs');
    this.layout.setContent('west', west);
    this.layout.setContent('center', this.outputs);
    if (!ids.rectype || !ids.type || !ids.terms.length) {
      element('p', 'h-muted', this.listHost).textContent = $HR('This database has no Presentation sets of this kind (2-1112)');
      return this;
    }
    this.manager = new HRecordManager().attach(this.listHost, {
      apiClient: this.options.apiClient,
      dbdefs: this.options.dbdefs,
      selectMode: 'manager',
      recordTypes: [ids.rectype],
      allowAddition: false,
      filter: false,
      // the kinds of this list (an enum field matches any of its terms)
      query: [{ [`f:${ids.type}`]: ids.terms.join(',') }],
      listFields: [ids.type, ids.summary].filter(Boolean),
      recordTools: (record) => this._rowTools(record, ids),
      editRecord: typeof this.options.onEdit === 'function' ? (id) => this.options.onEdit(Number(id)) : undefined,
      listOptions: {
        viewMode: 'list',
        pageLength: 500,
        listTools: true,
        controls: { viewMode: false, selectionActions: false, pageSize: false },
        interaction: { popupEnabled: false, adminInfoEnabled: true }
      },
      baseUrl: this.options.baseUrl,
      database: this.options.database
    });
    this.listen(this.listHost, 'h-record-manager-selection', (event) => {
      const selected = event.detail?.ids || [];
      void this.select(selected.length ? Number(selected[selected.length - 1]) : null);
    });
    this.listen(this.listHost, 'h-record-manager-error', (event) => HMsg.showMsgErr(event.detail?.error?.message || String(event.detail?.error)));
    await this.manager.render();
    await this.select(this.selectedId);
    if (typeof this.options.onEmpty === 'function' && (await this.count()) === 0) this.options.onEmpty();
    this.state = 'rendered';
    return this;
  }

  /** @returns {Promise<number>} The number of items of the list (the user's view). */
  async count() {
    const ids = this.ids();
    const answer = await this.options.apiClient.get('/records', {
      query: { q: JSON.stringify([{ t: String(ids.rectype) }, { [`f:${ids.type}`]: ids.terms.join(',') }]), detail: 'ids', limit: 1 }
    }).catch(() => null);
    const data = answer?.data ?? answer;
    const total = Number(data?.pagination?.total ?? data?.total ?? data?.count);
    if (Number.isFinite(total)) return total;
    return (data?.ids || data?.records || []).length;
  }

  /**
   * Select an item: its outputs on the right.
   *
   * @param {number|null} id
   * @returns {Promise<void>}
   */
  async select(id) {
    this.selectedId = Number(id) || null;
    this.outputs.replaceChildren();
    if (!this.selectedId) {
      element('p', 'h-muted h-presentation-list-hint', this.outputs).textContent = $HR('Select an item of the list');
    }
    await this.options.renderOutputs?.(this.selectedId, this.outputs);
  }

  /** Load the list again (after a save in the Editor), and the outputs of the selection. */
  async reload() {
    await this.manager?.reload();
    await this.select(this.selectedId);
  }

  /** @returns {Promise<void>} */
  async destroy() {
    await this.manager?.destroy();
    this.manager = null;
    this.layout?.destroy();
    this.layout = null;
    await super.destroy();
  }

  // ------------------------------------------------------------------ rows

  /** @private Edit (leftmost), the kind, the summary, Properties, Delete. */
  _rowTools(record, ids) {
    const box = element('span', 'h-presentation-row');
    const id = Number(record?.rec_ID) || 0;
    const icon = (glyph, title, run, className = '') => {
      const button = element('button', `heurist-icon-button h-presentation-row-tool ${className}`, box);
      button.type = 'button';
      button.title = $HR(title);
      button.setAttribute('aria-label', button.title);
      element('i', `fa-solid ${glyph}`, button).setAttribute('aria-hidden', 'true');
      // not the selection of the row
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        void this._run(run);
      });
      button.addEventListener('dblclick', (event) => event.stopPropagation());
      return button;
    };
    if (typeof this.options.onEdit === 'function') icon('fa-pen-ruler', 'Open the editor', () => this.options.onEdit(id), 'is-edit');
    const kind = this._kindLabel(record, ids);
    if (kind) element('span', 'h-presentation-row-kind', box).textContent = kind;
    if (this.options.canEdit !== false) {
      if (typeof this.options.editRecord === 'function') icon('fa-pen', 'Properties: name, description, owner and visibility', () => this._properties(id), 'is-properties');
      icon('fa-trash-can', 'Delete', () => this._delete(record), 'is-delete');
    }
    const summary = String([record?.details?.[ids.summary]].flat()[0]?.value ?? [record?.details?.[ids.summary]].flat()[0] ?? '').trim();
    if (summary) element('span', 'h-presentation-row-summary', box).textContent = summary;
    return box;
  }

  /** @private The kind of a row (shown when the list has more than one kind). */
  _kindLabel(record, ids) {
    if ((this.options.kinds || []).length < 2) return '';
    const term = Number([record?.details?.[ids.type]].flat()[0]?.value ?? [record?.details?.[ids.type]].flat()[0]) || 0;
    return term ? (this.options.dbdefs?.termLabel?.(term) || '') : '';
  }

  /** @private Properties: the record editor, then the list again. */
  async _properties(id) {
    const result = await this.options.editRecord(id);
    if (result?.saved !== false) await this.reload();
  }

  /** @private Delete an item after a question with its use. */
  async _delete(record) {
    const id = Number(record?.rec_ID) || 0;
    if (!id) return;
    const use = (await this.options.describeUse?.(id)) || '';
    if (use.startsWith('!')) {
      HMsg.showMsgErr(use.slice(1));
      return;
    }
    const title = String(record.rec_Title || `#${id}`);
    const answer = await askChoice(`${$HR('Delete')} "${title}"?${use ? `<br>${use}` : ''}`, $HR('Delete'), [['delete', $HR('Delete')]]);
    if (answer !== 'delete') return;
    try {
      await this.options.apiClient.request(`/presentation/${id}`, { method: 'DELETE' });
    } catch (error) {
      HMsg.showMsgErr(presentationErrorText(error));
      return;
    }
    if (this.selectedId === id) this.selectedId = null;
    this.options.onDeleted?.(id);
    await this.reload();
    HMsg.showMsgFlash?.($HR('Deleted'), { showDelay: 1500 });
  }

  /** @private Run an action and show its error. */
  async _run(action) {
    try {
      return await action();
    } catch (error) {
      HMsg.showMsgErr(presentationErrorText(error));
      return null;
    }
  }
}

/**
 * Text of an error of the API: a presentation used by website pages (409 in_use) or with generated reports (409
 * report_in_use) is not deleted.
 *
 * @param {*} error
 * @returns {string}
 */
export function presentationErrorText(error) {
  const details = error?.payload?.details ?? error?.payload ?? {};
  if (Number(details.pages) > 0) return `${$HR('It is used by website pages and can not be deleted')} (${details.pages})`;
  if (Number(details.outputs) > 0) return `${$HR('It has generated reports: delete them first')} (${details.outputs})`;
  return error?.payload?.message || error?.message || String(error);
}
