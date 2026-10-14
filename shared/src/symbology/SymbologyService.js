/**
 * @file SymbologyService.js
 * @brief Opens the symbology editors for a host (Explorer record editor, Map module)
 *        and saves the symbology of a Map Layer record (plan 17 §6). Replaces the
 *        legacy host bridge `editSymbology` (HeuristModuleViewer._editSymbology,
 *        _saveLayerSymbology), with its rules:
 * - the style editor keeps the thematic renderers of the value;
 * - a complete value (Map configuration default/selection symbology) keeps its icon type;
 * - Save writes DT_SYMBOLOGY with `PATCH /records/{id}` (srv write API, plan 14).
 *
 * The editors are loaded on first use (one lazy chunk).
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

import { RecordEditClient } from '../data/RecordEditClient.js';
import { buildSymbology, effectiveSymbol, parseSymbology, splitSymbology } from './symbology.js';
import { DEFAULT_MAP_SYMBOL } from './normalizeMapSymbol.js';

/** Symbology editing for a host. */
export class SymbologyService {
  /**
   * @param {object} options
   * @param {object} options.api HeuristApiClient.
   * @param {Function} [options.loadDbDefs] Resolves with HDbDefs (thematic maps, saving).
   * @param {Function} [options.iconUrl] `(rectypeId) → url` of record type icons (previews).
   * @param {Function} [options.loadEditors] Loads the editors module (tests); default the lazy chunk.
   */
  constructor({ api, loadDbDefs = null, iconUrl = null, loadEditors = null } = {}) {
    this.api = api;
    this.loadDbDefs = loadDbDefs;
    this.iconUrl = iconUrl;
    this._loadEditors = loadEditors || (() => import('../widgets/symbology/symbologyEditors.js'));
  }

  /**
   * Edit a symbology value.
   *
   * @param {*} value Stored value.
   * @param {object} [options]
   * @param {'style'|'thematic'|'image'} [options.kind='style'] Symbol editor, thematic maps or image filters.
   * @param {'symbol'|'draw'|'range'} [options.mode='symbol'] Mode of the symbol editor.
   * @param {object} [options.parentSymbol] Effective parent symbol (symbol mode).
   * @param {Array|object|string} [options.query] Layer query (thematic maps, record type previews).
   * @param {boolean} [options.complete=false] A complete value (configuration): keep the icon type.
   * @param {number} [options.rectypeId] Record type of the record type icon preview.
   * @returns {Promise<object|null>} The new value, or null on Cancel.
   */
  async edit(value, { kind = 'style', mode = 'symbol', parentSymbol = null, query = null, complete = false, rectypeId = null } = {}) {
    const editors = await this._loadEditors();
    const current = parseSymbology(value);
    if (kind === 'image') return editors.editImageFilter(current || {});
    if (kind === 'thematic') {
      const dbdefs = await this.loadDbDefs?.();
      return editors.editThematicMaps(current, {
        api: this.api, dbdefs, query, parentSymbol, iconUrl: this.iconUrl
      });
    }
    if (mode === 'draw') return editors.editSymbol(current || {}, { mode: 'draw' });
    const parent = parentSymbol || DEFAULT_MAP_SYMBOL;
    const result = await editors.editSymbol(current, { mode: 'symbol', parentSymbol: parent, iconUrl: this.iconUrl, rectypeId });
    if (result == null) return null;
    if (!complete) return result;
    // a configuration value is complete: an icon type equal to the parent's is kept
    const parts = splitSymbology(result);
    const symbol = parts.symbol || {};
    if (!Object.hasOwn(symbol, 'iconType')) symbol.iconType = effectiveSymbol({}, parent).iconType || 'rectype';
    return buildSymbology(symbol, parts.thematic);
  }

  /**
   * Save the symbology of a Map Layer record (its DT_SYMBOLOGY field).
   *
   * @param {number|string} recordId Map Layer record id.
   * @param {object} value Symbology value.
   * @returns {Promise<{record: object, issues: Array<object>}>} The saved record.
   * @throws {Error} When the field cannot be resolved or the save fails.
   */
  async saveLayerSymbology(recordId, value) {
    const dbdefs = await this.loadDbDefs?.();
    const dty = Number(dbdefs?.dbconst?.('DT_SYMBOLOGY')) || 0;
    if (!dty) throw new Error('DT_SYMBOLOGY is not defined in this database');
    const client = new RecordEditClient({ apiClient: this.api });
    const text = value && typeof value === 'object' && Object.keys(value).length ? JSON.stringify(value) : '';
    return client.patch(recordId, { details: { [dty]: text ? [text] : [] } });
  }
}
