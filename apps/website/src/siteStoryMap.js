/**
 * @file siteStoryMap.js
 * @brief The website element Story map (plan 27q1 §8), a lazy chunk: the stored story map (a Presentation set) as
 *        HStoryMap, its current element on the chosen Map module of the page. On the page it is a member of PageSync:
 *        it shares the selection (the story of the last selected record) and its source query goes on as
 *        `module:<id>`, so a Result module that takes its records from it lists the source records. A source query
 *        with one result shows its story at once.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR } from '#shared/ui';
import { normalizeDataSource } from '#shared/data/DataSource.js';
import { HStoryMap } from '#shared/widgets/storymap/HStoryMap.js';
import { StoryMapBinding } from '#shared/widgets/storymap/storyMapBinding.js';
import { StoryMapService } from '#shared/widgets/storymap/storyMapService.js';

/**
 * Mount a story map.
 *
 * @param {HTMLElement} host Host of the instance.
 * @param {object} instance Instance configuration (`settings.preset`, `settings.map`).
 * @param {object} config The configuration block of the page.
 * @param {object} options
 * @param {(instanceId: string) => Promise<object|null>} options.findModule The public API of a module of the page.
 * @returns {Promise<{widget: HStoryMap, start: object|null}|null>} The widget and the search it starts with (its source
 *          query), null when the story map can not be read.
 */
export async function mountStoryMap(host, instance, config, { findModule }) {
  const runtime = config.runtime || {};
  const settings = instance.settings || {};
  host.classList.add('h-site-storymap');
  const service = new StoryMapService({
    apiBaseUrl: runtime.apiBaseUrl || `${runtime.baseUrl || '/'}api`,
    database: runtime.database || ''
  });
  const preset = await service.loadPreset(settings.preset).catch(() => null);
  if (!preset) {
    host.textContent = runtime.design ? $HR('Choose a story map in the configuration of this element') : '';
    return null;
  }
  const overview = preset.settings.map.overview;
  const overviewQuery = overview?.query ?? (overview?.querySource ? await service.querySourceQuery(overview.querySource).catch(() => null) : null);
  const binding = settings.map
    ? new StoryMapBinding({ getMap: () => findModule(String(settings.map)), settings: preset.settings, title: preset.title })
    : null;
  const container = document.createElement('div');
  container.className = 'h-site-storymap-root';
  host.replaceChildren(container);
  const widget = new HStoryMap().attach(container, {
    service,
    binding,
    settings: preset.configuration,
    sourceQuery: preset.query,
    overviewQuery,
    language: config.site?.language || runtime.language || '',
    design: Boolean(runtime.design)
  }).render();
  const start = preset.query != null && preset.query !== ''
    ? { dataSource: normalizeDataSource({ reference: { type: 'query' }, title: preset.title, request: { q: preset.query } }), values: {}, missing: [] }
    : null;
  return { widget, start };
}
