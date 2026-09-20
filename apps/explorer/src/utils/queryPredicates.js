/**
 * @file queryPredicates.js
 * @brief Predicate keyword vocabulary for the Heurist record query language.
 *
 * HARD COPY of `KEYWORD_ALIASES` + `LINK_PREDICATES` from
 * `srv/Records/Query/Parser/RecordQueryParser.php` (~L26-40). The PHP parser
 * stays the single source of truth and has no dependency on this file; keep the
 * two in sync by hand (a CI/lint check is planned). See
 * docs/query-language-filter-builder-plan.md section 6 / D1.
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

/**
 * Alias → canonical predicate base. The canonical bases the builder emits are
 * `t`, `ids`, `f`, `fc`, `lt`, `lf`, `rt`, `rf`, `related`, `r`, plus the header
 * keywords (`title`, `url`, `notes`, `added`, `modified`, `owner`, `addedby`,
 * `access`, `tag`, `user`) and the grouping keywords (`any`, `all`, `not`) and
 * `sortby`.
 * @type {Readonly<Record<string,string>>}
 */
export const KEYWORD_ALIASES = Object.freeze({
  type: 't', typeid: 't', typename: 't', t: 't', id: 'ids', ids: 'ids',
  title: 'title', url: 'url', notes: 'notes', added: 'added', modified: 'modified',
  before: 'before', after: 'after', since: 'after', addedby: 'addedby', owner: 'owner',
  workgroup: 'owner', wg: 'owner', access: 'access', user: 'user', usr: 'user',
  ws: 'ws', workset: 'ws', tag: 'tag', keyword: 'tag', kwd: 'tag', field: 'f', f: 'f',
  count: 'fc', cnt: 'fc', fc: 'fc', geo: 'geo', file: 'file', linked_to: 'lt',
  linkedto: 'lt', linkto: 'lt', link_to: 'lt', lt: 'lt', linked_from: 'lf',
  linkedfrom: 'lf', linkfrom: 'lf', link_from: 'lf', lf: 'lf', related_to: 'rt',
  relatedto: 'rt', rt: 'rt', related_from: 'rf', relatedfrom: 'rf', rf: 'rf',
  related: 'related', links: 'links', relf: 'relf', r: 'r', any: 'any', all: 'all',
  not: 'not', exists: 'exists', sortby: 'sortby', sort: 'sortby', s: 'sortby'
});

/**
 * Predicate bases whose value is a nested sub-query (a record set), not a scalar.
 * @type {ReadonlyArray<string>}
 */
export const LINK_PREDICATES = Object.freeze([
  'lt', 'linked_to', 'linkedto', 'lf', 'linked_from', 'linkedfrom',
  'rt', 'related_to', 'relatedto', 'rf', 'related_from', 'relatedfrom',
  'related', 'links', 'relf', 'r'
]);

/** Grouping predicates whose value is a query array. */
export const GROUP_PREDICATES = Object.freeze(['any', 'all', 'not']);

/**
 * Record "header" keywords - properties every record has, addressable without a
 * field id. Maps the canonical base to the operator group in `queryVocabulary`
 * `headerKinds`.
 * @type {Readonly<Record<string,string>>}
 */
export const HEADER_KEYWORDS = Object.freeze({
  title: 'title', url: 'url', notes: 'notes', added: 'added', modified: 'modified',
  ids: 'id', owner: 'owner', addedby: 'addedby', access: 'access', tag: 'tag',
  user: 'user'
});

/**
 * Canonical base for an alias, or `null` when unknown.
 * @param {string} keyword
 * @returns {string|null}
 */
export function canonicalPredicate(keyword) {
  const key = String(keyword ?? '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(KEYWORD_ALIASES, key)
    ? KEYWORD_ALIASES[key]
    : null;
}

/** @param {string} base Canonical predicate base. @returns {boolean} */
export function isLinkPredicate(base) {
  return LINK_PREDICATES.includes(String(base));
}

/** @param {string} base Canonical predicate base. @returns {boolean} */
export function isGroupPredicate(base) {
  return GROUP_PREDICATES.includes(String(base));
}
