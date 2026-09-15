/**
 * @file moduleContracts.js
 * @brief Constant vocabulary for the module bootstrap envelope and public bridge events.
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

/** Format tag stamped on every normalized module bootstrap envelope. */
export const HEURIST_MODULE_BOOTSTRAP_FORMAT = 'heurist-module-bootstrap';

/** Current version of the module bootstrap envelope shape. */
export const HEURIST_MODULE_BOOTSTRAP_VERSION = 1;

/** Public event names shared by every embeddable Heurist module. */
export const HEURIST_MODULE_EVENTS = Object.freeze({
  READY: 'heurist-module-ready',
  ERROR: 'heurist-module-error',
  SELECTION_CHANGED: 'heurist-module-selection-changed',
  EDIT_RECORD_REQUESTED: 'heurist-module-edit-record-requested',
  CONFIGURATION_SAVED: 'heurist-module-configuration-saved',
  CONFIGURATION_CANCELLED: 'heurist-module-configuration-cancelled'
});
