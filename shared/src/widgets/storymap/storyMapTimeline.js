/**
 * @file storyMapTimeline.js
 * @brief The own timeline of a story map (27q3 §12, 2026-11-25): the elements of the shown story as its query, the
 *        current element as its selection. Used by the Story map tool of Explorer and the website element Story map
 *        with its own map (siteStoryMap.js); the timeline is the public API of the Timeline module.
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
 * A sync of a story to a timeline.
 *
 * @param {function(): (object|null)} getTimeline The timeline public API (`setQuery`, `setSelection`, `clearSelection`).
 * @returns {{sync: function(object|null, object|null): void, reset: function(): void}} `sync(story, item)`: `story` is
 *          HStoryMap's story (`{source, elements}`), `item` its current item (`{kind, element}`); `reset()`: the next
 *          sync sends the query again (another map or timeline).
 */
export function storyTimelineSync(getTimeline) {
  let shown = 0;
  return {
    reset() {
      shown = 0;
    },
    sync(story, item = null) {
      const timeline = getTimeline();
      if (!timeline) return;
      const topic = Number(story?.source?.id) || 0;
      if (topic !== shown) {
        shown = topic;
        const ids = (story?.elements || []).map((entry) => Number(entry.id)).filter((id) => id > 0);
        void Promise.resolve(timeline.setQuery?.(ids.length ? [{ ids: ids.join(',') }] : null))
          .catch((error) => console.warn('Story map: timeline', error));
      }
      const id = item?.kind === 'element' ? Number(item.element?.id) || 0 : 0;
      void Promise.resolve(id ? timeline.setSelection?.([id]) : timeline.clearSelection?.()).catch(() => {});
    }
  };
}

/** Id of the band of the story in a timeline that is not the story map's own (addLayer of the Timeline API). */
const STORY_LAYER_ID = 'storymap-story';

/**
 * A sync of a story to a timeline of the host (27q3 review 6: Explorer's Timeline pane when the story map has no own
 * timeline): the elements of the story are a band of their own (`addLayer`), the result of the timeline stays; the
 * current element is selected.
 *
 * @param {function(): (object|null|Promise<object|null>)} getTimeline The timeline public API (`addLayer`,
 *        `removeLayer`, `setSelection`), null: none.
 * @param {function(): string} getTitle Title of the band ("StoryMap: <name>").
 * @returns {{sync: function(object|null, object|null): Promise<void>, reset: function(): Promise<void>}} `reset()`
 *          removes the band (the own timeline is on, the story is closed).
 */
export function storyTimelineLayer(getTimeline, getTitle) {
  let shown = 0;
  let added = null;
  const remove = async () => {
    const timeline = added;
    added = null;
    shown = 0;
    if (timeline) await Promise.resolve(timeline.removeLayer?.(STORY_LAYER_ID)).catch(() => {});
  };
  return {
    reset: remove,
    async sync(story, item = null) {
      const timeline = await Promise.resolve(getTimeline()).catch(() => null);
      if (!timeline || typeof timeline.addLayer !== 'function') {
        await remove();
        return;
      }
      if (added && added !== timeline) await remove();
      const topic = Number(story?.source?.id) || 0;
      if (topic !== shown) {
        shown = topic;
        const ids = (story?.elements || []).map((entry) => Number(entry.id)).filter((id) => id > 0);
        if (!ids.length) {
          await remove();
        } else {
          added = timeline;
          await Promise.resolve(timeline.addLayer({ id: STORY_LAYER_ID, title: getTitle(), query: [{ ids: ids.join(',') }] }))
            .catch((error) => console.warn('Story map: timeline', error));
        }
      }
      // the current element; the selection of the timeline stays between the elements
      const id = item?.kind === 'element' ? Number(item.element?.id) || 0 : 0;
      if (id && added) void Promise.resolve(timeline.setSelection?.([id])).catch(() => {});
    }
  };
}

/**
 * Settings of the own map of a story map (27q3 §13, 2026-11-27): no header, no Heurist controls, no map controls.
 * Given as the bootstrap settings of the Map direct entry (also stops the user's saved map preference).
 */
export const OWN_MAP_SETTINGS = Object.freeze({
  options: {
    ui: { enabled: false, showSourceHeader: false },
    nativeControls: { zoom: false, scale: false, bookmark: false, print: false, search: false }
  }
});

/**
 * Settings of the own timeline of a story map (27q3 §13): no header, no control panel.
 */
export const OWN_TIMELINE_SETTINGS = Object.freeze({
  options: {
    ui: { enabled: false, showSourceHeader: false }
  }
});
