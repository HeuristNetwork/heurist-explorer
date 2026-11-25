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
