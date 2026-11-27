/**
 * @file storyTopicInput.js
 * @brief The story topic picker (27q3 review 8): one form in the View of Explorer (Show for), the CMS element form and
 *        the website element. A record picker of the topic record type (HInputResource `dropdown`: HValuePicker with
 *        its filter), the range of the topics as its query, Browse (the record manager) over the same range.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { RecordTitleSource } from '../../data/valueSources/FieldValueSource.js';

/**
 * The query of a range of topics: the ids of the range, `null` for all records of the type.
 *
 * @param {Array<number>|null} ids
 * @returns {Array<object>} Query (empty: all of the type; `ids:0` for an empty range).
 */
export function topicRangeQuery(ids) {
  return Array.isArray(ids) ? [{ ids: ids.length ? ids.join(',') : '0' }] : [];
}

/**
 * The options of `createHInput('resource', …)` of a story topic picker.
 *
 * @param {object} options
 * @param {object} options.apiClient HeuristApiClient.
 * @param {object} [options.dbdefs] HDbDefs.
 * @param {number} options.type Record type of the topics.
 * @param {Array<number>|null} [options.ids] The range (null: all records of the type).
 * @param {number|null} [options.value] The topic shown.
 * @param {function(object): Promise<Array<number>|null>} [options.browseRecords] The record manager (Browse); none: no
 *        Browse button.
 * @param {function(number): *} [options.viewRecord] View a record.
 * @returns {object}
 */
export function storyTopicInputOptions({ apiClient, dbdefs = null, type, ids = null, value = null, browseRecords = null, viewRecord = null }) {
  const query = topicRangeQuery(ids);
  return {
    suppressLabel: true,
    clearButton: false,
    value: value || null,
    apiClient,
    ...(dbdefs ? { dbdefs } : {}),
    targetTypes: [type],
    source: new RecordTitleSource(apiClient, { rtyId: type, query }),
    pointerMode: 'dropdown',
    showBrowse: typeof browseRecords === 'function',
    showAdd: false,
    // Browse: the records of the range only (all: all of the type)
    browseFilter: Array.isArray(ids) ? query : null,
    ...(typeof browseRecords === 'function' ? { browseRecords } : {}),
    ...(typeof viewRecord === 'function' ? { viewRecord } : {})
  };
}
