/**
 * @file SourceActions.js
 * @brief Accessible action buttons shared by document-backed visualizations (map, timeline).
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

import { $HR } from '#shared/ui';

/**
 * Build a small icon-only action button that reports async failures to `onError`.
 *
 * @param {string} icon Font Awesome icon class.
 * @param {string} title Localizable tooltip/aria-label text.
 * @param {Function} handler Click handler; may be async.
 * @param {Function} [onError] Called with the error when `handler` rejects; defaults to `console.error`.
 * @returns {HTMLButtonElement} The button element.
 */
export function sourceAction(icon, title, handler, onError = console.error) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'heurist-icon-button';
  button.title = $HR(title);
  button.setAttribute('aria-label', $HR(title));
  const glyph = document.createElement('span');
  glyph.className = icon;
  glyph.setAttribute('aria-hidden', 'true');
  button.append(glyph);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    Promise.resolve().then(() => handler(event)).catch(onError);
  });
  return button;
}
/**
 * Build the "Show data" action button for one document/layer's underlying DataSource.
 *
 * @param {object} api Public application API exposing `showLayerDataSource`.
 * @param {*} id Layer/band id.
 * @param {Function} [onError] Called with the error when the action fails.
 * @returns {HTMLButtonElement} The button element.
 */
export function showDataAction(api, id, onError) {
  return sourceAction('fa-solid fa-table', 'Show data', () => api.showLayerDataSource(id), onError);
}
/**
 * Build the "Show data" action button for a module with a single active DataSource (e.g. graph).
 *
 * @param {object} api Public application API exposing `showDataSource`.
 * @param {Function} [onError] Called with the error when the action fails.
 * @returns {HTMLButtonElement} The button element.
 */
export function showDataSourceAction(api, onError) {
  return sourceAction('fa-solid fa-table', 'Show data', () => api.showDataSource(), onError);
}
