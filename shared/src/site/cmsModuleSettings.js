/**
 * @file cmsModuleSettings.js
 * @brief Settings of a module on a published page: no Help, Options and Publish buttons (2026-11-28). A visitor
 *        does not change the options of the module and does not publish it; the help pages are not on a website.
 *        Used by the website runtime (the modules of a page) and by a published Explorer (its modules).
 *
 *   const settings = publishedModuleSettings(instance.settings);
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

/**
 * Settings of a module on a published page: `options.ui.showHelp`, `showOptions` and `showPublish` are false (the
 * persisted settings envelope of every module, plan 29), whatever the page stored.
 *
 * @param {object} [settings] Module settings.
 * @returns {object}
 */
export function publishedModuleSettings(settings = {}) {
  const value = settings && typeof settings === 'object' ? settings : {};
  const options = value.options && typeof value.options === 'object' ? value.options : {};
  return {
    ...value,
    options: { ...options, ui: { ...(options.ui || {}), showHelp: false, showOptions: false, showPublish: false } }
  };
}
