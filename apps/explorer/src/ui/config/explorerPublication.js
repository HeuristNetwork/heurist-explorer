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
import { QUERY_CHOICE_FILTER_THRESHOLD, QUERY_CHOICE_MARKS } from '#shared/data/queryChoices.js';

const LANGUAGE_LABELS = { auto: 'Automatic', eng: 'English', fre: 'French', ger: 'German', por: 'Portuguese' };
const MODE_LABELS = { buttons: 'Buttons', list: 'List', select: 'Select' };

/**
 * The filters a page may offer: `{key, kind, id?, title, parameterized}`; the query sources and saved filters by their
 * names (the one list, review 7: listQueryChoices with the scope `website`), then the current query.
 *
 * @param {object} lists
 * @param {Array<{kind: string, id: number, label: string, parameterized: boolean}>} [lists.choices] Query choices.
 * @param {object|null} [lists.current] The current DataSource (`request.q`).
 * @returns {Array<object>}
 */
export function publicationFilterChoices({ choices = [], current = null } = {}) {
  const list = (choices || []).filter((choice) => choice.kind === 'filter' || choice.kind === 'source').map((choice) => ({
    key: itemKey(choice.kind, choice.id), kind: choice.kind, id: Number(choice.id), title: choice.label,
    parameterized: choice.parameterized === true
  }));
  if (current?.request?.q) {
    // the presentation too: the columns, geo and time fields of the DataSource
    list.push({ key: itemKey('query'), kind: 'query', title: 'Current query', request: structuredClone(current.request),
      presentation: current.presentation ? structuredClone(current.presentation) : null, parameterized: false });
  }
  return list;
}

/**
 * Form JSON of the publication (without the *Publish to* section, added by the host).
 *
 * @param {Array<object>} choices From `publicationFilterChoices`.
 * @returns {object} heurist-edit-form/1.
 */
export function explorerPublicationForm(choices) {
  // the marks of the one picker (review 7): [filter] [parametrized]
  const term = (choice) => ({
    id: choice.key,
    label: choice.title,
    marks: [...(choice.kind === 'filter' ? [QUERY_CHOICE_MARKS.filter] : []), ...(choice.parameterized ? [QUERY_CHOICE_MARKS.parameterized] : [])]
  });
  return {
    format: 'heurist-edit-form/1',
    groups: [
      {
        id: 'page',
        label: 'Page',
        modes: ['configuration', 'publication'],
        children: [
          {
            // a website page: the language of the page (2026-11-14)
            name: 'ui.language', type: 'enum', label: 'Language', req: 'recommended', mode: 'select', clearable: false,
            terms: UI_LANGUAGES.map((id) => ({ id, label: LANGUAGE_LABELS[id] || id })), default: 'auto',
            modes: ['configuration', 'publication']
          }
        ]
      },
      {
        id: 'filters',
        label: 'Filters',
        children: [
          {
            name: 'filter.items', type: 'enum', label: 'Available filters', req: 'recommended', mode: 'select',
            multiple: true, max: 0, terms: choices.map(term), filterThreshold: QUERY_CHOICE_FILTER_THRESHOLD,
            help: 'Saved filters of the group "Website filters" and public query sources; none: the page has no filters'
          },
          {
            name: 'filter.active', type: 'enum', label: 'Active on start', req: 'recommended', mode: 'select',
            terms: choices.map(term), emptyLabel: 'None (the result of now)', filterThreshold: QUERY_CHOICE_FILTER_THRESHOLD,
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
