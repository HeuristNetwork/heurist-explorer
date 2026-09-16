/**
 * @file RecordStructureProvider.js
 * @brief Loads one record type's field structure, grouped into sections.
 *
 * Uses `GET /rst/{recordTypeId}` directly — a small, per-record-type
 * request — rather than the whole-database `/def/snapshot` (`HDbDefs`).
 * Unlike that snapshot, `/rst` already includes `separator` pseudo-field
 * rows, which is exactly what's needed to reproduce the legacy record-edit
 * form's section grouping (`hclient/widgets/entity/manageRecords.js`):
 * walk the rows in `rst_DisplayOrder`, and start a new section at every
 * `separator` row, using its `rst_DisplayName` as the heading,
 * `rst_DisplayHelpText` as help text, and `rst_DefaultValue` as the layout
 * hint (`group`/`tabs`/`accordion`/etc. — repurposed for separators only;
 * for real fields this same column is the field's own default value).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-recordview
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

const STRUCTURE_DETAILS =
  "rst_DetailTypeID,rst_DisplayName,rst_DisplayOrder,rst_RequirementType,rst_DefaultValue,rst_DisplayHelpText,dty_Type";

/** Loads and caches one record type's field structure, split into display sections. */
export class RecordStructureProvider {
  /** @param {{apiClient: object}} options Heurist API client. */
  constructor({ apiClient }) {
    this.apiClient = apiClient;
    this.cache = new Map(); // rectypeId -> Promise<Array<section>>
  }

  /**
   * Ordered, sectioned field structure for one record type.
   *
   * @param {number|string} rectypeId Record type id.
   * @param {{signal?: AbortSignal}} [options] Request options.
   * @returns {Promise<Array<{id: number|null, title: string|null, helpText: string, layout: string, fields: Array<object>}>>}
   *          Sections in display order; fields before the first separator
   *          are in an initial `{id: null, title: null}` section.
   * @throws {TypeError} When `rectypeId` is invalid.
   */
  async fieldSections(rectypeId, { signal } = {}) {
    const rty = Number(rectypeId);
    if (!Number.isInteger(rty) || rty < 1) {
      throw new TypeError("A valid Heurist record type id is required");
    }
    if (this.cache.has(rty)) return this.cache.get(rty);
    const promise = this.#load(rty, signal).catch((error) => {
      this.cache.delete(rty);
      throw error;
    });
    this.cache.set(rty, promise);
    return promise;
  }

  async #load(rty, signal) {
    const payload = await this.apiClient.get(`/rst/${rty}`, {
      signal,
      query: { details: STRUCTURE_DETAILS },
    });
    const rows = Array.isArray(payload?.items) ? payload.items : [];
    return buildSections(rows);
  }
}

/** Sort structure rows by display order, then split into sections at each separator row. */
function buildSections(rows) {
  const sorted = [...rows].sort((a, b) => order(a) - order(b));
  const sections = [];
  let current = { id: null, title: null, helpText: "", layout: null, fields: [] };
  sections.push(current);
  for (const row of sorted) {
    if (row.dty_Type === "separator") {
      current = {
        id: Number(row.rst_DetailTypeID) || null,
        title: row.rst_DisplayName || null,
        helpText: row.rst_DisplayHelpText || "",
        layout: row.rst_DefaultValue || null,
        fields: [],
      };
      sections.push(current);
      continue;
    }
    current.fields.push({
      id: Number(row.rst_DetailTypeID),
      name: row.rst_DisplayName || "",
      type: row.dty_Type || "",
      order: order(row),
      req: row.rst_RequirementType || "optional",
    });
  }
  return sections.filter((section) => section.fields.length > 0);
}

/** Numeric display order for a structure row (the API returns it as a zero-padded string). */
function order(row) {
  const value = Number(row?.rst_DisplayOrder);
  return Number.isFinite(value) ? value : 0;
}
