/**
 * @file crosstabsPresets.js
 * @brief Common parts of the Crosstabs viewer pane and the crosstab designer (plan 27q2 §17): the crosstabs of the
 *        database (Presentation sets of kind Crosstab with their record type), the labels of buckets and fields, and
 *        small DOM helpers of their toolbars.
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

import { $HR } from '#shared/ui';
import { fieldCodeLabel } from '#shared/data/fieldPathCodes.js';
import { normalizeCrosstabSettings } from '#shared/widgets/crosstabs/crosstabModel.js';

/**
 * Field, type and term ids of the Presentation set.
 *
 * @param {object|null} dbdefs HDbDefs.
 * @returns {{rectype: number, name: number, query: number, form: number, configuration: number, type: number, crosstabs: number}}
 */
export function crosstabIds(dbdefs) {
  const id = (code) => Number(dbdefs?.dbconst?.(code)) || 0;
  return {
    rectype: id('RT_PRESENTATION_SET'), name: id('DT_NAME'), query: id('DT_QUERY_STRING'), form: id('DT_FILTER_FORM'),
    configuration: id('DT_CONFIGURATION'), type: id('DT_PRESENTATION_TYPE'), crosstabs: id('TRM_PRESENTATION_CROSSTABS')
  };
}

/**
 * The crosstabs of the database with the record type each one counts, sorted by title.
 *
 * @param {object} apiClient HeuristApiClient.
 * @param {object|null} dbdefs HDbDefs.
 * @returns {Promise<Array<{id: number, title: string, rectype: number|null}>>}
 */
export async function loadCrosstabPresets(apiClient, dbdefs) {
  const ids = crosstabIds(dbdefs);
  if (!ids.rectype) return [];
  const fields = ['rec_ID', 'rec_Title', ids.type, ids.configuration].filter(Boolean).join(',');
  const answer = await apiClient.get('/records', {
    query: { q: JSON.stringify([{ t: String(ids.rectype) }]), fields, limit: 1000 }
  }).catch(() => null);
  return ((answer?.data ?? answer)?.records || [])
    .filter((record) => Number([record.details?.[ids.type]].flat()[0]) === ids.crosstabs)
    .map((record) => ({
      id: Number(record.rec_ID),
      title: String(record.rec_Title || `#${record.rec_ID}`),
      rectype: normalizeCrosstabSettings([record.details?.[ids.configuration]].flat()[0] ?? null).fields.rectype
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Group the crosstabs for the record types of the current result (presentation-sources.md §4): those whose record type
 * is in the result first (with its count), the others after them (disabled in the chooser).
 *
 * @param {Array<{id: number, title: string, rectype: number|null}>} presets
 * @param {Array<{id: number, name: string, count: number}>|null} recordTypes Record types of the result; null: not grouped.
 * @returns {{fitting: Array<object>, other: Array<object>}} Each item gets `count` (records of its type) when it fits.
 */
export function groupCrosstabPresets(presets, recordTypes) {
  if (!Array.isArray(recordTypes)) return { fitting: [...presets], other: [] };
  const counts = new Map(recordTypes.map((item) => [Number(item.id), Number(item.count) || 0]));
  const fitting = [];
  const other = [];
  for (const preset of presets) {
    if (preset.rectype && counts.get(preset.rectype) > 0) fitting.push({ ...preset, count: counts.get(preset.rectype) });
    else other.push(preset);
  }
  return { fitting, other };
}

/**
 * Labels of the buckets (terms, record types, users).
 *
 * @param {object|null} dbdefs
 * @returns {{termLabel: Function, rectypeName: Function, userGroupName: Function}}
 */
export function crosstabLabels(dbdefs) {
  return {
    termLabel: (id) => dbdefs?.termLabel?.(id) || '',
    rectypeName: (id) => dbdefs?.rectypeName?.(id) || '',
    userGroupName: (id) => dbdefs?.userGroupName?.(id) || ''
  };
}

/**
 * Caption of a field path code (or a field id).
 *
 * @param {object|null} dbdefs
 * @param {string|number} code
 * @returns {string}
 */
export function crosstabFieldLabel(dbdefs, code) {
  const text = String(code ?? '');
  if (/^\d+$/.test(text)) return dbdefs?.fieldGlobal?.(Number(text))?.name || text;
  return fieldCodeLabel(text, dbdefs) || text;
}

/**
 * Text of an error of the API (a crosstab used by website pages can not be deleted).
 *
 * @param {*} error
 * @returns {string}
 */
export function crosstabErrorText(error) {
  const pages = error?.payload?.details?.pages ?? error?.payload?.pages;
  if (Number(pages) > 0) return `${$HR('The crosstab is used by website pages and can not be deleted')} (${pages})`;
  return error?.payload?.message || error?.message || String(error);
}

/**
 * Create an element with classes.
 *
 * @param {string} tag
 * @param {string} [className]
 * @returns {HTMLElement}
 */
export function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * A toolbar button: icon and label (hidden in a narrow pane); `caption: false`: the icon only.
 *
 * @param {HTMLElement} parent
 * @param {string} icon Font Awesome class.
 * @param {string} label
 * @param {string} title Tooltip.
 * @param {Function} onClick
 * @param {boolean} [caption]
 * @returns {HTMLButtonElement}
 */
export function toolButton(parent, icon, label, title, onClick, caption = true) {
  const node = element('button', 'h-btn h-crosstabs-tool-btn');
  node.type = 'button';
  node.title = $HR(title);
  node.setAttribute('aria-label', $HR(label));
  const glyph = element('i', `fa-solid ${icon}`);
  glyph.setAttribute('aria-hidden', 'true');
  node.append(glyph);
  if (caption) {
    const text = element('span', 'h-crosstabs-tool-label');
    text.textContent = $HR(label);
    node.append(text);
  }
  node.addEventListener('click', onClick);
  parent.append(node);
  return node;
}

/**
 * A separator of the toolbar.
 *
 * @param {HTMLElement} parent
 * @returns {void}
 */
export function toolSeparator(parent) {
  const node = element('span', 'h-crosstabs-tool-separator');
  node.setAttribute('aria-hidden', 'true');
  parent.append(node);
}

/**
 * The selector button of the crosstabs (a list opens under it).
 *
 * @param {HTMLElement} parent
 * @param {string} text Label (the title of the crosstab).
 * @param {Function} onClick Called with the button.
 * @returns {HTMLButtonElement}
 */
export function presetSelector(parent, text, onClick) {
  const select = element('button', 'h-btn h-crosstabs-tool-select');
  select.type = 'button';
  select.title = $HR('Crosstab');
  select.setAttribute('aria-haspopup', 'listbox');
  const icon = element('i', 'fa-solid fa-table-cells');
  icon.setAttribute('aria-hidden', 'true');
  const label = element('span', 'h-crosstabs-tool-select-label');
  label.textContent = text;
  select.append(icon, label, element('span', 'h-caret'));
  select.addEventListener('click', () => onClick(select));
  parent.append(select);
  return select;
}
