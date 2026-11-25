/**
 * @file siteStoryMap.js
 * @brief The website element Story map (plan 27q1 §8), a lazy chunk: the stored story map (a Presentation set) as
 *        HStoryMap, its current element on the chosen Map module of the page. On the page it is a member of PageSync:
 *        it shares the selection (the story of the last selected record) and its source query goes on as
 *        `module:<id>`, so a Result module that takes its records from it lists the source records. A source query
 *        with one result shows its story at once.
 *        A page published from Explorer (27q3 §12, 2026-11-25): `settings.topic` is the story shown first and
 *        `settings.ownMap` gives the element its own Map and Timeline (the direct entries of the page): beside vertical
 *        stories, under horizontal ones.
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
import { storyTimelineSync } from '#shared/widgets/storymap/storyMapTimeline.js';
import './siteStoryMap.css';

/**
 * Mount a story map.
 *
 * @param {HTMLElement} host Host of the instance.
 * @param {object} instance Instance configuration (`settings.preset`, `settings.map`, `settings.topic`,
 *        `settings.ownMap`).
 * @param {object} config The configuration block of the page.
 * @param {object} options
 * @param {(instanceId: string) => Promise<object|null>} options.findModule The public API of a module of the page.
 * @param {object} [options.loaders] Module loaders of the page (`map`, `timeline`): the own map and timeline.
 * @returns {Promise<{widget: HStoryMap, start: object|null}|null>} The widget and the search it starts with (its source
 *          query), null when the story map can not be read.
 */
export async function mountStoryMap(host, instance, config, { findModule, loaders = null }) {
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
  const container = document.createElement('div');
  container.className = 'h-site-storymap-root';
  host.replaceChildren(container);
  // its own map and timeline (a page published from Explorer), else the Map module of the page
  const own = settings.ownMap === true && loaders?.map ? ownGeo(host, container, preset, config, loaders) : null;
  // the background map document comes from the settings (map.background, plan 27q1 §15)
  const getMap = own ? () => own.map : settings.map ? () => findModule(String(settings.map)) : null;
  const binding = getMap ? new StoryMapBinding({ getMap, settings: preset.settings, title: preset.title }) : null;
  let widget = null;
  widget = new HStoryMap().attach(container, {
    service,
    binding,
    settings: preset.configuration,
    sourceQuery: preset.query,
    language: config.site?.language || runtime.language || '',
    design: Boolean(runtime.design),
    onCurrent: own ? (index, item) => own.timeline.sync(widget?.story || null, item) : undefined
  }).render();
  if (own) {
    const destroy = widget.destroy.bind(widget);
    widget.destroy = async () => {
      await own.destroy();
      return destroy();
    };
  }
  // the story topic chosen when it was published
  const topic = Number(settings.topic) || 0;
  if (topic > 0) void widget.setSelection([topic]);
  const start = preset.query != null && preset.query !== ''
    ? { dataSource: normalizeDataSource({ reference: { type: 'query' }, title: preset.title, request: { q: preset.query } }), values: {}, missing: [] }
    : null;
  return { widget, start };
}

/**
 * The own Map and Timeline of the element: a part beside the story (vertical stories) or under it (horizontal).
 *
 * @param {HTMLElement} host Host of the instance.
 * @param {HTMLElement} container The story.
 * @param {object} preset The story map.
 * @param {object} config The configuration block of the page.
 * @param {object} loaders Module loaders (`map`, `timeline`).
 * @returns {{map: Promise<object|null>, timeline: object, destroy: function(): Promise<void>}}
 */
function ownGeo(host, container, preset, config, loaders) {
  const runtime = config.runtime || {};
  const below = preset.settings?.presentation?.layout === 'horizontal';
  host.classList.add('has-own-map', below ? 'is-geo-below' : 'is-geo-beside');
  const geo = document.createElement('div');
  geo.className = 'h-site-storymap-geo';
  const mapHost = document.createElement('div');
  mapHost.className = 'h-site-storymap-map';
  const timelineHost = document.createElement('div');
  timelineHost.className = 'h-site-storymap-timeline';
  geo.append(mapHost, timelineHost);
  host.append(geo);
  const mount = async (type, element) => {
    if (!loaders[type]) return null;
    try {
      const entry = await loaders[type]();
      return await entry({
        container: element,
        bootstrap: { runtime: { ...runtime }, settings: {}, state: null },
        bridge: null,
        assetBaseUrl: runtime.moduleBaseUrl ? `${runtime.moduleBaseUrl}heurist-${type}/` : null
      });
    } catch (error) {
      console.error(`Story map: own ${type}`, error);
      return null;
    }
  };
  let timelineApi = null;
  const map = mount('map', mapHost);
  const timelineReady = mount('timeline', timelineHost).then((api) => {
    timelineApi = api;
    timelineHost.hidden = !api;
    return api;
  });
  const timeline = storyTimelineSync(() => timelineApi);
  return {
    map,
    timeline,
    async destroy() {
      const [mapApi, timelineModule] = await Promise.all([map, timelineReady]);
      await Promise.resolve(timelineModule?.destroy?.()).catch(() => {});
      await Promise.resolve(mapApi?.destroy?.()).catch(() => {});
      geo.remove();
    }
  };
}
