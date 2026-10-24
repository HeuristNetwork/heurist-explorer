/**
 * @file recordEditorSettings.js
 * @brief Settings of the record editor (plan 25), set in the Explorer configuration
 *        (section *Record editor*) and passed to HRecordEditor:
 *
 * - `showHelp`, `showOptional`: the start settings of the Structure pane (Show help;
 *   Required only / Show optional); the pane can change them for the session;
 * - `reverseRelations`: the group "Relationships from other records";
 * - `nonStandardFields`: the group "Non-standard fields";
 * - `wysiwygInline`: a blocktext with HTML opens in the HTML editor at once.
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

/** Settings when none are saved. */
export const DEFAULT_RECORD_EDITOR_SETTINGS = Object.freeze({
  showHelp: true,
  showOptional: true,
  reverseRelations: true,
  nonStandardFields: true,
  wysiwygInline: false
});

/**
 * Settings with the defaults for missing or invalid values.
 *
 * @param {object|null} value Saved settings.
 * @returns {{showHelp: boolean, showOptional: boolean, reverseRelations: boolean, nonStandardFields: boolean, wysiwygInline: boolean}}
 */
export function normalizeRecordEditorSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const settings = {};
  for (const [key, fallback] of Object.entries(DEFAULT_RECORD_EDITOR_SETTINGS)) {
    settings[key] = typeof source[key] === 'boolean' ? source[key] : fallback;
  }
  return settings;
}
