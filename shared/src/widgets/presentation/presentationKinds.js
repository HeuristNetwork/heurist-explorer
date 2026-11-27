/**
 * @file presentationKinds.js
 * @brief The kinds of a Presentation set (2-1112, Presentation Type 2-1203; plan 27q1, 27q3 §5): their terms and how
 *        they are published. The server has the same names (srv/Presentations/PresentationEntityHandler::KINDS).
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

/** Kind => term constant of Presentation Type 2-1203. */
export const PRESENTATION_KINDS = Object.freeze({
  crosstabs: 'TRM_PRESENTATION_CROSSTABS',
  storymap: 'TRM_PRESENTATION_STORYMAP',
  export: 'TRM_PRESENTATION_EXPORT',
  cardreport: 'TRM_PRESENTATION_CARD_REPORT',
  listreport: 'TRM_PRESENTATION_LIST_REPORT'
});

/** Kinds that are reports (a template file, plan 27q3 §5). */
export const REPORT_KINDS = Object.freeze(['cardreport', 'listreport']);

/** Kinds that are published as a page (Publish, 27q3 §3); the others generate a file (Generate). */
export const PAGE_KINDS = Object.freeze(['crosstabs', 'storymap']);

/** Languages of a published page (Interface of the crosstabs and story map publication, as the module forms). */
export const PUBLICATION_LANGUAGE_TERMS = Object.freeze([
  { id: 'auto', label: 'Automatic' },
  { id: 'eng', label: 'English' },
  { id: 'fre', label: 'French' },
  { id: 'ger', label: 'German' },
  { id: 'por', label: 'Portuguese' }
]);

/**
 * Term ids of kinds in this database (unknown ones left out).
 *
 * @param {object|null} dbdefs HDbDefs.
 * @param {string[]} kinds
 * @returns {number[]}
 */
export function presentationKindTerms(dbdefs, kinds) {
  return kinds.map((kind) => Number(dbdefs?.dbconst?.(PRESENTATION_KINDS[kind])) || 0).filter((id) => id > 0);
}

/**
 * The kind of a term id.
 *
 * @param {object|null} dbdefs HDbDefs.
 * @param {number|string} termId
 * @returns {string|null}
 */
export function presentationKindOf(dbdefs, termId) {
  const id = Number(termId) || 0;
  if (!id) return null;
  for (const [kind, constant] of Object.entries(PRESENTATION_KINDS)) {
    if ((Number(dbdefs?.dbconst?.(constant)) || 0) === id) return kind;
  }
  return null;
}
