/**
 * @file explorerPublication.js
 * @brief "Publish this view" (plan 27b §11.3): the publication form of Explorer itself (page
 *        title and target page, language, the filters of the page for HFilter) and the
 *        settings of the page it writes.
 *
 * Only public filters can be put on a page: the saved filters of group 4 "Website filters"
 * (hard-coded until saved filters and query sources are merged) and the query sources whose
 * visibility is public; and the current query. The page keeps references (ids): the latest
 * version of each filter is read when the page opens.
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

import { itemKey, normalizePublishedFilter, FILTER_MODES, FILTER_PLACEMENTS } from '../../core/publishedView.js';
import { UI_LANGUAGES } from '../../core/ExplorerUiConfig.js';

/** Owner group of the saved filters a website may use ("Website filters"). */
export const WEBSITE_FILTERS_GROUP = 4;

const LANGUAGE_LABELS = { auto: 'Automatic', eng: 'English', fre: 'French', ger: 'German', por: 'Portuguese' };
const MODE_LABELS = { buttons: 'Buttons', list: 'List', select: 'Select' };

/**
 * The filters a page may offer: `{key, kind, id?, title, parameterized}`; saved filters first,
 * then query sources, then the current query.
 *
 * @param {object} lists
 * @param {Array<{id: number, title: string, kind?: string}>} [lists.filters] Saved filters of "Website filters".
 * @param {Array<{id: number, title: string, parametrized?: boolean}>} [lists.sources] Public query sources.
 * @param {object|null} [lists.current] The current DataSource (`request.q`).
 * @returns {Array<object>}
 */
export function publicationFilterChoices({ filters = [], sources = [], current = null } = {}) {
  const byTitle = (a, b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' });
  const choices = [
    ...[...filters].sort(byTitle).map((filter) => ({
      key: itemKey('filter', filter.id), kind: 'filter', id: Number(filter.id), title: filter.title,
      parameterized: filter.kind === 'parametrized'
    })),
    ...[...sources].sort(byTitle).map((source) => ({
      key: itemKey('source', source.id), kind: 'source', id: Number(source.id), title: source.title,
      parameterized: source.parametrized === true
    }))
  ];
  if (current?.request?.q) {
    // the presentation too: the columns, geo and time fields of the DataSource
    choices.push({ key: itemKey('query'), kind: 'query', title: 'Current query', request: structuredClone(current.request),
      presentation: current.presentation ? structuredClone(current.presentation) : null, parameterized: false });
  }
  return choices;
}

/**
 * Form JSON of the publication (without the *Publish to* section, added by the host).
 *
 * @param {Array<object>} choices From `publicationFilterChoices`.
 * @returns {object} heurist-edit-form/1.
 */
export function explorerPublicationForm(choices) {
  const term = (choice) => ({
    id: choice.key,
    label: `${choice.title}${choice.kind === 'filter' ? ' [filter]' : choice.kind === 'source' ? ' [source]' : ''}`
      + (choice.parameterized ? ' (parameterized)' : '')
  });
  return {
    format: 'heurist-edit-form/1',
    groups: [
      {
        id: 'page',
        label: 'Page',
        children: [
          {
            name: 'ui.language', type: 'enum', label: 'Language', req: 'recommended', mode: 'select', clearable: false,
            terms: UI_LANGUAGES.map((id) => ({ id, label: LANGUAGE_LABELS[id] || id })), default: 'auto'
          }
        ]
      },
      {
        id: 'filters',
        label: 'Filters',
        children: [
          {
            name: 'filter.items', type: 'enum', label: 'Available filters', req: 'recommended', mode: 'select',
            multiple: true, max: 0, terms: choices.map(term),
            help: 'Saved filters of the group "Website filters" and public query sources; none: the page has no filters'
          },
          {
            name: 'filter.active', type: 'enum', label: 'Active on start', req: 'recommended', mode: 'select',
            terms: choices.map(term), emptyLabel: 'None (the result of now)',
            help: 'One of the available filters; it runs when the page opens'
          },
          {
            name: 'filter.mode', type: 'enum', label: 'Presentation', req: 'recommended', mode: 'radio', clearable: false,
            terms: FILTER_MODES.map((id) => ({ id, label: MODE_LABELS[id] })), default: 'buttons'
          }
        ]
      }
    ]
  };
}

/**
 * Form values of the dialog: `{ui: {language}, filter: {items: keys[], active, mode, placement}}`.
 *
 * @param {object} [value] Values (partly) given.
 * @returns {object}
 */
export function normalizePublicationValues(value = {}) {
  const filter = value.filter || {};
  const keys = Array.isArray(filter.items) ? filter.items.map(String) : (filter.items ? [String(filter.items)] : []);
  return {
    ui: { language: UI_LANGUAGES.includes(value.ui?.language) ? value.ui.language : 'auto' },
    filter: {
      items: [...new Set(keys)],
      active: filter.active ? String(filter.active) : null,
      mode: FILTER_MODES.includes(filter.mode) ? filter.mode : 'buttons',
      placement: FILTER_PLACEMENTS.includes(filter.placement) ? filter.placement : 'west'
    }
  };
}

/**
 * The settings of the page: Explorer's view (`captureView`) with the language and the filters.
 * The active filter must be one of the available ones (else none).
 *
 * @param {object} viewSettings `captureView().settings`.
 * @param {object} values Form values (`normalizePublicationValues`).
 * @param {Array<object>} choices From `publicationFilterChoices`.
 * @param {string} [language] The language of now (for `auto`).
 * @returns {object}
 */
export function publicationSettings(viewSettings, values, choices, language = 'eng') {
  const chosen = values.filter.items
    .map((key) => choices.find((choice) => choice.key === key))
    .filter(Boolean)
    .map(({ key, kind, id, title, request, presentation }) => ({ key, kind, title,
      ...(kind === 'query' ? { request, presentation } : { id }) }));
  const filter = normalizePublishedFilter({ ...values.filter, items: chosen });
  const pageLanguage = values.ui.language === 'auto' ? language : values.ui.language;
  return {
    ...viewSettings,
    ui: { ...(viewSettings.ui || {}), language: pageLanguage || 'eng' },
    filter
  };
}
