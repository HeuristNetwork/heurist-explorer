/**
 * @file mapPublication.js
 * @brief The publication options of a map page (plan 29): *Show only active document* and
 *        *Preserve current state*. Pure: heurist-explorer's publication form runs it through
 *        the map's configuration entry, without the map itself.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/**
 * The settings and state of a map page from the form values.
 *
 * @param {object} input
 * @param {{options: object, config: object}} input.settings Settings envelope from the form.
 * @param {object|null} input.state The map's captured state.
 * @param {{preserveState?: boolean, showOnlyActiveDocument?: boolean}} [input.publish] Publication options.
 * @param {{activeDocumentId?: *, dynamicDocumentId?: *, minimalState?: object}} [input.publication] Map data
 *        sent with the request: the active and the dynamic document, the state without the view.
 * @returns {{settings: object, state: object|null}}
 */
export function prepareMapPublication({ settings, state = null, publish = {}, publication = {} }) {
  const value = JSON.parse(JSON.stringify(settings || {}));
  const options = value.options || (value.options = {});
  const documents = options.mapDocuments || (options.mapDocuments = {});
  const ui = options.ui || (options.ui = {});
  const activeId = publication?.activeDocumentId;
  const dynamicId = String(publication?.dynamicDocumentId || 'dynamic');

  if (publish?.showOnlyActiveDocument === true) {
    if (String(activeId) === dynamicId) {
      documents.allowed = [];
      documents.initiallyActive = null;
      ui.showMapDocuments = false;
    } else if (activeId != null && Number.isInteger(Number(activeId)) && Number(activeId) > 0) {
      // the same document at start: no other default is loaded and activated first
      documents.allowed = [Number(activeId)];
      documents.initiallyActive = Number(activeId);
      ui.showCurrentDocument = false;
    }
  }
  const pageState = publish?.preserveState === false ? (publication?.minimalState ?? null) : state;
  return { settings: value, state: pageState };
}
