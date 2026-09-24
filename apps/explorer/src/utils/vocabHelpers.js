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
  if (kind === 'exists') return [
    { token: '', input: 'none', whole: true, i18nKey: 'op.exists' },
    { token: 'NULL', input: 'none', whole: true, i18nKey: 'op.missing' }
  ];
  const own = vocab?.operators?.[kind] || [];
  const shared = (vocab?.commonAppliesTo || []).includes(kind) ? (vocab?.common || []) : [];
  const count = kind === 'none' ? [] : [{ token: '', input: 'count', i18nKey: 'op.count' }];
  return [...own, ...shared, ...count];
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

/**
 * The operator a raw value token stands for, for a field kind. "count of values"
 * is never chosen from a token (it comes only from an `fc:` key), and on numbers
 * both leading range forms (`<>a/b`, `><a/b`) mean "between".
 *
 * @param {object} vocab
 * @param {string} kind Field kind; see `kindFor`.
 * @param {?string} token Raw token (`''` for none).
 * @param {object[]} [list] Operators to choose from (default: all for the kind).
 * @returns {?string} i18nKey, or `null` when the kind has no operators.
 */
export function operatorForToken(vocab, kind, token, list = operatorsFor(vocab, kind)) {
  const candidates = list.filter((o) => o.i18nKey !== 'op.count');
  if (kind === 'number' && (token === '<>' || token === '><')
      && candidates.some((o) => o.i18nKey === 'op.between')) return 'op.between';
  const t = token ?? '';
  const exact = candidates.find((o) => (o.token || '') === t && !o.pattern);
  if (exact) return exact.i18nKey;
  const any = candidates.find((o) => (o.token || '') === t);
  return (any || candidates[0] || list[0])?.i18nKey ?? null;
}
