/**
 * @file vocabHelpers.js
 * @brief Small read helpers over the parsed queryVocabulary.json.
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

import { HEADER_KEYWORDS } from './queryPredicates.js';

/**
 * Resolve an i18nKey to display text, falling back to English then the key.
 * @param {object} vocab @param {string} lang @param {string} key
 * @returns {string}
 */
export function str(vocab, lang, key) {
  const strings = vocab?.strings || {};
  return strings?.[lang]?.[key] ?? strings?.eng?.[key] ?? key;
}

/**
 * Operator group ("kind") for a field type or header keyword.
 * @param {object} vocab
 * @param {string} fieldType dty_Type (e.g. 'freetext') - ignored when `headerKeyword` is set.
 * @param {?string} headerKeyword Canonical header base ('title','added',…).
 * @returns {string} text|number|date|enum|term|record|file|geo|bool|tag
 */
export function kindFor(vocab, fieldType, headerKeyword = null) {
  if (headerKeyword) {
    const group = HEADER_KEYWORDS[headerKeyword];
    return vocab?.headerKinds?.[group] || 'text';
  }
  return vocab?.fieldKinds?.[fieldType] || 'text';
}

/**
 * The ordered operator list offered for a kind (kind-specific + shared NULL ops).
 * @param {object} vocab @param {string} kind
 * @returns {Array<{token:string,input:string,i18nKey:string,pattern?:string,whole?:boolean}>}
 */
export function operatorsFor(vocab, kind) {
  const own = vocab?.operators?.[kind] || [];
  const shared = (vocab?.commonAppliesTo || []).includes(kind) ? (vocab?.common || []) : [];
  return [...own, ...shared];
}

/**
 * @param {object} vocab @param {string} kind @param {?string} i18nKey
 * @returns {object|null} the operator entry (defaults to the first for the kind)
 */
export function operatorByKey(vocab, kind, i18nKey) {
  const list = operatorsFor(vocab, kind);
  if (!list.length) return null;
  return list.find((o) => o.i18nKey === i18nKey) || list[0];
}
