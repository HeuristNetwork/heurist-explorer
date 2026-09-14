/**
 * @file HFilterBuilderSort.js
 * @brief One "sort by" row in the Filter Builder (field + direction).
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer.widgets.filter
 * @link        https://HeuristNetwork.org
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 *
 * Framework-free minimal replacement for `hclient/widgets/search/searchBuilderSort.js`.
 * Emits `{field, dir}` where `field` is a header keyword (`title`, `modified`,
 * `added`) or a numeric `dty` id from the scope record type.
 */

import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
import { $HR } from '#shared/ui';

const HEADER_SORTS = [
  ['', '— none —'],
  ['title', 'Record title'],
  ['modified', 'Date modified'],
  ['added', 'Date added'],
  ['id', 'Record ID']
];

export class HFilterBuilderSort extends HBaseWidget {
  /**
   * @param {{dbdefs:object, lang?:string, onChange?:Function, scopeRtyId?:(number|string)}} deps
   */
  constructor({ dbdefs, lang = 'eng', onChange, scopeRtyId = '' } = {}) {
    super();
    this.dbdefs = dbdefs;
    this.lang = lang;
    this._onChange = onChange || (() => {});
    this.scopeRtyId = scopeRtyId;
    this.entry = { field: '', dir: 'asc' };
  }

  render() {
    if (!this.container) throw new Error('HFilterBuilderSort must be attached before render');
    this.container.className = 'h-fbsort';
    this.container.replaceChildren();

    this._fieldSel = document.createElement('select');
    this._fieldSel.className = 'h-select h-fbsort-field';
    this._populateFields();
    this._fieldSel.addEventListener('change', () => {
      this.entry.field = coerce(this._fieldSel.value);
      this._onChange({ entry: this.getEntry() });
    });

    this._dirSel = document.createElement('select');
    this._dirSel.className = 'h-select h-fbsort-dir';
    for (const [v, label] of [['asc', $HR('ascending')], ['desc', $HR('descending')]]) {
      const o = document.createElement('option');
      o.value = v; o.textContent = label; this._dirSel.append(o);
    }
    this._dirSel.value = this.entry.dir;
    this._dirSel.addEventListener('change', () => {
      this.entry.dir = this._dirSel.value;
      this._onChange({ entry: this.getEntry() });
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'heurist-icon-button h-fbsort-remove';
    remove.textContent = '×';
    remove.title = $HR('Remove sort');
    remove.addEventListener('click', () => {
      this.destroy();
      this._onChange({ removed: true });
    });

    this.container.append(this._fieldSel, this._dirSel, remove);
    this.state = 'rendered';
    return this;
  }

  getEntry() {
    return { field: this.entry.field, dir: this.entry.dir };
  }

  setEntry(entry = {}) {
    this.entry = { field: entry.field ?? '', dir: entry.dir === 'desc' ? 'desc' : 'asc' };
    if (this.isRendered) {
      this._fieldSel.value = String(this.entry.field ?? '');
      this._dirSel.value = this.entry.dir;
    }
    return this;
  }

  setScope(rtyId) {
    this.scopeRtyId = rtyId;
    if (this.isRendered) this._populateFields();
  }

  _populateFields() {
    const keep = this._fieldSel.value;
    this._fieldSel.replaceChildren();
    for (const [v, label] of HEADER_SORTS) {
      const o = document.createElement('option');
      o.value = v; o.textContent = $HR(label); this._fieldSel.append(o);
    }
    const rty = Number(this.scopeRtyId) > 0 ? Number(this.scopeRtyId) : null;
    if (rty && this.dbdefs?.fields) {
      const grp = document.createElement('optgroup');
      grp.label = $HR('Fields');
      for (const field of this.dbdefs.fields(rty)) {
        if (['resource', 'relmarker', 'file', 'geo'].includes(field.type)) continue;
        const o = document.createElement('option');
        o.value = String(field.id);
        o.textContent = field.name;
        grp.append(o);
      }
      if (grp.children.length) this._fieldSel.append(grp);
    }
    this._fieldSel.value = keep || String(this.entry.field ?? '');
  }

  async destroy() {
    this.container?.replaceChildren();
    await super.destroy();
  }
}

function coerce(value) {
  return /^\d+$/.test(value) ? Number(value) : value;
}
