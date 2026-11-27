/**
 * @file siteStoryMap.js
 * @brief The website element Story map (plan 27q1 §8), a lazy chunk: the stored story map (a Presentation set) as
 *        HStoryMap, its current element on the chosen Map module of the page. On the page it is a member of PageSync:
 *        it shares the selection (the story of the last selected record) and its source query goes on as
 *        `module:<id>`, so a Result module that takes its records from it lists the source records. A source query
 *        with one result shows its story at once.
 *        A page published from Explorer (27q3 §12, 2026-11-25) and the element settings of 27q3 §13
 *        (storyMapConfiguration): `topic` is the story shown first; with `topicSelect` a list above the story lets the
 *        visitor choose the topic in `topicRange` (Story topics, All <type>, the Current result published from Explorer,
 *        or the records of the page's Saved filter actions); `map` / `timeline`: a Map / Timeline element of the page or
 *        `none` (27q3 review 7: no own map and timeline in the element any more, they are configured in the CMS editor);
 *        `ui.showSourceHeader` (the name of the story map above it), `ui.language`.
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

import { $HR, extendLocale, getActiveLanguage, getAssetBaseUrl } from '#shared/ui';
import { HeuristApiClient } from '#shared/api';
import { normalizeDataSource } from '#shared/data/DataSource.js';
import { HDbDefs } from '#shared/data/HDbDefs.js';
import { createHInput } from '#shared/widgets/form/inputs/createHInput.js';
import { HStoryMap } from '#shared/widgets/storymap/HStoryMap.js';
import { StoryMapBinding } from '#shared/widgets/storymap/storyMapBinding.js';
import { storyMapConfiguration } from '#shared/widgets/storymap/storyMapConfiguration.js';
import { RANGE_LIMIT, storyTopicType, withType } from '#shared/widgets/storymap/storyMapModel.js';
import { StoryMapService } from '#shared/widgets/storymap/storyMapService.js';
import { storyTimelineSync } from '#shared/widgets/storymap/storyMapTimeline.js';
import { storyTopicInputOptions } from '#shared/widgets/storymap/storyTopicInput.js';
// the source header (.heurist-source-header) as the other modules
import '#shared/ui/heurist-module.css';
import './siteStoryMap.css';

/** No map / timeline; any other value is an element of the page. */
const GEO_NONE = 'none';

/**
 * Mount a story map.
 *
 * @param {HTMLElement} host Host of the instance.
 * @param {object} instance Instance configuration (`settings`: storyMapConfiguration).
 * @param {object} config The configuration block of the page.
 * @param {object} options
 * @param {(instanceId: string) => Promise<object|null>} options.findModule The public API of a module of the page.
 * @returns {Promise<{widget: HStoryMap, start: object|null}|null>} The widget and the search it starts with (its source
 *          query), null when the story map can not be read. With the range *Saved filter by Action* the widget has
 *          `setPageRecords(dataSource)` (PageSync gives it the records of the page).
 */
