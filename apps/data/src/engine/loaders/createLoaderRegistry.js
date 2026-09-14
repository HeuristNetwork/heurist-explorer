/**
 * @file createLoaderRegistry.js
 * @brief Creates the application loader registry.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { LoaderRegistry } from "./LoaderRegistry.js";
import { DatasetLoader } from "./DatasetLoader.js";
import { QueryLoader } from "./QueryLoader.js";

export function createLoaderRegistry(providers) {
  return new LoaderRegistry()
    .register("dataset", new DatasetLoader(providers))
    .register("query", new QueryLoader(providers));
}
