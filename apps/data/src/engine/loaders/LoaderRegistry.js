/**
 * @file LoaderRegistry.js
 * @brief Registers and dispatches data loaders.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
/** Registers loaders and dispatches requests by source type. */
export class LoaderRegistry {
  constructor() {
    this.loaders = new Map();
  }
  /** Register a loader under a source type. */
  register(type, loader) {
    this.loaders.set(type, loader);
    return this;
  }
  /** Load a source through its registered loader. */
  load(type, request) {
    const loader = this.loaders.get(type);
    if (!loader) throw new Error(`No data loader registered for ${type}`);
    return loader.load(request);
  }
}