export async function mountStoryMap(host, instance, config, { findModule }) {
  const runtime = config.runtime || {};
  const settings = storyMapConfiguration.normalize(instance.settings || {});
  host.classList.add('h-site-storymap');
  const apiBaseUrl = runtime.apiBaseUrl || `${runtime.baseUrl || '/'}api`;
  const service = new StoryMapService({ apiBaseUrl, database: runtime.database || '' });
  const preset = await service.loadPreset(settings.preset).catch(() => null);
  if (!preset) {
    host.textContent = runtime.design ? $HR('Choose a story map in the configuration of this element') : '';
    return null;
  }
  // the language of the element (a story map published from Explorer): its texts as a direct module (as crosstabs)
  const pageLanguage = settings.ui?.language && settings.ui.language !== 'auto' ? settings.ui.language : '';
  const language = config.site?.language || pageLanguage || runtime.language || '';
  if (pageLanguage && language !== getActiveLanguage()) await extendLocale(language, getAssetBaseUrl()).catch(() => null);
  const header = settings.ui?.showSourceHeader === true ? document.createElement('div') : null;
  if (header) {
    header.className = 'heurist-source-header h-site-storymap-header';
    header.textContent = preset.title || '';
  }
  const topicHost = settings.topicSelect ? document.createElement('div') : null;
  if (topicHost) topicHost.className = 'h-site-storymap-topic';
  const body = document.createElement('div');
  body.className = 'h-site-storymap-body';
  const container = document.createElement('div');
  container.className = 'h-site-storymap-root';
  body.append(container);
  host.replaceChildren(...[header, topicHost].filter(Boolean), body);
  // the Map and Timeline elements of the page
  const pageMap = settings.map === GEO_NONE ? null : settings.map;
  const pageTimeline = settings.timeline === GEO_NONE ? null : settings.timeline;
  // the background map document comes from the settings (map.background, plan 27q1 §15)
  const getMap = pageMap ? () => findModule(String(pageMap)) : null;
  const binding = getMap ? new StoryMapBinding({ getMap, settings: preset.settings, title: preset.title }) : null;
  let widget = null;
  let current = null;
  const timeline = pageTimeline ? pageTimelineSync(findModule, pageTimeline, () => [widget?.story || null, current]) : null;
  widget = new HStoryMap().attach(container, {
    service,
    binding,
    settings: preset.configuration,
    sourceQuery: preset.query,
    language,
    design: Boolean(runtime.design),
    onCurrent: timeline
      ? (index, item) => {
        current = item;
        timeline.sync(widget?.story || null, item);
      }
      : undefined
  }).render();
  // the selection of the page (PageSync) shows a story only for a record of the topic type (27q3 review 8): a click on
  // the map or the timeline selects an element of the story, which is not a topic; the story stays
  const topicType = storyTopicType(preset.settings, preset.query);
  const showSelection = widget.setSelection.bind(widget);
  let picker = null;
  widget.setSelection = async (ids) => {
    const list = (Array.isArray(ids) ? ids : []).map(Number).filter((id) => id > 0);
    if (!list.length) return undefined;
    let topics = list;
    if (topicType) {
      const found = new Set((await service.queryIds(withType([{ ids: list.join(',') }], topicType), list.length).catch(() => []))
        .map(Number));
      topics = list.filter((id) => found.has(id));
    }
    if (!topics.length) return undefined;
    const id = topics[topics.length - 1];
    picker?.show(id);
    return showSelection([id]);
  };
  picker = topicHost
    ? topicPicker(topicHost, { widget, service, preset, settings, apiBaseUrl, database: runtime.database || '', runtime, language })
    : null;
  if (picker) {
    const destroy = widget.destroy.bind(widget);
    widget.destroy = async () => {
      picker.destroy();
      return destroy();
    };
  }
  if (picker?.setPageRecords) widget.setPageRecords = (dataSource) => picker.setPageRecords(dataSource);
  // the story topic chosen when it was published, or in the element
  const topic = Number(settings.topic) || 0;
  if (topic > 0) {
    void widget.setSelection([topic]);
    picker?.show(topic);
  }
  const start = preset.query != null && preset.query !== ''
    ? { dataSource: normalizeDataSource({ reference: { type: 'query' }, title: preset.title, request: { q: preset.query } }), values: {}, missing: [] }
    : null;
  return { widget, start };
}

/**
 * The Timeline element of the page that shows the story (27q3 §13): found once it is mounted, then synced as the own one.
 *
 * @param {(instanceId: string) => Promise<object|null>} findModule
 * @param {string} instanceId
 * @param {function(): Array} state `[story, current item]` now (a timeline found later shows them).
 * @returns {{sync: function(object|null, object|null): void, reset: function(): void}}
 */
function pageTimelineSync(findModule, instanceId, state) {
  let api = null;
  const sync = storyTimelineSync(() => api);
  void Promise.resolve(findModule(String(instanceId))).then((found) => {
    api = found || null;
    if (!api) return;
    sync.reset();
    sync.sync(...state());
  }).catch(() => {});
  return sync;
}

