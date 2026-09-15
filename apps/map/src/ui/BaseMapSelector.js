/**
 * @file BaseMapSelector.js
 * @brief Renders mutually exclusive configured base maps.
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

/** Renders the list of configured base maps as a mutually exclusive selector. */
export class BaseMapSelector {
  /**
   * @param {{api: object, container: HTMLElement}} options `api` is the map's public API;
   *        `container` is the element the selector renders into.
   */
  constructor({ api, container }) { this.api = api; this.container = container; }

  /**
   * Render the base-map list.
   *
   * @param {Array<object>} items Available base maps.
   * @param {*} activeId Id of the currently active base map.
   * @returns {void}
   */
  render(items, activeId) {
    this.container.replaceChildren();
    for (const item of items) {
      const label = document.createElement('label');
      label.className = 'heurist-map-basemap-row';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.classList.add('h-checkbox');
      radio.name = 'heurist-map-basemap';
      radio.checked = String(item.id) === String(activeId);
      radio.addEventListener('change', () => radio.checked && this.api.setBaseMap(item.id).catch(() => {}));
      const title = document.createElement('span');
      title.textContent = item.title;
      label.append(radio, title);
      this.container.append(label);
    }
  }
}
