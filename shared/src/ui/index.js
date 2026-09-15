/**
 * @file index.js
 * @brief Barrel export for the shared UI primitives, i18n, and configuration helpers.
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

export * from './i18n/index.js';
export * from './config/index.js';
export { InlineHelp } from './InlineHelp.js';
export { PublishedDialog } from './PublishedDialog.js';
export { HMsg } from './HMsg.js';