/**
 * The topic list above the story (27q3 §13): a record picker of the topic type over the range of the element; the
 * chosen record is the selection of the story map.
 *
 * @param {HTMLElement} host
 * @param {object} options `widget`, `service`, `preset`, `settings` (normalized), `apiBaseUrl`, `database`, `runtime`,
 *        `language`. The picker is the one of Explorer's View and the CMS form (storyTopicInputOptions, 27q3 review 8),
 *        with Browse: the record manager over the public records.
 * @returns {{show: function(number): void, setPageRecords?: function(object): Promise<void>, destroy: function(): void}|null}
 *          Null when the story map has no topic record type.
 */
function topicPicker(host, { widget, service, preset, settings, apiBaseUrl, database, runtime = {}, language = '' }) {
  const type = storyTopicType(preset.settings, preset.query);
  if (!type) {
    host.remove();
    return null;
  }
  const apiClient = new HeuristApiClient({ apiBaseUrl, database });
  // Browse: the record manager of the shared widgets with the definitions of the database (read on the first Browse)
  const browseRecords = async (options = {}) => {
    const [{ openRecordManager }, dbdefs] = await Promise.all([
      import('#shared/widgets/record-manager/openRecordManager.js'),
      pageDefinitions(apiClient, database, language)
    ]);
    if (!dbdefs) return null;
    return openRecordManager({ selectMode: 'select', ...options, apiClient, dbdefs, baseUrl: runtime.baseUrl || '', database });
  };
  let input = null;
  let value = Number(settings.topic) || 0;
  let serial = 0;
  const label = document.createElement('span');
  label.className = 'h-site-storymap-topic-label h-i18n';
  label.textContent = $HR('Story of');
  const inputHost = document.createElement('span');
  inputHost.className = 'h-site-storymap-topic-input';
  host.append(label, inputHost);
  const choose = (id) => {
    value = Number(id) || 0;
    if (!value) return;
    if (input && Number([input.getValue()].flat()[0]) !== value) input.setValue(value);
    void widget.setSelection([value]);
  };
  // ids: the range (null: all records of the type)
  const render = (ids) => {
    input?.destroy?.();
    inputHost.replaceChildren();
    input = createHInput('resource', inputHost, storyTopicInputOptions({ apiClient, type, ids, value: value || null, browseRecords }));
    inputHost.title = Array.isArray(ids) && !ids.length ? $HR('No records in the range') : '';
    // a range of one record: its story when none is shown yet
    if (!value && Array.isArray(ids) && ids.length === 1) choose(ids[0]);
  };
  inputHost.addEventListener('h-input-change', () => {
    const id = Number([input?.getValue()].flat()[0]) || 0;
    if (id && id !== value) choose(id);
  });
  const range = async (query) => {
    const turn = ++serial;
    const ids = query == null || query === '' ? [] : await service.queryIds(withType(query, type), RANGE_LIMIT).catch(() => []);
    if (turn === serial) render(ids);
  };
  const kind = settings.topicRange;
  if (kind === 'any') render(null);
  else if (kind === 'current') void range(settings.query ?? null);
  else if (kind === 'links') render([]);
  else void range(preset.query);
  return {
    show: (id) => {
      value = Number(id) || 0;
      if (input && value) input.setValue(value);
    },
    // Saved filter by Action: the records of the page are the range
    ...(kind === 'links' ? { setPageRecords: (dataSource) => range(dataSource?.request?.q ?? null) } : {}),
    destroy: () => {
      serial += 1;
      input?.destroy?.();
      input = null;
    }
  };
}

/** Definitions of a database, read once per page (the record manager of Browse). */
const DEFINITIONS = new Map();

/** @returns {Promise<object|null>} HDbDefs, null when they can not be read. */
function pageDefinitions(apiClient, database, language) {
  const key = `${database}|${language}`;
  if (!DEFINITIONS.has(key)) {
    DEFINITIONS.set(key, HDbDefs.load(apiClient.buildUrl('/def/snapshot'), { lang: language }).catch((error) => {
      console.warn('Story map: the definitions can not be read', error);
      DEFINITIONS.delete(key);
      return null;
    }));
  }
  return DEFINITIONS.get(key);
}
