/**
 * @file index.js
 * @brief Value sources for HValuePicker (plan §4.1).
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

export * from './valueList.js';
export { StaticSource, TermSource, UserGroupSource, vocabularyItems } from './localSources.js';
export { FieldValueSource, FacetTermSource, RangeBucketSource, fetchFieldRange } from './FieldValueSource.js';
