/**
 * @file RecordViewLoader.js
 * @brief Loads everything the shared record renderer needs for one record.
 *
 * Combines the record itself, the sectioned field structure of its record type,
 * the record type name and - for the full view only - its tags and its
 * relationships/incoming links. Used by record popups of other modules
 * (heurist-map) together with `RecordViewRenderer`.
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
import { HDbDefs } from "../data/HDbDefs.js";
import { VocabularyProvider } from "../data/VocabularyProvider.js";
import { RecordDataProvider } from "./RecordDataProvider.js";
import { RecordStructureProvider } from "./RecordStructureProvider.js";
import { RecordRelationsProvider } from "./RecordRelationsProvider.js";

/** Loads one record with the structure, names, tags and relations its rendering needs. */
export class RecordViewLoader {
  /**
   * @param {object} options Providers.
   * @param {RecordDataProvider} options.recordDataProvider Loads the resolved record and its tags.
   * @param {RecordStructureProvider} options.structureProvider Loads the field sections of a record type.
   * @param {VocabularyProvider} options.vocabularyProvider Resolves record type names.
   * @param {RecordRelationsProvider|null} [options.relationsProvider] Loads relationships and incoming links.
   */
  constructor({ recordDataProvider, structureProvider, vocabularyProvider, relationsProvider = null }) {
    this.recordDataProvider = recordDataProvider;
    this.structureProvider = structureProvider;
    this.vocabularyProvider = vocabularyProvider;
    this.relationsProvider = relationsProvider;
  }

  /**
   * Create a loader with the standard providers for one Heurist API client.
   * The database definitions (for relationships) are loaded once, on first use.
   *
   * @param {object} options Options.
   * @param {object} options.apiClient Heurist API client.
   * @param {string} [options.language] Interface language for the definitions.
   * @returns {RecordViewLoader}
   */
  static create({ apiClient, language = "eng" }) {
    let dbDefsPromise = null;
    const dbDefsProvider = () => {
      dbDefsPromise ||= HDbDefs.load(apiClient.buildUrl("/def/snapshot"), { lang: language }).catch((error) => {
        dbDefsPromise = null;
        throw error;
      });
      return dbDefsPromise;
    };
    return new RecordViewLoader({
      recordDataProvider: new RecordDataProvider({ apiClient }),
      structureProvider: new RecordStructureProvider({ apiClient }),
      vocabularyProvider: new VocabularyProvider({ apiClient }),
      relationsProvider: new RecordRelationsProvider({ apiClient, dbDefsProvider }),
    });
  }

  /**
   * Load one record for rendering.
   *
   * @param {number|string} id Record ID.
   * @param {object} [options] Load options.
   * @param {boolean} [options.full=false] Also load tags and relations (the full view).
   * @param {AbortSignal} [options.signal] Abort signal.
   * @returns {Promise<{record: object, sections: Array<object>, recordTypeName: string|null,
   *   tags: object|null, relations: object|null}|null>} Render input, or `null` when the record is not found.
   */
  async load(id, { full = false, signal } = {}) {
    const record = await this.recordDataProvider.load({ id, signal });
    if (!record) return null;
    const recordTypeId = Number(record.rec_RecTypeID) || 0;
    const sectionsLoad = this.structureProvider.fieldSections(recordTypeId, { signal });
    const [sections, names, tags, relations] = await Promise.all([
      sectionsLoad,
      this.vocabularyProvider.getRecordTypeNames([recordTypeId], { signal }),
      full ? this.recordDataProvider.loadTags?.({ id, signal }) ?? null : null,
      full && this.relationsProvider?.load
        ? sectionsLoad.then((loaded) => this.relationsProvider.load({ id: Number(id), rty: recordTypeId, sections: loaded, signal }))
        : null,
    ]);
    return { record, sections, recordTypeName: names.get(recordTypeId) || null, tags, relations };
  }

  /**
   * Load several records for rendering (without tags and relations), in one
   * record request, one structure request per record type and one name request.
   *
   * @param {Array<number|string>} ids Record IDs.
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<Map<number, {record: object, sections: Array<object>, recordTypeName: string|null}>>}
   *          Render input by record ID, for the records found.
   */
  async loadMany(ids, { signal } = {}) {
    const records = await this.recordDataProvider.loadMany({ ids, signal });
    const types = [...new Set([...records.values()].map((record) => Number(record.rec_RecTypeID) || 0).filter(Boolean))];
    const [structures, names] = await Promise.all([
      Promise.all(types.map(async (rty) => [rty, await this.structureProvider.fieldSections(rty, { signal })])),
      this.vocabularyProvider.getRecordTypeNames(types, { signal }),
    ]);
    const sections = new Map(structures);
    const result = new Map();
    for (const [id, record] of records) {
      const rty = Number(record.rec_RecTypeID) || 0;
      result.set(id, { record, sections: sections.get(rty) || [], recordTypeName: names.get(rty) || null });
    }
    return result;
  }
}
