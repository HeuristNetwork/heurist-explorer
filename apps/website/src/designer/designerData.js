/**
 * @file designerData.js
 * @brief Records of the CMS designer (plan 27c §8): a website or page record as an editable document, the
 *        PATCH body of the changed fields, translations of 2-1202, the menu tree and the preview URL.
 *
 * Fields (local ids from `GET /website/setup` codes): page content 2-4 (`content`), header 2-929, footer 2-940,
 * configuration 2-1187, translations 2-1202 (`xx:{json}` per language). A save sends only the fields that
 * changed, with the record's `rec_Modified` (plan 27c §8, 27d §4).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { CmsRecordDocument } from '#shared/site/cmsEdit.js';

/** Part of a record => key of its field in the codes. */
export const PART_FIELDS = Object.freeze({ header: 'header', content: 'content', footer: 'footer' });

/**
 * The editable document of a record.
 *
 * @param {object} record Record of `GET /{entity}/{id}` (details by field id).
 * @param {Object<string, number>} codes Local ids (WebsiteRepository::CONCEPTS names).
 * @returns {CmsRecordDocument}
 */
export function recordDocument(record, codes) {
  const details = record?.details || {};
  const website = Number(record?.rec_RecTypeID) === Number(codes.home);
  const parts = { content: firstValue(details[codes.content]) };
  if (website) {
    parts.header = firstValue(details[codes.header]);
    parts.footer = firstValue(details[codes.footer]);
  }
  return new CmsRecordDocument({
    parts,
    config: firstValue(details[codes.configuration]),
    translations: parseTranslations(details[codes.translations])
  });
}

/**
 * Translations of 2-1202: one `xx:{json}` value per language (CmsValidator::translations).
 *
 * @param {Array<string|object>|string} values
 * @returns {Object<string, Object<string, string>>}
 */
export function parseTranslations(values) {
  const result = {};
  for (const raw of Array.isArray(values) ? values : [values]) {
    const value = raw && typeof raw === 'object' ? String(raw.value ?? '') : String(raw ?? '');
    const match = /^([A-Za-z]{2,3}):([\s\S]*)$/.exec(value);
    if (!match) continue;
    try {
      const blocks = JSON.parse(match[2]);
      if (blocks && typeof blocks === 'object' && !Array.isArray(blocks)) result[match[1].toLowerCase()] = blocks;
    } catch {
      // not ours: left out
    }
  }
  return result;
}

/** Values of 2-1202 for translations by language. */
export function translationValues(translations) {
  return Object.entries(translations || {}).map(([language, blocks]) => `${language}:${JSON.stringify(blocks)}`);
}

/**
 * Details of the fields that changed since the saved state (the PATCH body).
 *
 * @param {{parts: object, configuration: string, translations: object}} now Current `serialize()`.
 * @param {{parts: object, configuration: string, translations: object}} saved `serialize()` after load / save.
 * @param {Object<string, number>} codes
 * @returns {Object<string, Array<string>>} Field id => values; empty when nothing changed.
 */
export function changedDetails(now, saved, codes) {
  const details = {};
  for (const [part, key] of Object.entries(PART_FIELDS)) {
    if (now.parts[part] === undefined || now.parts[part] === saved.parts[part]) continue;
    details[codes[key]] = now.parts[part] ? [now.parts[part]] : [];
  }
  if (now.configuration !== saved.configuration) details[codes.configuration] = [now.configuration];
  if (JSON.stringify(now.translations) !== JSON.stringify(saved.translations)) {
    details[codes.translations] = translationValues(now.translations);
  }
  return details;
}

/**
 * Where a page sits in a menu tree.
 *
 * @param {Array<{id: number, children: Array}>} pages Menu tree (meta.website.pages).
 * @param {number} pageId
 * @returns {{parent: number, index: number, siblings: number[], page: object}|null} parent 0 = top menu.
 */
export function menuPlace(pages, pageId, parent = 0) {
  for (const [index, page] of (pages || []).entries()) {
    if (Number(page.id) === Number(pageId)) return { parent, index, siblings: pages.map((item) => Number(item.id)), page };
    const found = menuPlace(page.children, pageId, Number(page.id));
    if (found) return found;
  }
  return null;
}

/** Ids of all sub pages (all levels) of a menu item. */
export function subPageIds(page) {
  return (page?.children || []).flatMap((child) => [Number(child.id), ...subPageIds(child)]);
}

/**
 * `assign` values of a page dropped on a tree item (website tree): parent and position in the parent's menu
 * without the page itself (the server removes it first).
 *
 * @param {Array<object>} pages Menu tree.
 * @param {number} pageId Dropped page.
 * @param {number} targetId Page it was dropped on; 0 = Home (the top menu).
 * @param {'before'|'inside'|'after'} position
 * @returns {{parent: number, index: number|null}|null} Null when not allowed (into itself or a sub page).
 */
export function dropPlace(pages, pageId, targetId, position) {
  const moving = menuPlace(pages, pageId);
  if (Number(targetId) === Number(pageId)) return null;
  if (moving && subPageIds(moving.page).includes(Number(targetId))) return null;
  if (position === 'inside' || !targetId) return { parent: Number(targetId) || 0, index: null };
  const target = menuPlace(pages, targetId);
  if (!target) return null;
  const siblings = target.siblings.filter((id) => id !== Number(pageId));
  const index = siblings.indexOf(Number(targetId)) + (position === 'after' ? 1 : 0);
  return { parent: target.parent, index };
}

/**
 * URL of the preview page: the design page of the server (plan 27c §6).
 *
 * @param {string} siteUrl URL of the website or standalone page (meta.website.url).
 * @param {number} pageId Page of the website (0 = home).
 * @param {string|null} language Preview language.
 */
export function previewUrl(siteUrl, pageId = 0, language = null) {
  const base = String(siteUrl || '').replace(/\/+$/, '');
  const path = pageId ? `${base}/${pageId}` : base;
  const params = new URLSearchParams({ design: '1' });
  if (language) params.set('lang', language);
  return `${path}${path.includes('?') ? '&' : '?'}${params}`;
}

function firstValue(values) {
  const value = Array.isArray(values) ? values[0] : values;
  if (value && typeof value === 'object') return String(value.value ?? '');
  return String(value ?? '');
}
